# DevTrack

A job application tracker I'm building to keep applications and follow-ups in one place.

The planned stack is Java 21, Spring Boot, React with TypeScript, and PostgreSQL. So far, this branch contains the local database setup. The backend and frontend come next.

## Local database

You need Docker Desktop running.

Copy the example configuration once:

```sh
cp .env.example .env
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

## Next milestone

Save a job application through the UI and still see it after refreshing the page.
