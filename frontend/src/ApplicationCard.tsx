import { useState } from 'react';
import InterviewWorkspace from './InterviewWorkspace';
import ApplicationForm from './ApplicationForm';
import ApplicationTimeline from './ApplicationTimeline';
import { statuses, statusLabel, type ApplicationStatus, type JobApplication, type UpdateJobApplicationRequest } from './types';

function safeLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

type Props = {
  application: JobApplication;
  editing: boolean;
  busy: boolean;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: UpdateJobApplicationRequest) => Promise<void>;
  onStatus: (status: ApplicationStatus) => void;
  onDelete: () => void;
};

export default function ApplicationCard({ application, editing, busy, selected, onSelect, onEdit, onCancel, onSave, onStatus, onDelete }: Props) {
  const [showInterviewPrep, setShowInterviewPrep] = useState(false);
  const link = safeLink(application.postingUrl);
  return <article className={selected ? 'application-card application-card-selected' : 'application-card'}
    aria-label={`${application.company} — ${application.title}`}>
    <label className="application-select">
      <input type="checkbox" disabled={busy || editing} checked={selected} onChange={event => onSelect(event.target.checked)}
        aria-label={`Select ${application.company} — ${application.title}`} />
      <span>Select application</span>
    </label>
    {editing ? <ApplicationForm application={application} busy={busy} onSave={onSave} onCancel={onCancel} /> : <>
      <div className="application-card-header">
        <div className="application-identity">
          <div className="company-monogram" aria-hidden="true">{application.company.trim().charAt(0).toUpperCase()}</div>
          <div><h3>{application.title}</h3><p className="application-company">{application.company}</p></div>
        </div>
        <span className={`status-badge status-${application.status.toLowerCase()}`}>{statusLabel(application.status)}</span>
      </div>
      <div className="application-details">
        {application.location && <p><span>Location</span>{application.location}</p>}
        {application.applicationDate && <p><span>Application date</span>{application.applicationDate}</p>}
        {application.interviewDate && <p><span>Interview</span>{application.interviewDate}</p>}
        {application.followUpDate && <p><span>Follow up</span><time dateTime={application.followUpDate}>{application.followUpDate}</time></p>}
      </div>
      {application.notes && <p className="application-notes">{application.notes}</p>}
      {link && <a className="job-link" href={link} target="_blank" rel="noopener noreferrer">View job posting <span aria-hidden="true">↗</span></a>}
      <div className="application-controls">
        <div className="status-control">
          <label htmlFor={`status-${application.id}`}>Status</label>
          <select id={`status-${application.id}`} value={application.status} disabled={busy}
            onChange={event => onStatus(event.target.value as ApplicationStatus)}>
            {statuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </div>
        <div className="application-actions">
          <button className="secondary-button" disabled={busy} onClick={onEdit}>Edit</button>
          <button className="danger-button" disabled={busy} onClick={onDelete}>Delete</button>
        </div>
      </div>
      <div className="interview-toggle-wrap"><button type="button" className="secondary-button" disabled={busy}
        aria-expanded={showInterviewPrep} onClick={() => setShowInterviewPrep(value => !value)}>
        {showInterviewPrep ? 'Hide interview prep' : 'Interview prep'}
      </button></div>
      {showInterviewPrep && <InterviewWorkspace applicationId={application.id} busy={busy} />}
      <ApplicationTimeline applicationId={application.id} status={application.status} />
    </>}
  </article>;
}
