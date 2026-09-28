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