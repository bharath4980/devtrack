# DevTrack

A job application tracker I'm building to keep applications and follow-ups in one place.

The backend uses Java 21 and Spring Boot, with PostgreSQL running locally through Docker and a React/TypeScript frontend. You can register, sign in, and create, search, filter, edit, change the status of, and delete your own applications.

If you already have data from the version without login, read [the migration instructions](docs/authentication.md#existing-local-databases) before starting this branch. Existing records are preserved and must be assigned to your account explicitly.

## Local database

You need Docker Desktop running. Run these commands from the repository root.

Copy the example configuration once:

```sh
cp -n .env.example .env
```

The example password is only for local development. The `.env` file is ignored by Git.

Start PostgreSQL:

```sh
docker compose up -d --wait
```

Check its status:

```sh
docker compose ps
```

The `db` service should be healthy. It is available at `localhost:5432`, with database and username `devtrack`.

Stop it when finished:

```sh
docker compose down
```

Data is kept in a Docker volume between runs. Avoid `docker compose down -v` unless you intend to delete the local database.

## Backend

Install Java 21 and Maven 3.6.3 or later. On macOS, select Java 21 for the current terminal:

```sh
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
```

From the repository root:

```sh
cd backend
mvn spring-boot:run
```

Keep this terminal open while using the backend. Press Control+C to stop it.

Open http://localhost:8080/api/health. With the database running, the response should be:

```json
{"status":"UP"}
```

The backend reads the password from the root `.env` file when started from `backend`. It listens only on the local machine for now. Spring Boot Actuator supplies the health endpoint; no custom health controller is needed.

## Frontend

You need Node.js and npm. The frontend uses Vite, which requires Node.js 20.19+ on the 20.x line, or 22.12 and newer. Keep the backend running in its own terminal.

In a second terminal, from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Create an account, then sign in. The application screen shows your account email and a **Sign out** button. Search, filters, and all application actions are limited to your account.

The browser calls `/api/health`. During development, Vite forwards `/api` requests to the backend on port 8080. This avoids needing a separate CORS configuration for local development. This proxy does not come with the production build; deployment will need its own API routing.

To check TypeScript and build the frontend, run this from `frontend`:

```sh
npm run build
```

## Tests

From `backend`:

```sh
mvn clean test
```

Tests cover health, registration, login/logout, CSRF protection, application ownership, and preservation of existing rows during migration. They use H2; verify the migration and application behavior with local PostgreSQL before merging.

See [authentication and ownership](docs/authentication.md) for the request flow, migration steps, and deployment limitations.

## Current scope

Applications and accounts persist in PostgreSQL. Login sessions are held in memory and end when the backend restarts. Password reset, email verification, deployment, and a dashboard are not implemented yet.
