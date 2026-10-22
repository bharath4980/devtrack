import { useEffect, useRef, useState, type DragEvent } from 'react';
import { getApplications } from './applicationApi';
import { errorMessage } from './apiError';
import { statuses, statusLabel, type ApplicationPage, type ApplicationStatus, type JobApplication } from './types';

const PAGE_SIZE = 20;
type Columns = Partial<Record<ApplicationStatus, ApplicationPage>>;

type Props = {
  revision: number;
  busy: boolean;
  onMove: (id: number, status: ApplicationStatus) => Promise<void>;
};

function postingLink(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export default function PipelineBoard({ revision, busy, onMove }: Props) {
  const [columns, setColumns] = useState<Columns>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const [loadingMore, setLoadingMore] = useState<ApplicationStatus | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<ApplicationStatus | null>(null);
  const generation = useRef(0);
  const pending = useRef<AbortController[]>([]);

  useEffect(() => {
    const version = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setMoreError('');
    setColumns({});
    setLoadingMore(null);
    Promise.all(statuses.map(stage => getApplications({
      page: 0, size: PAGE_SIZE, status: stage, search: '', sort: 'NEWEST',
    }, controller.signal))).then(pages => {
      if (!controller.signal.aborted && version === generation.current) {
        setColumns(Object.fromEntries(statuses.map((stage, index) => [stage, pages[index]])) as Columns);
      }
    }).catch(reason => {
      if (!controller.signal.aborted) setError(errorMessage(reason, 'Could not load the pipeline.'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
      pending.current.forEach(request => request.abort());
      pending.current = [];
    };
  }, [revision]);

  async function loadMore(stage: ApplicationStatus) {
    const current = columns[stage];
    if (!current || busy || loadingMore || current.page + 1 >= current.totalPages) return;
    const version = generation.current;
    const controller = new AbortController();
    pending.current.push(controller);
    setLoadingMore(stage);
    setMoreError('');
    try {
      const next = await getApplications({
        page: current.page + 1, size: PAGE_SIZE, status: stage, search: '', sort: 'NEWEST',
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

  if (loading) return <div className="panel-state" role="status">Loading pipeline board…</div>;
  if (error) return <div className="panel-state" role="alert">
    <p className="form-error">{error}</p>
    <button type="button" className="secondary-button" onClick={() => window.location.reload()}>Retry</button>
  </div>;

  return <section aria-label="Application pipeline board" className="board-section">
    <p className="form-help board-help">Drag cards between stages, or use a card's stage selector.
      The board shows all stages, independently of the list filters. Scroll sideways on smaller screens.</p>
    {moreError && <p className="form-error" role="alert">{moreError}</p>}
    <div className="pipeline-board-scroll" tabIndex={0} aria-label="Scrollable pipeline columns">
      <div className="pipeline-board">
        {statuses.map(stage => {
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
                    <div><strong>{application.title}</strong><p>{application.company}</p></div>
                  </div>
                  {application.location && <p className="board-card-location">{application.location}</p>}
                  {application.followUpDate && <p className="board-card-date">
                    Follow up <time dateTime={application.followUpDate}>{application.followUpDate}</time></p>}
                  <div className="board-card-actions">
                    <label htmlFor={'board-status-' + application.id}>Move to stage</label>
                    <select id={'board-status-' + application.id} value={application.status}
                      disabled={busy} onChange={event => void onMove(application.id, event.target.value as ApplicationStatus)}>
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
              {loadingMore === stage ? 'Loading…' : 'Load more (' + items.length + ' of ' + column.totalElements + ')'}
            </button>}
          </section>;
        })}
      </div>
    </div>
  </section>;
}
