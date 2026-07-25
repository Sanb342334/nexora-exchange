function resolveApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return '/api';
  return 'http://localhost:4000/api';
}

const API_URL = resolveApiUrl();

const ACCESS_KEY = 'p2p_access';
const REFRESH_KEY = 'p2p_refresh';

export const tokenStore = {
  get access() {
    return typeof window !== 'undefined' ? localStorage.getItem(ACCESS_KEY) : null;
  },
  get refresh() {
    return typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function refreshTokens(): Promise<boolean> {
  const refresh = tokenStore.refresh;
  if (!refresh) return false;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  const data = await res.json();
  tokenStore.set(data.accessToken, data.refreshToken);
  return true;
}

const REQUEST_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function api<T = any>(
  path: string,
  options: RequestInit & { retry?: boolean } = {},
): Promise<T> {
  const { retry = true, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  const access = tokenStore.access;
  if (access) headers['Authorization'] = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Сервер не отвечает. Проверьте backend на :4000', 0);
  }

  if (res.status === 401 && retry) {
    const ok = await refreshTokens();
    if (ok) return api<T>(path, { ...options, retry: false });
    tokenStore.clear();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError('Не авторизован', 401);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message ?? 'Ошибка запроса';
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const apiGet = <T = any>(path: string) => api<T>(path, { method: 'GET' });
export const apiPost = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const apiPatch = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
export const apiDelete = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

export async function apiUpload(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  const access = tokenStore.access;
  if (access) headers['Authorization'] = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_URL}/uploads`, { method: 'POST', headers, body: form });
  } catch {
    throw new ApiError('Сервер не отвечает. Проверьте backend на :4000', 0);
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(', ')
      : data?.message ?? 'Ошибка загрузки';
    throw new ApiError(message, res.status);
  }
  return data as { url: string };
}

export function resolveUploadUrl(url: string): string {
  if (url.startsWith('http')) return url;
  const base = API_URL.replace(/\/api$/, '');
  return `${base}${url}`;
}
