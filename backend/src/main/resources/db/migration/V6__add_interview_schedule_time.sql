-- Optional local interview time with an explicit IANA time zone.
-- Existing date-only rounds retain NULL values and remain valid.
ALTER TABLE interview_rounds ADD COLUMN scheduled_time TIME;
ALTER TABLE interview_rounds ADD COLUMN time_zone VARCHAR(64);
ALTER TABLE interview_rounds ADD CONSTRAINT ck_interview_schedule_time
    CHECK (
        (scheduled_time IS NULL AND time_zone IS NULL)
        OR (scheduled_date IS NOT NULL AND scheduled_time IS NOT NULL AND time_zone IS NOT NULL)
    );
