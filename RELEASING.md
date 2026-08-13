# Releasing

This package is distributed on two platforms with a clear split:

- **npm** — published **manually** by the maintainer. npm is restricting 2FA-bypass
  tokens (account changes from Aug 2026, direct publishing from Jan 2027), so CI
  publishing is intentionally avoided.
- **GitHub** — fully **automated**. Pushing a `v*` tag runs the checks and creates a
  GitHub Release with auto-generated notes.

## Cut a new release

1. Make sure `main` is green and `npm run check` passes locally.
2. Bump the version — this updates `package.json`, `package-lock.json` and creates
   the git tag in one step:

   ```sh
   npm version patch -m "chore: release v%s"
   ```

   Use `minor` or `major` instead of `patch` when the change warrants it.
3. Push the version commit and the tag:

   ```sh
   git push origin main
   git push origin vX.Y.Z
   ```

   The `Release` workflow runs `npm run check` and creates the GitHub Release.
4. **Publish to npm** — the only manual step:

   ```sh
   npm publish --access=public
   ```

   npm will ask for your 6-digit 2FA code; enter it and the package is live.

## Checklist

- [ ] `npm run check` passes
- [ ] version bumped with `npm version …` (tag created)
- [ ] commit + tag pushed → GitHub Release created automatically
- [ ] `npm publish --access=public` succeeded (2FA code entered)
