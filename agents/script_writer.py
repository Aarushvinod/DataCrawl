"""Script Writer Agent — Together AI."""

import asyncio
import ast
import importlib.util
import json
import os
import re
import textwrap
import sys
import tempfile
import uuid
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.services.project_secrets import materialize_secret_env
from app.services.run_control import finish_agent_log, register_cleanup, run_cancellable, start_agent_log
from agents.llm_utils import TOGETHER_MODELS, invoke_together
from agents.state import DataCrawlState

SCRIPT_WRITER_SYSTEM_PROMPT = """You are the DataCrawl Script Writer Agent. You generate Python scripts that collect data from APIs and websites.

Requirements:
- You are NOT responsible for source discovery. The orchestrator has already chosen the provider, endpoint, auth method, and output contract.
- The script must be immediately executable as-is.
- Prefer standard library + requests + beautifulsoup4 + pandas, but you may import other mainstream Python packages when they materially improve reliability.
- Missing third-party dependencies can be installed automatically before execution, so include the imports the script truly needs.
- If no CLI arguments are passed, the script must still run using embedded defaults from the task.
- The script must emit the final dataset as CSV to stdout when run successfully.
- Optionally support --output PATH, but stdout CSV is mandatory.
- The most important requirement is respecting the data contract exactly:
  - exact source/provider and endpoint
  - exact required columns
  - exact time range and symbols/entities
  - target row count and acceptable range
  - exact auth requirements
- Do not invent fields, sources, or extra unrelated data.

Return ONLY the Python script code, wrapped in ```python ... ```.
"""

SCRIPT_WRITER_FALLBACK_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo"
SCRIPT_WRITER_REPAIR_PROMPT = """The previous Python script failed.

Fix it so that:
- it is syntactically valid Python
- it runs without manual edits
- it emits CSV to stdout
- it uses robust request headers for sites that block generic clients
- it raises clear exceptions on failures
- it keeps third-party imports minimal and only for packages that can be installed with pip
- it addresses the validator failure exactly, including schema and row-count issues

Return ONLY the corrected Python script in a ```python``` block.
"""

SCRIPT_PACKAGE_ALLOWLIST = {
    "requests": "requests",
    "bs4": "beautifulsoup4",
    "beautifulsoup4": "beautifulsoup4",
    "pandas": "pandas",
    "numpy": "numpy",
    "lxml": "lxml",
    "yfinance": "yfinance",
    "dateutil": "python-dateutil",
    "yaml": "PyYAML",
    "pyyaml": "PyYAML",
    "sklearn": "scikit-learn",
    "scipy": "scipy",
    "openpyxl": "openpyxl",
    "html5lib": "html5lib",
    "feedparser": "feedparser",
}

CLI_ARG_ALIASES = {
    "range_value": "range",
}


def _extract_script(content: str) -> str:
    script = content.strip()
    if "```python" in script:
        script = script.split("```python", 1)[1].split("```", 1)[0].strip()
    elif "```" in script:
        script = script.split("```", 1)[1].split("```", 1)[0].strip()
    return script


def _is_yahoo_finance_task(task: dict) -> bool:
    haystack = " ".join([
        str(task.get("source", "")),
        str(task.get("target_data", "")),
        json.dumps(task.get("params", {}), default=str),
    ]).lower()
    return "yahoo" in haystack or "finance.yahoo.com" in haystack


def _build_yahoo_finance_script(task: dict) -> str:
    params = task.get("params", {}) or {}
    ticker = str(params.get("ticker", "TSLA"))
    range_value = str(params.get("range", "1mo"))
    interval = str(params.get("interval", "1d"))
    source = str(task.get("source", f"https://finance.yahoo.com/quote/{ticker}/history"))
    return textwrap.dedent(
        f"""\
        #!/usr/bin/env python3
        import argparse
        import json
        import sys
        import requests
        import pandas as pd
        
        DEFAULT_TICKER = {ticker!r}
        DEFAULT_RANGE = {range_value!r}
        DEFAULT_INTERVAL = {interval!r}
        DEFAULT_SOURCE = {source!r}
        API_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{{ticker}}"
        
        def fetch_history(ticker: str, range_value: str, interval: str) -> pd.DataFrame:
            headers = {{
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                "Accept": "application/json,text/plain,*/*",
                "Accept-Language": "en-US,en;q=0.9",
                "Origin": "https://finance.yahoo.com",
                "Referer": DEFAULT_SOURCE,
            }}
            params = {{
                "range": range_value,
                "interval": interval,
                "includePrePost": "false",
                "events": "div,split",
            }}
            response = requests.get(API_URL.format(ticker=ticker), params=params, headers=headers, timeout=30)
            response.raise_for_status()
            payload = response.json()
            result = payload["chart"]["result"][0]
            timestamps = result.get("timestamp") or []
            quote = result.get("indicators", {{}}).get("quote", [{{}}])[0]
            if not timestamps:
                raise ValueError("No time series data returned from Yahoo Finance")
            rows = []
            for index, ts in enumerate(timestamps):
                rows.append({{
                    "date": pd.to_datetime(ts, unit="s").strftime("%Y-%m-%d"),
                    "open": quote.get("open", [None] * len(timestamps))[index],
                    "high": quote.get("high", [None] * len(timestamps))[index],
                    "low": quote.get("low", [None] * len(timestamps))[index],
                    "close": quote.get("close", [None] * len(timestamps))[index],
                    "volume": quote.get("volume", [None] * len(timestamps))[index],
                }})
            df = pd.DataFrame(rows).dropna()
            if df.empty:
                raise ValueError("No non-null price rows returned from Yahoo Finance")
            df["open"] = df["open"].astype(float)
            df["high"] = df["high"].astype(float)
            df["low"] = df["low"].astype(float)
            df["close"] = df["close"].astype(float)
            df["volume"] = df["volume"].astype(int)
            return df
        
        def main() -> None:
            parser = argparse.ArgumentParser()
            parser.add_argument("--ticker", default=DEFAULT_TICKER)
            parser.add_argument("--range", dest="range_value", default=DEFAULT_RANGE)
            parser.add_argument("--interval", default=DEFAULT_INTERVAL)
            parser.add_argument("--output", default="")
            args = parser.parse_args()
            df = fetch_history(args.ticker, args.range_value, args.interval)
            csv_output = df.to_csv(index=False, lineterminator="\\n")
            if args.output:
                with open(args.output, "w", encoding="utf-8") as handle:
                    handle.write(csv_output)
            sys.stdout.write(csv_output)
        
        if __name__ == "__main__":
            main()
        """
    )


def _build_cli_args(params: dict) -> list[str]:
    args: list[str] = []
    for key, value in (params or {}).items():
        if value is None:
            continue
        flag_name = CLI_ARG_ALIASES.get(str(key), str(key)).replace("_", "-")
        flag = f"--{flag_name}"
        if isinstance(value, bool):
            if value:
                args.append(flag)
            continue
        if isinstance(value, (str, int, float)):
            args.extend([flag, str(value)])
    return args


def _build_script_writer_payload(task: dict) -> dict:
    return {
        "action": "generate_script",
        "source": task.get("source", ""),
        "target_data": task.get("target_data", ""),
        "source_details": task.get("source_details", {}),
        "constraints": task.get("constraints", {}),
        "required_columns": task.get("required_columns", []),
        "row_count_target": task.get("row_count_target"),
        "row_count_range": task.get("row_count_range"),
        "time_range": task.get("time_range", ""),
        "symbols": task.get("symbols", []),
        "auth_requirements": task.get("auth_requirements", {}),
        "output_schema": task.get("output_schema", {}),
        "output_contract": task.get("output_contract", {}),
        "params": task.get("params", {}),
        "repair_context": task.get("repair_context"),
    }


def _discover_required_packages(script: str) -> list[str]:
    tree = ast.parse(script)
    packages: list[str] = []
    seen: set[str] = set()

    def add_package(module_name: str) -> None:
        top_level = module_name.split(".", 1)[0]
        if not top_level or top_level in sys.stdlib_module_names:
            return
        package_name = SCRIPT_PACKAGE_ALLOWLIST.get(top_level, top_level)
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", package_name):
            return
        if importlib.util.find_spec(top_level) is not None:
            return
        if package_name not in seen:
            seen.add(package_name)
            packages.append(package_name)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                add_package(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            add_package(node.module)

    return packages


async def _install_script_dependencies(
    state: DataCrawlState,
    script: str,
    temp_dir: str,
) -> tuple[Path, list[str]]:
    packages = _discover_required_packages(script)
    deps_dir = Path(temp_dir) / "site-packages"
    deps_dir.mkdir(parents=True, exist_ok=True)
    if not packages:
        return deps_dir, []

    command = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--target",
        str(deps_dir),
        *packages,
    ]
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=temp_dir,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    register_cleanup(state["run_id"], lambda proc=process: proc.kill() if proc.returncode is None else None)
    stdout_bytes, stderr_bytes = await run_cancellable(
        state["user_id"],
        state["project_id"],
        state["run_id"],
        process.communicate(),
    )
    if process.returncode != 0:
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()
        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        detail = stderr or stdout or f"pip exited with code {process.returncode}"
        raise RuntimeError(f"Dependency installation failed for {', '.join(packages)}. {detail}")
    return deps_dir, packages


async def _execute_generated_script(state: DataCrawlState, script: str, task: dict) -> tuple[str, dict]:
    params = task.get("params", {}) or {}
    temp_dir = tempfile.TemporaryDirectory(prefix="datacrawl-script-")
    register_cleanup(state["run_id"], temp_dir.cleanup)

    script_path = Path(temp_dir.name) / "generated_script.py"
    output_path = Path(temp_dir.name) / "output.csv"
    script_path.write_text(script, encoding="utf-8")
    deps_dir, installed_packages = await _install_script_dependencies(state, script, temp_dir.name)
    auth_requirements = task.get("auth_requirements", {}) or {}
    secret_env = materialize_secret_env(
        user_id=state["user_id"],
        project_id=state["project_id"],
        env_mapping=auth_requirements.get("secret_env"),
    ) if auth_requirements.get("secret_env") else {}

    cli_args = _build_cli_args(params)
    commands = [
        [sys.executable, str(script_path), *cli_args],
        [sys.executable, str(script_path), *cli_args, "--output", str(output_path)],
    ]

    last_error = ""
    last_command: list[str] = []
    for command in commands:
        last_command = command
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=temp_dir.name,
            env={
                **os.environ,
                **secret_env,
                "PYTHONUNBUFFERED": "1",
                "PYTHONPATH": (
                    str(deps_dir)
                    if not os.environ.get("PYTHONPATH")
                    else f"{deps_dir}{os.pathsep}{os.environ['PYTHONPATH']}"
                ),
            },
        )
        register_cleanup(state["run_id"], lambda proc=process: proc.kill() if proc.returncode is None else None)

        stdout_bytes, stderr_bytes = await run_cancellable(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            process.communicate(),
        )
        stdout = stdout_bytes.decode("utf-8", errors="replace").strip()
        stderr = stderr_bytes.decode("utf-8", errors="replace").strip()

        if process.returncode == 0 and stdout:
            return stdout, {
                "execution_mode": "stdout",
                "command": command,
                "stderr": stderr[:1000],
                "installed_packages": installed_packages,
                "secret_env_keys": sorted(secret_env.keys()),
            }

        if process.returncode == 0 and output_path.exists():
            return output_path.read_text(encoding="utf-8"), {
                "execution_mode": "output_file",
                "command": command,
                "stderr": stderr[:1000],
                "installed_packages": installed_packages,
                "secret_env_keys": sorted(secret_env.keys()),
            }

        last_error = _format_script_execution_error(
            stderr or f"Script exited with code {process.returncode}",
            command,
        )

    if not last_error:
        last_error = _format_script_execution_error("Script exited without producing output.", last_command)
    raise RuntimeError(f"Generated script did not produce dataset output. {last_error}")


def _dataset_summary(dataset_csv: str) -> tuple[list[str], int]:
    lines = [line for line in dataset_csv.splitlines() if line.strip()]
    columns = [column.strip().strip('"') for column in lines[0].split(",")] if lines else []
    row_count = max(len(lines) - 1, 0)
    return columns, row_count


def _format_script_execution_error(stderr: str, command: list[str]) -> str:
    command_str = " ".join(command)
    lowered = stderr.lower()

    if "unrecognized arguments:" in lowered:
        return (
            "Generated script rejected the runtime arguments passed by DataCrawl. "
            f"Command: `{command_str}`. Raw error: {stderr}"
        )

    if any(token in lowered for token in (
        "nameresolutionerror",
        "failed to resolve",
        "temporary failure in name resolution",
        "nodename nor servname provided",
        "max retries exceeded",
        "connectionerror",
    )):
        host_match = re.search(r"host='([^']+)'", stderr)
        host = host_match.group(1) if host_match else "the upstream source"
        return (
            "Generated script reached the data-fetch step, but the upstream request failed due to "
            f"network/DNS resolution while contacting {host}. Raw error: {stderr}"
        )

    if "modulenotfounderror" in lowered or "no module named" in lowered:
        return (
            "Generated script failed because a required Python dependency was still unavailable at runtime. "
            f"Command: `{command_str}`. Raw error: {stderr}"
        )

    if "syntaxerror" in lowered:
        return f"Generated script is syntactically invalid. Raw error: {stderr}"

    return f"Generated script failed during execution. Command: `{command_str}`. Raw error: {stderr}"


async def _repair_script(
    state: DataCrawlState,
    task: dict,
    script: str,
    failure: str,
    *,
    log_id: str,
) -> str:
    messages = [
        SystemMessage(content=SCRIPT_WRITER_REPAIR_PROMPT),
        HumanMessage(content=json.dumps({
            "task": _build_script_writer_payload(task),
            "failure": failure,
            "broken_script": script,
        })),
    ]
    response = await invoke_together(
        state,
        model=TOGETHER_MODELS["script_writer"],
        messages=messages,
        temperature=0.1,
        max_tokens=2200,
        extra_body={"chat_template_kwargs": {"enable_thinking": False}},
        log_id=log_id,
    )
    repaired = _extract_script(response.content if isinstance(response.content, str) else str(response.content or ""))
    if not repaired.strip():
        raise RuntimeError(f"Script repair returned no code. Failure was: {failure}")
    return repaired


async def script_writer_node(state: DataCrawlState) -> dict:
    task = state.get("current_task", {})
    log_id = start_agent_log(
        state["user_id"],
        state["project_id"],
        state["run_id"],
        agent_name="script_writer",
        action="generate_script",
        summary=f"Generating script for {task.get('source', 'unknown source')}",
        current_task=task,
    )

    messages = [
        SystemMessage(content=SCRIPT_WRITER_SYSTEM_PROMPT),
        HumanMessage(content=json.dumps(_build_script_writer_payload(task))),
    ]

    try:
        attempts: list[tuple[str, dict | None]] = [
            (
                TOGETHER_MODELS["script_writer"],
                None,
            ),
            (
                TOGETHER_MODELS["script_writer"],
                {"chat_template_kwargs": {"enable_thinking": False}},
            ),
            (SCRIPT_WRITER_FALLBACK_MODEL, None),
        ]

        script = ""
        model_used = TOGETHER_MODELS["script_writer"]
        last_finish_reason = None

        for model_name, extra_body in attempts:
            response = await invoke_together(
                state,
                model=model_name,
                messages=messages,
                temperature=0.2,
                max_tokens=2200,
                extra_body=extra_body,
                log_id=log_id,
            )
            model_used = model_name
            last_finish_reason = response.response_metadata.get("finish_reason")
            raw_content = response.content if isinstance(response.content, str) else str(response.content or "")
            script = _extract_script(raw_content)
            if script.strip():
                break

        if not script.strip():
            raise RuntimeError(
                f"Script writer returned no code. Last finish_reason={last_finish_reason}, model={model_used}"
            )

        execution_details = {}
        dataset_csv = ""
        last_failure = ""
        candidate_scripts = [script]
        if _is_yahoo_finance_task(task):
            candidate_scripts.append(_build_yahoo_finance_script(task))

        for candidate_index, candidate_script in enumerate(candidate_scripts):
            working_script = candidate_script
            for repair_attempt in range(3):
                try:
                    compile(working_script, "<generated_script>", "exec")
                    dataset_csv, execution_details = await _execute_generated_script(state, working_script, task)
                    columns, row_count = _dataset_summary(dataset_csv)
                    if row_count <= 0:
                        raise RuntimeError("Generated script returned CSV with no data rows")
                    script = working_script
                    break
                except Exception as exc:
                    last_failure = str(exc)
                    if candidate_index == len(candidate_scripts) - 1 and repair_attempt == 2:
                        raise
                    if candidate_index < len(candidate_scripts) - 1 and repair_attempt == 0:
                        break
                    working_script = await _repair_script(
                        state,
                        task,
                        working_script,
                        last_failure,
                        log_id=log_id,
                    )
            else:
                continue

            if dataset_csv:
                break

        if not dataset_csv:
            raise RuntimeError(f"Generated script did not produce dataset output. {last_failure}")

        columns, row_count = _dataset_summary(dataset_csv)

        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="completed",
            summary=f"Generated scraping script for {task.get('source', 'unknown source')}",
            details={
                "script_preview": script[:500],
                "model_used": model_used,
                "thinking": getattr(response, "reasoning", ""),
                "execution": execution_details,
                "rows": row_count,
            },
            clear_current_task=True,
        )
        return {
            "current_agent": "orchestrator",
            "current_task": None,
            "messages": [AIMessage(
                content=(
                    f"[Script Generated and Executed]: Produced {row_count} rows.\n"
                    f"```python\n{script}\n```"
                ),
                name="script_writer",
            )],
            "datasets": [{
                "id": str(uuid.uuid4()),
                "type": "script_output",
                "script": script,
                "data_csv": dataset_csv,
                "row_count": row_count,
                "columns": columns,
                "source": task.get("source", ""),
                "target_data": task.get("target_data", ""),
            }],
            "last_script_task": task,
        }
    except Exception as exc:
        finish_agent_log(
            state["user_id"],
            state["project_id"],
            state["run_id"],
            log_id=log_id,
            status="failed",
            summary=f"Script generation failed: {exc}",
            details={"error": str(exc)},
            clear_current_task=True,
        )
        raise
