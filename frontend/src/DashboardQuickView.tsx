import { useEffect, useRef, useState } from 'react';
import { getApplication } from './applicationApi';
import ApplicationForm from './ApplicationForm';
import ApplicationTimeline from './ApplicationTimeline';
import InterviewWorkspace from './InterviewWorkspace';
import { errorMessage } from './apiError';
import { statusLabel, type JobApplication, type UpdateJobApplicationRequest } from './types';

type Props = {
  applicationId: number;
  revision: number;
  busy: boolean;
  onClose: () => void;
  onSave: (id: number, values: UpdateJobApplicationRequest) => Promise<void>;
  onInterviewChange: () => void;
};

function safePostingUrl(raw: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

export default function DashboardQuickView({ applicationId, revision, busy, onClose, onSave, onInterviewChange }: Props) {
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [retry, setRetry] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    panelRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [applicationId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getApplication(applicationId, controller.signal)
      .then(result => { if (!controller.signal.aborted) setApplication(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason, 'Could not load this application.')); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applicationId, revision, retry]);

  async function save(values: UpdateJobApplicationRequest) {
    await onSave(applicationId, values);
    setEditing(false);
  }

  const link = safePostingUrl(application?.postingUrl ?? null);

  return <section ref={panelRef} id="dashboard-quick-view" className="quick-view-panel"
    aria-label="Application quick view">
    <div className="quick-view-header">
      <div><p className="eyebrow">From your dashboard</p>
        <h3 ref={headingRef} tabIndex={-1}>Application quick view</h3>
      </div>
      <button type="button" className="secondary-button" onClick={onClose}>Close quick view</button>
    </div>
    {loading && <p role="status" className="form-help">Loading application details…</p>}
    {!loading && error && <div role="alert">
      <p className="form-error">{error}</p>
      <button type="button" className="secondary-button" onClick={() => setRetry(count => count + 1)}>
        Retry details
      </button>
    </div>}
    {!loading && !error && application && <>
      {editing
        ? <ApplicationForm key={application.id} application={application} busy={busy}
            onSave={save} onCancel={() => setEditing(false)} />
        : <>
          <div className="quick-view-identity">
            <div><h4>{application.title}</h4><p>{application.company}</p></div>
            <span className={'status-badge status-' + application.status.toLowerCase()}>
              {statusLabel(application.status)}
            </span>
          </div>
          <dl className="quick-view-details">
            <div><dt>Location</dt><dd>{application.location || 'Not specified'}</dd></div>
            <div><dt>Application date</dt><dd>{application.applicationDate || 'Not specified'}</dd></div>
            <div><dt>Interview</dt><dd>{application.interviewDate || 'Not scheduled'}</dd></div>
            <div><dt>Follow-up</dt><dd>{application.followUpDate || 'Not scheduled'}</dd></div>
          </dl>
          <section className="quick-view-contact" aria-label="Recruiter and resume details">
            <h4>Recruiter &amp; resume</h4>
            <dl className="quick-view-details quick-view-contact-fields">
              <div><dt>Recruiter</dt><dd>{application.recruiterName || 'Not added'}</dd></div>
              <div><dt>Recruiter email</dt><dd>{application.recruiterEmail || 'Not added'}</dd></div>
              <div><dt>Resume used</dt><dd>{application.resumeVersion || 'Not added'}</dd></div>
            </dl>
          </section>
          <section className="quick-view-notes" aria-label="Application notes">
            <h4>Notes</h4><p>{application.notes || 'No notes yet.'}</p>
          </section>
          <div className="quick-view-actions">
            <button type="button" disabled={busy} onClick={() => setEditing(true)}>Edit application</button>
            {link && <a href={link} target="_blank" rel="noopener noreferrer">View job posting ↗</a>}
          </div>
          <div className="quick-view-workspace">
            <InterviewWorkspace applicationId={application.id} busy={busy} onChanged={onInterviewChange} />
          </div>
          <section className="quick-view-history" aria-label="Application history">
            <h4>Application history</h4>
            <ApplicationTimeline key={application.id} applicationId={application.id} status={application.status} />
          </section>
        </>}
    </>}
  </section>;
}
