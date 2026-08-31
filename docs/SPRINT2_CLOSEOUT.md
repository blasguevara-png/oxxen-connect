# OXXEN Connect — Sprint 2 closeout runbook

## Production identity

- Canonical domain: `https://connect.oxxengroup.com`
- Legacy domain: `https://oxxen-connect.vercel.app`
- Supabase project: `OXXEN Connect` (`qslmppzkpltfuvsqmxqq`)
- Vercel project: `oxxen-connect`
- GitHub repository: `blasguevara-png/oxxen-connect`

Never regenerate `public_id`, reuse historical aliases, or remove the legacy domain while printed cards still reference it.

## Mandatory MFA for OWNER

The application requires TOTP MFA for the `OWNER` role before rendering the administrative dashboard. Password login remains AAL1 only; after successful TOTP verification Supabase refreshes the session to AAL2. Database restrictive RLS policies also deny OWNER access to operational tables and the media bucket unless the JWT claim `aal` is `aal2`.

TOTP secrets are managed only by Supabase Auth. OXXEN Connect does not persist TOTP secrets in application tables, logs or audit metadata.

### Enrollment

1. Sign in with the OWNER email and password.
2. The admin guard detects that OWNER requires MFA.
3. If no verified TOTP factor exists, the app calls Supabase MFA enrollment and displays the enrollment QR.
4. Scan the QR with Google Authenticator, Microsoft Authenticator, Authy or 1Password.
5. Enter the current code.
6. The app creates a challenge, verifies the code and requires an AAL2 session before opening the dashboard.

### Subsequent login

1. Email + password.
2. TOTP code challenge.
3. AAL2 verification.
4. Admin role verification.
5. Dashboard.

### Lost authenticator / recovery

There is intentionally no application bypass and no recovery code stored by OXXEN Connect. If the only OWNER loses all verified authenticators:

1. Verify the identity of the OWNER through the organization's internal recovery procedure.
2. Open Supabase Dashboard using the project owner account.
3. Authentication → Users → select the OXXEN Connect OWNER.
4. Remove/revoke only the lost MFA factor using Supabase's administrative controls.
5. The OWNER signs in again and enrolls a new TOTP factor through OXXEN Connect.
6. Review `oxxen_connect_audit_logs` and Supabase Auth logs after recovery.

Do not disable RLS, change the OWNER role, create a temporary public admin, or store TOTP secrets as a workaround.

## Leaked password protection

Supabase Security Advisor currently reports Leaked Password Protection as disabled. This is a project Auth setting and is not changed by SQL migrations.

Manual production setting:

1. Supabase Dashboard → project **OXXEN Connect**.
2. Authentication → Providers → Email (Auth settings).
3. Set minimum password length to at least 12 for administrative use where the plan/UI allows it.
4. Select the strongest available required-character option.
5. Enable **Leaked Password Protection** / prevent leaked passwords.
6. Save.
7. Run Security Advisor again and confirm the warning disappears.

Supabase documents leaked password protection as a Pro-plan-and-above feature. If the project plan does not expose the toggle, record that as an accepted plan limitation and rely on long unique passwords + mandatory TOTP until the plan is upgraded.

## Encrypted external backups

Workflow: `.github/workflows/encrypted-backup.yml`.

It runs daily at 05:30 UTC (00:30 Peru) and can also be triggered manually before migrations. It exports the five critical operational tables, validates the restore package in dry-run mode, compresses it, encrypts it using AES-256-CBC + PBKDF2, deletes the plaintext working copy, and uploads only the encrypted archive as a GitHub Actions artifact.

Retention tiers:

- daily: 7 days;
- weekly (Sunday): 28 days;
- monthly (day 1): 90 days.

Because the repository is public, artifacts must never contain plaintext operational data.

### Required GitHub Actions secrets

Repository → Settings → Secrets and variables → Actions → New repository secret:

- `OXXEN_BACKUP_SUPABASE_URL`: canonical Supabase API URL for the OXXEN Connect project.
- `OXXEN_BACKUP_SERVICE_ROLE_KEY`: service-role/secret key used only by the backup runner.
- `OXXEN_BACKUP_ENCRYPTION_PASSPHRASE`: random passphrase of at least 24 characters, stored outside GitHub as well so backups remain recoverable if repository access is lost.

Never put these values in source code, commits, issues, workflow logs or `VITE_*` variables.

### Manual pre-migration backup

GitHub → Actions → **Encrypted Production Backup** → Run workflow, with reason such as `pre-migration-2026-08-31`. Do not start a destructive migration until that run is green.

### Decrypt an artifact

After downloading the `.enc` artifact in a trusted environment:

```bash
export BACKUP_PASSPHRASE='...'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 \
  -pass env:BACKUP_PASSPHRASE \
  -in oxxen-connect-backup.tar.gz.enc \
  -out oxxen-connect-backup.tar.gz

tar -xzf oxxen-connect-backup.tar.gz
```

Validate before applying:

```bash
npm run backup:restore -- ./oxxen-connect-backup
```

Only after review:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run backup:restore -- ./oxxen-connect-backup --apply
```

The restore script preserves original card `id`, `public_id` and historical aliases.

## Incident procedures

### Supabase unavailable

- Do not regenerate QR destinations.
- Check Supabase project health and API/Auth/Storage logs.
- Keep Vercel deployment unchanged unless the incident is proven frontend-related.
- Restore data only from a validated backup and only after confirming data loss rather than transient outage.

### Vercel unavailable

- Preserve DNS and both domains.
- Check production deployment/build/runtime logs.
- Roll back to the last known-good deployment if necessary.
- Do not delete `oxxen-connect.vercel.app`, because old printed QR codes rely on it as the legacy entry point.

### Accidental card deletion/corruption

- Stop further writes if corruption is ongoing.
- Obtain the latest encrypted backup before the incident.
- Run restore in dry-run mode.
- Restore the original `id`, `public_id` and aliases. Never issue a replacement `public_id` for a physical card.
- Smoke-test both canonical and legacy URLs before closing the incident.

### Client loses a physical card

Losing a physical card is not a database incident. Deactivate the public card if the customer requests it. Do not reuse that card's `public_id` or aliases for another customer. A replacement physical card may point to the same permanent `public_id` when appropriate.

## Sessions

Supabase client session persistence and refresh-token rotation remain enabled. Normal logout clears the local session. A future security control may expose a privileged “close all sessions” action using Supabase Auth global sign-out; this must not be implemented as a client-side bypass or by deleting database rows.
