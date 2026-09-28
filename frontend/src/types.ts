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
};

export type CreateJobApplicationRequest = {
  company: string;
  title: string;
  location: string;
  postingUrl: string;
  notes: string;
  applicationDate: string;
};

export type UpdateJobApplicationRequest = {
  company: string;
  title: string;
  location: string;
  postingUrl: string;
  notes: string;
  applicationDate: string;
  interviewDate: string;
};