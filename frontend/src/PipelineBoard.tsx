import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { getApplications } from './applicationApi';
import ApplicationForm from './ApplicationForm';
import ApplicationTimeline from './ApplicationTimeline';
import InterviewWorkspace from './InterviewWorkspace';
import { errorMessage } from './apiError';
import {
  statuses, statusLabel,
  type ApplicationPage, type ApplicationSort, type ApplicationStatus,
  type JobApplication, type UpdateJobApplicationRequest,
} from './types';

const PAGE_SIZE = 20;
type Columns = Partial<Record<ApplicationStatus, ApplicationPage>>;
type BoardFilters = { search: string; stage: ApplicationStatus | ''; sort: ApplicationSort };
const initialFilters: BoardFilters = { search: '', stage: '', sort: 'NEWEST' };

type Props = {
  revision: number;
  busy: boolean;
  onMove: (id: number, status: ApplicationStatus) => Promise<void>;
  onEdit: (id: number, values: UpdateJobApplicationRequest) => Promise<void>;
  onInterviewChange: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function postingLink(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

function daysAway(date: string, today: string) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

function attentionLabels(application: JobApplication, today: string) {
  const labels: { kind: string; text: string }[] = [];
  const active = !['OFFER', 'REJECTED'].includes(application.status);
  if (active && application.followUpDate) {
    const days = daysAway(application.followUpDate, today);
    if (days < 0) labels.push({ kind: 'overdue', text: 'Follow-up overdue' });
    else if (days === 0) labels.push({ kind: 'today', text: 'Follow-up today' });
    else if (days <= 7) labels.push({ kind: 'upcoming', text: 'Follow-up in ' + days + (days === 1 ? ' day' : ' days') });
  }
  if (application.status === 'INTERVIEW' && application.interviewDate) {
    const days = daysAway(application.interviewDate, today);
    if (days >= 0 && days <= 7) labels.push({
      kind: 'interview', text: days === 0 ? 'Interview today' :
        days === 1 ? 'Interview tomorrow' : 'Interview in ' + days + ' days',
    });
  }
  return labels;
}

export default function PipelineBoard({ revision, busy, onMove, onEdit, onInterviewChange, onDirtyChange }: Props) {
  const [filters, setFilters] = useState<BoardFilters>(initialFilters);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftStage, setDraftStage] = useState<ApplicationStatus | ''>('');
  const [draftSort, setDraftSort] = useState<ApplicationSort>('NEWEST');
  const [columns, setColumns] = useState<Columns>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState<ApplicationStatus | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<ApplicationStatus | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [interviewDirty, setInterviewDirty] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const lastLoadedQuery = useRef<string | null>(null);
  const pending = useRef<AbortController[]>([]);
  const detailRef = useRef<HTMLHeadingElement>(null);
  const now = new Date();
  const todayLocal = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')].join('-');
  const draftDirty = (editing && editDirty) || (!editing && interviewDirty);
  useEffect(() => { onDirtyChange?.(draftDirty); }, [draftDirty, onDirtyChange]);
  function confirmDiscardDraft() {
    return !draftDirty || window.confirm('Discard unsaved application or interview changes?');
  }
  const visibleStages = filters.stage ? [filters.stage] : statuses;
  const selected = statuses.flatMap(stage => columns[stage]?.items ?? [])
    .find(item => item.id === selectedId);

  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    pending.current.forEach(request => request.abort());
    pending.current = [];
    const queryKey = JSON.stringify([filters.search, filters.stage, filters.sort, retry]);
    // A revision-only refresh must not unmount the editor or discard unsaved fields.
    // New filters and initial loads still clear stale cards and show the loading state.
    const backgroundRefresh = lastLoadedQuery.current === queryKey;
    if (!backgroundRefresh) {
      setLoading(true);
      setColumns({});
    }
    setError('');
    setMoreError('');
    setLoadingMore(null);
    const stages = filters.stage ? [filters.stage] : statuses;
    Promise.all(stages.map(async stage => {
      const query = { size: PAGE_SIZE, status: stage, search: filters.search, sort: filters.sort };
      const first = await getApplications({ ...query, page: 0 }, controller.signal);
      // Refresh every page already shown so later cards (and an open editor) stay visible.
      const lastPage = backgroundRefresh
        ? Math.min(columns[stage]?.page ?? 0, first.totalPages - 1) : 0;
      if (lastPage <= 0) return first;
      const rest = await Promise.all(Array.from({ length: lastPage }, (_, index) =>
        getApplications({ ...query, page: index + 1 }, controller.signal)));
      const seen = new Set<number>();
      return {
        ...first,
        page: lastPage,
        items: [first, ...rest].flatMap(result => result.items).filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        }),
      };
    })).then(pages => {
      if (!controller.signal.aborted && version === generation.current) {
        lastLoadedQuery.current = queryKey;
        setColumns(Object.fromEntries(stages.map((stage, index) => [stage, pages[index]])) as Columns);
      }
    }).catch(reason => {
      if (!controller.signal.aborted) {
        if (backgroundRefresh) setMoreError(errorMessage(reason, 'Could not refresh the pipeline.'));
        else setError(errorMessage(reason, 'Could not load the pipeline.'));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
      pending.current.forEach(request => request.abort());
      pending.current = [];
    };
  }, [revision, filters, retry]);

  useEffect(() => {
    if (!loading && !error && selectedId !== null && !selected) {
      setSelectedId(null);
      setEditing(false);
    }
  }, [loading, error, selectedId, selected]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmDiscardDraft()) return;
    setSelectedId(null);
    setEditDirty(false);
    setInterviewDirty(false);
    setEditing(false);
    setFilters({ search: draftSearch.trim(), stage: draftStage, sort: draftSort });
  }

  function clearFilters() {
    if (!confirmDiscardDraft()) return;
    setEditDirty(false);
    setInterviewDirty(false);
    setDraftSearch('');
    setDraftStage('');
    setDraftSort('NEWEST');
    setSelectedId(null);
    setEditing(false);
    setFilters({ ...initialFilters });
  }

  async function loadMore(stage: ApplicationStatus) {
    const current = columns[stage];
    if (!current || busy || loadingMore || loading || current.page + 1 >= current.totalPages) return;
    const version = generation.current;
    const controller = new AbortController();
    pending.current.push(controller);
    setLoadingMore(stage);
    setMoreError('');
    try {
      const next = await getApplications({
        page: current.page + 1, size: PAGE_SIZE,
        status: stage, search: filters.search, sort: filters.sort,
      }, controller.signal);
      if (controller.signal.aborted || version !== generation.current) return;
      setColumns(previous => {
        const existing = previous[stage];
        if (!existing || existing.page !== current.page) return previous;
        const ids = new Set(existing.items.map(item => item.id));
        return { ...previous, [stage]: {
          ...next, items: [...existing.items, ...next.items.filter(item => !ids.has(item.id))],
        } };
      });
    } catch (reason) {
      if (!controller.signal.aborted) setMoreError(errorMessage(reason, 'Could not load more applications.'));
    } finally {
      pending.current = pending.current.filter(request => request !== controller);
      if (!controller.signal.aborted && version === generation.current) setLoadingMore(null);
    }
  }

  function openDetails(id: number) {
    if (!confirmDiscardDraft()) return;
    setSelectedId(current => current === id ? null : id);
    setEditing(false);
    setEditDirty(false);
    setInterviewDirty(false);
    if (selectedId !== id) window.requestAnimationFrame(() => detailRef.current?.focus());
  }

  async function saveDetails(id: number, values: UpdateJobApplicationRequest) {
    await onEdit(id, values);
    setEditing(false);
    setEditDirty(false);
  }

  function findDragged(id: number): JobApplication | undefined {
    for (const stage of statuses) {
      const found = columns[stage]?.items.find(item => item.id === id);
      if (found) return found;
    }
    return undefined;
  }

  function startDrag(event: DragEvent<HTMLElement>, application: JobApplication) {
    if (busy) { event.preventDefault(); return; }
    setDraggedId(application.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(application.id));
  }

  function drop(event: DragEvent<HTMLElement>, stage: ApplicationStatus) {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain'));
    const source = draggedId === id && Number.isSafeInteger(id) ? findDragged(id) : undefined;
    setDraggedId(null);
    setOverStage(null);
    if (busy || !source || source.status === stage) return;
    void onMove(source.id, stage);
  }

  return <section aria-label="Application pipeline board" className="board-section">
    <form className="board-filters" aria-label="Board search and filters" onSubmit={applyFilters}>
      <div className="form-field board-filter-search">
        <label htmlFor="board-search">Search board</label>
        <input id="board-search" type="search" maxLength={255}
          placeholder="Company, title, or location" value={draftSearch}
          onChange={event => setDraftSearch(event.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="board-stage-filter">Show stages</label>
        <select id="board-stage-filter" value={draftStage}
          onChange={event => setDraftStage(event.target.value as ApplicationStatus | '')}>
          <option value="">All stages</option>
          {statuses.map(stage => <option key={stage} value={stage}>{statusLabel(stage)}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="board-sort">Sort cards</label>
        <select id="board-sort" value={draftSort}
          onChange={event => setDraftSort(event.target.value as ApplicationSort)}>
          <option value="NEWEST">Newest saved</option>
          <option value="OLDEST">Oldest saved</option>
          <option value="COMPANY">Company A–Z</option>
          <option value="APPLICATION_DATE">Application date</option>
        </select>
      </div>
      <div className="board-filter-actions">
        <button type="submit" disabled={busy}>Apply</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={clearFilters}>Clear</button>
      </div>
    </form>
    <p className="form-help board-help">
      {filters.search || filters.stage ? 'Showing matching applications from your account. ' : ''}
      Drag cards on desktop, or use a card's stage selector. On mobile, browse stages vertically.
    </p>
    {loading && <div className="panel-state" role="status">Loading pipeline board…</div>}
    {error && <div className="panel-state" role="alert">
      <p className="form-error">{error}</p>
      <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>Retry board</button>
    </div>}
    {!loading && !error && <>
      {selected && <section className="board-detail-panel" aria-label="Application details">
        <div className="board-detail-heading">
          <div>
            <p className="eyebrow">Application details</p>
            <h3 ref={detailRef} tabIndex={-1}>{selected.title} · {selected.company}</h3>
            <span className={'status-badge status-' + selected.status.toLowerCase()}>{statusLabel(selected.status)}</span>
          </div>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => {
            if (!confirmDiscardDraft()) return;
            setSelectedId(null); setEditing(false); setEditDirty(false); setInterviewDirty(false);
          }}>Close details</button>
        </div>
        {editing ? <ApplicationForm key={selected.id} application={selected} busy={busy}
          onSave={values => saveDetails(selected.id, values)} onDirtyChange={setEditDirty}
          onCancel={() => { setEditing(false); setEditDirty(false); }} /> : <>
          <dl className="board-detail-fields">
            <div><dt>Location</dt><dd>{selected.location || 'Not specified'}</dd></div>
            <div><dt>Applied</dt><dd>{selected.applicationDate || 'Not specified'}</dd></div>
            <div><dt>Interview</dt><dd>{selected.interviewDate || 'Not scheduled'}</dd></div>
            <div><dt>Follow-up</dt><dd>{selected.followUpDate || 'Not scheduled'}</dd></div>
          </dl>
          <section className="board-detail-contact" aria-label="Recruiter and resume details">
            <h4>Recruiter &amp; resume</h4>
            <dl className="board-detail-fields board-contact-fields">
              <div><dt>Recruiter</dt><dd>{selected.recruiterName || 'Not added'}</dd></div>
              <div><dt>Recruiter email</dt><dd>{selected.recruiterEmail || 'Not added'}</dd></div>
              <div><dt>Resume used</dt><dd>{selected.resumeVersion || 'Not added'}</dd></div>
            </dl>
          </section>
          <section className="board-detail-notes" aria-label="Application notes">
            <h4>Notes</h4>
            <p>{selected.notes || 'No notes yet.'}</p>
          </section>
          <div className="board-detail-actions">
            <button type="button" disabled={busy} onClick={() => {
              if (!confirmDiscardDraft()) return;
              setEditing(true); setInterviewDirty(false);
            }}>Edit application</button>
            {postingLink(selected.postingUrl) && <a href={postingLink(selected.postingUrl)!}
              target="_blank" rel="noopener noreferrer">View job posting ↗</a>}
          </div>
        </>}
        {!editing && <>
          <div className="board-detail-workspace">
            <InterviewWorkspace key={selected.id} applicationId={selected.id} busy={busy}
              onChanged={onInterviewChange} onDirtyChange={setInterviewDirty} />
          </div>
          <section className="board-detail-history" aria-label="Application history">
            <h4>Application history</h4>
            <ApplicationTimeline key={selected.id} applicationId={selected.id} status={selected.status} />
          </section>
        </>}
      </section>}
      {moreError && <p className="form-error" role="alert">{moreError}</p>}
      <div className="pipeline-board-scroll" tabIndex={0} aria-label="Scrollable pipeline columns">
        <div className={'pipeline-board' + (visibleStages.length === 1 ? ' pipeline-board-single' : '')}>
          {visibleStages.map(stage => {
            const column = columns[stage];
            const items = column?.items ?? [];
            return <section key={stage}
              className={'board-column board-column-' + stage.toLowerCase() +
                (overStage === stage ? ' board-column-target' : '')}
              aria-label={statusLabel(stage) + ' stage'}
              onDragOver={event => {
                if (busy || draggedId === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setOverStage(stage);
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverStage(null);
              }}
              onDrop={event => drop(event, stage)}>
              <header className="board-column-heading">
                <h3>{statusLabel(stage)}</h3>
                <span aria-label={String(column?.totalElements ?? 0) + ' applications'}>
                  {column?.totalElements ?? 0}</span>
              </header>
              <div className="board-cards">
                {items.length === 0 && <p className="board-empty">No applications in this stage.</p>}
                {items.map(application => {
                  const link = postingLink(application.postingUrl);
                  return <article className="board-card" key={application.id}
                    aria-label={application.company + ' — ' + application.title}
                    draggable={!busy}
                    onDragStart={event => startDrag(event, application)}
                    onDragEnd={() => { setDraggedId(null); setOverStage(null); }}>
                    <div className="board-card-identity">
                      <span className="board-company-mark" aria-hidden="true">
                        {application.company.trim().charAt(0).toUpperCase()}</span>
                      <div>
                        <button type="button" className="board-title-button"
                          aria-expanded={selectedId === application.id}
                          onClick={() => openDetails(application.id)}>
                          {application.title}
                        </button>
                        <p>{application.company}</p>
                      </div>
                    </div>
                    {application.location && <p className="board-card-location">{application.location}</p>}
                    {attentionLabels(application, todayLocal).length > 0 && <div className="board-attention">
                      {attentionLabels(application, todayLocal).map(label => <span key={label.kind}
                        className={'board-attention-chip attention-' + label.kind}>{label.text}</span>)}
                    </div>}
                    {application.followUpDate && <p className="board-card-date">
                      Follow up <time dateTime={application.followUpDate}>{application.followUpDate}</time></p>}
                    <div className="board-card-actions">
                      <button type="button" className="secondary-button board-view-details"
                        aria-expanded={selectedId === application.id}
                        onClick={() => openDetails(application.id)}>
                        {selectedId === application.id ? 'Hide details' : 'View details'}
                      </button>
                      <label htmlFor={'board-status-' + application.id}>Move to stage</label>
                      <select id={'board-status-' + application.id} value={application.status}
                        disabled={busy}
                        onChange={event => void onMove(application.id, event.target.value as ApplicationStatus)}>
                        {statuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}
                      </select>
                      {link && <a href={link} target="_blank" rel="noopener noreferrer">Job posting ↗</a>}
                    </div>
                  </article>;
                })}
              </div>
              {column && column.page + 1 < column.totalPages && <button type="button"
                className="secondary-button board-load-more" disabled={busy || loadingMore !== null}
                onClick={() => void loadMore(stage)}>
                {loadingMore === stage ? 'Loading…' :
                  'Load more (' + items.length + ' of ' + column.totalElements + ')'}
              </button>}
            </section>;
          })}
        </div>
      </div>
    </>}
  </section>;
}
