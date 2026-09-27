# DevTrack

A job application tracker I'm building to keep applications and follow-ups in one place.

The backend uses Java 21 and Spring Boot, with PostgreSQL running locally through Docker. The React/TypeScript frontend currently checks the backend connection. Application tracking is the next feature.

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

Open http://localhost:5173. The connection card should show **Connected** when the backend and PostgreSQL are available. Use **Check again** to retry after starting either service.

The browser calls `/api/health`. During development, Vite forwards `/api` requests to the backend on port 8080. This avoids needing a separate CORS configuration for local development. This proxy does not come with the production build; deployment will need its own API routing.

To check TypeScript and build the frontend, run this from `frontend`:

```sh
npm run build
```

## Tests

From `backend`:

```sh
mvn test
```

The initial tests check the health response and that the environment endpoint is not exposed. They use an in-memory H2 database and do not verify PostgreSQL-specific behavior. The local health check above verifies the actual PostgreSQL connection.

## Next milestone

Save a job application through the UI and still see it after refreshing the page.
