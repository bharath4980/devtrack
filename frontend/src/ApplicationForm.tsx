import { useState, type FormEvent } from 'react';
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
    interviewDate: application?.interviewDate ?? '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
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
    { name: 'company', label: 'Company', type: 'text', required: true },
    { name: 'title', label: 'Job title', type: 'text', required: true },
    { name: 'location', label: 'Location', type: 'text' },
    { name: 'postingUrl', label: 'Job posting URL', type: 'url' },
    { name: 'applicationDate', label: 'Application date', type: 'date', required: true },
    ...(application ? [{ name: 'interviewDate', label: 'Interview date', type: 'date' }] : []),
  ];

  return <form className="application-form" onSubmit={submit} aria-label={application ? 'Edit application' : 'New application'}>
    <fieldset disabled={busy}>
      {fields.map(({ name, label, type, required }) => <div className="form-field" key={name}>
        <label htmlFor={`${prefix}-${name}`}>{label}</label>
        <input id={`${prefix}-${name}`} type={type} autoFocus={name === 'company'} required={required} maxLength={type === 'date' ? undefined : 255}
          pattern={name === 'postingUrl' ? '[hH][tT][tT][pP][sS]?://.*' : undefined}
          value={values[name as keyof UpdateJobApplicationRequest]}
          aria-invalid={!!fieldErrors[name]} aria-describedby={fieldErrors[name] ? `${prefix}-${name}-error` : undefined}
          onChange={event => setValues({ ...values, [name]: event.target.value })} />
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
