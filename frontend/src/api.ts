export const sessionExpiredEvent = 'devtrack:session-expired';

type CsrfToken = { headerName: string; token: string };

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  // A fresh token handles login/logout rotation without a client-side token cache.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Could not prepare the request. Please try again.');
    const csrf: CsrfToken = await response.json();
    headers.set(csrf.headerName, csrf.token);
  }

  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401 && path !== '/api/auth/login') {
    window.dispatchEvent(new Event(sessionExpiredEvent));
  } else if (response.status === 403) {
    // Expired sessions can fail CSRF validation before authentication is checked.
    const session = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (session.status === 401) window.dispatchEvent(new Event(sessionExpiredEvent));
  }
  return response;
}
