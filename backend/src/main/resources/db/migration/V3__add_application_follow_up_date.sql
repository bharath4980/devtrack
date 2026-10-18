ALTER TABLE job_applications ADD COLUMN follow_up_date DATE;

CREATE INDEX idx_applications_owner_follow_up ON job_applications(owner_id, follow_up_date);
