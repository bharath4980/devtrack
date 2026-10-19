import { useEffect, useRef, useState, type FormEvent } from 'react';
import { previewJobPosting } from './applicationApi';
import { ApiError, errorMessage } from './apiError';
import type { JobApplication, UpdateJobApplicationRequest } from './types';

type Props = {
  application?: JobApplication;
  busy: boolean;
  onSave: (values: UpdateJobApplicationRequest) => Promise<void>;
  onCancel: () => void;
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function ApplicationForm({ application, busy, onSave, onCancel }: Props) {
  const [values, setValues] = useState<UpdateJobApplicationRequest>({
    company: application?.company ?? '', title: application?.title ?? '',
    location: application?.location ?? '', postingUrl: application?.postingUrl ?? '',
    notes: application?.notes ?? '', applicationDate: application?.applicationDate ?? today(),
    followUpDate: application?.followUpDate ?? '',
    interviewDate: application?.interviewDate ?? '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const [lookupError, setLookupError] = useState('');
  const lookupController = useRef<AbortController | null>(null);

  useEffect(() => () => lookupController.current?.abort(), []);

  async function importDetails() {
    const url = values.postingUrl.trim();
    if (!url || lookupBusy) return;

    lookupController.current?.abort();
    const controller = new AbortController();
    lookupController.current = controller;
    setLookupBusy(true);
    setLookupMessage('');
    setLookupError('');
    try {
      const preview = await previewJobPosting(url, controller.signal);
      if (controller.signal.aborted) return;
      setValues(current => current.postingUrl.trim() === url
        ? { ...current, company: preview.company, title: preview.title, location: preview.location || current.location }
        : current);
      setLookupMessage('Details filled in. Review the company, title, and location before saving.');
    } catch (failure) {
      if (!controller.signal.aborted) setLookupError(
        errorMessage(failure, 'Could not read this job link. Enter the details manually.'));
    } finally {
      if (lookupController.current === controller) {
        lookupController.current = null;
        setLookupBusy(false);
      }
    }
  }
  const prefix = application ? `edit-${application.id}` : 'create';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setFieldErrors({});
    try {
      await onSave({ ...values, company: values.company.trim(), title: values.title.trim(), postingUrl: values.postingUrl.trim() });
    } catch (failure) {
      setError(errorMessage(failure, 'Could not save the application. Please try again.'));
      if (failure instanceof ApiError) setFieldErrors(failure.fieldErrors);
    }
  }

  const fields = [
    { name: 'postingUrl', label: 'Job posting URL', type: 'url' },
    { name: 'company', label: 'Company', type: 'text', required: true },
    { name: 'title', label: 'Job title', type: 'text', required: true },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'applicationDate', label: 'Application date', type: 'date', required: true },
    { name: 'followUpDate', label: 'Follow-up date', type: 'date' },
    ...(application ? [{ name: 'interviewDate', label: 'Interview date', type: 'date' }] : []),
  ];

  return <form className="application-form" onSubmit={submit} aria-label={application ? 'Edit application' : 'New application'}>
    <fieldset disabled={busy}>
      {fields.map(({ name, label, type, required }) => <div className={`form-field${name === 'postingUrl' ? ' form-field-full' : ''}`} key={name}>
        <label htmlFor={`${prefix}-${name}`}>{label}</label>
        <input id={`${prefix}-${name}`} type={type} autoFocus={name === 'company'} required={required} maxLength={type === 'date' ? undefined : 255}
          pattern={name === 'postingUrl' ? '[hH][tT][tT][pP][sS]?://.*' : undefined}
          value={values[name as keyof UpdateJobApplicationRequest]}
          aria-invalid={!!fieldErrors[name]} aria-describedby={fieldErrors[name] ? `${prefix}-${name}-error` : undefined}
          onChange={event => {
            const value = event.currentTarget.value;
            if (name === 'postingUrl') {
              lookupController.current?.abort();
              setLookupBusy(false);
              setLookupMessage('');
              setLookupError('');
            }
            setValues(current => ({ ...current, [name]: value }));
          }} />
        {name === 'postingUrl' && <>
          <div className="posting-import-actions">
            <button type="button" className="secondary-button" disabled={busy || lookupBusy || !values.postingUrl.trim()}
              onClick={() => void importDetails()}>{lookupBusy ? 'Looking up…' : 'Fill from job link'}</button>
            <span className="form-help">Supports public Greenhouse, Lever, and Ashby links. Other sites can be entered manually.</span>
          </div>
          {lookupMessage && <p className="form-help lookup-success" role="status">{lookupMessage}</p>}
          {lookupError && <p className="form-error" role="alert">{lookupError}</p>}
        </>}
        {fieldErrors[name] && <span className="form-error" id={`${prefix}-${name}-error`}>{fieldErrors[name]}</span>}
      </div>)}
      {application && <p className="form-help form-field-full">Upcoming interviews includes applications with Interview status and a date today or later.</p>}
      <div className="form-field form-field-full">
        <label htmlFor={`${prefix}-notes`}>Notes</label>
        <textarea id={`${prefix}-notes`} rows={4} maxLength={2000} value={values.notes}
          aria-invalid={!!fieldErrors.notes} aria-describedby={`${prefix}-notes-help`}
          onChange={event => setValues({ ...values, notes: event.target.value })} />
        <span className="form-help" id={`${prefix}-notes-help`}>{fieldErrors.notes ?? `${values.notes.length}/2000 characters`}</span>
      </div>
      {error && <p className="form-error form-field-full" role="alert">{error}</p>}
      <div className="form-actions form-field-full">
        <button type="submit">{busy ? 'Saving…' : application ? 'Save changes' : 'Save application'}</button>
        <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}
