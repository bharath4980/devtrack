import { useState, type FormEvent } from 'react';
import { ApiError } from './apiError';
import { login, register, type CurrentUser } from './authApi';

export default function AuthForm({ onAuthenticated }: {
  onAuthenticated: (user: CurrentUser) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'register') {
        await register(email, password);
        setMode('login');
        setPassword('');
        setNotice('Account created. Sign in with your new password.');
      } else {
        onAuthenticated(await login(email, password));
        setPassword('');
      }
    } catch (error) {
      setError(error instanceof ApiError && Object.keys(error.fieldErrors).length
        ? Object.entries(error.fieldErrors).map(([field, message]) => `${field}: ${message}`).join('. ')
        : error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function changeMode() {
    setMode(mode === 'login' ? 'register' : 'login');
    setPassword('');
    setError('');
    setNotice('');
  }

  return (
    <div className="page">
      <header className="header"><a className="brand" href="/">DevTrack</a></header>
      <main className="auth-panel">
        <p className="eyebrow">Your job search</p>
        <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
        <p className="intro">Keep your applications and next steps in one place.</p>
        <form className="auth-form connection-card" onSubmit={submit}>
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" autoComplete="username"
            maxLength={254} required value={email}
            onChange={(event) => setEmail(event.target.value)} disabled={busy} />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? 12 : undefined}
            maxLength={72} required value={password}
            onChange={(event) => setPassword(event.target.value)} disabled={busy}
            aria-describedby={mode === 'register' ? 'password-help' : undefined} />
          {mode === 'register' && <p id="password-help" className="form-help">
            Use 12–72 characters. Some characters use more than one byte; the limit is 72 bytes.
          </p>}
          {notice && <p role="status">{notice}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button className="text-button" type="button" onClick={changeMode} disabled={busy}>
          {mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}
        </button>
      </main>
    </div>
  );
}
