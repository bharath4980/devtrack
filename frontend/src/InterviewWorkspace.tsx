import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  createInterviewRound, deleteInterviewRound, getInterviewRounds, updateInterviewRound,
  type InterviewRound, type InterviewRoundInput,
} from './interviewApi';
import { errorMessage } from './apiError';

const blank: InterviewRoundInput = {
  roundName: '', scheduledDate: null, format: 'VIDEO', contactName: '',
  contactEmail: '', preparationNotes: '', followUpNotes: '', outcome: 'PLANNED',
};
const formats: InterviewRoundInput['format'][] = ['PHONE', 'VIDEO', 'ONSITE', 'TAKE_HOME', 'OTHER'];
const outcomes: InterviewRoundInput['outcome'][] = ['PLANNED', 'COMPLETED', 'CANCELLED'];
const labelFor = (value: string) => value.replaceAll('_', ' ').toLowerCase()
  .replace(/^./, letter => letter.toUpperCase());

type Props = { applicationId: number; busy?: boolean; onChanged?: () => void };

export default function InterviewWorkspace({ applicationId, busy = false, onChanged }: Props) {
  const id = useId();
  const [rounds, setRounds] = useState<InterviewRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<InterviewRoundInput>({ ...blank });
  const [retry, setRetry] = useState(0);

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

  function setField<K extends keyof InterviewRoundInput>(key: K, value: InterviewRoundInput[K]) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function startNew() {
    setDraft({ ...blank });
    setEditingId(null);
    setShowForm(true);
    setError('');
    setNotice('');
  }

  function startEdit(round: InterviewRound) {
    setDraft({
      roundName: round.roundName, scheduledDate: round.scheduledDate,
      format: round.format, contactName: round.contactName ?? '',
      contactEmail: round.contactEmail ?? '', preparationNotes: round.preparationNotes ?? '',
      followUpNotes: round.followUpNotes ?? '', outcome: round.outcome,
    });
    setEditingId(round.id);
    setShowForm(true);
    setError('');
    setNotice('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || busy) return;
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
      setNotice('Interview round saved.');
      onChanged?.();
    } catch (reason) {
      setError(errorMessage(reason, 'Could not save interview round.'));
    } finally {
      setSaving(false);
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
              <p>{labelFor(round.format)} · {round.scheduledDate || 'Date not set'} · {labelFor(round.outcome)}</p>
            </div>
            <div className="interview-round-actions">
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
              onChange={event => setField('scheduledDate', event.target.value || null)} />
          </div>
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
          <button type="button" className="secondary-button" onClick={() => { setShowForm(false); setEditingId(null); }}>
            Cancel
          </button>
        </div>
      </fieldset>
    </form>}
  </section>;
}
