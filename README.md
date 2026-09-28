# DevTrack

DevTrack is a full-stack job application tracker I built to keep applications, statuses, interviews, and follow-ups in one place.

**Live demo:** https://devtrack-3upd.onrender.com

The app uses Java 21 and Spring Boot for the backend, PostgreSQL for persistence, and React + TypeScript for the frontend. Authentication is session-based, and every application is scoped to the signed-in user.

> The live demo runs on Render's free tier, so the first request after a period of inactivity can take longer while the service wakes up.

## Features

- Register, sign in, and sign out
- Create, edit, and delete job applications
- Track application status: Saved, Applied, Interview, Offer, or Rejected
- Search by company, job title, or location
- Filter applications by status
- Dashboard summary with counts by status
- Upcoming interview tracking
- Per-user application ownership
- Server-side validation and consistent API error responses
- CSRF protection for state-changing requests
- PostgreSQL migrations with Flyway
- GitHub Actions CI for backend tests and frontend builds
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

Install Java 21 and Maven.

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

In a second terminal:

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

GitHub Actions runs the backend tests and frontend production build on pushes and pull requests.

## Production deployment

The root `Dockerfile` uses a multi-stage build:

1. Build the React frontend with Node.js.
2. Build the Spring Boot application with Maven and Java 21.
3. Copy the frontend production build into Spring Boot's static resources.
4. Run the final application from a Java 21 JRE image.

The production app is deployed as one service, so the frontend and backend share the same origin.

The deployed service uses these environment variables:

- `DATABASE_URL`
- `DATABASE_USER`
- `POSTGRES_PASSWORD`
- `SESSION_COOKIE_SECURE=true`
- `PORT=8080`

Secrets are configured in the hosting environment and are not committed to the repository.

## Current limitations

- Login sessions are stored in memory, so users need to sign in again after the backend restarts.
- Password reset is not implemented yet.
- Email verification is not implemented yet.
- The public demo uses free hosting and can have a cold start after inactivity.

See [authentication and ownership](docs/authentication.md) for more details about the authentication flow and migration behavior.
