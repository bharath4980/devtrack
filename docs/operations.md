# Operations and recovery runbook

This runbook describes DevTrack's **existing** Render web service and Spring Boot/PostgreSQL deployment. Its purpose is to distinguish verified application readiness from an open port, and to offer a safe investigation path after deployment trouble.

**Scope:** The runbook and its companion CI improvement do not change Render settings, trigger a production rollout, alter credentials, connect to the production database, or manipulate user records.

## Current deployment and health behavior

- GitHub's `main` branch automatically deploys a single Docker-based Spring Boot service on Render Free. The same application serves the compiled React frontend and the API.
- The service listens on `0.0.0.0` and the `PORT` environment variable (currently `8080`); the Java 21 runtime uses `-XX:TieredStopAtLevel=1` to reduce warm-up work on limited CPU.
- Public `GET /api/health` is provided by Spring Boot Actuator and permitted without an account. On a healthy instance it returns HTTP 200 with `{"status":"UP"}`. Health details are deliberately hidden.
- The standard Spring Boot database health contributor checks PostgreSQL, so an open TCP port is not sufficient for application readiness.
- **At the time of this runbook, Render's `healthCheckPath` is blank.** Render therefore uses its default TCP port probe, which cannot independently confirm `/api/health`. A Render deployment marked **live** is meaningful, but does not by itself prove the authenticated application workflow or record preservation.

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

## Proposed Render HTTP health check (separate approval required)

The desired setting is **`/api/health`**, not `/` and not an authenticated application route. After reviewing this runbook and confirming the endpoint responds with `UP` in a suitable environment:

1. Open the existing Render web service in the Render dashboard.
2. Go to **Settings → Health Checks → Edit** and enter `/api/health`.
3. Save only after explicit approval for a production service-configuration change.
4. Watch the service events and logs after the change, check that the health status remains healthy, and confirm at least one authorized user flow. Record the change and any observed restart/deploy effects.

**This repository is not linked to a Render Blueprint for this service.** Adding a `render.yaml` file alone would not update its existing service setting. Do not create a duplicate Render service or change database IP allowlists just to test readiness.

Render requires a 2xx or 3xx response within five seconds for each HTTP health check. The database-aware health endpoint gives a stronger readiness signal than TCP, but a transient database outage or overloaded Free instance can cause health-check failures and instance restarts; weigh that behavior before enabling it. Reference: [Render health checks](https://render.com/docs/health-checks).

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
| Hikari or Flyway failure | Check database availability, connection errors and migration validation (without printing secrets). | Investigate the actual dependency; avoid resetting Flyway history, schema, or production database. |
| `/api/health` is DOWN/503 | Check health-check response, database status, recent resource pressure and service logs. | Fix the underlying issue; do not mislabel a TCP-only success as healthy. |
| Render says live, but user flow fails | Inspect application logs, sessions, browser network behavior, and read-only application state. | Treat as an application incident despite live deployment status. |
| Data appears missing | Verify signed-in account identity and owner scoping, and inspect read-only records if authorized. | **Stop writes, exports, imports, schema resets, and destructive commands.** Do not delete or recreate a database or volume. |

Before a rollback, understand whether the release included a migration and whether the previous code can read the current schema. Get explicit approval before taking rollback, configuration, or database action. A process restart ends in-memory sessions; users might need to sign in again. The downloaded CSV export is **not** a full database backup or a substitute for tested database recovery.

**Operational boundary:** Production connection settings and secrets belong in Render; keep them out of logs, tickets, screenshots, and repository files. A failed deployment on the Render Free tier is not proof that production records were modified.

Related: [deployment case study](deployment-case-study.md) · [authentication and ownership](authentication.md) · [engineering notes](engineering.md).
