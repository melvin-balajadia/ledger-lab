const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...init });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function sendJson<T>(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    const message = Array.isArray(json.error) ? json.error.join('; ') : (json.error ?? res.statusText);
    throw new Error(message);
  }
  return json as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return sendJson<T>('POST', path, body);
}

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return sendJson<T>('PATCH', path, body);
}

export async function deleteRequest(path: string, body?: { reason?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    credentials: 'include',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? res.statusText);
  }
}

export async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', credentials: 'include', body: formData });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

// Client and server run on different origins, so the session cookie
// (SameSite=Lax) is never attached to a plain cross-origin <img src>. Fetch
// the bytes with credentials instead and hand the browser an object URL.
export async function fetchImageUrl(path: string): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
