import type { ApplicationStatus } from './types';

export type ImportApplicationRow = {
  company: string;
  title: string;
  location: string;
  status: ApplicationStatus;
  applicationDate: string;
  interviewDate: string;
  followUpDate: string;
  postingUrl: string;
  recruiterName: string;
  recruiterEmail: string;
  resumeVersion: string;
  notes: string;
};

const REQUIRED = ['company', 'title'];
const ALIASES: Record<string, string> = {
  id: 'id', company: 'company', employer: 'company', title: 'title', job_title: 'title',
  position: 'title', location: 'location', status: 'status',
  application_date: 'applicationDate', applied_date: 'applicationDate',
  interview_date: 'interviewDate', follow_up_date: 'followUpDate',
  posting_url: 'postingUrl', job_url: 'postingUrl', url: 'postingUrl',
  recruiter_name: 'recruiterName', recruiter_email: 'recruiterEmail',
  resume_version: 'resumeVersion',
  notes: 'notes',
};
const validStatuses = new Set(['SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED']);

function parseCsvCells(input: string): string[][] {
  const rows: string[][] = [];
  let line: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else cell += char;
    } else if (char === '"') {
      if (cell !== '' || closedQuote) throw new Error('The CSV has an unexpected quote near row ' + (rows.length + 1) + '.');
      quoted = true;
    } else if (char === ',' || char === '\r' || char === '\n') {
      line.push(cell); cell = ''; closedQuote = false;
      if (char !== ',') {
        if (line.some(value => value.trim() !== '')) rows.push(line);
        if (rows.length > 101) throw new Error('Import at most 100 applications per CSV.');
        line = [];
        if (char === '\r' && input[i + 1] === '\n') i++;
      }
    } else {
      if (closedQuote) throw new Error('Unexpected characters after a quote near row ' + (rows.length + 1) + '.');
      cell += char;
    }
  }
  if (quoted) throw new Error('The CSV has an unfinished quoted field.');
  if (cell !== '' || line.length) {
    line.push(cell);
    if (line.some(value => value.trim() !== '')) rows.push(line);
  }
  return rows;
}

function date(raw: string, field: string, row: number): string {
  const value = raw.trim();
  if (!value) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Row ' + row + ': ' + field + ' must be YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  if (actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1 || actual.getUTCDate() !== day) {
    throw new Error('Row ' + row + ': invalid ' + field + '.');
  }
  return value;
}

export function parseApplicationsCsv(input: string): ImportApplicationRow[] {
  const rows = parseCsvCells(input.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('Choose a CSV containing a header and at least one application.');
  const headings = rows[0].map(value => ALIASES[value.trim().toLowerCase().replace(/[\s-]+/g, '_')]);
  if (headings.some(name => !name)) throw new Error('CSV contains an unrecognized column. Use a DevTrack export or supported column names.');
  if (new Set(headings).size !== headings.length) throw new Error('CSV contains duplicate column names.');
  for (const field of REQUIRED) {
    if (!headings.includes(field)) throw new Error('CSV must contain company and title columns.');
  }
  const records = rows.slice(1);
  if (records.length > 100) throw new Error('Import at most 100 applications per CSV.');
  return records.map((cells, index) => {
    const row = index + 2;
    if (cells.length !== headings.length) throw new Error('Row ' + row + ': expected ' + headings.length + ' CSV columns.');
    const raw: Record<string, string> = {};
    headings.forEach((name, i) => { raw[name] = cells[i].trim(); });
    const company = raw.company || '';
    const title = raw.title || '';
    if (!company || !title) throw new Error('Row ' + row + ': company and title are required.');
    for (const [field, max] of [['company', 255], ['title', 255], ['location', 255], ['postingUrl', 255], ['notes', 2000],
      ['recruiterName', 255], ['recruiterEmail', 254], ['resumeVersion', 255]] as const) {
      if ((raw[field] ?? '').length > max) throw new Error('Row ' + row + ': ' + field + ' is too long.');
    }
    const status = (raw.status || 'SAVED').toUpperCase();
    if (!validStatuses.has(status)) throw new Error('Row ' + row + ': invalid status "' + status + '".');
    const url = raw.postingUrl || '';
    if (url) {
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password)
          throw new Error('Invalid URL');
      } catch { throw new Error('Row ' + row + ': enter a valid http or https posting URL.'); }
    }
    if (raw.recruiterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.recruiterEmail)) {
      throw new Error('Row ' + row + ': enter a valid recruiter email.');
    }
    return {
      company, title, location: raw.location || '', status: status as ApplicationStatus,
      applicationDate: date(raw.applicationDate || '', 'application date', row),
      interviewDate: date(raw.interviewDate || '', 'interview date', row),
      followUpDate: date(raw.followUpDate || '', 'follow-up date', row),
      postingUrl: url, notes: raw.notes || '',
      recruiterName: raw.recruiterName || '', recruiterEmail: raw.recruiterEmail || '',
      resumeVersion: raw.resumeVersion || '',
    };
  });
}
