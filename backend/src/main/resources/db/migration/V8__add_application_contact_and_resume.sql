-- Optional tracking metadata; existing applications and ownership remain unchanged.
ALTER TABLE job_applications ADD COLUMN recruiter_name VARCHAR(255);
ALTER TABLE job_applications ADD COLUMN recruiter_email VARCHAR(254);
ALTER TABLE job_applications ADD COLUMN resume_version VARCHAR(255);
