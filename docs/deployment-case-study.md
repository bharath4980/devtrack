# Deployment reliability case study: Render Free startup

## Context

At the time of the October 18, 2026 startup incident, DevTrack ran its React production bundle and Spring Boot API in one non-root Java 21 Docker image on a Render Free web service, with a separate PostgreSQL resource. The application database has **since moved to Neon PostgreSQL**; this case study describes the earlier deployment incident, not the current database hosting provider. The single-service app design keeps delivery simple but makes cold starts sensitive to restricted instance resources.

## Symptom and investigation

After PR #18, two deployment attempts built successfully yet failed to become live. Render repeatedly reported that no listening port had been detected before its startup timeout. The existing live release remained in service.

Investigation found:

- The builds passed GitHub Actions, including backend and browser tests.
- Render's new startup instance ran close to its **0.15 CPU** allocation, while observed memory remained below the limit.
- Spring Boot progressed into Tomcat initialization, HikariCP connected to PostgreSQL, and Flyway initialized.
- The failure was therefore **not sufficient evidence** that PR #18's frontend legacy-history change was broken.
- The original CI Docker test used host networking and explicitly forced `SERVER_ADDRESS=127.0.0.1`. It did **not** verify how a published container port behaves with the Dockerfile's public bind address.

The exact cause of both earlier timeouts was not proven definitively. CPU-constrained JVM warm-up was a plausible contributor.

## Targeted correction (PR #19)

1. Start the Java 21 process with `-XX:TieredStopAtLevel=1` to prioritize faster warm-up over some peak long-running JIT performance.
2. Run the production image in GitHub Actions with a **published Docker port**, exercising the image's `SERVER_ADDRESS=0.0.0.0` rather than overriding it with localhost.
3. Keep application features, production authentication limits, database configuration, and schema unchanged.

## Evidence and measured result

- [PR #19](https://github.com/bharath4980/devtrack/pull/19) merged as commit `4dbdcbd0959d21684ceb75076ea93f6caa4d8256`.
- [GitHub Actions CI run #73](https://github.com/bharath4980/devtrack/actions/runs/39163086147) passed H2 and PostgreSQL tests, frontend build, the production-image published-port smoke check, and **20 Playwright browser tests** (10 desktop, 10 mobile).
- Render's auto-deploy `dep-dbaj8hflk1mc73cum0t0` reached **live** on October 18, 2026.
- Application logs recorded **76.898 seconds** for Spring Boot startup, and the deployment completed in roughly **1 minute 44 seconds**, rather than timing out as the previous attempts had.

These observations demonstrate **a successful deployment**, not proof that the configuration removes all future cold-start risk or improves sustained throughput.

## Remaining limits and follow-up

- CI does not reproduce Render's severely throttled CPU allocation.
- The public health endpoint and an authenticated inspection of existing production legacy records require separate verification; the browser tests use disposable sample accounts instead.
- No read-only production row-count comparison was made: the database restricts external connections, and security settings should not be weakened just for a report.
- If startup timeouts recur, compare timestamps for instance boot, database connection, listening port, and Render's health/deployment events before changing infrastructure.
- After a deployment, check Render live status and `/api/health`; confirm key user flows with a safe account. Never run destructive CI browser tests against production.

**Engineering takeaway:** Improve the representativeness of tests, keep production changes narrow, retain the prior working version until the new one is healthy, and report verified outcomes separately from hypotheses.
