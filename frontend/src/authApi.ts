import { apiFetch } from './api';
import { readApiError } from './apiError';

export type CurrentUser = { id: number; email: string };

export async function getCurrentUser(signal?: AbortSignal): Promise<CurrentUser | null> {
  const response = await fetch('/api/auth/me', {
    credentials: 'same-origin', cache: 'no-store', signal,
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Could not reach DevTrack. Please try again.');
  return response.json();
}

export async function register(email: string, password: string): Promise<void> {
  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw await readApiError(response, 'Could not create your account.');
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: email.trim().toLowerCase(), password }),
  });
  if (response.status === 401) throw new Error('Email or password is incorrect.');
  if (!response.ok) throw await readApiError(response, 'Could not sign in. Please try again.');
  const user = await getCurrentUser();
  if (!user) throw new Error('Could not start your session. Please sign in again.');
  return user;
}

export async function logout(): Promise<void> {
  const response = await apiFetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok && response.status !== 401) throw new Error('Could not sign out. Please try again.');
}
