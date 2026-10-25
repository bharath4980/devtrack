import { useEffect, useRef, useState, type FormEvent } from 'react';
import { previewJobPosting, findDuplicateApplication, type DuplicateApplication } from './applicationApi';
import { ApiError, errorMessage } from './apiError';
import { statusLabel, type JobApplication, type UpdateJobApplicationRequest } from './types';

type Props = {
  application?: JobApplication;
  busy: boolean;
  onSave: (values: UpdateJobApplicationRequest) => Promise<void>;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function ApplicationForm({ application, busy, onSave, onCancel, onDirtyChange }: Props) {
  const [values, setValues] = useState<UpdateJobApplicationRequest>({
    company: application?.company ?? '', title: application?.title ?? '',
    location: application?.location ?? '', postingUrl: application?.postingUrl ?? '',
    recruiterName: application?.recruiterName ?? '', recruiterEmail: application?.recruiterEmail ?? '',
    resumeVersion: application?.resumeVersion ?? '',
    notes: application?.notes ?? '', applicationDate: application?.applicationDate ?? today(),
    followUpDate: application?.followUpDate ?? '',
    interviewDate: application?.interviewDate ?? '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitPending = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');
  const [lookupError, setLookupError] = useState('');
  const lookupController = useRef<AbortController | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateApplication | null>(null);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');
  const [confirmedDuplicateUrl, setConfirmedDuplicateUrl] = useState('');

  useEffect(() => () => lookupController.current?.abort(), []);

  useEffect(() => {
    const url = values.postingUrl.trim();
    setDuplicate(null);
    setDuplicateError('');
    if (!/^https?:\/\/[^/]+/i.test(url) || url.length > 255) {
      setDuplicateChecking(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDuplicateChecking(true);
      void findDuplicateApplication(url, application?.id, controller.signal)
        .then(match => { if (!controller.signal.aborted) setDuplicate(match); })
        .catch(() => {
          if (!controller.signal.aborted) setDuplicateError('Could not check this link for duplicates.');
        })
        .finally(() => { if (!controller.signal.aborted) setDuplicateChecking(false); });
    }, 450);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [values.postingUrl, application?.id]);

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
  const initialValues: UpdateJobApplicationRequest = {
    company: application?.company ?? '', title: application?.title ?? '',
    location: application?.location ?? '', postingUrl: application?.postingUrl ?? '',
    recruiterName: application?.recruiterName ?? '', recruiterEmail: application?.recruiterEmail ?? '',
    resumeVersion: application?.resumeVersion ?? '',
    notes: application?.notes ?? '', applicationDate: application?.applicationDate ?? today(),
    followUpDate: application?.followUpDate ?? '', interviewDate: application?.interviewDate ?? '',
  };
  const hasUnsavedChanges = (Object.keys(initialValues) as (keyof UpdateJobApplicationRequest)[])
    .some(key => values[key] !== initialValues[key]);

  // Parent views also need the dirty state before changing filters or details.
  useEffect(() => { onDirtyChange?.(hasUnsavedChanges); }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  function cancelEditing() {
    if (hasUnsavedChanges && !window.confirm('Discard your unsaved application changes?')) return;
    onCancel();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Lock before the asynchronous duplicate check to prevent repeat submissions.
    if (busy || submitPending.current) return;
    submitPending.current = true;
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const url = values.postingUrl.trim();
      if (url && confirmedDuplicateUrl !== url) {
        try {
          const match = await findDuplicateApplication(url, application?.id);
          if (match) {
            setDuplicate(match);
            setError('This job is already tracked. Choose Save anyway if you want another entry.');
            return;
          }
        } catch (failure) {
          setError(errorMessage(failure,
            'Could not check this link for duplicates. Try again or clear the URL to save manually.'));
          return;
        }
      }
      try {
        await onSave({ ...values, company: values.company.trim(), title: values.title.trim(), postingUrl: url });
      } catch (failure) {
        setError(errorMessage(failure, 'Could not save the application. Please try again.'));
        if (failure instanceof ApiError) setFieldErrors(failure.fieldErrors);
      }
    } finally {
      submitPending.current = false;
      setSubmitting(false);
    }
  }

  const fields = [
    { name: 'postingUrl', label: 'Job posting URL', type: 'url' },
    { name: 'company', label: 'Company', type: 'text', required: true },
    { name: 'title', label: 'Job title', type: 'text', required: true },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'recruiterName', label: 'Recruiter name (optional)', type: 'text' },
    { name: 'recruiterEmail', label: 'Recruiter email (optional)', type: 'email' },
    { name: 'resumeVersion', label: 'Resume version used (optional)', type: 'text' },
    { name: 'applicationDate', label: 'Application date', type: 'date', required: true },
    { name: 'followUpDate', label: 'Follow-up date', type: 'date' },
    ...(application ? [{ name: 'interviewDate', label: 'Interview date', type: 'date' }] : []),
  ];

  return <form className="application-form" onSubmit={submit} aria-label={application ? 'Edit application' : 'New application'}>
    <fieldset disabled={busy || submitting}>
      {fields.map(({ name, label, type, required }) => <div className={`form-field${name === 'postingUrl' ? ' form-field-full' : ''}`} key={name}>
        <label htmlFor={`${prefix}-${name}`}>{label}</label>
        <input id={`${prefix}-${name}`} type={type} autoFocus={name === 'company'} required={required} maxLength={type === 'date' ? undefined : type === 'email' ? 254 : 255}
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
              setDuplicate(null);
              setDuplicateError('');
              setConfirmedDuplicateUrl('');
            }
            setValues(current => ({ ...current, [name]: value }));
          }} />
        {name === 'postingUrl' && <>
          <div className="posting-import-actions">
            <button type="button" className="secondary-button" disabled={busy || lookupBusy || !values.postingUrl.trim()}
              onClick={() => void importDetails()}>{lookupBusy ? 'Looking up…' : 'Fill from job link'}</button>
            <span className="form-help">Supports public Greenhouse, Lever, Ashby, SmartRecruiters, Workday, and BambooHR links. Other sites can be entered manually.</span>
          </div>
          {lookupMessage && <p className="form-help lookup-success" role="status">{lookupMessage}</p>}
          {lookupError && <p className="form-error" role="alert">{lookupError}</p>}
          {duplicateChecking && <p className="form-help" role="status">Checking saved job links…</p>}
          {duplicateError && <p className="form-help" role="status">{duplicateError}</p>}
          {duplicate && <div className="form-field-full" role="alert">
            <p className="form-error">Already tracked: {duplicate.company} — {duplicate.title} ({statusLabel(duplicate.status)}).
              Check your existing entry before saving another.</p>
            {confirmedDuplicateUrl === values.postingUrl.trim()
              ? <p className="form-help">Duplicate acknowledged. Select Save application to continue.</p>
              : <button type="button" className="secondary-button"
                  onClick={() => { setConfirmedDuplicateUrl(values.postingUrl.trim()); setError(''); }}>
                  Save anyway
                </button>}
          </div>}
        </>}
        {fieldErrors[name] && <span className="form-error" id={`${prefix}-${name}-error`}>{fieldErrors[name]}</span>}
      </div>)}
      {application && <p className="form-help form-field-full">Upcoming interviews includes applications with Interview status and a date today or later.</p>}
      <p className="form-help form-field-full">Recruiter details and the resume version are private tracking notes. No resume file is uploaded.</p>
      <div className="form-field form-field-full">
        <label htmlFor={`${prefix}-notes`}>Notes</label>
        <textarea id={`${prefix}-notes`} rows={4} maxLength={2000} value={values.notes}
          aria-invalid={!!fieldErrors.notes} aria-describedby={`${prefix}-notes-help`}
          onChange={event => setValues({ ...values, notes: event.target.value })} />
        <span className="form-help" id={`${prefix}-notes-help`}>{fieldErrors.notes ?? `${values.notes.length}/2000 characters`}</span>
      </div>
      {error && <p className="form-error form-field-full" role="alert">{error}</p>}
      <div className="form-actions form-field-full">
        <button type="submit">{submitting || busy ? 'Saving…' : application ? 'Save changes' : 'Save application'}</button>
        <button type="button" className="secondary-button" onClick={cancelEditing}>Cancel</button>
      </div>
    </fieldset>
  </form>;
}
