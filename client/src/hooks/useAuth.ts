import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postJson } from '../lib/api';
import type { AuthUser } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const ME_QUERY_KEY = ['auth', 'me'];

// A 401 here means "logged out", not a failed request -- resolve to null
// instead of throwing so the rest of the app doesn't treat it as an error.
async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/auth/me failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<AuthUser>;
}

export function useAuthMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, retry: false });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) => postJson<AuthUser>('/api/auth/login', body),
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postJson<Record<string, never>>('/api/auth/logout', {}),
    onSuccess: () => queryClient.setQueryData(ME_QUERY_KEY, null),
  });
}
