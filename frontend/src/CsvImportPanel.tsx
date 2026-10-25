import { useRef, useState, type ChangeEvent } from 'react';
import { importApplications } from './applicationApi';
import { errorMessage } from './apiError';
import { parseApplicationsCsv, type ImportApplicationRow } from './csvImport';

type Props = { disabled: boolean; onImported: (count: number) => void; onCancel: () => void };

export default function CsvImportPanel({ disabled, onImported, onCancel }: Props) {
  const [rows, setRows] = useState<ImportApplicationRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importPending = useRef(false);
  const readSequence = useRef(0);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = ++readSequence.current;
    const file = event.target.files?.[0];
    setRows([]); setChecked(false); setError(''); setFileName('');
    setReading(Boolean(file));
    if (!file) return;
    try {
      if (file.size > 512_000) throw new Error('Choose a CSV file under 500 KB (100 applications maximum).');
      const result = parseApplicationsCsv(await file.text());
      if (selected !== readSequence.current) return;
      setRows(result);
      setFileName(file.name);
    } catch (reason) {
      if (selected === readSequence.current) setError(errorMessage(reason, 'Could not read this CSV.'));
    } finally {
      if (selected === readSequence.current) setReading(false);
    }
  }

  async function save() {
    if (disabled || saving || reading || importPending.current || !checked || rows.length === 0) return;
    importPending.current = true;
    setSaving(true);
    setError('');
    try {
      const count = await importApplications(rows);
      setRows([]);
      setFileName('');
      setChecked(false);
      if (fileRef.current) fileRef.current.value = '';
      onImported(count);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not import the CSV. No applications were added.'));
    } finally {
      importPending.current = false;
      setSaving(false);
    }
  }

  return <section className="csv-import-panel" aria-label="Import applications from CSV">
    <div className="csv-import-head">
      <div>
        <h3>Import applications from CSV</h3>
        <p className="form-help">Choose a DevTrack export or a CSV with company and title columns.
          Optional columns: location, status, application_date, interview_date, follow_up_date, posting_url, notes, recruiter_name, recruiter_email, and resume_version.
          Saved IDs from exported files are ignored; new account-owned IDs are generated.</p>
      </div>
      <button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>Close import</button>
    </div>
    <div className="form-field">
      <label htmlFor="import-csv-file">CSV file (up to 100 applications, 500 KB)</label>
      <input ref={fileRef} id="import-csv-file" type="file" accept=".csv,text/csv"
        disabled={disabled || saving} onChange={event => void chooseFile(event)} />
    </div>
    {reading && <p role="status" className="form-help">Reading selected CSV…</p>}
    {error && <p role="alert" className="form-error">{error} No changes were made if the import was rejected.</p>}
    {rows.length > 0 && <div className="csv-import-preview">
      <p role="status"><strong>Preview:</strong> {rows.length} {rows.length === 1 ? 'application' : 'applications'} from {fileName}.
        Nothing has been imported yet.</p>
      <p className="form-help">Review all {rows.length} rows below. Scroll the table to check every row before importing.</p>
      <div className="csv-preview-scroll" role="region" aria-label="Review CSV rows" tabIndex={0}>
        <table aria-label="CSV application preview">
          <thead><tr><th scope="col">Row</th><th scope="col">Company</th>
            <th scope="col">Job title</th><th scope="col">Location</th>
            <th scope="col">Status</th><th scope="col">Application date</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>
            <td>{index + 1}</td><td>{row.company}</td><td>{row.title}</td>
            <td>{row.location || 'Not set'}</td><td>{row.status}</td>
            <td>{row.applicationDate || 'Not set'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="form-help">The server checks all rows and duplicate jobs again. If one row is invalid
        or duplicated, the entire import is rejected without changing your applications.
        Only new records are created; existing applications are never replaced.</p>
      <label className="csv-import-confirm">
        <input type="checkbox" checked={checked} disabled={disabled || saving}
          onChange={event => setChecked(event.target.checked)} />
        <span>I reviewed the CSV and want to add these applications to my account.</span>
      </label>
      <button type="button" disabled={disabled || saving || reading || !checked} onClick={() => void save()}>
        {saving ? 'Importing applications…' : 'Import ' + rows.length + ' applications'}
      </button>
    </div>}
  </section>;
}
