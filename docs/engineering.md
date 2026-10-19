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

Search uses substring matching; no full-text index is warranted for this workload. Concurrent edits use last-write-wins; there is no collaborative editing or revision history. Interview dates have day precision and use UTC for the upcoming list. Email delivery, reminders, password reset, and verified email would require a separate, justified feature phase.


## Application activity and analytics

Flyway V4 introduces an `application_activity` table with indexed owner/application relationships. Creation and meaningful status transitions write timestamped events in the same database transaction as the application change. Repeating an unchanged status does not add history. Deleting an application cascades its events. Both `GET /api/applications/{id}/activity` and `GET /api/dashboard/activity` require authentication and are strictly owner-scoped, with the newest 20/12 events returned respectively.

Earlier changes were not recorded, so historical events are intentionally not fabricated during migration. `GET /api/dashboard/analytics` calculates six monthly buckets using user-entered application dates, and stage rates from current status plus recorded status history. Consequently those rates can undercount stages reached prior to rollout; they are directional signals rather than complete lifetime conversion metrics.

The activity table is not a replacement for application records or an event-sourced system. The current application row remains authoritative.

When an existing application has no recorded events, the frontend shows its current status as a **snapshot only**, explicitly not as an activity event. No timestamps, baseline rows, or historical transitions are invented or written to the database.

## Public job-board preview integrations

The authenticated preview endpoint accepts recognized HTTPS posting links for Greenhouse, Lever, Ashby, and SmartRecruiters. The service validates hostnames and path segments, builds requests against fixed provider API hosts, and never fetches arbitrary user-provided URLs or follows redirects. Responses have strict byte caps and timeouts. A provider error or missing posting returns a manual-entry fallback; imported fields remain editable before saving.

Ashby's public board endpoint returns an array of postings rather than one job. The importer matches the requested posting by its ID or canonical job URL and never substitutes the first job on a board. It permits up to 2 MiB of public-board JSON; unusually large boards can require manual entry. This is an application preview only, not general-purpose crawling or scraping.

SmartRecruiters posting links use a company identifier and a numeric posting ID. The importer accepts only the exact `jobs.smartrecruiters.com` or `www.smartrecruiters.com` hostnames and a bounded path pattern, then constructs `https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}`. Tracking query strings are never sent to the provider API. The public posting-detail response supplies the title (`name`), company name, and location fields. The returned posting ID and any supplied company identifier are checked against the requested link; empty or inconsistent data produces a manual-entry fallback. No tokens, scraping, or new database fields are required. This integration supports individual public posting links, not general job search.

## Recorded weekly activity

The dashboard's six-week activity chart counts only saved `CREATED` and `STATUS_CHANGED` rows from `application_activity`, filtered by authenticated owner and the event timestamp. Weeks start on Monday at 00:00 UTC, include the current partial week, and exclude events before the window or after the request snapshot time. Each week reports created events and status-change events separately. Zero means **no events recorded for that bucket**; it does not prove no job-search activity occurred before tracking was introduced.

Unlike the monthly application chart, which uses user-entered application dates, this chart uses persisted event timestamps. No backfill, schema migration, or updates to existing records are performed. Events for deleted applications are no longer counted because their activity rows are deleted with the application.
