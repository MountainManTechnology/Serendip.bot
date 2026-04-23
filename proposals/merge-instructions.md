Proposed changes to make `Serendip.bot` a runnable monorepo root

Summary

- Add a root `package.json` with workspaces and scripts (see `merged-package.json`).
- Add `turbo.json` as `merged-turbo.json` to configure caching and tasks.
- Copy minimal components using `copy-minimal.sh` (dry-run by default).
- Create a consolidated `.env.example` at repo root (see `/Users/will/Serendip.bot/.env.example`).

How to apply

1. Run `./copy-minimal.sh --apply` to copy files into place.
2. Review `proposals/merged-package.json` and either merge into root `package.json` or create a new root `package.json` using it.
3. Copy `proposals/merged-turbo.json` to `turbo.json` at repo root (merge if an existing `turbo.json` exists).
4. Update Dockerfile `build.context` fields and `docker-compose.yml` paths to point to the new `apps/*` and `services/*` locations.
5. Create `Serendip.bot/.env` from `.env.example` and populate secrets in CI/secrets manager.

Notes

- These are _proposals_; I did not overwrite existing root manifests.
- Next I can apply patches to `package.json`/`turbo.json` if you want me to create them directly in the repo.
