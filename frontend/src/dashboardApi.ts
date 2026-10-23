import { apiFetch } from './api';

export type DashboardSummary = {
  total: number;
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
  overdueFollowUps: number;
  dueTodayFollowUps: number;
};

export type UpcomingInterview = {
  id: number;
  company: string;
  title: string;
  interviewDate: string;
};

export type UpcomingInterviewRound = {
  roundId: number;
  applicationId: number;
  company: string;
  title: string;
  roundName: string;
  format: 'PHONE' | 'VIDEO' | 'ONSITE' | 'TAKE_HOME' | 'OTHER';
  scheduledDate: string;
  scheduledTime: string | null;
  timeZone: string | null;
};

export async function getUpcomingInterviewRounds(signal?: AbortSignal): Promise<UpcomingInterviewRound[]> {
  const response = await apiFetch('/api/dashboard/interviews/rounds', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Failed to load upcoming interview rounds');
  return response.json();
}

export type DueFollowUp = {
  id: number;
  company: string;
  title: string;
  followUpDate: string;
};

export async function getDueFollowUps(signal?: AbortSignal): Promise<DueFollowUp[]> {
  const response = await apiFetch('/api/dashboard/follow-ups', { signal });
  if (!response.ok) throw new Error('Failed to load due follow-ups');
  return response.json();
}

export async function getUpcomingFollowUps(signal?: AbortSignal): Promise<DueFollowUp[]> {
  const response = await apiFetch('/api/dashboard/follow-ups/upcoming', { signal });
  if (!response.ok) throw new Error('Failed to load upcoming follow-ups');
  return response.json();
}

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

export type ApplicationActivity = {
  id: number;
  applicationId: number;
  company: string;
  title: string;
  type: 'CREATED' | 'STATUS_CHANGED' | 'FOLLOW_UP_COMPLETED';
  fromStatus: import('./types').ApplicationStatus | null;
  toStatus: import('./types').ApplicationStatus;
  occurredAt: string;
};

export type DashboardAnalytics = {
  trackedApplications: number;
  interviewOrOfferReached: number;
  offersReached: number;
  interviewOrOfferRate: number;
  offerRate: number;
  monthlyApplications: { month: string; applications: number }[];
  weeklyActivity: { weekStart: string; created: number; statusChanges: number }[];
};

export async function getRecentActivity(signal?: AbortSignal): Promise<ApplicationActivity[]> {
  const response = await apiFetch('/api/dashboard/activity', { signal });
  if (!response.ok) throw new Error('Failed to load recent activity');
  return response.json();
}

export async function getDashboardAnalytics(signal?: AbortSignal): Promise<DashboardAnalytics> {
  const response = await apiFetch('/api/dashboard/analytics', { signal });
  if (!response.ok) throw new Error('Failed to load analytics');
  return response.json();
}
