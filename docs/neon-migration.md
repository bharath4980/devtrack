# Neon Free migration preflight — no production cutover

**Status: planning only.** DevTrack continues to use the existing Render Free PostgreSQL 17 database. Render reports an expiration date of **October 28, 2026 at 05:36 UTC**. Prepare a verified backup and a suitable replacement before that date. Nothing here authorizes a production environment change, database write, networking change, deploy, or deletion.

## Zero-cost viability checks

Neon Free currently provides 1 GB storage per project and 100 compute-unit hours per month. A 0.25 CU compute kept active for 30 days uses around 180 CU-hours, above the free quota. Render currently checks `/api/health`, which probes database availability. Hikari connections and health polls can keep Neon active. **Do not switch production until we measure this behavior on a disposable Neon test database.**

1. Connect a Neon account and create a *new* Free project in a region near Render Ohio. Prefer PostgreSQL 17 if offered. Do not share credentials in chat, commit them, or expose them in screenshots.
2. Create a disposable testing branch/database. Point a **local** DevTrack instance at that database (not at the current production database), allow Flyway to build the four migrations, then test registration, login, ownership, application CRUD, status history and health using fictional data.
3. Validate PostgreSQL direct connection, JDBC TLS and Spring/Hikari timeouts. Test scale-to-zero, database wake-up, and a realistic frequency of `/api/health` checks. Review actual Neon compute-hour usage, not assumptions.
4. If necessary, prepare a separate application PR for connection pooling and liveness/readiness behavior with backend and browser tests; do not weaken existing production health checks without review.

## Source backup prerequisites (separately authorized)

The existing Render Free PostgreSQL database has **external access disabled** (empty IP allowlist). Render Free web services do not provide interactive shell access. A full logical backup requires a controlled source export: temporarily permit **only the owner's current public IP using a /32 rule** for a local PostgreSQL client, then restore the empty allowlist. Never permit `0.0.0.0/0` merely to make export easy.

DevTrack's application CSV export is **not** sufficient: it omits user password hashes, activity events, Flyway migration history and database sequences. Use `pg_dump` from a PostgreSQL 17-or-newer client and keep the sensitive file outside the Git repository with restrictive permissions.

On the owner's Mac, **only after explicit approval**, use these command templates. Supply source URLs securely through the terminal; never paste a password-bearing connection URL into GitHub, chat, or CI:

```sh
umask 077
mkdir -p "$HOME/devtrack-private-backups"
# Set RENDER_EXTERNAL_URL privately and verify it targets the correct database.
pg_dump --dbname="$RENDER_EXTERNAL_URL" --format=custom --schema=public \
  --no-owner --no-acl --file="$HOME/devtrack-private-backups/devtrack-before-neon.dump"
pg_restore --list "$HOME/devtrack-private-backups/devtrack-before-neon.dump" \
  > "$HOME/devtrack-private-backups/backup-contents.txt"
```

**Do not run the source backup yet.** It handles real user data. Confirm the backup's size, checksum, table inventory and restoreability before any cutover.

## Restoring into a fresh Neon destination

Restoring a complete schema into a staging database that already ran Flyway will conflict with existing tables. Use a separate **empty**, independently verified Neon target. For restore, use Neon's **direct SSL connection**, not a pooled endpoint, and only after separate authorization:

```sh
# Run only against a verified EMPTY Neon database, never the Render source.
pg_restore --dbname="$NEON_DIRECT_URL" --no-owner --no-acl \
  --exit-on-error --single-transaction \
  "$HOME/devtrack-private-backups/devtrack-before-neon.dump"
```

Validate application counts, user-account counts, event counts, per-owner counts, four Flyway migration entries, foreign keys and sequence positions on both sides using **read-only** SQL. Verify authentication and ownership privately. Never publish production data or password hashes.

DevTrack expects separate Render environment variables: `DATABASE_URL` must be a **JDBC** URL such as `jdbc:postgresql://NEON_HOST/DATABASE?sslmode=require` (not Neon’s `postgresql://` URL), `DATABASE_USER` is the Neon role, and `POSTGRES_PASSWORD` is the Neon password. Settings and secrets are changed only in a separately approved cutover.

## Cutover and rollback require separate approval

1. Arrange a short maintenance window and **freeze writes** before the final source backup; otherwise records created after backup are missed.
2. Take a final backup, restore into a fresh Neon target, and verify all records and relationships before reconfiguring Render.
3. Explicitly approve any production environment-variable and health-check changes, then verify Render startup, database availability, sign-in, owner-scoped records and Neon CU-hour consumption.
4. Preserve the original Render database without weakening its access restrictions. **After users write to Neon, simply switching back to Render loses newer writes.** A rollback needs its own write freeze and reverse synchronization plan.
5. If Neon Free proves unsuitable, the fallback is to upgrade the existing Render database before its October 28 expiration.

## Verified isolated preflight (October 19, 2026)

- Created a **Neon Free** project, `devtrack-neon-preflight`, using **PostgreSQL 17.11**, AWS Ohio, a fixed 0.25 CU compute, and a separate `devtrack-compatibility-test` branch. The production Render configuration and data were not touched.
- The branch started empty. The **10 schema statements from DevTrack's four Flyway SQL migration files** executed successfully in a single transaction through Neon's SQL tool. Inspection confirmed all three expected tables, the owner and activity foreign keys, status/type check constraints, and the expected indexes.
- Inserted **two entirely fictional accounts**, **two applications**, and **two activity events**. Owner-scoped SQL counts returned one application for each account; the first account showed two events and one status change, and foreign-key integrity checks found zero broken references. These are **database-level compatibility tests**, not Spring Security or HTTP API tests.
- The SQL was applied **directly**, **not by the Flyway runtime**. The branch intentionally has **no `flyway_schema_history`**; do not call these results a completed Flyway migration or application startup test. For a genuine Flyway/JDBC run, use a **new empty disposable branch** and run the Java application with Neon credentials supplied securely, not this already-initialized branch.
- Neon's API reports `suspend_timeout_seconds=0`, meaning **the default five-minute inactivity timeout** (not suspension disabled). The project's unused main compute reached the `idle` state. The account uses `free_v3` with a **1 GB** storage cap; compute usage values were still zero in the API response and are **not enough for a monthly projection**.
- The documentation-only PR's H2 and PostgreSQL/Docker/browser CI checks passed separately, using disposable local databases rather than Neon.

## Evidence and actions still outstanding

A real **Spring Boot startup/Flyway run against an empty Neon branch**, authenticated application workflows, connection pool and health-check wake/suspend behavior under realistic production traffic, reliable CU-hour usage over time, source backup, restoration, count reconciliation, and final cutover **have not occurred**. The repository's tests cannot yet be called a Neon integration test. The next stage requires a secure JDBC connection from a runner or the owner's Mac; do not put secrets into chat or GitHub workflow inputs. Retain Render's October 28 fallback deadline.

References: [Neon Free plan update](https://neon.com/blog/neon-free-plan-1-gb-per-project), [Neon compute](https://neon.com/docs/manage/endpoints/), [Render Free limits](https://render.com/docs/free), [Render backup guide](https://render.com/docs/postgresql-backups).
