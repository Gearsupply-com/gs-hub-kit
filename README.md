# @gearsupply/hub-kit

Shared UI + conventions for apps embedded in the **Gearsupply Hub**. Consumed by each Hub
app as a **git dependency pinned to a tag** (no npm registry). Next apps must add
`@gearsupply/hub-kit` to `transpilePackages` — the kit ships TS/CSS source, not a build.

- **Design source of truth (Notion):** Gearsupply Hub → "GS Hub App Kit" design spec. Read it before the code.
- **Exports:** `@gearsupply/hub-kit` (`HubToolbar`, `HubSidebar`) · `@gearsupply/hub-kit/hub-toolbar.css` · `@gearsupply/hub-kit/hub-sidebar.css`
- **Test:** `npm test` (vitest) · **Typecheck:** `npm run typecheck` · no build step

---

# Adding a new app to the Gearsupply Hub — complete runbook

**Audience:** any engineer (or coding agent) standing up a brand-new app and adding it to the Hub — start to finish, staging then prod. Everything below was proven standing up PIM + Prospector + Warehouse (2026-08); every gotcha was hit for real.

> **For agents (Claude):** do as much of this yourself as your tools allow — create the Vercel project, set env vars, disable Deployment Protection, open PRs, land migrations through `gs-internal-supabase-db`, and verify with `curl`. The **"Agent autonomy"** table near the end says exactly what to automate and what to hand to a human. Never hand a human a step you could have done.

## 0. The 60-second model

- **One Hub, many apps.** Each app is its **own repo + its own Vercel project**, embedded in the Hub shell (`hub.gearsupply.com`) as a **cross-origin iframe**. The Hub can't render inside your app — it overlays a floating pill and **posts the user's session in**.
- **One shared identity + (usually) one shared database.** Every app authenticates against the **same Supabase project** as the Hub and reads/writes the shared schema under **RLS**. The Hub is the identity provider; your app gets the session for free (no second login) via a **postMessage handoff**.
- **Two environments, mirrored everywhere.** `staging` (branch → preview deploy → staging Supabase branch DB) and `main`/prod. **Hub and app must point at the SAME Supabase project per environment**, or the handed-off token is invalid.

### Separate your data by SCHEMA, not by project

**One shared Supabase project = one auth.** The SSO handoff works *only* because your app adopts the Hub's session against **that same project** — a Hub JWT is invalid against any other Supabase project. So you don't get a separate auth per app; you separate *data* by **schema**:

| Approach | When | Data |
|---|---|---|
| **Shared project, own schema (default — do this)** | Almost always | Add a `<app>` schema (alongside `crm`/`pim`/`prospector`) in the shared Supabase via `gs-internal-supabase-db` migrations (§2). RLS + org scoping + the adopted Hub session all work natively. |
| **Separate data *store*, still shared auth (exception)** | Data genuinely can't live in shared Postgres — an external system or a huge/independent store (e.g. Warehouse's `gs-items`) | **Auth is still the shared Supabase project** — you adopt the Hub session exactly the same way. Only the *data* lives elsewhere; guard it in your **own server routes** by validating that Hub session server-side. This is **not** a second Supabase auth/project. |

Either way the **auth + embedding** steps (§4–5) are identical — every app adopts the one shared session.

## 1. Architecture you're plugging into

- **Supabase (shared):** project `hhfpccwjxyexypwotijn` (prod) with a persistent **`staging` branch** (`zbczikbtgivvdpoheseh`). Schema is owned by **`gs-internal-supabase-db`** (the only repo that applies migrations). Schemas in use: `public` (users, orgs, apps, profiles, app_access), `crm`, `erp`, `pim`, `prospector`, `marts`, `crawler`.
- **Identity + gating:** `public.profiles.is_admin` = Hub super-admin; `public.app_access` (per-user, per-app, 4-tier `viewer/contributor/manager/admin`) drives which tabs a user sees and what they can do. Org scoping via `public.users.org_id` + `current_org_id()` in RLS.
- **Auth:** Google OAuth (PKCE). The **Hub** owns login + token refresh; embedded apps receive the session and **must not self-refresh** (dual-refresh races log the user out).
- **Client keys:** browser uses the **publishable** key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) with RLS; server-only code uses `SUPABASE_SECRET_KEY` / `SUPABASE_DB_URL`. Never ship the secret key to the browser.

## 2. Database architecture — how to add tables (the one rule)

**All shared-DB schema changes go through `gs-internal-supabase-db` as a migration. Never run DDL from your app repo, never `supabase db push` from anywhere else, never apply SQL by hand or via MCP against prod.** That repo's CI is the sole applier.

1. `git switch staging && git pull` in `gs-internal-supabase-db` (always branch from `staging`).
2. New migration file: **UTC-timestamp prefix** `YYYYMMDDHHMMSS_name.sql` (never sequential integers — parallel agents collide otherwise). Check prod `schema_migrations` for the latest version so yours sorts after it.
3. Write **additive, idempotent** DDL: `create table if not exists`, `add column if not exists`, `on conflict do nothing`. Add **RLS**: `enable row level security` + policies scoped by `current_org_id()` (copy an existing table's policy). An app deploy must work before *or* after the migration lands.
4. Commit to `staging` → PR → merge to `staging`. The Supabase branch integration applies it to the **staging branch DB**. Test against your staging app.
5. Promote: PR **`staging` → `main`**. CI (`db-migrate.yml`, `supabase db push --include-all`) applies it to **prod**.

**Per-environment Supabase creds (this is how a staging app reads the staging DB):**

| App env (Vercel scope) | `NEXT_PUBLIC_SUPABASE_URL` | Key |
|---|---|---|
| Preview (staging) | `https://zbczikbtgivvdpoheseh.supabase.co` (staging branch) | staging branch publishable key |
| Production | `https://hhfpccwjxyexypwotijn.supabase.co` (prod) | prod publishable key |

The Hub uses the **same** mapping — that's what keeps the handed-off session valid.

## 3. Stand up the app (repo + Vercel + Supabase)

1. **Repo:** new `Gearsupply-com/gs-<app>` (Next.js). Add `@gearsupply/hub-kit` as a git dependency pinned to a tag; add it to `transpilePackages`. Create a long-lived **`staging` branch** off `main` — you deploy and test there first.
2. **Vercel project:** import the repo (framework auto-detects Next.js; no `vercel.json` needed). Production Branch = `main`; `staging` auto-gets a preview + a stable branch alias `gs-<app>-git-staging-<team>.vercel.app`.
3. **Env vars (per environment):**

    | Var | Preview (staging) | Production | Notes |
    |---|---|---|---|
    | `NEXT_PUBLIC_SUPABASE_URL` | staging branch URL | prod URL | §2 table |
    | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | staging key | prod key | browser, RLS |
    | `SUPABASE_SECRET_KEY` | staging | prod | server only |
    | `NEXT_PUBLIC_HUB_ALLOWED_ORIGINS` | `https://hub-staging.gearsupply.com` | *(optional; prod hub is baked)* | §4 allowlist |

4. **Disable Vercel Authentication** (Project → Settings → Deployment Protection → Vercel Authentication → off). Required so the Hub can iframe your Vercel URL (see §4 domains). Your app is still gated by its own Supabase auth.
5. **Supabase client:** browser client with `createBrowserClient(url, publishableKey)`; **when embedded, disable auto-refresh** (`autoRefreshToken:false`) — the Hub is the sole refresher. Copy Prospector's `src/lib/supabase/browserClient.ts`.

## 4. Embed in the Hub

**Domains — use a Vercel URL, skip Cloudflare (fast path).** The Hub embeds by *origin* and the allowlists accept `https://*.vercel.app`, so you don't need a Cloudflare subdomain. Point the Hub tab at your stable Vercel URL: prod `gs-<app>.vercel.app`, staging `gs-<app>-git-staging-<team>.vercel.app`. **Caveat:** `*.vercel.app` isn't a "custom domain", so under Deployment Protection `all_except_custom_domains` it's behind the Vercel SSO wall (`302 → vercel.com/sso-api`) → the iframe 403s. That's why §3.4 disables Vercel Authentication. A Cloudflare custom domain is optional (nicer prod, SSO-exempt) but needs a **manual DNS record** — skip unless you want the pretty URL.

1. **Register the tab** in `gs-hub` `lib/tabs.ts`: `{ slug, label, src: process.env.NEXT_PUBLIC_<APP>_URL || "https://gs-<app>.vercel.app", allow?: "camera; microphone" }`.
2. **Hub env vars:** set `NEXT_PUBLIC_<APP>_URL` on the `gs-hub` project — **Preview** = your staging URL, **Production** = your prod URL. (Scope matters: `hub-staging` must be a deploy that reads Preview-scoped vars.)
3. **Allow framing:** your app sends `Content-Security-Policy: frame-ancestors 'self' <hub origins>` and **no** `X-Frame-Options: DENY/SAMEORIGIN`. **Bake** the origins into the build (survives Vercel build-cache) with an env escape hatch (see gs-pim `next.config.ts`).
4. **The two allowlists — both must include EVERY Hub origin, including staging:**

    | Allowlist | Controls | Lives in |
    |---|---|---|
    | `frame-ancestors` (CSP) | who may **frame** the app | app `next.config` headers/middleware |
    | hub-origin allowlist | who the app **trusts for `SET_SESSION`** | app embed bridge + env var |

    Hub origins: `https://hub.gearsupply.com`, `https://hub-staging.gearsupply.com`, `https://gs-hub-gearsupply.vercel.app`, `https://gs-hub-sable.vercel.app` (a `https://*.vercel.app` wildcard entry works too).

    > **#1 gotcha — "prod baked, staging forgotten."** Teams bake the prod Hub but omit `hub-staging.gearsupply.com` → the staging Hub can't frame the app (CSP) *and* can't sign it in (`SET_SESSION` rejected). Include `hub-staging` from day one.

    **Env-var (standardized in kit v0.3.0):** use `NEXT_PUBLIC_HUB_ALLOWED_ORIGINS` — the kit's `createHubSession()` reads it and **bakes in every Hub origin, including `hub-staging`**, so a new app can't hit the gotcha above. Legacy `NEXT_PUBLIC_HUB_ORIGINS` (PIM) is retired on migration.

## 5. Auth end-to-end

- **Embedded (the normal case):** the Hub's `HandoffEmbed` posts `SET_SESSION` to your origin on `APP_READY`/`REQUEST_SESSION`/token-refresh/focus. Your **child bridge** is `useHubSession()` / `createHubSession()` from `@gearsupply/hub-kit` (v0.3.0+): mount it above your `AuthGate`, pass `appKey` + `setSession: (t) => supabase.auth.setSession(t)`; it validates the sender origin against the allowlist (all Hub origins incl. `hub-staging` baked in) and adopts the session. supabase-js stores the session in **localStorage, not cookies** → third-party-cookie blocking is a non-issue. (Prospector/PIM still run their own bespoke bridges pending migration — see the kit's P2 follow-up.)
- **`AuthGate`:** when embedded (`window.parent !== window`) and unauthed → show **"Reconnecting…"** and keep re-requesting the session; **never a login form.** A Google login button inside the iframe is a dead end — **Google blocks OAuth in iframes (`403 — you do not have access`)**. Standalone (app opened directly), show the sign-in screen.
- **Standalone sign-in / OAuth redirect URLs:** if the app is ever opened directly (not embedded) and does Google OAuth, its origin must be in **Supabase Auth → URL Configuration → Redirect URLs** (add `https://gs-<app>.vercel.app`, the staging branch alias, and any custom domain). Embedded-only apps don't need this.

## 6. Set up the STAGING environment (do this first, every time)

1. App: `staging` branch exists and deploys on Vercel; **Vercel Authentication disabled**; Preview env vars point at the **staging branch Supabase** (§2) and `NEXT_PUBLIC_HUB_ALLOWED_ORIGINS` includes `https://hub-staging.gearsupply.com`.
2. App code (on `staging`): `frame-ancestors` + hub-origin allowlist include the staging Hub; the embed bridge + `AuthGate` are present. **If `staging` is behind `main`, the bridge code may be missing — sync `main`→`staging` first** (this bit Prospector: its `staging` was a whole feature behind and had to be caught up before embedding worked).
3. Hub: `NEXT_PUBLIC_<APP>_URL` (Preview scope) = your staging branch-alias URL; the tab is registered.
4. DB: any new tables landed on the `gs-internal-supabase-db` **`staging`** branch (§2) so the staging branch DB has them.
5. **Verify** (§9), then and only then promote to `main` (§7).

## 7. Change flow: staging → main (never straight to main)

Same shape in every repo:

1. Feature branch → PR into **`staging`** → merge. Vercel builds a **staging preview**; it reads the **staging** Supabase branch. Test there.
2. When staging is green, PR **`staging` → `main`** → merge → prod deploy (apps run `deploy-prod.yml`; `preview-smoke.yml` guards previews).
3. **DB changes** ride the same rails but in `gs-internal-supabase-db`: land on `staging` (applies to staging branch DB), then PR `staging`→`main` (CI applies to prod). Keep app deploys backward-compatible so either order is safe.

Never commit migrations or app-embedding changes straight to `main` — they must bake on staging behind the staging Hub first.

## 8. Agent autonomy — what Claude does itself vs. what needs a human

**Do these yourself** (you have the tools):

| Task | How |
|---|---|
| Create/configure the Vercel project, set env vars, **disable Deployment Protection** | Vercel MCP (`create_git_project`, env tools, `update_project_deployment_protection`) |
| Register the Hub tab, add `frame-ancestors` + hub allowlist, wire the bridge | edit code + open PRs (`gh`) into each repo's `staging` |
| Author + land DB migrations | new migration in `gs-internal-supabase-db`, PR `staging`→`main`; CI applies (never direct DB writes) |
| Inspect/query DB, read branch-action logs, reset a Supabase branch | Supabase MCP (`execute_sql`, `get_logs service=branch-action`, `reset_branch`) |
| Verify headers / SSO wall / framing | `curl -sSI` (see §9) |
| Merge PRs into `staging` (unprotected) and drive the staging→main promotion | `gh pr merge` |

**Escalate to a human** (out of an agent's reach — say so explicitly and give the exact click-path):

- **Cloudflare DNS** for a custom domain — manual. (Default to the Vercel URL to avoid this entirely.)
- **Supabase Auth config** — adding a standalone app origin to **Redirect URLs**, or Google OAuth client changes (dashboard).
- **Supabase staging branch** ops when the management token can't reach the branch ref (`execute_sql` returns "permission denied") — the human runs SQL in the branch's SQL editor, or fixes a wedged `branch-action` (see gs-internal-supabase-db memory: the staging branch auto-apply can 404).
- **Merging to `main`/prod** — get an explicit human OK before any prod-affecting merge.

## 9. Verify (staging)

```bash
# Protection off + framing allowed:
curl -sSI https://<app-staging-url> | grep -iE 'location|content-security-policy'
#   BAD:  location: https://vercel.com/sso-api?...          (Deployment Protection still on)
#   GOOD: content-security-policy: frame-ancestors 'self' https://hub-staging.gearsupply.com ...
```

Then load `https://hub-staging.gearsupply.com`, open the app's tab: it must **render** (framing OK) and **sign in automatically** (handoff OK) — no login form, no 403. If it hangs "Reconnecting…"/"Signing you in…": the hub-origin allowlist is missing `hub-staging` or its env var isn't set. If it shows a Google login that 403s: the app isn't getting the session (allowlist/bridge) or `staging` is behind `main`.
