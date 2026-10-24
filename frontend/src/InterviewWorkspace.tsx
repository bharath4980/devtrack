import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  createInterviewRound, deleteInterviewRound, getInterviewRounds, updateInterviewRound, downloadInterviewCalendar,
  type InterviewRound, type InterviewRoundInput,
} from './interviewApi';
import { errorMessage } from './apiError';
import { interviewTimeInBrowser } from './interviewLocalTime';

const blank: InterviewRoundInput = {
  roundName: '', scheduledDate: null, scheduledTime: null, timeZone: null, format: 'VIDEO', contactName: '',
  contactEmail: '', preparationNotes: '', followUpNotes: '', outcome: 'PLANNED',
};
const formats: InterviewRoundInput['format'][] = ['PHONE', 'VIDEO', 'ONSITE', 'TAKE_HOME', 'OTHER'];
const outcomes: InterviewRoundInput['outcome'][] = ['PLANNED', 'COMPLETED', 'CANCELLED'];
const labelFor = (value: string) => value.replaceAll('_', ' ').toLowerCase()
  .replace(/^./, letter => letter.toUpperCase());

// Keep familiar choices first, then expose all time zones supported by the browser.
// These are IANA identifiers so the backend can safely handle daylight saving time.
const commonTimeZones = [
  { value: 'America/New_York', label: 'Eastern Time — New York' },
  { value: 'America/Chicago', label: 'Central Time — Chicago' },
  { value: 'America/Denver', label: 'Mountain Time — Denver' },
  { value: 'America/Phoenix', label: 'Arizona Time — Phoenix' },
  { value: 'America/Los_Angeles', label: 'Pacific Time — Los Angeles' },
  { value: 'America/Anchorage', label: 'Alaska Time — Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time — Honolulu' },
  { value: 'Asia/Kolkata', label: 'India Standard Time — Kolkata' },
  { value: 'Europe/London', label: 'United Kingdom — London' },
  { value: 'Europe/Berlin', label: 'Central Europe — Berlin' },
  { value: 'Asia/Dubai', label: 'United Arab Emirates — Dubai' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Japan — Tokyo' },
  { value: 'Australia/Sydney', label: 'Australia — Sydney' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
];
const commonZoneIds = new Set(commonTimeZones.map(zone => zone.value));
const otherTimeZones = (typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone') : [])
  .filter(zone => !commonZoneIds.has(zone))
  .sort((a, b) => a.localeCompare(b));
const selectableZoneIds = new Set([...commonZoneIds, ...otherTimeZones]);

type Props = { applicationId: number; busy?: boolean; onChanged?: () => void; onDirtyChange?: (dirty: boolean) => void };

export default function InterviewWorkspace({ applicationId, busy = false, onChanged, onDirtyChange }: Props) {
  const id = useId();
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<InterviewRoundInput>({ ...blank });
  const [draftBaseline, setDraftBaseline] = useState<InterviewRoundInput>({ ...blank });
  const [retry, setRetry] = useState(0);
  const savePending = useRef(false);
  const hasUnsavedChanges = (Object.keys(blank) as (keyof InterviewRoundInput)[])
    .some(key => draft[key] !== draftBaseline[key]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getInterviewRounds(applicationId, controller.signal)
      .then(items => { if (!controller.signal.aborted) setRounds(items); })
      .catch(reason => {
        if (!controller.signal.aborted) setError(errorMessage(reason, 'Could not load interview rounds.'));
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [applicationId, retry]);

  useEffect(() => {
    onDirtyChange?.(showForm && hasUnsavedChanges);
    return () => onDirtyChange?.(false);
  }, [showForm, hasUnsavedChanges, onDirtyChange]);

  // Protect a partially completed interview form from accidental tab closure.
  useEffect(() => {
    if (!showForm || !hasUnsavedChanges) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [showForm, hasUnsavedChanges]);

  function cancelForm() {
    if (saving || busy) return;
    if (hasUnsavedChanges && !window.confirm('Discard your unsaved interview round changes?')) return;
    setShowForm(false);
    setEditingId(null);
    setDraft({ ...blank });
    setDraftBaseline({ ...blank });
  }

  function setField<K extends keyof InterviewRoundInput>(key: K, value: InterviewRoundInput[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function startNew() {
    if (saving || busy) return;
    const empty = { ...blank };
    setDraft(empty);
    setDraftBaseline(empty);
    setEditingId(null);
    setShowForm(true);
    setError('');
    setNotice('');
  }

  function startEdit(round: InterviewRound) {
    if (saving || busy) return;
    if (showForm && hasUnsavedChanges &&
        !window.confirm('Discard unsaved changes and edit another interview round?')) return;
    const nextDraft: InterviewRoundInput = {
      roundName: round.roundName, scheduledDate: round.scheduledDate,
      scheduledTime: round.scheduledTime, timeZone: round.timeZone,
      format: round.format, contactName: round.contactName ?? '',
      contactEmail: round.contactEmail ?? '', preparationNotes: round.preparationNotes ?? '',
      followUpNotes: round.followUpNotes ?? '', outcome: round.outcome,
    };
    setDraft(nextDraft);
    setDraftBaseline(nextDraft);
    setEditingId(round.id);
    setShowForm(true);
    setError('');
    setNotice('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || busy || savePending.current) return;
    savePending.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    const values = { ...draft, roundName: draft.roundName.trim(), scheduledDate: draft.scheduledDate || null };
    try {
      const saved = editingId === null
        ? await createInterviewRound(applicationId, values)
        : await updateInterviewRound(applicationId, editingId, values);
      setRounds(current => [...current.filter(item => item.id !== saved.id), saved]
        .sort((a, b) => a.id - b.id));
      setShowForm(false);
      setEditingId(null);
      setDraft({ ...blank });
      setDraftBaseline({ ...blank });
      setNotice('Interview round saved.');
      onChanged?.();
    } catch (reason) {
      setError(errorMessage(reason, 'Could not save interview round.'));
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  async function exportCalendar(round: InterviewRound) {
    if (downloadingId !== null || busy) return;
    setDownloadingId(round.id);
    setError('');
    try {
      await downloadInterviewCalendar(applicationId, round.id);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not download the calendar event.'));
    } finally {
      setDownloadingId(null);
    }
  }

  async function remove(round: InterviewRound) {
    if (busy || saving || !window.confirm('Delete ' + round.roundName + '? This cannot be undone.')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await deleteInterviewRound(applicationId, round.id);
      setRounds(current => current.filter(item => item.id !== round.id));
      if (editingId === round.id) { setShowForm(false); setEditingId(null); }
      setNotice('Interview round deleted.');
      onChanged?.();
    } catch (reason) {
      setError(errorMessage(reason, 'Could not delete interview round.'));
    } finally {
      setSaving(false);
    }
  }

  return <section className="interview-workspace" role="region" aria-label="Interview preparation">
    <div className="interview-workspace-heading">
      <div>
        <h4>Interview preparation</h4>
        <p className="form-help">Track rounds, contacts, preparation and follow-ups for this application.</p>
      </div>
      {!showForm && !loading && <button type="button" className="secondary-button"
        disabled={busy || saving || rounds.length >= 30} onClick={startNew}>Add interview round</button>}
    </div>
    {loading && <p className="form-help" role="status">Loading interview rounds…</p>}
    {error && <div role="alert" className="form-error">{error}
      {loading === false && rounds.length === 0 && <button type="button" className="secondary-button"
        onClick={() => setRetry(value => value + 1)}>Retry interview rounds</button>}
    </div>}
    {notice && <p className="save-notice" role="status">{notice}</p>}
    {!loading && rounds.length === 0 && !error && <p className="form-help">No rounds yet. Add a screen, interview or take-home assessment.</p>}
    {!loading && rounds.length > 0 && <ol className="interview-round-list">
      {rounds.map(round => <li key={round.id}>
        <article className="interview-round" aria-label={round.roundName}>
          <div className="interview-round-header">
            <div><strong>{round.roundName}</strong>
              <p>{labelFor(round.format)} · {round.scheduledDate || 'Date not set'}
                {round.scheduledTime && round.timeZone ? ' at ' + round.scheduledTime + ' (' + round.timeZone + ')' : ''}
                {' · '}{labelFor(round.outcome)}</p>
              {interviewTimeInBrowser(round.scheduledDate, round.scheduledTime, round.timeZone) &&
                <p className="form-help">Your local time: {interviewTimeInBrowser(round.scheduledDate, round.scheduledTime, round.timeZone)}</p>}
            </div>
            <div className="interview-round-actions">
              {round.googleCalendarUrl && <a className="secondary-button interview-calendar-link"
                href={round.googleCalendarUrl} target="_blank" rel="noopener noreferrer"
                aria-label={'Open ' + round.roundName + ' in Google Calendar'}>
                Google Calendar ↗
              </a>}
              {round.outlookCalendarUrl && <a className="secondary-button interview-calendar-link"
                href={round.outlookCalendarUrl} target="_blank" rel="noopener noreferrer"
                aria-label={'Open ' + round.roundName + ' in Outlook Calendar'}>
                Outlook Calendar ↗
              </a>}
              {round.scheduledDate && round.scheduledTime && round.timeZone &&
                <button type="button" className="secondary-button" disabled={busy || saving || downloadingId !== null}
                  onClick={() => void exportCalendar(round)}>
                  {downloadingId === round.id ? 'Preparing calendar…' : 'Apple / other (.ics)'}
                </button>}
              <button type="button" className="secondary-button" disabled={busy || saving}
                onClick={() => startEdit(round)}>Edit round</button>
              <button type="button" className="danger-button" disabled={busy || saving}
                onClick={() => void remove(round)}>Delete round</button>
            </div>
          </div>
          {(round.contactName || round.contactEmail) && <p className="interview-round-contact">
            Contact: {[round.contactName, round.contactEmail].filter(Boolean).join(' · ')}
          </p>}
          {round.preparationNotes && <div className="interview-round-notes"><strong>Preparation</strong><p>{round.preparationNotes}</p></div>}
          {round.followUpNotes && <div className="interview-round-notes"><strong>Follow-up</strong><p>{round.followUpNotes}</p></div>}
        </article>
      </li>)}
    </ol>}
    {showForm && <form className="interview-round-form" aria-label="Interview round form" onSubmit={event => void save(event)}>
      <h5>{editingId === null ? 'New interview round' : 'Edit interview round'}</h5>
      <fieldset disabled={busy || saving}>
        <div className="interview-round-fields">
          <div className="form-field">
            <label htmlFor={id + '-name'}>Round name</label>
            <input id={id + '-name'} required maxLength={120} value={draft.roundName}
              placeholder="Technical screen" onChange={event => setField('roundName', event.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor={id + '-date'}>Scheduled date</label>
            <input id={id + '-date'} type="date" value={draft.scheduledDate ?? ''}
              required={Boolean(draft.scheduledTime)}
              onChange={event => setDraft(current => ({
                ...current, scheduledDate: event.target.value || null,
                ...(!event.target.value ? { scheduledTime: null, timeZone: null } : {}),
              }))} />
          </div>
          <div className="form-field">
            <label htmlFor={id + '-time'}>Start time (optional)</label>
            <input id={id + '-time'} type="time" value={draft.scheduledTime ?? ''}
              disabled={!draft.scheduledDate} onChange={event => {
                const time = event.target.value || null;
                const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
                setDraft(current => ({ ...current, scheduledTime: time,
                  timeZone: time ? (current.timeZone || localZone) : null }));
              }} />
          </div>
          {draft.scheduledTime && <div className="form-field">
            <label htmlFor={id + '-zone'}>Time zone</label>
            <select id={id + '-zone'} required value={draft.timeZone ?? ''}
              onChange={event => setField('timeZone', event.target.value)}>
              <option value="" disabled>Select a time zone</option>
              <optgroup label="Common time zones">
                {commonTimeZones.map(zone => <option key={zone.value} value={zone.value}>
                  {zone.label} ({zone.value})
                </option>)}
              </optgroup>
              {otherTimeZones.length > 0 && <optgroup label="More time zones">
                {otherTimeZones.map(zone => <option key={zone} value={zone}>
                  {zone.replaceAll('_', ' ')}
                </option>)}
              </optgroup>}
              {draft.timeZone && !selectableZoneIds.has(draft.timeZone) &&
                <option value={draft.timeZone}>{draft.timeZone} (saved selection)</option>}
            </select>
            <p className="form-help">Defaults to your browser time zone. Choose the time zone
              given in your interview invitation if it differs.</p>
          </div>}
          <div className="form-field">
            <label htmlFor={id + '-format'}>Format</label>
            <select id={id + '-format'} value={draft.format}
              onChange={event => setField('format', event.target.value as InterviewRoundInput['format'])}>
              {formats.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={id + '-outcome'}>Outcome</label>
            <select id={id + '-outcome'} value={draft.outcome}
              onChange={event => setField('outcome', event.target.value as InterviewRoundInput['outcome'])}>
              {outcomes.map(value => <option key={value} value={value}>{labelFor(value)}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor={id + '-contact'}>Recruiter or interviewer</label>
            <input id={id + '-contact'} maxLength={255} value={draft.contactName ?? ''}
              onChange={event => setField('contactName', event.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor={id + '-email'}>Contact email</label>
            <input id={id + '-email'} type="email" maxLength={254} value={draft.contactEmail ?? ''}
              onChange={event => setField('contactEmail', event.target.value)} />
          </div>
          <div className="form-field interview-wide">
            <label htmlFor={id + '-prep'}>Preparation notes</label>
            <textarea id={id + '-prep'} maxLength={2000} rows={3} value={draft.preparationNotes ?? ''}
              onChange={event => setField('preparationNotes', event.target.value)} />
          </div>
          <div className="form-field interview-wide">
            <label htmlFor={id + '-followup'}>Follow-up notes</label>
            <textarea id={id + '-followup'} maxLength={2000} rows={3} value={draft.followUpNotes ?? ''}
              onChange={event => setField('followUpNotes', event.target.value)} />
          </div>
        </div>
        <div className="interview-round-actions">
          <button type="submit">{saving ? 'Saving…' : 'Save interview round'}</button>
          <button type="button" className="secondary-button" onClick={cancelForm}>
            Cancel
          </button>
        </div>
        <p className="form-help">When date, time and time zone are set, open a prefilled Google or Outlook
          event and click Save there, or download an .ics file for Apple and other calendars.
          Calendar times use a one-hour placeholder; confirm the actual duration with your interviewer.</p>
      </fieldset>
    </form>}
  </section>;
}
