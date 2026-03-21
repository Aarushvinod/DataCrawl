"""Data processing helpers using pandas."""

import io
import json
import pandas as pd


def csv_to_dataframe(csv_string: str) -> pd.DataFrame:
    """Convert a CSV string to a pandas DataFrame."""
    return pd.read_csv(io.StringIO(csv_string))


def dataframe_to_csv(df: pd.DataFrame) -> str:
    """Convert a pandas DataFrame to a CSV string."""
    return df.to_csv(index=False)


def json_to_dataframe(json_data: str | list) -> pd.DataFrame:
    """Convert JSON data (string or list of dicts) to a DataFrame."""
    if isinstance(json_data, str):
        json_data = json.loads(json_data)
    return pd.DataFrame(json_data)


def get_data_summary(df: pd.DataFrame) -> dict:
    """Get a summary of the DataFrame."""
    return {
        "row_count": len(df),
        "columns": list(df.columns),
        "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        "null_counts": df.isnull().sum().to_dict(),
        "sample_rows": df.head(5).to_dict(orient="records"),
    }


def merge_datasets(
    datasets: list[pd.DataFrame],
    join_key: str,
    strategy: str = "inner",
) -> pd.DataFrame:
    """Merge multiple DataFrames on a common key."""
    if not datasets:
        return pd.DataFrame()
    if len(datasets) == 1:
        return datasets[0]

    result = datasets[0]
    for df in datasets[1:]:
        result = result.merge(df, on=join_key, how=strategy)

    return result
