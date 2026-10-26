# Operations and recovery runbook

This runbook describes DevTrack's **existing** Render web service and Spring Boot application backed by **Neon PostgreSQL**. Its purpose is to distinguish verified application readiness from an open port, and to offer a safe investigation path after deployment trouble.

**Scope:** This runbook documents the existing service and safe checks. Reading it does not change Render settings, credentials, database contents, or user records.

## Current deployment and health behavior

- GitHub's `main` branch automatically deploys a single Docker-based Spring Boot service on Render Free. The same application serves the compiled React frontend and the API. The PostgreSQL database is hosted separately on Neon; Render hosts the application, not its database.
- The service listens on `0.0.0.0` and the `PORT` environment variable (currently `8080`); the Java 21 runtime uses `-XX:TieredStopAtLevel=1` to reduce warm-up work on limited CPU.
- Public `GET /api/health` is provided by Spring Boot Actuator and permitted without an account. On a healthy instance it returns HTTP 200 with `{"status":"UP"}`. Health details are deliberately hidden.
- The standard Spring Boot database health contributor checks PostgreSQL, so an open TCP port is not sufficient for application readiness.
- **Current Render HTTP health-check path: `/api/health/liveness`** (verified on the existing service). This checks only the running application process, not PostgreSQL. It is intentionally lightweight so routine probes do not repeatedly wake a sleeping database on the Free tier. Render marking a deployment **live** therefore does not independently prove database readiness, authenticated user flows, or record preservation.

## Safe checks before changing Render

The GitHub Actions job builds the production Docker image and starts it on a published host port against **disposable PostgreSQL**. Its smoke check runs:

```sh
HEALTH_ATTEMPTS=60 HEALTH_DELAY_SECONDS=2 bash scripts/check-health.sh http://127.0.0.1:8081/api/health
```

The probe makes anonymous GET requests and accepts success only for an HTTP success response with JSON `status=UP`. It displays no response body or credentials. The backend integration tests also verify anonymous access, non-disclosure of health details, and the presence of the database health contributor.

For a **read-only** live check (this may wake a sleeping Free instance), use:

```sh
HEALTH_ATTEMPTS=60 HEALTH_DELAY_SECONDS=5 bash scripts/check-health.sh https://devtrack-3upd.onrender.com/api/health
```

A failed probe can mean DNS or network restrictions, a sleeping or starting service, an application health failure, or a database connectivity issue. If the checker cannot reach the host, **report HTTP health as unverified**, even when Render says live. Do not treat client-side DNS failures as evidence of a broken deployment.

## Liveness versus readiness

The existing configuration deliberately separates two concerns:

- **`/api/health/liveness` (Render's configured HTTP probe):** reports process liveness without invoking the database contributor. This reduces routine database wake-ups but is not a guarantee that reads and writes will work.
- **`/api/health` (readiness investigation):** includes Spring Boot's database health contributor and is appropriate for an explicit read-only diagnostic check when networking permits. A successful response is still not a substitute for an authorized end-to-end user check.

The service is not managed by a Render Blueprint; adding a `render.yaml` file would not automatically change the current health-check path. Any future configuration changes require separate approval and verification. Do not switch the probe to database-aware readiness merely to silence a warning: database outages or free-tier cold starts could instead cause repeated restarts. Reference: [Render health checks](https://render.com/docs/health-checks).

## Deployment verification

1. Confirm GitHub Actions completed successfully for the **exact head commit**, including H2, PostgreSQL, the published-port Docker smoke test, and desktop/mobile Playwright on disposable data.
2. For an approved merge, confirm the Render deployment commit SHA matches the resulting merge commit.
3. Follow events: **build started → build succeeded → deployment started → Tomcat initialized → Hikari connected → Flyway verified → Tomcat listening → application started → Render live**. Some steps can appear in a different order. Seeing a listening-port warning during warm-up is not by itself a failure.
4. Check Render error logs, repeated restarts, CPU/memory metrics, and the health endpoint independently where networking allows.
5. Where authorized, confirm a pre-existing application is still visible and perform read-only checks of the key user workflow. Do not run destructive browser tests on production.
6. Report separately: successful deployment, HTTP health, real user flow, and pre/post record integrity. Do not claim any step was verified without evidence.

## Recovery when a deployment fails or the app appears unhealthy

| Symptom | Investigation | Safe response |
| --- | --- | --- |
| Image build fails | Inspect the build step, Java/Node dependency errors, and Docker image build logs. | Correct on a new branch and rerun CI; do not change credentials or database storage to fix a build error. |
| No listening port or startup timeout | Compare timestamped startup, JVM work, CPU limits, `PORT`, and Tomcat binding. | Preserve the last live version and diagnose first. Do not blindly redeploy or increase limits. |
| Hikari or Flyway failure | Check Neon database availability, connection errors and migration validation (without printing secrets). | Investigate the actual dependency; avoid resetting Flyway history, schema, or production database. |
| `/api/health` is DOWN/503 | Check health-check response, database status, recent resource pressure and service logs. | Fix the underlying issue; do not mislabel a TCP-only success as healthy. |
| Render says live, but user flow fails | Remember Render tests process-only liveness. Inspect `/api/health` when possible, application logs, sessions, browser network behavior, and authorized read-only application state. | Treat as an application incident despite live deployment status. |
| Data appears missing | Verify signed-in account identity and owner scoping, and inspect read-only records if authorized. | **Stop writes, exports, imports, schema resets, and destructive commands.** Do not delete or recreate a database or volume. |

Before a rollback, understand whether the release included a migration and whether the previous code can read the current schema. Get explicit approval before taking rollback, configuration, or database action. A process restart ends in-memory sessions; users might need to sign in again. The downloaded CSV export is **not** a full database backup or a substitute for tested database recovery.

**Operational boundary:** Production connection settings and secrets belong in Render; keep them out of logs, tickets, screenshots, and repository files. A failed deployment on the Render Free tier is not proof that production records were modified.

Related: [deployment case study](deployment-case-study.md) · [authentication and ownership](authentication.md) · [engineering notes](engineering.md).
