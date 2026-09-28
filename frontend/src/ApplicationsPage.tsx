import {
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import type { CurrentUser } from './authApi';
import {
  createApplication,
  deleteApplication,
  getApplications,
  updateApplication,
  updateApplicationStatus,
} from './applicationApi';
import {
  getDashboardSummary,
  getUpcomingInterviews,
  type DashboardSummary,
  type UpcomingInterview,
} from './dashboardApi';
import type {
  ApplicationStatus,
  CreateJobApplicationRequest,
  JobApplication,
  UpdateJobApplicationRequest,
} from './types';

type ConnectionStatus =
  | 'checking'
  | 'connected'
  | 'unavailable';

const connectionText = {
  checking: {
    title: 'Checking connection…',
    description:
      'Waiting for a response from DevTrack.',
  },
  connected: {
    title: 'Connected',
    description:
      'The backend and database are responding.',
  },
  unavailable: {
    title: 'Unable to connect',
    description:
      'Make sure the backend and database are running, then try again.',
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

const emptyDashboard: DashboardSummary = {
  total: 0,
  saved: 0,
  applied: 0,
  interview: 0,
  offer: 0,
  rejected: 0,
};

export default function ApplicationsPage({
  user,
  onLogout,
  signingOut,
  logoutError,
}: {
  user: CurrentUser;
  onLogout: () => void;
  signingOut: boolean;
  logoutError: string;
}) {
  const [status, setStatus] =
    useState<ConnectionStatus>('checking');
  const [attempt, setAttempt] = useState(0);

  const [dashboard, setDashboard] =
    useState<DashboardSummary>(emptyDashboard);
  const [dashboardLoading, setDashboardLoading] =
    useState(true);
  const [dashboardError, setDashboardError] =
    useState('');

  const [upcomingInterviews, setUpcomingInterviews] =
    useState<UpcomingInterview[]>([]);
  const [interviewsLoading, setInterviewsLoading] =
    useState(true);
  const [interviewsError, setInterviewsError] =
    useState('');

  const [applications, setApplications] = useState<
    JobApplication[]
  >([]);
  const [applicationsLoading, setApplicationsLoading] =
    useState(true);
  const [applicationsError, setApplicationsError] =
    useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    ApplicationStatus | ''
  >('');

  const [form, setForm] =
    useState<CreateJobApplicationRequest>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [statusSavingId, setStatusSavingId] =
    useState<number | null>(null);
  const [statusUpdateError, setStatusUpdateError] =
    useState('');

  const [editingId, setEditingId] =
    useState<number | null>(null);
  const [editForm, setEditForm] =
    useState<UpdateJobApplicationRequest | null>(null);
  const [editSaving, setEditSaving] =
    useState(false);
  const [editError, setEditError] = useState('');

  const [deletingId, setDeletingId] =
    useState<number | null>(null);
  const [deleteError, setDeleteError] =
    useState('');

  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError('');

    try {
      const data = await getDashboardSummary();
      setDashboard(data);
    } catch {
      setDashboardError(
        'Could not load dashboard summary.',
      );
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadUpcomingInterviews() {
    setInterviewsLoading(true);
    setInterviewsError('');

    try {
      const data = await getUpcomingInterviews();
      setUpcomingInterviews(data);
    } catch {
      setInterviewsError(
        'Could not load upcoming interviews.',
      );
    } finally {
      setInterviewsLoading(false);
    }
  }

  async function loadApplications(
    searchValue = '',
    statusValue: ApplicationStatus | '' = '',
  ) {
    setApplicationsLoading(true);
    setApplicationsError('');

    try {
      const data = await getApplications(
        searchValue,
        statusValue,
      );

      setApplications(data);
    } catch {
      setApplicationsError(
        'Could not load applications.',
      );
    } finally {
      setApplicationsLoading(false);
    }
  }

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
            connected
              ? 'connected'
              : 'unavailable',
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
    void loadDashboard();
    void loadUpcomingInterviews();
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
      await createApplication(form);

      setForm(emptyForm);

      await Promise.all([
        loadDashboard(),
        loadUpcomingInterviews(),
        loadApplications(
          search,
          statusFilter,
        ),
      ]);
    } catch {
      setSaveError(
        'Could not save the application. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleFilterSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    await loadApplications(
      search,
      statusFilter,
    );
  }

  async function clearFilters() {
    setSearch('');
    setStatusFilter('');

    await loadApplications();
  }

  async function handleStatusChange(
    id: number,
    newStatus: ApplicationStatus,
  ) {
    setStatusSavingId(id);
    setStatusUpdateError('');

    try {
      await updateApplicationStatus(
        id,
        newStatus,
      );

      await Promise.all([
        loadDashboard(),
        loadUpcomingInterviews(),
        loadApplications(
          search,
          statusFilter,
        ),
      ]);
    } catch {
      setStatusUpdateError(
        'Could not update the application status.',
      );
    } finally {
      setStatusSavingId(null);
    }
  }

  function startEditing(
    application: JobApplication,
  ) {
    setEditingId(application.id);
    setEditError('');

    setEditForm({
      company: application.company,
      title: application.title,
      location: application.location ?? '',
      postingUrl: application.postingUrl ?? '',
      notes: application.notes ?? '',
      applicationDate:
        application.applicationDate ?? '',
      interviewDate:
        application.interviewDate ?? '',
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm(null);
    setEditError('');
  }

  async function handleEditSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      editingId === null ||
      editForm === null
    ) {
      return;
    }

    setEditSaving(true);
    setEditError('');

    try {
      await updateApplication(
        editingId,
        editForm,
      );

      setEditingId(null);
      setEditForm(null);

      await Promise.all([
        loadDashboard(),
        loadUpcomingInterviews(),
        loadApplications(
          search,
          statusFilter,
        ),
      ]);
    } catch {
      setEditError(
        'Could not update the application. Please try again.',
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(
    application: JobApplication,
  ) {
    const confirmed = window.confirm(
      `Delete ${application.company} — ${application.title}?`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(application.id);
    setDeleteError('');

    try {
      await deleteApplication(application.id);

      await Promise.all([
        loadDashboard(),
        loadUpcomingInterviews(),
        loadApplications(
          search,
          statusFilter,
        ),
      ]);
    } catch {
      setDeleteError(
        'Could not delete the application. Please try again.',
      );
    } finally {
      setDeletingId(null);
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

        <div className="account-menu">
          <span>{user.email}</span>

          <button
            type="button"
            onClick={onLogout}
            disabled={signingOut}
          >
            {signingOut
              ? 'Signing out…'
              : 'Sign out'}
          </button>
        </div>
      </header>

      <main>
        {logoutError && (
          <p
            className="form-error"
            role="alert"
          >
            {logoutError}
          </p>
        )}

        <p className="eyebrow">
          Getting started
        </p>

        <h1>
          Your applications,
          <br />
          in one place.
        </h1>

        <p className="intro">
          A place to keep track of where you
          applied and what comes next.
        </p>

        <section className="next-step">
          <p className="eyebrow">
            Dashboard
          </p>

          <h2>Application summary</h2>

          {dashboardLoading && (
            <p>Loading dashboard…</p>
          )}

          {dashboardError && (
            <p className="form-error">
              {dashboardError}
            </p>
          )}

          {!dashboardLoading &&
            !dashboardError && (
              <div className="dashboard-grid">
                <div className="dashboard-card">
                  <span>Total</span>
                  <strong>
                    {dashboard.total}
                  </strong>
                </div>

                <div className="dashboard-card">
                  <span>Saved</span>
                  <strong>
                    {dashboard.saved}
                  </strong>
                </div>

                <div className="dashboard-card">
                  <span>Applied</span>
                  <strong>
                    {dashboard.applied}
                  </strong>
                </div>

                <div className="dashboard-card">
                  <span>Interview</span>
                  <strong>
                    {dashboard.interview}
                  </strong>
                </div>

                <div className="dashboard-card">
                  <span>Offer</span>
                  <strong>
                    {dashboard.offer}
                  </strong>
                </div>

                <div className="dashboard-card">
                  <span>Rejected</span>
                  <strong>
                    {dashboard.rejected}
                  </strong>
                </div>
              </div>
            )}
        </section>

        <section className="next-step">
          <p className="eyebrow">
            Upcoming interviews
          </p>

          <h2>What’s coming next</h2>

          {interviewsLoading && (
            <p>
              Loading upcoming interviews…
            </p>
          )}

          {interviewsError && (
            <p className="form-error">
              {interviewsError}
            </p>
          )}

          {!interviewsLoading &&
            !interviewsError &&
            upcomingInterviews.length === 0 && (
              <p>
                No upcoming interviews scheduled.
              </p>
            )}

          {!interviewsLoading &&
            !interviewsError &&
            upcomingInterviews.map(
              (interview) => (
                <div
                  className="upcoming-interview"
                  key={interview.id}
                >
                  <div>
                    <h3>
                      {interview.title}
                    </h3>

                    <p>
                      {interview.company}
                    </p>
                  </div>

                  <span>
                    {interview.interviewDate}
                  </span>
                </div>
              ),
            )}
        </section>

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
                {
                  connectionText[status]
                    .description
                }
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

          <form
            className="application-form"
            onSubmit={handleSubmit}
          >
            <div className="form-field">
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
                    company:
                      event.target.value,
                  })
                }
                required
              />
            </div>

            <div className="form-field">
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
                    title:
                      event.target.value,
                  })
                }
                required
              />
            </div>

            <div className="form-field">
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
                    location:
                      event.target.value,
                  })
                }
              />
            </div>

            <div className="form-field">
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

            <div className="form-field">
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

            <div className="form-field form-field-full">
              <label htmlFor="notes">
                Notes
              </label>

              <textarea
                id="notes"
                value={form.notes}
                onChange={(event) =>
                  setForm({
                    ...form,
                    notes:
                      event.target.value,
                  })
                }
                rows={4}
              />
            </div>

            {saveError && (
              <p className="form-error form-field-full">
                {saveError}
              </p>
            )}

            <div className="form-actions form-field-full">
              <button
                type="submit"
                disabled={saving}
              >
                {saving
                  ? 'Saving…'
                  : 'Save application'}
              </button>
            </div>
          </form>
        </section>

        <section className="next-step">
          <p className="eyebrow">
            Applications
          </p>

          <h2>Saved applications</h2>

          <form
            className="filter-form"
            onSubmit={handleFilterSubmit}
          >
            <div className="form-field filter-search">
              <label htmlFor="search">
                Search
              </label>

              <input
                id="search"
                type="search"
                placeholder="Company, title, or location"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="status-filter">
                Status
              </label>

              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target
                      .value as
                      | ApplicationStatus
                      | '',
                  )
                }
              >
                <option value="">
                  All statuses
                </option>
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
            </div>

            <div className="filter-actions">
              <button type="submit">
                Apply filters
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  void clearFilters()
                }
              >
                Clear filters
              </button>
            </div>
          </form>

          {applicationsLoading && (
            <p>Loading applications…</p>
          )}

          {applicationsError && (
            <p className="form-error">
              {applicationsError}
            </p>
          )}

          {statusUpdateError && (
            <p className="form-error">
              {statusUpdateError}
            </p>
          )}

          {deleteError && (
            <p className="form-error">
              {deleteError}
            </p>
          )}

          {!applicationsLoading &&
            !applicationsError &&
            applications.length === 0 && (
              <div className="empty-state">
                No applications match your filters.
              </div>
            )}

          <div className="applications-list">
            {applications.map(
              (application) => (
                <article
                  className="application-card"
                  key={application.id}
                >
                  {editingId ===
                    application.id &&
                  editForm ? (
                    <form
                      className="application-form edit-form"
                      onSubmit={
                        handleEditSubmit
                      }
                    >
                      <div className="form-field">
                        <label
                          htmlFor={`edit-company-${application.id}`}
                        >
                          Company
                        </label>

                        <input
                          id={`edit-company-${application.id}`}
                          type="text"
                          value={
                            editForm.company
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditForm({
                              ...editForm,
                              company:
                                event.target
                                  .value,
                            })
                          }
                          required
                        />
                      </div>

                      <div className="form-field">
                        <label
                          htmlFor={`edit-title-${application.id}`}
                        >
                          Job title
                        </label>

                        <input
                          id={`edit-title-${application.id}`}
                          type="text"
                          value={
                            editForm.title
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditForm({
                              ...editForm,
                              title:
                                event.target
                                  .value,
                            })
                          }
                          required
                        />
                      </div>

                      <div className="form-field">
                        <label
                          htmlFor={`edit-location-${application.id}`}
                        >
                          Location
                        </label>

                        <input
                          id={`edit-location-${application.id}`}
                          type="text"
                          value={
                            editForm.location
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditForm({
                              ...editForm,
                              location:
                                event.target
                                  .value,
                            })
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label
                          htmlFor={`edit-url-${application.id}`}
                        >
                          Job posting URL
                        </label>

                        <input
                          id={`edit-url-${application.id}`}
                          type="url"
                          value={
                            editForm.postingUrl
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditForm({
                              ...editForm,
                              postingUrl:
                                event.target
                                  .value,
                            })
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label
                          htmlFor={`edit-application-date-${application.id}`}
                        >
                          Application date
                        </label>

                        <input
                          id={`edit-application-date-${application.id}`}
                          type="date"
                          value={
                            editForm.applicationDate
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditForm({
                              ...editForm,
                              applicationDate:
                                event.target
                                  .value,
                            })
                          }
                          required
                        />
                      </div>

                      <div className="form-field">
                        <label
                          htmlFor={`edit-interview-date-${application.id}`}
                        >
                          Interview date
                        </label>

                        <input
                          id={`edit-interview-date-${application.id}`}
                          type="date"
                          value={
                            editForm.interviewDate
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditForm({
                              ...editForm,
                              interviewDate:
                                event.target
                                  .value,
                            })
                          }
                        />
                      </div>

                      <div className="form-field form-field-full">
                        <label
                          htmlFor={`edit-notes-${application.id}`}
                        >
                          Notes
                        </label>

                        <textarea
                          id={`edit-notes-${application.id}`}
                          value={
                            editForm.notes
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditForm({
                              ...editForm,
                              notes:
                                event.target
                                  .value,
                            })
                          }
                          rows={4}
                        />
                      </div>

                      {editError && (
                        <p className="form-error form-field-full">
                          {editError}
                        </p>
                      )}

                      <div className="form-actions form-field-full">
                        <button
                          type="submit"
                          disabled={editSaving}
                        >
                          {editSaving
                            ? 'Saving changes…'
                            : 'Save changes'}
                        </button>

                        <button
                          className="secondary-button"
                          type="button"
                          onClick={
                            cancelEditing
                          }
                          disabled={editSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="application-card-header">
                        <div>
                          <h3>
                            {application.title}
                          </h3>

                          <p className="application-company">
                            {application.company}
                          </p>
                        </div>

                        <span
                          className={`status-badge status-${application.status.toLowerCase()}`}
                        >
                          {application.status}
                        </span>
                      </div>

                      <div className="application-details">
                        {application.location && (
                          <p>
                            <span>
                              Location
                            </span>
                            {
                              application.location
                            }
                          </p>
                        )}

                        {application.applicationDate && (
                          <p>
                            <span>
                              Applied
                            </span>
                            {
                              application.applicationDate
                            }
                          </p>
                        )}

                        {application.interviewDate && (
                          <p>
                            <span>
                              Interview
                            </span>
                            {
                              application.interviewDate
                            }
                          </p>
                        )}
                      </div>

                      {application.notes && (
                        <p className="application-notes">
                          {application.notes}
                        </p>
                      )}

                      {application.postingUrl && (
                        <a
                          className="job-link"
                          href={
                            application.postingUrl
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          View job posting
                        </a>
                      )}

                      <div className="application-controls">
                        <div className="status-control">
                          <label
                            htmlFor={`status-${application.id}`}
                          >
                            Status
                          </label>

                          <select
                            id={`status-${application.id}`}
                            value={
                              application.status
                            }
                            disabled={
                              statusSavingId ===
                              application.id
                            }
                            onChange={(
                              event,
                            ) =>
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
                        </div>

                        <div className="application-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() =>
                              startEditing(
                                application,
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            className="danger-button"
                            type="button"
                            disabled={
                              deletingId ===
                              application.id
                            }
                            onClick={() =>
                              void handleDelete(
                                application,
                              )
                            }
                          >
                            {deletingId ===
                            application.id
                              ? 'Deleting…'
                              : 'Delete'}
                          </button>
                        </div>
                      </div>

                      {statusSavingId ===
                        application.id && (
                        <p className="saving-message">
                          Updating status…
                        </p>
                      )}
                    </>
                  )}
                </article>
              ),
            )}
          </div>
        </section>
      </main>

      <footer>
        DevTrack · A project in progress
      </footer>
    </div>
  );
}