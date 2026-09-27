import { useEffect, useState, type FormEvent } from 'react';
import {
  createApplication,
  getApplications,
  updateApplicationStatus,
} from './applicationApi';
import type {
  ApplicationStatus,
  CreateJobApplicationRequest,
  JobApplication,
} from './types';

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

const emptyForm: CreateJobApplicationRequest = {
  company: '',
  title: '',
  location: '',
  postingUrl: '',
  notes: '',
  applicationDate: '',
};

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [attempt, setAttempt] = useState(0);

  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState('');

  const [form, setForm] =
    useState<CreateJobApplicationRequest>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [statusSavingId, setStatusSavingId] =
    useState<number | null>(null);
  const [statusUpdateError, setStatusUpdateError] =
    useState('');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const timeout = window.setTimeout(
      () => controller.abort(),
      8000,
    );

    async function checkConnection() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
        });

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
          setStatus(
            connected ? 'connected' : 'unavailable',
          );
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

  useEffect(() => {
    async function loadApplications() {
      try {
        const data = await getApplications();
        setApplications(data);
        setApplicationsError('');
      } catch {
        setApplicationsError(
          'Could not load applications.',
        );
      } finally {
        setApplicationsLoading(false);
      }
    }

    void loadApplications();
  }, []);

  function retryConnection() {
    setStatus('checking');
    setAttempt((previous) => previous + 1);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSaving(true);
    setSaveError('');

    try {
      const created = await createApplication(form);

      setApplications((current) => [
        created,
        ...current,
      ]);

      setForm(emptyForm);
    } catch {
      setSaveError(
        'Could not save the application. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(
    id: number,
    newStatus: ApplicationStatus,
  ) {
    setStatusSavingId(id);
    setStatusUpdateError('');

    try {
      const updated = await updateApplicationStatus(
        id,
        newStatus,
      );

      setApplications((current) =>
        current.map((application) =>
          application.id === updated.id
            ? updated
            : application,
        ),
      );
    } catch {
      setStatusUpdateError(
        'Could not update the application status.',
      );
    } finally {
      setStatusSavingId(null);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <a
          className="brand"
          href="/"
          aria-label="DevTrack home"
        >
          <span
            className="brand-mark"
            aria-hidden="true"
          >
            D
          </span>

          DevTrack
        </a>

        <span className="project-label">
          Personal job tracker
        </span>
      </header>

      <main>
        <p className="eyebrow">Getting started</p>

        <h1>
          Your applications,
          <br />
          in one place.
        </h1>

        <p className="intro">
          A place to keep track of where you applied
          and what comes next.
        </p>

        <section
          className="connection-card"
          aria-labelledby="connection-heading"
        >
          <div className="card-heading">
            <h2 id="connection-heading">
              Connection check
            </h2>

            <span className="step-label">
              Setup
            </span>
          </div>

          <div
            className="connection-result"
            role="status"
            aria-live="polite"
          >
            <span
              className={`status-dot ${status}`}
              aria-hidden="true"
            />

            <div>
              <h3>
                {connectionText[status].title}
              </h3>

              <p>
                {connectionText[status].description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={retryConnection}
            disabled={status === 'checking'}
          >
            {status === 'checking'
              ? 'Checking…'
              : 'Check again'}
          </button>
        </section>

        <section className="next-step">
          <p className="eyebrow">
            New application
          </p>

          <h2>Add an application</h2>

          <form onSubmit={handleSubmit}>
            <div>
              <label htmlFor="company">
                Company
              </label>

              <input
                id="company"
                type="text"
                value={form.company}
                onChange={(event) =>
                  setForm({
                    ...form,
                    company: event.target.value,
                  })
                }
                required
              />
            </div>

            <div>
              <label htmlFor="title">
                Job title
              </label>

              <input
                id="title"
                type="text"
                value={form.title}
                onChange={(event) =>
                  setForm({
                    ...form,
                    title: event.target.value,
                  })
                }
                required
              />
            </div>

            <div>
              <label htmlFor="location">
                Location
              </label>

              <input
                id="location"
                type="text"
                value={form.location}
                onChange={(event) =>
                  setForm({
                    ...form,
                    location: event.target.value,
                  })
                }
              />
            </div>

            <div>
              <label htmlFor="postingUrl">
                Job posting URL
              </label>

              <input
                id="postingUrl"
                type="url"
                value={form.postingUrl}
                onChange={(event) =>
                  setForm({
                    ...form,
                    postingUrl:
                      event.target.value,
                  })
                }
              />
            </div>

            <div>
              <label htmlFor="applicationDate">
                Application date
              </label>

              <input
                id="applicationDate"
                type="date"
                value={form.applicationDate}
                onChange={(event) =>
                  setForm({
                    ...form,
                    applicationDate:
                      event.target.value,
                  })
                }
                required
              />
            </div>

            <div>
              <label htmlFor="notes">
                Notes
              </label>

              <textarea
                id="notes"
                value={form.notes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    notes: event.target.value,
                  })
                }
                rows={4}
              />
            </div>

            {saveError && <p>{saveError}</p>}

            <button
              type="submit"
              disabled={saving}
            >
              {saving
                ? 'Saving…'
                : 'Save application'}
            </button>
          </form>
        </section>

        <section className="next-step">
          <p className="eyebrow">
            Applications
          </p>

          <h2>Saved applications</h2>

          {applicationsLoading && (
            <p>Loading applications…</p>
          )}

          {applicationsError && (
            <p>{applicationsError}</p>
          )}

          {statusUpdateError && (
            <p>{statusUpdateError}</p>
          )}

          {!applicationsLoading &&
            !applicationsError &&
            applications.length === 0 && (
              <p>No applications saved yet.</p>
            )}

          {applications.map((application) => (
            <div key={application.id}>
              <h3>{application.title}</h3>

              <p>{application.company}</p>

              {application.location && (
                <p>{application.location}</p>
              )}

              <label
                htmlFor={`status-${application.id}`}
              >
                Status
              </label>

              <select
                id={`status-${application.id}`}
                value={application.status}
                disabled={
                  statusSavingId === application.id
                }
                onChange={(event) =>
                  void handleStatusChange(
                    application.id,
                    event.target
                      .value as ApplicationStatus,
                  )
                }
              >
                <option value="SAVED">
                  Saved
                </option>
                <option value="APPLIED">
                  Applied
                </option>
                <option value="INTERVIEW">
                  Interview
                </option>
                <option value="OFFER">
                  Offer
                </option>
                <option value="REJECTED">
                  Rejected
                </option>
              </select>

              {statusSavingId ===
                application.id && (
                <p>Updating status…</p>
              )}
            </div>
          ))}
        </section>
      </main>

      <footer>
        DevTrack · A project in progress
      </footer>
    </div>
  );
}