# @gearsupply/hub-kit

Shared UI + conventions for apps embedded in the **Gearsupply Hub**. Consumed by each Hub
app as a **git dependency pinned to a tag** (no npm registry). Next apps must add
`@gearsupply/hub-kit` to `transpilePackages` — the kit ships TS/CSS source, not a build.

- **Design source of truth (Notion):** Gearsupply Hub → "GS Hub App Kit" design spec. Read it before the code.
- **Exports:** `@gearsupply/hub-kit` (`HubToolbar`, `HubSidebar`) · `@gearsupply/hub-kit/hub-toolbar.css` · `@gearsupply/hub-kit/hub-sidebar.css`
- **Test:** `npm test` (vitest) · **Typecheck:** `npm run typecheck` · no build step

---

# Adding a new app to the Gearsupply Hub — runbook

How to stand up a new app, embed it in the Hub, and get one-login SSO — on **staging and prod**.
Distilled from standing up PIM + Prospector in the Hub (2026-08); every gotcha below was hit for real.

> Until the `hub-app` skill (gs-claude-kit, spec P3) exists, this runbook is the checklist.

## Mental model

- Each Hub app is a **cross-origin iframe** on its own Vercel origin. The Hub can't render inside it — it overlays the floating "Gearsupply Hub /" pill and **posts the session in**.
- The Hub embeds by **origin**: `NEXT_PUBLIC_<APP>_URL` → `HandoffEmbed` computes `childOrigin = new URL(src).origin` and posts `SET_SESSION` there.
- Auth is a **postMessage handoff**, not a second login. The Hub is the **sole** Supabase token refresher; the app receives `SET_SESSION` and calls `supabase.auth.setSession(...)`. supabase-js stores the session in **localStorage, not cookies** → third-party-cookie blocking is a non-issue.

## Domains — use a Vercel URL, skip Cloudflare (the fast path)

You do **not** need a Cloudflare subdomain to embed an app. The Hub embeds by origin, and the allowlists accept `https://*.vercel.app`. Point the Hub tab at the app's **stable Vercel URL**:

| Env | Hub tab points at |
|---|---|
| prod | `gs-<app>.vercel.app` (production alias) |
| staging | `gs-<app>-git-staging-<team>.vercel.app` (Vercel's auto branch-alias for the `staging` branch — stable, redeploys on each staging push) |

**Required caveat (the crux):** `*.vercel.app` URLs are **not** "custom domains", so under Vercel Deployment Protection scope `all_except_custom_domains` they hit the Vercel SSO wall (`302 → vercel.com/sso-api`) and the iframe returns 403. **Turn Vercel Authentication OFF** on the app's Vercel project (Settings → Deployment Protection → Vercel Authentication). The app stays gated by its own Supabase auth, so nothing is truly exposed.

A Cloudflare custom domain (e.g. `<app>-staging.gearsupply.com`) is optional — nicer for prod, and SSO-exempt under that scope — but it needs a **manual** DNS record. Skip it unless you want the pretty URL.

## Steps

1. **Repo + Supabase.** Follow the `staging` → `main` branch model. Apps share the Gearsupply Supabase (schema managed in `gs-internal-supabase-db`): staging reads the shared **`staging` branch DB**, prod reads prod. No per-app database.
2. **Vercel project.** Staging deploys from `staging`, prod from `main`. **Disable Vercel Authentication** (Deployment Protection) so the iframe origin actually loads the app instead of the SSO wall.
3. **Register the tab in the Hub** (`gs-hub` `lib/tabs.ts`): `{ key, label, src: process.env.NEXT_PUBLIC_<APP>_URL || "https://gs-<app>.vercel.app" }`. Then set `NEXT_PUBLIC_<APP>_URL` **per environment** on the `gs-hub` Vercel project — **Preview** scope = the staging URL, **Production** scope = the prod URL. (Env *scope* matters: `hub-staging` must be a deploy that reads Preview-scoped vars.)
4. **Allow framing.** The app must send `Content-Security-Policy: frame-ancestors 'self' <hub origins>` and **no** `X-Frame-Options: DENY/SAMEORIGIN`. **Bake** the origins into the build (survives Vercel build-cache reuse) with an env escape hatch.
5. **Wire the session bridge.** A child bridge listens for `SET_SESSION` from an **origin allowlist** and `setSession()`s it. Today that's per-app (Prospector `HubBridge`, PIM `EmbeddedAuthBridge`) following the "Hub → Child App Session Handoff" contract; once kit P2 lands, use `createHubSession()` from this kit. The allowlist must include the **same** Hub origins as frame-ancestors.
6. **`AuthGate`: never show a login inside the iframe.** When embedded (`window.parent !== window`) and unauthed → render a **"Reconnecting…"** screen and keep re-requesting the session; **never a login form**. A login button in the frame is a dead end: **Google OAuth is blocked inside iframes** (Google returns `403 — you do not have access`). The session must come from the parent.

## The two allowlists — both must include EVERY Hub origin (incl. staging)

| Allowlist | Controls | Lives in |
|---|---|---|
| `frame-ancestors` (CSP) | who may **frame** the app | app `next.config` headers / middleware |
| hub-origin allowlist | who the app **trusts for `SET_SESSION`** | app embed bridge + env var |

Hub origins to include: `https://hub.gearsupply.com`, `https://hub-staging.gearsupply.com`, `https://gs-hub-gearsupply.vercel.app`, `https://gs-hub-sable.vercel.app` (a `https://*.vercel.app` wildcard entry is supported too).

> **#1 gotcha — "prod baked, staging forgotten."** Both lists commonly ship with the prod Hub baked in but omit `hub-staging.gearsupply.com`. Result: the staging Hub can't frame the app (CSP) *and* can't sign it in (SET_SESSION rejected). Include `hub-staging` from day one.

**Env-var drift to standardize:** Prospector reads `NEXT_PUBLIC_HUB_ALLOWED_ORIGINS`, PIM reads `NEXT_PUBLIC_HUB_ORIGINS`. Pick one for new apps — recommend **`NEXT_PUBLIC_HUB_ALLOWED_ORIGINS`** — and have the kit's `createHubSession()` own it so apps stop diverging.

## Gotchas (all hit standing up PIM + Prospector)

- **Vercel SSO wall** applies to `*.vercel.app` and preview-branch custom domains even under `all_except_custom_domains` — only the **prod** custom domain is exempt. → disable Deployment Protection.
- **staging branch behind main:** if the app's `staging` branch lacks the embed-bridge code, the deployed staging app can't do the handoff and falls back to a (broken) login. Keep `staging` synced with `main` — Prospector's staging was a whole feature behind and had to be caught up first.
- **localStorage, not cookies:** if sign-in doesn't stick, it's the allowlist/handshake — not third-party cookies.
- **Env scope ≠ domain→branch mapping:** confirm `hub-staging` is served by a deploy that reads the Preview-scoped `NEXT_PUBLIC_*_URL` vars.

## Verify (staging)

```bash
# 1) protection is off + framing is allowed (no SSO redirect, CSP present):
curl -sSI https://<app-staging-url> | grep -iE 'location|content-security-policy'
#   BAD:  location: https://vercel.com/sso-api?...      (Deployment Protection still on)
#   GOOD: content-security-policy: frame-ancestors 'self' https://hub-staging.gearsupply.com ...
```

Then load `https://hub-staging.gearsupply.com`, open the app's tab: it should **render** (framing OK) and **sign in automatically** (handoff OK) — no login form, no 403.
