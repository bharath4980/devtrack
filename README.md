# DevTrack

DevTrack is a full-stack job application tracker I built to keep applications, statuses, interviews, and notes in one place.

**Live demo:** https://devtrack-3upd.onrender.com

The app uses Java 21 and Spring Boot for the backend, PostgreSQL for persistence, and React + TypeScript for the frontend. Authentication is session-based, and every application is scoped to the signed-in user.

> The live demo runs on Render's free tier, so the first request after a period of inactivity can take longer while the service wakes up.

## Preview

![DevTrack dashboard](docs/images/devtrack-dashboard.png)

## Features

- Register, sign in, and sign out
- Create, edit, and delete job applications
- Track application status: Saved, Applied, Interview, Offer, or Rejected
- Search by company, job title, or location
- Filter applications by status; paginate results and sort by company or date
- Dashboard summary with counts by status
- Upcoming interview tracking
- Per-user application ownership
- Server-side validation and consistent API error responses
- CSRF protection, authentication throttling, and a same-origin content security policy
- PostgreSQL migrations with Flyway
- GitHub Actions CI for H2/PostgreSQL tests, frontend builds, and desktop/mobile browser workflows
- Production Docker image that serves the React build from Spring Boot

## Tech stack

### Backend

- Java 21
- Spring Boot 3
- Spring Security
- Spring Data JPA / Hibernate
- PostgreSQL
- Flyway
- Maven

### Frontend

- React
- TypeScript
- Vite

### Infrastructure

- Docker / Docker Compose
- GitHub Actions
- Render

## Local setup

### 1. Start PostgreSQL

Docker Desktop needs to be running.

From the repository root:

```sh
cp -n .env.example .env
docker compose up -d --wait
```

Check the database:

```sh
docker compose ps
```

The `db` service should be healthy and available at `localhost:5432`.

To stop it:

```sh
docker compose down
```

The PostgreSQL data is stored in a Docker volume. Avoid `docker compose down -v` unless you intentionally want to delete the local database.

If you have data from the older version of DevTrack that did not have authentication, see [authentication and ownership](docs/authentication.md#existing-local-databases) before starting the application.

### 2. Run the backend

Install Java 21 and Maven. The frontend requires Node.js 22.12 or newer; CI uses Node 22.

On macOS, select Java 21 for the current terminal:

```sh
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

Then:

```sh
cd backend
mvn spring-boot:run
```

The API runs at `http://localhost:8080`.

Health check:

```text
http://localhost:8080/api/health
```

Expected response:

```json
{"status":"UP"}
```

### 3. Run the frontend

In a second terminal, from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

During local development, Vite proxies `/api` requests to Spring Boot on port 8080.

## Tests

Backend:

```sh
cd backend
mvn clean test
```

Frontend:

```sh
cd frontend
npm run build
```

The backend test suite covers authentication, CSRF protection, application ownership, validation/error responses, dashboard behavior, and database migration behavior.

GitHub Actions runs the backend suite with both H2 and a disposable PostgreSQL 16 database. It also builds the production Docker image and runs Playwright against that image on desktop and mobile Chromium.

The browser tests cover registration/login, CRUD, interview tracking, filters, pagination, validation feedback, persistence after reload, and expired sessions. They only accept localhost URLs and create test accounts; never point them at the live demo or your normal database.

To run the production browser checks locally, from the repository root:

```sh
docker compose -p devtrack-e2e -f compose.test.yaml up --build -d
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
cd ..
docker compose -p devtrack-e2e -f compose.test.yaml down
```

This uses port 8081 and an isolated PostgreSQL database in temporary memory. Stopping these test services removes their test data, not your normal development data. The test runner waits for the application to become healthy.

For a PostgreSQL backend-only run, set `TEST_DATABASE_URL`, `TEST_DATABASE_DRIVER=org.postgresql.Driver`, `TEST_DATABASE_USER`, and `TEST_DATABASE_PASSWORD` before `mvn clean test`. **Use a disposable database: integration tests delete their fixtures.**

## Production deployment

The root `Dockerfile` uses a multi-stage build:

1. Build the React frontend with Node.js.
2. Build the Spring Boot application with Maven and Java 21.
3. Copy the frontend production build into Spring Boot's static resources.
4. Run the final application as a non-root user from a Java 21 JRE image.

The production app is deployed as one service, so the frontend and backend share the same origin.

The deployed service uses these environment variables:

- `DATABASE_URL`
- `DATABASE_USER`
- `POSTGRES_PASSWORD`
- `SESSION_COOKIE_SECURE=true`
- `PORT=8080`

`DATABASE_URL` must be a JDBC URL (`jdbc:postgresql://HOST:5432/DATABASE`), not a `postgres://` URL. `PORT` controls the Spring Boot listener; the image defaults to port 8080 and listens on all interfaces. Render terminates HTTPS; keep `SESSION_COOKIE_SECURE=true` there. Use `/api/health` as the service health check.

Secrets are configured in the hosting environment and are not committed to the repository. CI and the local test Compose file contain only disposable test credentials. The application supports graceful shutdown and logs unexpected server errors without returning stack traces to clients.

Deploy the frontend and backend together: the applications endpoint now returns page metadata instead of a bare array. No schema migration or data reset is needed for this change. Never edit an already-applied Flyway migration.

See [engineering notes](docs/engineering.md) for the API contract and design tradeoffs.

## Current limitations

- Login sessions are stored in memory, so users need to sign in again after the backend restarts.
- Authentication throttles are local to one process and reset on restart. Account limits and a global budget protect this low-traffic demo; shared sessions/rate limits would be needed before scaling to multiple instances.
- Password reset is not implemented yet.
- Email verification is not implemented yet.
- Upcoming interviews are the next five applications in Interview status with a date today or later, using UTC. Dates have no time-of-day/reminder support.
- The public demo uses free hosting and can have a cold start after inactivity.

See [authentication and ownership](docs/authentication.md) for more details about the authentication flow and migration behavior.
