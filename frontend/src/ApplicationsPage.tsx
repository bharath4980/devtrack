import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { CurrentUser } from './authApi';
import { createApplication, deleteApplication, downloadApplicationsCsv, getApplications, rescheduleFollowUp, updateApplication, updateApplicationStatus } from './applicationApi';
import { getDashboardSummary, getDueFollowUps, getUpcomingFollowUps, getUpcomingInterviews, getUpcomingInterviewRounds, getRecentActivity, getDashboardAnalytics, type DashboardSummary, type DueFollowUp, type UpcomingInterview, type UpcomingInterviewRound, type ApplicationActivity, type DashboardAnalytics } from './dashboardApi';
import { errorMessage } from './apiError';
import { statuses, statusLabel, type ApplicationPage, type ApplicationQuery, type ApplicationSort, type ApplicationStatus, type JobApplication, type UpdateJobApplicationRequest } from './types';
import ApplicationForm from './ApplicationForm';
import ApplicationCard from './ApplicationCard';
import Dashboard from './Dashboard';
import PipelineBoard from './PipelineBoard';
import CsvImportPanel from './CsvImportPanel';

const initialQuery: ApplicationQuery = { search: '', status: '', sort: 'NEWEST', page: 0 };

type Props = { user: CurrentUser; onLogout: () => void; signingOut: boolean; logoutError: string };

export default function ApplicationsPage({ user, onLogout, signingOut, logoutError }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkTarget, setBulkTarget] = useState<ApplicationStatus | ''>('');
  const [bulkProgress, setBulkProgress] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | ''>('');
  const [sort, setSort] = useState<ApplicationSort>('NEWEST');
  const [page, setPage] = useState<ApplicationPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [dashboardRevision, setDashboardRevision] = useState(0);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [interviews, setInterviews] = useState<UpcomingInterview[]>([]);
  const [upcomingRounds, setUpcomingRounds] = useState<UpcomingInterviewRound[]>([]);
  const [followUps, setFollowUps] = useState<DueFollowUp[]>([]);
  const [upcomingFollowUps, setUpcomingFollowUps] = useState<DueFollowUp[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [recentActivity, setRecentActivity] = useState<ApplicationActivity[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const mutationPending = useRef(false);
  const [actionError, setActionError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [exportError, setExportError] = useState('');
  const [notice, setNotice] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  const refresh = () => setRevision(value => value + 1);
  const refreshDashboard = () => setDashboardRevision(value => value + 1);

  // A page change must never silently include applications from another page.
  useEffect(() => {
    setSelectedIds([]);
    setBulkTarget('');
  }, [query]);

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
    Promise.all([
      getDashboardSummary(controller.signal), getUpcomingInterviews(controller.signal), getUpcomingInterviewRounds(controller.signal),
      getDueFollowUps(controller.signal), getUpcomingFollowUps(controller.signal),
      getDashboardAnalytics(controller.signal), getRecentActivity(controller.signal),
    ]).then(([counts, upcoming, rounds, due, soon, trends, activity]) => {
      if (!controller.signal.aborted) {
        setSummary(counts); setInterviews(upcoming); setUpcomingRounds(rounds); setFollowUps(due);
        setUpcomingFollowUps(soon); setAnalytics(trends); setRecentActivity(activity);
      }
    }).catch(error => {
        if (!controller.signal.aborted) setDashboardError(errorMessage(error, 'Could not load dashboard.'));
      }).finally(() => { if (!controller.signal.aborted) setDashboardLoading(false); });
    return () => controller.abort();
  }, [revision, dashboardRevision]);

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

  async function changeFollowUpDate(id: number, date: string) {
    await mutate(() => rescheduleFollowUp(id, date), 'Follow-up rescheduled.');
  }

  async function changeStatus(id: number, next: ApplicationStatus) {
    try { await mutate(() => updateApplicationStatus(id, next), 'Status updated.'); }
    catch (error) { setActionError(errorMessage(error, 'Could not update status.')); }
  }

  async function applyBulkStatus() {
    if (!page || busy || signingOut || mutationPending.current || !bulkTarget) return;
    const affected = page.items.filter(application =>
      selectedIds.includes(application.id) && application.status !== bulkTarget);
    if (affected.length === 0) return;
    if (!window.confirm(`Move ${affected.length} selected ${affected.length === 1 ? 'application' : 'applications'} to ${statusLabel(bulkTarget)}? This records a status change for each application.`)) return;

    mutationPending.current = true;
    setBusy(true);
    setActionError('');
    setNotice('');
    let updated = 0;
    let failure: unknown = null;
    try {
      for (const application of affected) {
        setBulkProgress(`Updating ${updated + 1} of ${affected.length}…`);
        try {
          await updateApplicationStatus(application.id, bulkTarget);
          updated++;
        } catch (error) {
          failure = error;
          break; // Preserve prior successful changes; never claim an atomic batch.
        }
      }
      if (failure) {
        setActionError(`Updated ${updated} of ${affected.length} applications. Remaining updates were not applied. ${errorMessage(failure, 'Could not update status.')}`);
      } else {
        setNotice(`${updated} ${updated === 1 ? 'application' : 'applications'} moved to ${statusLabel(bulkTarget)}.`);
      }
    } finally {
      mutationPending.current = false;
      setBulkProgress('');
      setBusy(false);
      setSelectedIds([]);
      setBulkTarget('');
      refresh();
    }
  }

  async function remove(application: JobApplication) {
    if (!window.confirm(`Delete ${application.company} — ${application.title}? This cannot be undone.`)) return;
    try {
      await mutate(() => deleteApplication(application.id), 'Application deleted.');
      if (editingId === application.id) setEditingId(null);
    } catch (error) { setActionError(errorMessage(error, 'Could not delete application.')); }
  }

  async function exportCsv() {
    if (exporting || signingOut) return;
    setExporting(true);
    setExportError('');
    try {
      await downloadApplicationsCsv();
    } catch (error) {
      setExportError(errorMessage(error, 'Could not download the CSV file.'));
    } finally {
      setExporting(false);
    }
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
  const selectedOnPage = page?.items.filter(application => selectedIds.includes(application.id)) ?? [];
  const countToMove = selectedOnPage.filter(application => application.status !== bulkTarget).length;
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
      <Dashboard summary={summary} interviews={interviews} upcomingRounds={upcomingRounds} followUps={followUps} upcomingFollowUps={upcomingFollowUps} analytics={analytics} recentActivity={recentActivity} loading={dashboardLoading} error={dashboardError} onRetry={refresh} onReschedule={changeFollowUpDate} onEdit={edit} onInterviewChange={refreshDashboard} revision={revision} busy={busy || signingOut} />
      <p className="save-notice" role="status">{notice}</p>
      {creating && <section className="editor-section" aria-label="Add application"><div className="section-heading"><div><p className="eyebrow">New opportunity</p><h2>New application</h2></div></div>
        <ApplicationForm busy={blocked} onSave={create} onCancel={() => { setCreating(false); addButton.current?.focus(); }} />
      </section>}
      <section className="next-step" id="applications" tabIndex={-1} aria-labelledby="applications-heading">
        <div className="section-heading export-heading">
          <div><p className="eyebrow">Application tracker</p><h2 id="applications-heading">Your applications</h2>
            <p className="section-description">Search, filter, and manage each opportunity in one place.</p></div>
          <div className="csv-action-buttons">
            <button type="button" className="secondary-button"
              disabled={blocked || exporting} aria-expanded={showCsvImport}
              onClick={() => setShowCsvImport(current => !current)}>
              {showCsvImport ? 'Hide CSV import' : 'Import CSV'}
            </button>
            <button type="button" className="secondary-button export-button"
              disabled={blocked || exporting} onClick={() => void exportCsv()}>
              {exporting ? 'Preparing CSV…' : 'Export all CSV'}
            </button>
          </div>
        </div>
        {exportError && <p className="form-error" role="alert">{exportError}</p>}
        {showCsvImport && <CsvImportPanel disabled={blocked} onCancel={() => setShowCsvImport(false)}
          onImported={count => {
            setShowCsvImport(false);
            setNotice(count + (count === 1 ? ' application imported.' : ' applications imported.'));
            setQuery({ ...initialQuery });
            setView('list');
            setSelectedIds([]);
            refresh();
          }} />}
        <div className="application-view-switch" role="group" aria-label="Application view">
          <button type="button" aria-pressed={view === 'list'} disabled={blocked}
            className={view === 'list' ? 'view-active' : 'secondary-button'}
            onClick={() => { setView('list'); refresh(); }}>List view</button>
          <button type="button" aria-pressed={view === 'board'} disabled={blocked}
            className={view === 'board' ? 'view-active' : 'secondary-button'}
            onClick={() => { setView('board'); setEditingId(null); setSelectedIds([]); setBulkTarget(''); }}>Board view</button>
        </div>
        {view === 'list' && <form className="filter-form" onSubmit={applyFilters}>
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
        </form>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {view === 'board' && <PipelineBoard revision={revision} busy={blocked} onMove={changeStatus} onEdit={edit} onInterviewChange={refreshDashboard} />}
        {view === 'list' && <>
        {loading && <p role="status">Loading applications…</p>}
        {loadError && <div role="alert"><p className="form-error">{loadError}</p><button className="secondary-button" onClick={refresh}>Retry applications</button></div>}
        {!loading && !loadError && page && <>
          <p className="results-count" role="status">{page.totalElements} {page.totalElements === 1 ? 'application' : 'applications'}{query.search || query.status ? ' matching your filters' : ''}</p>
          {page.items.length > 0 && <div className="bulk-toolbar" role="group" aria-label="Bulk status actions">
            <label className="bulk-select-all">
              <input type="checkbox" aria-label="Select all applications on this page"
                checked={selectedOnPage.length === page.items.length}
                disabled={blocked}
                onChange={event => setSelectedIds(event.target.checked ? page.items.map(item => item.id) : [])} />
              <span>Select page</span>
            </label>
            <span className="bulk-selected-count">{selectedOnPage.length} selected on this page</span>
            <label htmlFor="bulk-status-target">Move selected to</label>
            <select id="bulk-status-target" value={bulkTarget} disabled={blocked || !selectedOnPage.length}
              onChange={event => setBulkTarget(event.target.value as ApplicationStatus | '')}>
              <option value="">Choose stage</option>
              {statuses.map(stage => <option key={stage} value={stage}>{statusLabel(stage)}</option>)}
            </select>
            <button type="button" disabled={blocked || !bulkTarget || countToMove === 0}
              onClick={() => void applyBulkStatus()}>Move selected</button>
            <button type="button" className="secondary-button" disabled={blocked || !selectedOnPage.length}
              onClick={() => { setSelectedIds([]); setBulkTarget(''); }}>Clear selection</button>
            {bulkTarget && selectedOnPage.length > 0 && <p className="form-help bulk-change-note">
              {countToMove} of {selectedOnPage.length} will change stage; already-matching applications stay unchanged.
            </p>}
            {bulkProgress && <p className="form-help bulk-progress" role="status">{bulkProgress}</p>}
          </div>}
          {page.items.length === 0 ? <div className="empty-state"><span className="empty-symbol" aria-hidden="true">◇</span><p>{query.search || query.status ? 'No matches. Try another search or clear your filters.' : 'Your list is empty. Add your first application to get started.'}</p></div> :
            <div className="applications-list">{page.items.map(application => <ApplicationCard key={application.id} application={application}
              editing={editingId === application.id} busy={blocked}
              selected={selectedIds.includes(application.id)}
              onSelect={checked => setSelectedIds(current => checked
                ? current.includes(application.id) ? current : [...current, application.id]
                : current.filter(id => id !== application.id))}
              onEdit={() => { setEditingId(application.id); setCreating(false); }}
              onCancel={() => setEditingId(null)} onSave={values => edit(application.id, values)}
              onStatus={next => void changeStatus(application.id, next)} onDelete={() => void remove(application)} onInterviewChange={refreshDashboard} />)}</div>}
          {page.totalPages > 1 && <nav className="pagination" aria-label="Application pages">
            <button className="secondary-button" disabled={blocked || query.page === 0} onClick={() => { setEditingId(null); setQuery(value => ({ ...value, page: value.page - 1 })); }}>Previous</button>
            <span>Page {page.page + 1} of {page.totalPages}</span>
            <button className="secondary-button" disabled={blocked || query.page + 1 >= page.totalPages} onClick={() => { setEditingId(null); setQuery(value => ({ ...value, page: value.page + 1 })); }}>Next</button>
          </nav>}
        </>}
        </>}
      </section>
    </main>
    <footer>DevTrack · Built for a more organized job search.</footer>
  </div>;
}
