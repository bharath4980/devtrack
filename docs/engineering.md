# Engineering notes

## Request and ownership flow

React calls relative `/api` URLs. Vite proxies them locally; the production JAR serves both the frontend and API. Spring Security checks the session and CSRF token before controllers run. The controller resolves the account from the principal, and every application query includes its owner ID. Client-supplied owner IDs are never used. Other users' records return 404 on mutation.

This stays a controller/service/repository application. No event bus, shared cache, or token service is needed for one process and one database.

## Application list

`GET /api/applications?search=Acme&status=APPLIED&page=0&size=10&sort=NEWEST`

- `page` is zero-based; `size` is 1–100 (default 10).
- Sort values: `NEWEST`, `OLDEST`, `COMPANY`, `APPLICATION_DATE`.
- Search is case-insensitive across company, title, and location. `%`, `_`, and `!` are literal characters, not search operators.
- Both rows and total counts are owner-scoped. Sorting includes an ID tie-breaker.

```json
{
  "items": [],
  "page": 0,
  "size": 10,
  "totalElements": 0,
  "totalPages": 0
}
```

The frontend keeps draft filters separate from applied filters. It cancels superseded reads so a slow earlier request cannot overwrite newer results. After mutations, it refreshes the list and dashboard; if the last page became empty, it moves to the last remaining page. Mutations are never replayed automatically.

## Validation and errors

The backend is authoritative for lengths, required fields, statuses, dates, and HTTP(S) posting URLs. Forms also enforce lengths and display server field errors. Errors contain `timestamp`, `status`, `error`, `message`, `path`, and `fieldErrors`. Unexpected exceptions are logged server-side and return a generic 500; unsupported HTTP methods retain their 405 status.

## Database and test choices

Flyway owns schema changes; Hibernate validates them. The nullable ownership column preserves old unassigned rows. New API writes always set an authenticated owner. No new migration is needed for paging, security limits, or UI changes.

H2 gives quick local integration feedback. CI repeats endpoint tests on PostgreSQL to catch database-specific query differences, then tests the production Docker image through Playwright. Browser tests use disposable accounts and data on localhost. Unit tests check throttle expiration and concurrent requests without sleeping.

## Deliberate limits

Sessions and throttle counters live in memory. Restarting the app signs users out. Fixed windows are easy to explain but allow bursts around window boundaries, and shared budgets can temporarily affect legitimate users. These limits suit a small demo, not a high-traffic public identity service.

Search uses substring matching; no full-text index is warranted for this workload. Concurrent edits use last-write-wins; there is no collaborative editing or revision history. Application-level interview dates have day precision, while scheduled interview rounds can also store a time and IANA time zone. The dashboard uses the browser's time-zone header for scheduling boundaries; analytics weeks remain UTC-based. Automated email/push notifications, password reset, and verified email would require a separate, justified feature phase.


## Application activity and analytics

Flyway V4 introduces an `application_activity` table with indexed owner/application relationships. Creation and meaningful status transitions write timestamped events in the same database transaction as the application change. Repeating an unchanged status does not add history. Deleting an application cascades its events. Both `GET /api/applications/{id}/activity` and `GET /api/dashboard/activity` require authentication and are strictly owner-scoped, with the newest 20/12 events returned respectively.

Earlier changes were not recorded, so historical events are intentionally not fabricated during migration. `GET /api/dashboard/analytics` calculates six monthly buckets using user-entered application dates, and stage rates from current status plus recorded status history. Consequently those rates can undercount stages reached prior to rollout; they are directional signals rather than complete lifetime conversion metrics.

The activity table is not a replacement for application records or an event-sourced system. The current application row remains authoritative.

When an existing application has no recorded events, the frontend shows its current status as a **snapshot only**, explicitly not as an activity event. No timestamps, baseline rows, or historical transitions are invented or written to the database.

## Public job-board preview integrations

The authenticated preview endpoint accepts recognized HTTPS posting links for Greenhouse, Lever, Ashby, SmartRecruiters, Workday, and BambooHR. The service validates hostnames and path segments, builds requests against fixed provider API hosts, and never fetches arbitrary user-provided URLs or follows redirects. Responses have strict byte caps and timeouts. A provider error or missing posting returns a manual-entry fallback; imported fields remain editable before saving.

Ashby's public board endpoint returns an array of postings rather than one job. The importer matches the requested posting by its ID or canonical job URL and never substitutes the first job on a board. It permits up to 2 MiB of public-board JSON; unusually large boards can require manual entry. This is an application preview only, not general-purpose crawling or scraping.

SmartRecruiters posting links use a company identifier and a numeric posting ID. The importer accepts only the exact `jobs.smartrecruiters.com` or `www.smartrecruiters.com` hostnames and a bounded path pattern, then constructs `https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}`. Tracking query strings are never sent to the provider API. The public posting-detail response supplies the title (`name`), company name, and location fields. The returned posting ID and any supplied company identifier are checked against the requested link; empty or inconsistent data produces a manual-entry fallback. No tokens, scraping, or new database fields are required. This integration supports individual public posting links, not general job search.

Workday URLs are accepted only on validated `*.wdN.myworkdayjobs.com` hostnames with bounded job paths, and preview requests use that validated host's `/wday/cxs/` endpoint. BambooHR previews accept validated `*.bamboohr.com/careers/{id}` links and check returned share URLs against the same host and posting. Unsupported links and unsuccessful previews require manual entry.

## Recorded weekly activity

The dashboard's six-week activity chart counts only saved `CREATED` and `STATUS_CHANGED` rows from `application_activity`, filtered by authenticated owner and the event timestamp. Weeks start on Monday at 00:00 UTC, include the current partial week, and exclude events before the window or after the request snapshot time. Each week reports created events and status-change events separately. Zero means **no events recorded for that bucket**; it does not prove no job-search activity occurred before tracking was introduced.

Unlike the monthly application chart, which uses user-entered application dates, this chart uses persisted event timestamps. No backfill, schema migration, or updates to existing records are performed. Events for deleted applications are no longer counted because their activity rows are deleted with the application.

## Follow-up priorities

The dashboard's summary response includes `overdueFollowUps` and `dueTodayFollowUps`, computed from all owner-scoped applications whose status is **Saved, Applied, or Interview** and whose explicit follow-up date is earlier than or equal to today in the time zone supplied by the browser. Overdue uses dates strictly before today; due today uses equality. Future dates, missing dates, terminal Offer/Rejected statuses, and other accounts never contribute.

The existing `GET /api/dashboard/follow-ups` endpoint still returns the **earliest five** due applications. Counts deliberately come from the full eligible set, not this limited list. Each visible overdue card shows calendar days since its follow-up date in the browser's time zone; a date is a user-entered reminder, not evidence that a follow-up was sent or completed. Changing a date or status refreshes the dashboard counts. A separate **Next actions** section above the analytics selects up to five priorities from the existing five-item due, upcoming-follow-up, scheduled-round, and application-interview lists. It sorts overdue and due-today follow-ups ahead of imminent interviews and later reminders, opening the existing authenticated application quick view rather than creating another task store. The queue cannot claim to include every eligible application because its source lists are bounded. No notification, reminder automation, new table, or migration is introduced.

## Read-only CSV export

`GET /api/applications/export.csv` returns a UTF-8 (BOM) CSV attachment for the authenticated account. This export **always includes all of that account's applications**, irrespective of search, filters, or list pagination, ordered by stable application ID. It contains `id`, company, job title, location, current status, application/interview/follow-up dates, posting URL, notes, recruiter name, recruiter email, and resume version; it does **not** include passwords, account identifiers, internal ownership metadata, or invented historical events.

Text fields are RFC-style quoted with embedded quotes doubled. Leading spreadsheet formula operators (`=`, `+`, `-`, `@`, including after leading whitespace) and control prefixes are neutralized with an apostrophe before quoting, preventing untrusted notes or job titles from executing as spreadsheet formulas. Dates use `YYYY-MM-DD`; absent optional fields are empty cells. The response uses `text/csv;charset=UTF-8`, attachment disposition, and `Cache-Control: no-store`. The export is a read-only snapshot, not an import/restore mechanism.

To bound server memory, exports are limited to **10,000 rows** and requests exceeding that size fail with HTTP 413 rather than silently dropping records. This feature performs no schema migration, write, or external upload. Downloaded CSV files contain personal job-search information and should be stored securely.
