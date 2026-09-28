import { apiFetch } from './api';

export type DashboardSummary = {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
};

export type UpcomingInterview = {
  id: number;
  company: string;
  title: string;
  interviewDate: string;
};

export async function getDashboardSummary(signal?: AbortSignal): Promise<DashboardSummary> {
  const response = await apiFetch('/api/dashboard', { signal });

  if (!response.ok) {
    throw new Error('Failed to load dashboard');
  }

  return response.json();
}

export async function getUpcomingInterviews(signal?: AbortSignal): Promise<UpcomingInterview[]> {
  const response = await apiFetch('/api/dashboard/interviews', { signal });

  if (!response.ok) {
    throw new Error('Failed to load upcoming interviews');
  }

  return response.json();
}