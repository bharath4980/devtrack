# Encrypted production database backups

DevTrack runs on Neon PostgreSQL 17. The **Encrypted database backup** GitHub Actions workflow takes a custom-format logical backup of the public schema each day, encrypts it using an age public key, and uploads **only ciphertext** to GitHub Actions artifacts.

**Status (October 24, 2026):** The scheduled workflow is active. The [October 24 scheduled run](https://github.com/bharath4980/devtrack/actions/runs/40092525973) completed successfully, which verifies that the configured job ran its dump, archive-inventory check, encryption, and encrypted-artifact upload steps. **Decryption and restoration into a disposable database have not been independently verified here.** A successful backup job alone is not proof that the data can be restored.

## Security considerations

- **This GitHub repository is public.** Artifact contents can be downloaded by repository readers. Never upload an unencrypted database dump, SQL export, connection string, or private decryption key.
- Keep the age **private identity** entirely off GitHub, Render, Neon, and the repository. Make a protected second offline copy; without it the archived backups cannot be decrypted.
- GitHub **repository secret** DEVTRACK_BACKUP_DB_PASSWORD contains only the current Neon database password, not a connection URL or the old Render password.
- GitHub **repository variable** DEVTRACK_BACKUP_AGE_RECIPIENT contains the public age1 recipient string.
- Initially the workflow uses the Neon database owner login. This credential is more privileged than a dedicated read-only backup login. Restrict access to workflow edits and secrets; review changes to the workflow before merging.
- Archives contain password hashes and personal application records. Only encrypted artifacts are retained.

## Initial setup or credential recovery on the owner's Mac

The steps below are for initial configuration or deliberate key rotation. An active encrypted backup is already scheduled; do not overwrite the existing recipient, password, or private identity solely to repeat setup.

1. If Homebrew is available, install age with: **brew install age**.
2. Create a new private encryption identity and output its corresponding public recipient:

~~~sh
umask 077
mkdir -p "$HOME/devtrack-private-backups"
age-keygen -o "$HOME/devtrack-private-backups/devtrack-age-identity.txt"
age-keygen -y "$HOME/devtrack-private-backups/devtrack-age-identity.txt"
~~~

The final command prints **only the public recipient**. Do not share the private identity or reveal the contents of the file. Preserve an offline second copy.

3. Under **GitHub → bharath4980/devtrack → Settings → Secrets and variables → Actions → Variables**, create DEVTRACK_BACKUP_AGE_RECIPIENT with the printed **public** recipient.
4. Under **Secrets**, create DEVTRACK_BACKUP_DB_PASSWORD with the current production Neon **neondb_owner** password from branch **devtrack-production-cutover-20261021**. Store it as a secret, not a variable.
5. Before changing the workflow, credentials, or encryption recipient, review the impact on existing archives and retain the matching private identity. Old backups must remain decryptable after any rotation.
6. To perform a manual verification, go to **Actions → Encrypted database backup → Run workflow** on main. Confirm a successful run and an artifact ending in **.dump.age**. Do not print passwords or database rows into logs. Then perform a separate, disposable restore practice as described below.

## Decryption and restore practice

Download an encrypted backup artifact to a private folder on your Mac. Substitute the real downloaded filename:

~~~sh
umask 077
age --decrypt \
  --identity "$HOME/devtrack-private-backups/devtrack-age-identity.txt" \
  --output "$HOME/devtrack-private-backups/devtrack-restore-test.dump" \
  "$HOME/Downloads/REPLACE-WITH-ACTUAL-ARCHIVE.dump.age"
~~~

Check the custom-format dump with PostgreSQL 17 pg_restore --list, then periodically practice restoring into a **disposable** local PostgreSQL 17 database. Verify account/application/activity counts, owner relationships, migration history, foreign keys, and ID sequences. Never restore a test archive into production. Remove the decrypted test copy afterward.

## Retention and monitoring

- The workflow is scheduled daily at **07:23 UTC**, not necessarily at an exact execution time. Public-repository schedules are automatically disabled after 60 days without repository activity.
- GitHub artifacts have **30-day retention** here. They expire, so store periodic **encrypted** copies in independent private storage you control.
- GitHub Actions standard runners are free for public repositories, subject to published artifact storage and other account limits. Review usage as data grows.
- Review at least one recent successful backup each week and after credential or schema changes; a passing backup is not proof of successful restoration.
- A failed dump, validation, encryption, or upload must fail the run, never upload plaintext, and never change production application settings.

References: [GitHub Actions scheduling](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [Actions billing and limits](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [age encryption](https://github.com/age-sops/age).
