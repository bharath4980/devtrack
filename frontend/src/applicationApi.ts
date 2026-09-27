import type {
  CreateJobApplicationRequest,
  JobApplication,
} from './types';

export async function getApplications(): Promise<JobApplication[]> {
  const response = await fetch('/api/applications');

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