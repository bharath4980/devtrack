import { apiFetch } from './api';
import { readApiError } from './apiError';
import type {
  ApplicationStatus,
  ApplicationQuery,
  ApplicationPage,
  CreateJobApplicationRequest,
  JobApplication,
  UpdateJobApplicationRequest,
} from './types';

export type JobPostingPreview = {
  company: string;
  title: string;
  location: string;
};

export async function previewJobPosting(url: string, signal?: AbortSignal): Promise<JobPostingPreview> {
  const params = new URLSearchParams({ url });
  const response = await apiFetch(`/api/job-postings/preview?${params}`, { signal });
  if (!response.ok) throw await readApiError(response, 'Could not load job details.');
  return response.json();
}

export type DuplicateApplication = {
  id: number;
  company: string;
  title: string;
  status: ApplicationStatus;
};

// This never contacts the pasted URL; the backend looks only at this account's saved links.
export async function findDuplicateApplication(
  url: string, excludeId?: number, signal?: AbortSignal,
): Promise<DuplicateApplication | null> {
  const params = new URLSearchParams({ url });
  if (excludeId !== undefined) params.set('excludeId', String(excludeId));
  const response = await apiFetch(`/api/applications/duplicate?${params}`, { signal, cache: 'no-store' });
  if (response.status === 204) return null;
  if (!response.ok) throw await readApiError(response, 'Could not check saved job links.');
  return response.json();
}

export async function getApplicationActivity(id: number, signal?: AbortSignal): Promise<import('./dashboardApi').ApplicationActivity[]> {
  const response = await apiFetch(`/api/applications/${id}/activity`, { signal });
  if (!response.ok) throw await readApiError(response, 'Could not load application history.');
  return response.json();
}

export async function getApplications(query: ApplicationQuery, signal?: AbortSignal): Promise<ApplicationPage> {
  const params = new URLSearchParams({
    page: String(query.page), size: '10', sort: query.sort,
  });
  if (query.search.trim()) params.set('search', query.search.trim());
  if (query.status) params.set('status', query.status);
  const response = await apiFetch(`/api/applications?${params}`, { signal });
  if (!response.ok) throw await readApiError(response, 'Could not load applications.');
  return response.json();
}

export async function downloadApplicationsCsv(): Promise<void> {
  const response = await apiFetch('/api/applications/export.csv', { cache: 'no-store' });
  if (!response.ok) throw await readApiError(response, 'Could not export applications.');

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = 'devtrack-applications-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(blobUrl);
  }
}

export async function createApplication(
  application: CreateJobApplicationRequest,
): Promise<JobApplication> {
  const response = await apiFetch('/api/applications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(application),
  });

  if (!response.ok) {
    throw await readApiError(
        response,
        'Failed to save application',
      );
  }

  return response.json();
}

export async function rescheduleFollowUp(id: number, followUpDate: string): Promise<JobApplication> {
  const response = await apiFetch(`/api/applications/${id}/follow-up`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ followUpDate }),
  });
  if (!response.ok) throw await readApiError(response, 'Could not reschedule follow-up.');
  return response.json();
}

export async function updateApplicationStatus(
  id: number,
  status: ApplicationStatus,
): Promise<JobApplication> {
  const response = await apiFetch(`/api/applications/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw await readApiError(
        response,
        'Failed to update application status',
      );
  }

  return response.json();
}

export async function updateApplication(
  id: number,
  application: UpdateJobApplicationRequest,
): Promise<JobApplication> {
  const response = await apiFetch(`/api/applications/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(application),
  });

  if (!response.ok) {
    throw await readApiError(
        response,
        'Failed to update application',
      );
  }

  return response.json();
}

export async function deleteApplication(
  id: number,
): Promise<void> {
  const response = await apiFetch(`/api/applications/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw await readApiError(
        response,
        'Failed to delete application',
      );
  }
}