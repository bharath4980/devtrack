import { apiFetch } from './api';
import { readApiError } from './apiError';

export type InterviewFormat = 'PHONE' | 'VIDEO' | 'ONSITE' | 'TAKE_HOME' | 'OTHER';
export type InterviewOutcome = 'PLANNED' | 'COMPLETED' | 'CANCELLED';
export type InterviewRoundInput = {
  roundName: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  timeZone: string | null;
  format: InterviewFormat;
  contactName: string | null;
  contactEmail: string | null;
  preparationNotes: string | null;
  followUpNotes: string | null;
  outcome: InterviewOutcome;
};
export type InterviewRound = InterviewRoundInput & {
  id: number;
  googleCalendarUrl: string | null;
  outlookCalendarUrl: string | null;
};

export async function getInterviewRounds(applicationId: number, signal?: AbortSignal): Promise<InterviewRound[]> {
  const response = await apiFetch('/api/applications/' + applicationId + '/interviews', {
    signal, cache: 'no-store',
  });
  if (!response.ok) throw await readApiError(response, 'Could not load interview rounds.');
  return response.json();
}

export async function createInterviewRound(applicationId: number, input: InterviewRoundInput): Promise<InterviewRound> {
  const response = await apiFetch('/api/applications/' + applicationId + '/interviews', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw await readApiError(response, 'Could not create interview round.');
  return response.json();
}

export async function updateInterviewRound(applicationId: number, roundId: number,
  input: InterviewRoundInput): Promise<InterviewRound> {
  const response = await apiFetch('/api/applications/' + applicationId + '/interviews/' + roundId, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!response.ok) throw await readApiError(response, 'Could not update interview round.');
  return response.json();
}

export async function deleteInterviewRound(applicationId: number, roundId: number): Promise<void> {
  const response = await apiFetch('/api/applications/' + applicationId + '/interviews/' + roundId, { method: 'DELETE' });
  if (!response.ok) throw await readApiError(response, 'Could not delete interview round.');
}

export async function downloadInterviewCalendar(applicationId: number, roundId: number): Promise<void> {
  const response = await apiFetch(
    '/api/applications/' + applicationId + '/interviews/' + roundId + '/calendar.ics',
    { cache: 'no-store' },
  );
  if (!response.ok) throw await readApiError(response, 'Could not export the interview calendar event.');
  const file = await response.blob();
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'devtrack-interview-' + roundId + '.ics';
  document.body.appendChild(link);
  try { link.click(); }
  finally { link.remove(); URL.revokeObjectURL(url); }
}
