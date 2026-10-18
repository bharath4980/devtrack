export type ApplicationStatus =
  | 'SAVED'
  | 'APPLIED'
  | 'INTERVIEW'
  | 'OFFER'
  | 'REJECTED';

export type JobApplication = {
  id: number;
  company: string;
  title: string;
  location: string | null;
  postingUrl: string | null;
  notes: string | null;
  status: ApplicationStatus;
  applicationDate: string | null;
  interviewDate: string | null;
  followUpDate: string | null;
};

export type CreateJobApplicationRequest = {
  company: string;
  title: string;
  location: string;
  postingUrl: string;
  notes: string;
  applicationDate: string;
  followUpDate: string;
};

export type UpdateJobApplicationRequest = {
  company: string;
  title: string;
  location: string;
  postingUrl: string;
  notes: string;
  applicationDate: string;
  interviewDate: string;
  followUpDate: string;
};

export type ApplicationSort = 'NEWEST' | 'OLDEST' | 'COMPANY' | 'APPLICATION_DATE';
export type ApplicationQuery = {
  search: string;
  status: ApplicationStatus | '';
  sort: ApplicationSort;
  page: number;
};
export type ApplicationPage = {
  items: JobApplication[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};
export const statuses: ApplicationStatus[] = ['SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED'];
export const statusLabel = (status: ApplicationStatus) => status[0] + status.slice(1).toLowerCase();
