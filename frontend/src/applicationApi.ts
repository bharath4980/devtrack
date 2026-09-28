import type {
  ApplicationStatus,
  CreateJobApplicationRequest,
  JobApplication,
  UpdateJobApplicationRequest,
} from './types';

export async function getApplications(
  search = '',
  status: ApplicationStatus | '' = '',
): Promise<JobApplication[]> {
  const params = new URLSearchParams();

  if (search.trim()) {
    params.set('search', search.trim());
  }

  if (status) {
    params.set('status', status);
  }

  const query = params.toString();

  const response = await fetch(
    `/api/applications${query ? `?${query}` : ''}`,
  );

  if (!response.ok) {
    throw new Error('Failed to load applications');
  }

  return response.json();
}

export async function createApplication(
  application: CreateJobApplicationRequest,
): Promise<JobApplication> {
  const response = await fetch('/api/applications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(application),
  });

  if (!response.ok) {
    throw new Error('Failed to save application');
  }

  return response.json();
}

export async function updateApplicationStatus(
  id: number,
  status: ApplicationStatus,
): Promise<JobApplication> {
  const response = await fetch(`/api/applications/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error('Failed to update application status');
  }

  return response.json();
}

export async function updateApplication(
  id: number,
  application: UpdateJobApplicationRequest,
): Promise<JobApplication> {
  const response = await fetch(`/api/applications/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(application),
  });

  if (!response.ok) {
    throw new Error('Failed to update application');
  }

  return response.json();
}

export async function deleteApplication(
  id: number,
): Promise<void> {
  const response = await fetch(`/api/applications/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete application');
  }
}