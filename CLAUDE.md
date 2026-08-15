# @gearsupply/hub-kit

Shared UI + conventions for apps embedded in the **Gearsupply Hub**.
Consumed by each Hub app as a git dependency pinned to a tag; Next apps must add
`@gearsupply/hub-kit` to `transpilePackages` (the kit ships TS/CSS source, not a build).

- Notion project (source of truth): Gearsupply Hub → "GS Hub App Kit" design spec.
- Session order: read the Notion spec before the code.
- **Standing up / embedding / SSO for a new Hub app:** see `README.md` → "Adding a new app to the Gearsupply Hub — runbook" (domains via Vercel URL vs Cloudflare, Deployment Protection, the two allowlists incl. `hub-staging`, the auth handoff). Kept in sync with the Notion spec's operational-runbook section.
- Test: `npm test` (vitest). Typecheck: `npm run typecheck`.
- No build step. Exports: `@gearsupply/hub-kit` (components), `@gearsupply/hub-kit/hub-toolbar.css` (styles).
