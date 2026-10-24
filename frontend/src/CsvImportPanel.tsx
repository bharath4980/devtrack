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
  const fileRef = useRef<HTMLInputElement>(null);
  const importPending = useRef(false);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setRows([]); setChecked(false); setError(''); setFileName('');
    if (!file) return;
    try {
      if (file.size > 512_000) throw new Error('Choose a CSV file under 500 KB (100 applications maximum).');
      const result = parseApplicationsCsv(await file.text());
      setRows(result);
      setFileName(file.name);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not read this CSV.'));
    }
  }

  async function save() {
    if (disabled || saving || importPending.current || !checked || rows.length === 0) return;
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
    {error && <p role="alert" className="form-error">{error} No changes were made if the import was rejected.</p>}
    {rows.length > 0 && <div className="csv-import-preview">
      <p role="status"><strong>Preview:</strong> {rows.length} {rows.length === 1 ? 'application' : 'applications'} from {fileName}.
        Nothing has been imported yet.</p>
      <div className="csv-preview-scroll">
        <table aria-label="CSV application preview">
          <thead><tr><th>Company</th><th>Job title</th><th>Status</th><th>Application date</th></tr></thead>
          <tbody>{rows.slice(0, 5).map((row, index) => <tr key={index}>
            <td>{row.company}</td><td>{row.title}</td><td>{row.status}</td>
            <td>{row.applicationDate || 'Not set'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {rows.length > 5 && <p className="form-help">Showing the first five rows; all {rows.length} rows will be imported.</p>}
      <p className="form-help">The server checks all rows and duplicate jobs again. If one row is invalid
        or duplicated, the entire import is rejected without changing your applications.
        Only new records are created; existing applications are never replaced.</p>
      <label className="csv-import-confirm">
        <input type="checkbox" checked={checked} disabled={disabled || saving}
          onChange={event => setChecked(event.target.checked)} />
        <span>I reviewed the CSV and want to add these applications to my account.</span>
      </label>
      <button type="button" disabled={disabled || saving || !checked} onClick={() => void save()}>
        {saving ? 'Importing applications…' : 'Import ' + rows.length + ' applications'}
      </button>
    </div>}
  </section>;
}
