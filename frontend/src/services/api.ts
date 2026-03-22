const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

let getTokenFn: (() => Promise<string>) | null = null;

export function setTokenGetter(fn: () => Promise<string>) {
  getTokenFn = fn;
}

async function getHeaders(contentType?: string): Promise<HeadersInit> {
  const headers: Record<string, string> = {};

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  if (getTokenFn) {
    try {
      const token = await getTokenFn();
      headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // Token retrieval failed — continue without auth header
    }
  }

  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new ApiError(response.status, response.statusText, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export class ApiError extends Error {
  status: number;
  statusText: string;
  body: string;

  constructor(status: number, statusText: string, body: string) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof ApiError) {
    const rawBody = error.body?.trim();
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as Record<string, unknown>;
        const detail = parsed.detail ?? parsed.message ?? parsed.error;
        if (typeof detail === 'string' && detail.trim()) {
          return detail;
        }
      } catch {
        return rawBody;
      }
    }
    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

export const api = {
  async get<T = unknown>(path: string): Promise<T> {
    const headers = await getHeaders('application/json');
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers,
    });
    return handleResponse<T>(response);
  },

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const headers = await getHeaders('application/json');
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    const headers = await getHeaders('application/json');
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async delete<T = unknown>(path: string): Promise<T> {
    const headers = await getHeaders('application/json');
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers,
    });
    return handleResponse<T>(response);
  },

  async upload<T = unknown>(path: string, formData: FormData): Promise<T> {
    const headers = await getHeaders();
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    return handleResponse<T>(response);
  },
};

export default api;
