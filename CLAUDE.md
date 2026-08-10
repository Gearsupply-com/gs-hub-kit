# @gearsupply/hub-kit

Shared UI + conventions for apps embedded in the **Gearsupply Hub**.
Consumed by each Hub app as a git dependency pinned to a tag; Next apps must add
`@gearsupply/hub-kit` to `transpilePackages` (the kit ships TS/CSS source, not a build).

- Notion project (source of truth): Gearsupply Hub → "GS Hub App Kit" design spec.
- Session order: read the Notion spec before the code.
- Test: `npm test` (vitest). Typecheck: `npm run typecheck`.
- No build step. Exports: `@gearsupply/hub-kit` (components), `@gearsupply/hub-kit/hub-toolbar.css` (styles).
