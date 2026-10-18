import { useEffect, useState } from 'react';
import { getApplicationActivity } from './applicationApi';
import { statusLabel, type ApplicationStatus } from './types';
import type { ApplicationActivity } from './dashboardApi';

type Props = { applicationId: number; status: ApplicationStatus };

export function activityText(item: ApplicationActivity): string {
  return item.type === 'CREATED'
    ? 'Application saved'
    : `Status changed: ${item.fromStatus ? statusLabel(item.fromStatus) : 'Unknown'} → ${statusLabel(item.toStatus)}`;
}

export function activityTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

export default function ApplicationTimeline({ applicationId, status }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<ApplicationActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getApplicationActivity(applicationId, controller.signal)
      .then(result => { if (!controller.signal.aborted) setItems(result); })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load history. Try again.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applicationId, status, expanded]);

  const lastRecorded = items[0];
  const daysInStage = !loading && lastRecorded?.toStatus === status
    ? Math.max(0, Math.floor((Date.now() - new Date(lastRecorded.occurredAt).getTime()) / 86400000))
    : null;

  return <div className="activity-timeline">
    <button type="button" className="timeline-toggle secondary-button" aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide history' : 'View history'}</button>
    {expanded && <div className="timeline-content" aria-label="Application activity">
      {loading && <p role="status" className="form-help">Loading history…</p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {!loading && !error && daysInStage !== null && <p className="form-help stage-age">
        Current {statusLabel(status)} stage · {daysInStage} {daysInStage === 1 ? 'day' : 'days'} since the latest recorded change
      </p>}
      {!loading && !error && (items.length === 0
        ? <p className="form-help">No recorded activity yet. History starts when tracking was enabled.</p>
        : <ol className="timeline-list">{items.map(item => <li key={item.id}>
            <span className="timeline-marker" aria-hidden="true" />
            <div><strong>{activityText(item)}</strong><time dateTime={item.occurredAt}>{activityTime(item.occurredAt)}</time></div>
          </li>)}</ol>)}
    </div>}
  </div>;
}
