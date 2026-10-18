import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CurrentUser } from './authApi';
import { createApplication, deleteApplication, getApplications, updateApplication, updateApplicationStatus } from './applicationApi';
import { getDashboardSummary, getDueFollowUps, getUpcomingInterviews, type DashboardSummary, type DueFollowUp, type UpcomingInterview } from './dashboardApi';
import { errorMessage } from './apiError';
import { statuses, statusLabel, type ApplicationPage, type ApplicationQuery, type ApplicationSort, type ApplicationStatus, type JobApplication, type UpdateJobApplicationRequest } from './types';
import ApplicationForm from './ApplicationForm';
import ApplicationCard from './ApplicationCard';
import Dashboard from './Dashboard';

const initialQuery: ApplicationQuery = { search: '', status: '', sort: 'NEWEST', page: 0 };

type Props = { user: CurrentUser; onLogout: () => void; signingOut: boolean; logoutError: string };

export default function ApplicationsPage({ user, onLogout, signingOut, logoutError }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | ''>('');
  const [sort, setSort] = useState<ApplicationSort>('NEWEST');
  const [page, setPage] = useState<ApplicationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [interviews, setInterviews] = useState<UpcomingInterview[]>([]);
  const [followUps, setFollowUps] = useState<DueFollowUp[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const mutationPending = useRef(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    getApplications(query, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      // A deletion or another tab can remove the last row on this page.
      if (query.page > 0 && result.items.length === 0) {
        setQuery(current => ({ ...current, page: Math.max(0, result.totalPages - 1) }));
      } else setPage(result);
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(errorMessage(error, 'Could not load applications.'));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setDashboardLoading(true);
    setDashboardError('');
    Promise.all([getDashboardSummary(controller.signal), getUpcomingInterviews(controller.signal), getDueFollowUps(controller.signal)])
      .then(([counts, upcoming, due]) => {
        if (!controller.signal.aborted) { setSummary(counts); setInterviews(upcoming); setFollowUps(due); }
      }).catch(error => {
        if (!controller.signal.aborted) setDashboardError(errorMessage(error, 'Could not load dashboard.'));
      }).finally(() => { if (!controller.signal.aborted) setDashboardLoading(false); });
    return () => controller.abort();
  }, [revision]);

  async function mutate(action: () => Promise<unknown>, message: string) {
    if (mutationPending.current) throw new Error('Please wait for the current change to finish.');
    mutationPending.current = true;
    setBusy(true); setActionError(''); setNotice('');
    try {
      await action();
      setNotice(message);
      refresh();
    } finally {
      mutationPending.current = false;
      setBusy(false);
    }
  }

  async function create(values: UpdateJobApplicationRequest) {
    await mutate(() => createApplication(values), 'Application saved.');
    setCreating(false);
    addButton.current?.focus();
  }

  async function edit(id: number, values: UpdateJobApplicationRequest) {
    await mutate(() => updateApplication(id, values), 'Changes saved.');
    setEditingId(null);
  }

  async function changeStatus(id: number, next: ApplicationStatus) {
    try { await mutate(() => updateApplicationStatus(id, next), 'Status updated.'); }
    catch (error) { setActionError(errorMessage(error, 'Could not update status.')); }
  }

  async function remove(application: JobApplication) {
    if (!window.confirm(`Delete ${application.company} — ${application.title}? This cannot be undone.`)) return;
    try {
      await mutate(() => deleteApplication(application.id), 'Application deleted.');
      if (editingId === application.id) setEditingId(null);
    } catch (error) { setActionError(errorMessage(error, 'Could not delete application.')); }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditingId(null);
    setQuery({ search: search.trim(), status, sort, page: 0 });
  }

  function clearFilters() {
    setSearch(''); setStatus(''); setSort('NEWEST'); setEditingId(null);
    setQuery({ ...initialQuery });
  }

  const blocked = busy || signingOut;
  return <div className="page">
    <a className="skip-link" href="#applications">Skip to applications</a>
    <header className="header">
      <div className="header-start">
        <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">D</span><span>DevTrack</span></a>
        <nav className="top-nav" aria-label="Workspace navigation">
          <a href="#overview">Overview</a>
          <a href="#applications">Applications</a>
        </nav>
      </div>
      <div className="account-menu">
        <span className="account-avatar" aria-hidden="true">{user.email.charAt(0).toUpperCase()}</span>
        <span className="account-email">{user.email}</span>
        <button className="secondary-button" onClick={onLogout} disabled={blocked}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
      </div>
    </header>
    <main className="workspace">
      {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
      <div className="workspace-heading">
        <div className="hero-copy">
          <p className="eyebrow">Your career workspace</p>
          <h1>Make every application count.</h1>
          <p className="intro">Stay on top of opportunities, upcoming interviews, and the next step in your search.</p>
        </div>
        <button className="add-button" ref={addButton} disabled={blocked || creating} onClick={() => { setCreating(true); setEditingId(null); }}>
          <span aria-hidden="true" className="button-plus">+</span> Add application
        </button>
      </div>
      <Dashboard summary={summary} interviews={interviews} followUps={followUps} loading={dashboardLoading} error={dashboardError} onRetry={refresh} />
      <p className="save-notice" role="status">{notice}</p>
      {creating && <section className="editor-section" aria-label="Add application"><div className="section-heading"><div><p className="eyebrow">New opportunity</p><h2>New application</h2></div></div>
        <ApplicationForm busy={blocked} onSave={create} onCancel={() => { setCreating(false); addButton.current?.focus(); }} />
      </section>}
      <section className="next-step" id="applications" tabIndex={-1} aria-labelledby="applications-heading">
        <div className="section-heading">
          <div><p className="eyebrow">Application tracker</p><h2 id="applications-heading">Your applications</h2>
            <p className="section-description">Search, filter, and manage each opportunity in one place.</p></div>
        </div>
        <form className="filter-form" onSubmit={applyFilters}>
          <div className="form-field filter-search"><label htmlFor="search">Search</label>
            <input id="search" type="search" maxLength={255} placeholder="Company, title, or location" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <div className="form-field"><label htmlFor="status-filter">Status filter</label>
            <select id="status-filter" value={status} onChange={event => setStatus(event.target.value as ApplicationStatus | '')}>
              <option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}
            </select>
          </div>
          <div className="form-field"><label htmlFor="sort">Sort by</label>
            <select id="sort" value={sort} onChange={event => setSort(event.target.value as ApplicationSort)}>
              <option value="NEWEST">Newest saved</option><option value="OLDEST">Oldest saved</option>
              <option value="COMPANY">Company A–Z</option><option value="APPLICATION_DATE">Application date</option>
            </select>
          </div>
          <div className="filter-actions"><button disabled={blocked}>Apply filters</button>
            <button type="button" className="secondary-button" onClick={clearFilters} disabled={blocked}>Clear filters</button>
          </div>
        </form>
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {loading && <p role="status">Loading applications…</p>}
        {loadError && <div role="alert"><p className="form-error">{loadError}</p><button className="secondary-button" onClick={refresh}>Retry applications</button></div>}
        {!loading && !loadError && page && <>
          <p className="results-count" role="status">{page.totalElements} {page.totalElements === 1 ? 'application' : 'applications'}{query.search || query.status ? ' matching your filters' : ''}</p>
          {page.items.length === 0 ? <div className="empty-state"><span className="empty-symbol" aria-hidden="true">◇</span><p>{query.search || query.status ? 'No matches. Try another search or clear your filters.' : 'Your list is empty. Add your first application to get started.'}</p></div> :
            <div className="applications-list">{page.items.map(application => <ApplicationCard key={application.id} application={application}
              editing={editingId === application.id} busy={blocked} onEdit={() => { setEditingId(application.id); setCreating(false); }}
              onCancel={() => setEditingId(null)} onSave={values => edit(application.id, values)}
              onStatus={next => void changeStatus(application.id, next)} onDelete={() => void remove(application)} />)}</div>}
          {page.totalPages > 1 && <nav className="pagination" aria-label="Application pages">
            <button className="secondary-button" disabled={blocked || query.page === 0} onClick={() => { setEditingId(null); setQuery(value => ({ ...value, page: value.page - 1 })); }}>Previous</button>
            <span>Page {page.page + 1} of {page.totalPages}</span>
            <button className="secondary-button" disabled={blocked || query.page + 1 >= page.totalPages} onClick={() => { setEditingId(null); setQuery(value => ({ ...value, page: value.page + 1 })); }}>Next</button>
          </nav>}
        </>}
      </section>
    </main>
    <footer>DevTrack · Built for a more organized job search.</footer>
  </div>;
}
