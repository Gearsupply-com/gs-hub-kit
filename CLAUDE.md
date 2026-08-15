# @gearsupply/hub-kit

Shared UI + conventions for apps embedded in the **Gearsupply Hub**.
Consumed by each Hub app as a git dependency pinned to a tag; Next apps must add
`@gearsupply/hub-kit` to `transpilePackages` (the kit ships TS/CSS source, not a build).

- Notion project (source of truth): Gearsupply Hub → "GS Hub App Kit" design spec.
- Session order: read the Notion spec before the code.
- **Standing up / embedding / SSO for a new Hub app:** `README.md` → "Adding a new app to the Gearsupply Hub — complete runbook" is the canonical, living how-to for engineers AND agents — architecture, DB (shared Supabase + `gs-internal-supabase-db` migration flow, per-env creds), Vercel/Supabase setup, embedding (Vercel-URL-vs-Cloudflare, Deployment Protection, the two allowlists incl. `hub-staging`), auth handoff, staging-env setup, the staging→main flow, and an **Agent autonomy** table (what Claude does itself vs. escalates). Mirrored in the Notion "GS Hub App Kit" spec.
- Test: `npm test` (vitest). Typecheck: `npm run typecheck`.
- No build step. Exports: `@gearsupply/hub-kit` (components), `@gearsupply/hub-kit/hub-toolbar.css` (styles).
