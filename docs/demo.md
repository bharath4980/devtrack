# Safe demo walkthrough

This guide is for reviewers who want to explore DevTrack without using anyone's existing job-search records. It is **documentation**, not a seed script, preconfigured demo account, or promise that the production service contains example data.

## Explore the interface

1. Open [the deployed application](https://devtrack-3upd.onrender.com). The Render Free instance may need time to wake up.
2. Create **your own** account with a unique password; never ask for or reuse someone else's credentials. Use fictional job-application data only.
3. Choose **Add application**. Enter a fictional employer and role (examples below). Use manual entry; job URL autofill is optional and currently supports Greenhouse, Lever, Ashby, and SmartRecruiters.
4. In **Your applications**, change a status, search or filter, and select **View history** to see recorded events created after the action.
5. Return to **Your search, at a glance** for pipeline, recent-activity, application-trend, follow-up, and interview sections. Counts reflect the data in **your own account**.
6. Sign out. These examples do not require exposing personal emails, production database records, or privileged access.

## Fictional example records

Use this as inspiration for **manually entered sample data**, not real employer claims or job postings:

| Company (fictional) | Role | Location | Status | Optional follow-up |
| --- | --- | --- | --- | --- |
| Acme Labs | Software Engineer | Houston, TX | Applied | A future date you choose |
| Northstar Systems | Backend Engineer | Remote | Saved | None |
| Harborline Studio | Platform Engineer | Austin, TX | Interview | A future date you choose |

These are examples only: the app is **not** populated with them automatically, and the counts in [the overview illustration](images/product-overview.svg) are also fictional.

### History accuracy

Newly created applications record creation activity and subsequent meaningful status transitions. An application from before activity tracking was added may have **no recorded events**. Its UI should show **Current status** and **Snapshot only · not a recorded event**, with an explanation that earlier changes were not recorded. It must not invent a timestamp or a prior state.

## For a reproducible, isolated demonstration

The repository's Playwright tests run against a disposable local PostgreSQL environment. Their setup and teardown instructions are in the [README](../README.md#verification). The test `existing applications without history show a truthful status snapshot` simulates an empty activity history and verifies the snapshot on desktop and mobile. This test does **not** modify production data.

A recent passing CI run also produced desktop and mobile screenshots from the test-created account, but CI artifacts expire. These transient artifacts should not be treated as permanent README assets. For publication, capture **fresh screenshots from an isolated test account** and verify that all names, notes, URLs, account indicators and timestamps are suitable for public sharing. Do not pass tests against the deployed site or a personal account.

## Screenshot review checklist

- Match the current deployed UI and state which commit/build was captured.
- Capture the dashboard and application list at desktop and mobile widths.
- Show fictional company/job information only; redact the account identifier if present.
- Show a separate history/snapshot view only when the source state supports it.
- Inspect every visible detail before publishing; never call an illustration a screenshot.
- Store approved screenshots under `docs/images/` and replace the illustrative overview only when those captures are current and accurate.

**Current visual asset:** [Product overview illustration](images/product-overview.svg), explicitly labeled as illustrative—not a live screenshot. An older unused dashboard PNG remains in the repository but should not be republished until it is checked against the current UI.
