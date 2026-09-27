import { useEffect, useState } from 'react';

type ConnectionStatus = 'checking' | 'connected' | 'unavailable';

const connectionText = {
  checking: {
    title: 'Checking connection…',
    description: 'Waiting for a response from DevTrack.',
  },
  connected: {
    title: 'Connected',
    description: 'The backend and database are responding.',
  },
  unavailable: {
    title: 'Unable to connect',
    description: 'Make sure the backend and database are running, then try again.',
  },
};

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    async function checkConnection() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Health check failed');
        }

        const data: unknown = await response.json();
        const connected =
          typeof data === 'object' &&
          data !== null &&
          'status' in data &&
          data.status === 'UP';

        if (active) {
          setStatus(connected ? 'connected' : 'unavailable');
        }
      } catch {
        if (active) {
          setStatus('unavailable');
        }
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkConnection();

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  function retryConnection() {
    setStatus('checking');
    setAttempt((previous) => previous + 1);
  }

  return (
    <div className="page">
      <header className="header">
        <a className="brand" href="/" aria-label="DevTrack home">
          <span className="brand-mark" aria-hidden="true">D</span>
          DevTrack
        </a>
        <span className="project-label">Personal job tracker</span>
      </header>

      <main>
        <p className="eyebrow">Getting started</p>
        <h1>Your applications,<br />in one place.</h1>
        <p className="intro">
          A place to keep track of where you applied and what comes next.
        </p>

        <section className="connection-card" aria-labelledby="connection-heading">
          <div className="card-heading">
            <h2 id="connection-heading">Connection check</h2>
            <span className="step-label">Setup</span>
          </div>
          <div className="connection-result" role="status" aria-live="polite">
            <span className={`status-dot ${status}`} aria-hidden="true" />
            <div>
              <h3>{connectionText[status].title}</h3>
              <p>{connectionText[status].description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={retryConnection}
            disabled={status === 'checking'}
          >
            {status === 'checking' ? 'Checking…' : 'Check again'}
          </button>
        </section>

        <section className="next-step" aria-labelledby="next-heading">
          <p className="eyebrow">Up next</p>
          <h2 id="next-heading">Add your first application</h2>
          <p>
            Application tracking is still being built. This page currently checks
            the connection only.
          </p>
        </section>
      </main>

      <footer>DevTrack · A project in progress</footer>
    </div>
  );
}
