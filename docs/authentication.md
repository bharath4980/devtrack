# Authentication and ownership

DevTrack uses Spring Security's server-side sessions. Signing in stores authentication in the server session and sends the browser an HttpOnly `JSESSIONID` cookie. Passwords are stored as BCrypt hashes. Emails are trimmed and lowercased before registration and login.

Sessions expire after 30 minutes of inactivity. Restarting the backend signs everyone out; accounts and applications remain in PostgreSQL.

## Request flow

- `GET /api/auth/csrf` supplies a CSRF token, including for anonymous visitors.
- `POST /api/auth/register` accepts JSON with `email` and `password`. It creates the account without signing in.
- `POST /api/auth/login` uses form-encoded `email` and `password`. Spring Security verifies the password, rotates the session ID, and returns 204.
- `GET /api/auth/me` returns the signed-in user's ID and email, or 401.
- `POST /api/auth/logout` invalidates the session and returns 204.

Every state-changing request, including registration, login, and logout, requires a CSRF token. The frontend fetches one before each such request and passes it in the header named by the response. This adds one small request but avoids storing tokens and handling login/logout rotation manually. Failed mutations are never automatically replayed.

The application controller resolves the signed-in account. The service sets that account as the owner on creation. Repository queries combine ownership with search and status conditions, and updates/deletes look up both the application ID and owner ID. An inaccessible or nonexistent application returns 404. Client-supplied owner IDs are not used.

The application screen mounts only after the session check succeeds. Signing out or receiving an expired-session response unmounts it, clearing its application data and forms.

## Existing local databases

Do this before starting the authentication branch against a database created by the earlier version. Stop the backend first and keep Docker running.

From the repository root, save a backup outside the repository:

```sh
mkdir -p "$HOME/Developer/devtrack-backups"
docker compose exec -T db pg_dump -U devtrack -d devtrack -Fc > "$HOME/Developer/devtrack-backups/devtrack-before-auth-$(date +%Y%m%d-%H%M%S).dump"
```

Keep that backup private: it contains application data. Check that the dump completed successfully and inspect its table of contents with `pg_restore --list` before proceeding.

The old application used Hibernate's automatic schema updates. Flyway now manages changes and Hibernate only validates the schema.

- V1 describes the original application table for a new empty database.
- V2 adds accounts, a nullable owner column, a foreign key, and an ownership index.
- Automatic baselining is disabled by default so an existing schema is not silently accepted.

For this known existing DevTrack schema only, start the backend once from `backend` with:

```sh
JAVA_HOME=$(/usr/libexec/java_home -v 21) FLYWAY_BASELINE_ON_MIGRATE=true mvn spring-boot:run
```

This records the existing schema as V1 and applies V2. Subsequent starts use the normal command, without the baseline variable. An empty database needs no baseline flag and runs both migrations normally.

**Existing applications are preserved but unassigned and invisible to every account.** Registration never claims them automatically.

After you register your account, assign the old rows deliberately in the local PostgreSQL console:

```sh
docker compose exec db psql -U devtrack -d devtrack
```

Inspect accounts and the unassigned row count:

```sql
SELECT id, email FROM app_users ORDER BY id;
SELECT COUNT(*) FROM job_applications WHERE owner_id IS NULL;
```

Only if all unassigned rows belong to you, replace `YOUR_REGISTERED_EMAIL` below with the exact email shown above:

```sql
BEGIN;
UPDATE job_applications
SET owner_id = (
    SELECT id FROM app_users WHERE email = 'YOUR_REGISTERED_EMAIL'
)
WHERE owner_id IS NULL
  AND EXISTS (SELECT 1 FROM app_users WHERE email = 'YOUR_REGISTERED_EMAIL');
SELECT COUNT(*) FROM job_applications WHERE owner_id IS NULL;
```

Inspect the update count. Use `COMMIT;` only when the result is correct; otherwise use `ROLLBACK;`. Exit with `\q`. For mixed ownership, assign reviewed application IDs individually instead.

The column remains nullable to preserve legacy rows. All new records created by the API require an authenticated owner. Do not use `docker compose down -v`, edit applied migrations, or run the old unauthenticated backend against a database that now contains multiple users' applications.

## Scope and deployment

This is a single-instance session implementation, deployed with the frontend and API under the same HTTPS origin. Render terminates TLS; `SESSION_COOKIE_SECURE=true` protects production cookies. Local HTTP uses `false`. No permissive CORS rules or authentication tokens in localStorage are used.

Authentication requests are throttled after CSRF validation and before password hashing:

- Each normalized login email: 10 attempts per 15 minutes.
- All login attempts together: 100 per minute.
- All registration attempts together: 20 per hour.

Limits include successful and failed attempts. Blocked requests return structured `429` responses with `Retry-After`. The per-account table is bounded and does not evict active limits when full. Expired entries are cleaned up during requests. Account keys are hashed; passwords and request bodies are not logged by the limiter.

These are deliberately conservative budgets for a low-traffic portfolio demo. They do not rely on `X-Forwarded-For`, which is unsafe to trust without a verified proxy configuration. The tradeoff is that an attacker can temporarily exhaust a shared budget or an account's allowance. They are not a substitute for upstream DDoS protection. Limits and sessions reset on restart; use shared storage and a verified client-IP policy before running multiple replicas. The limits can be adjusted using `DEVTRACK_AUTH_ACCOUNT_LIMIT`, `DEVTRACK_AUTH_LOGIN_LIMIT`, and `DEVTRACK_AUTH_REGISTRATION_LIMIT`; changing a limit does not change its window duration.

Password reset, email verification, and shared sessions are outside this version. Registration reports a conflict for existing emails, so it can reveal whether an email is registered. Public demo users should use sample job data and a unique password.

Security-filter errors (401, 403, 429) use the same JSON shape as controller errors. A restrictive content security policy allows scripts and connections from the app's own origin and blocks embedding the page. Posting links accept only HTTP(S); old invalid links are not rendered as clickable links.

Use `http://127.0.0.1:5173` consistently during development. Switching between `localhost` and `127.0.0.1` switches browser cookie hosts.

## Verification

`mvn clean test` covers registration validation, password hashing, real login sessions, session-ID and CSRF rotation, authentication/CSRF enforcement, owner scoping across search filters and mutations, logout, and legacy-row preservation. The same endpoint tests run on H2 locally and PostgreSQL in CI. The legacy-schema baseline test uses an isolated H2 fixture. Neither test path touches the deployed database.

`npm run build` checks frontend types and creates the production bundle.
