# DevTrack

A job application tracker I'm building to keep applications and follow-ups in one place.

The backend uses Java 21 and Spring Boot, with PostgreSQL running locally through Docker. So far, it exposes a health endpoint that checks the database connection. Application tracking and the React/TypeScript frontend are next.

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

## Tests

From `backend`:

```sh
mvn test
```

The initial tests check the health response and that the environment endpoint is not exposed. They use an in-memory H2 database and do not verify PostgreSQL-specific behavior. The local health check above verifies the actual PostgreSQL connection.

## Next milestone

Save a job application through the UI and still see it after refreshing the page.
