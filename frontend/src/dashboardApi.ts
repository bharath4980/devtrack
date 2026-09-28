import { apiFetch } from './api';

export type DashboardSummary = {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
};

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await apiFetch('/api/dashboard');

  if (!response.ok) {
    throw new Error('Failed to load dashboard');
  }

  return response.json();
}