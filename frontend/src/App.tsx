import { useEffect, useState } from 'react';
import ApplicationsPage from './ApplicationsPage';
import AuthForm from './AuthForm';
import { getCurrentUser, logout, type CurrentUser } from './authApi';
import { sessionExpiredEvent } from './api';

export default function App() {
  const [user, setUser] = useState<CurrentUser | null>();
  const [sessionError, setSessionError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    getCurrentUser(controller.signal)
      .then((current) => { if (active) setUser(current); })
      .catch(() => {
        if (active) setSessionError('Could not reach DevTrack. Check that the backend is running.');
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    function sessionExpired() {
      setUser(null);
      setLogoutError('');
    }
    window.addEventListener(sessionExpiredEvent, sessionExpired);
    return () => window.removeEventListener(sessionExpiredEvent, sessionExpired);
  }, []);

  async function signOut() {
    setSigningOut(true);
    setLogoutError('');
    try {
      await logout();
      setUser(null);
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Could not sign out.');
    } finally {
      setSigningOut(false);
    }
  }

  if (user === undefined) {
    return <main className="page auth-panel">
      <h1>DevTrack</h1>
      {sessionError ? <>
        <p role="alert">{sessionError}</p>
        <button type="button" onClick={() => {
          setSessionError('');
          setAttempt((value) => value + 1);
        }}>Try again</button>
      </> : <p role="status">Checking your session…</p>}
    </main>;
  }
  if (!user) return <AuthForm onAuthenticated={setUser} />;
  return <ApplicationsPage key={user.id} user={user}
    onLogout={() => void signOut()} signingOut={signingOut} logoutError={logoutError} />;
}
