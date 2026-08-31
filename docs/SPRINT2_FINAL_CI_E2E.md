# Sprint 2 final CI/E2E gate

This document records the final pre-closeout controls for OXXEN Connect Sprint 2.

## CI topology

Pull requests targeting `main` must run:

1. `CI / verify`
   - install dependencies
   - lint
   - TypeScript typecheck
   - Vitest unit/contract tests
   - production build
2. `CI / e2e-critical`
   - Playwright non-destructive critical checks against the canonical production contract
   - public profile desktop/mobile
   - unauthenticated admin guard
   - legacy QR redirect and query preservation
   - `/api/contact` contract and invalid input handling

After a commit reaches `main`, `CI / production-smoke` remains as the post-merge smoke suite.

The critical Playwright suite is intentionally non-destructive. It never creates, edits, archives, restores, or deletes real customer data.

## Required GitHub protection for `main`

The repository owner must enable a branch protection rule or ruleset for `main` with the following effective configuration:

- Require a pull request before merging: **ON**
- Required approvals: **0** while OXXEN Connect has a single repository owner
- Require status checks to pass before merging: **ON**
- Required checks:
  - `CI / verify`
  - `CI / e2e-critical`
- Require branches to be up to date before merging: **ON** when available without creating a permanent single-owner deadlock
- Block force pushes: **ON**
- Block branch deletion: **ON**
- Do not allow bypass of the rule for normal day-to-day changes. Emergency bypass, if GitHub exposes it, should remain an explicit owner action rather than the default workflow.

### GitHub UI path

`Repository → Settings → Rules → Rulesets` (preferred) or `Settings → Branches → Branch protection rules`.

For a ruleset:

1. Create a branch ruleset named `Protect main`.
2. Enforcement status: `Active`.
3. Target branches: include `main` only.
4. Enable `Restrict deletions`.
5. Enable `Block force pushes` / disallow non-fast-forward updates.
6. Enable `Require a pull request before merging`.
7. Keep required approvals at `0` while there is only one owner.
8. Enable `Require status checks to pass`.
9. Add `CI / verify`.
10. Add `CI / e2e-critical` after the first PR run makes the check available to GitHub.
11. Enable `Require branches to be up to date before merging` if GitHub offers it for the selected rule type.
12. Save the active ruleset.

Do not enable a mandatory second reviewer until another trusted maintainer exists; that would deadlock the single-owner repository.

## Testing pyramid and production safety

### Vitest

Used for deterministic logic and security gates:

- OWNER MFA policy
- TOTP enrollment/challenge failure handling
- AdminGuard unauthenticated/non-admin/AAL1/AAL2 behavior
- canonical public URL helper
- image validation helpers
- static production contracts for permanent `public_id`, aliases, analytics limits, OWNER AAL2 RLS, restore identity preservation, and the scoped legacy redirect

### Playwright critical

Used only for non-destructive production-facing contracts:

- canonical public profile loads
- mobile and desktop rendering
- legacy printed QR returns permanent redirect
- legacy query parameters are preserved
- `/admin`, `/api`, and `/assets` are not redirected as public profiles
- `/api/contact` valid/404/400/405/header-injection cases
- unauthenticated admin access is sent to login
- missing public profile returns a safe state

### Requires a future isolated staging environment for true mutation E2E

The following flows must **not** be exercised against real production cards:

- successful credential login with a test admin
- authenticated non-admin account rejection using a real Auth user
- real TOTP enrollment/challenge with disposable factors
- create card
- edit card
- archive card
- restore card
- change slug and verify a historical alias against a real test database
- attempt a real `public_id` mutation through the client stack
- invalid analytics RPC payloads against disposable test data

Until a dedicated staging/test Supabase project exists, these invariants are covered through component mocks, migration/restore contract tests, production-safe smoke tests, and manual production audit evidence. Do not create a paid staging project without explicit approval.

## Secret hygiene

Tests must never commit or print:

- production passwords
- TOTP enrollment material
- service-role credentials
- JWTs
- session cookies
- private API credentials

Production smoke tests use only public routes and public identifiers.
