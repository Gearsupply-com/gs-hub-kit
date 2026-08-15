// Child-side Hub session handoff — the ONE shared implementation every Hub app
// uses instead of its own copy (retires Prospector's HubBridge/hubContract/
// hubOrigins/adoptHubSession and PIM's EmbeddedAuthBridge).
//
// Mirrors the Hub's parent-side contract (gs-hub `lib/embed/hubEmbed.ts`): the
// child posts APP_READY (carrying its appKey), the Hub replies SET_SESSION with
// its shared-Supabase session, and the child adopts it via the injected
// `setSession`. Because the Hub and the app authenticate against the SAME
// Supabase project, the Hub's tokens are valid in the app — signing the user in
// with no second login. The Hub is the SOLE token refresher, so the app's
// Supabase client must run with `autoRefreshToken: false` when embedded.
//
// Framework-agnostic: no React, no `@supabase/supabase-js` dependency — you pass
// a `setSession` function. A thin React wrapper lives in `useHubSession`.

export const SET_SESSION = "SET_SESSION" as const;
export const APP_READY = "APP_READY" as const;
export const REQUEST_SESSION = "REQUEST_SESSION" as const;

/** The Hub's shared-Supabase session, handed to the child to adopt. */
export interface HubSessionPayload {
  type: typeof SET_SESSION;
  userId: string;
  email: string;
  accessToken: string;
  /** Required to adopt a durable session; the Hub omits it only transiently. */
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/**
 * Hub origins baked into every consumer build so the allowlist can never be
 * silently empty — a cache-reused build that dropped an env-only origin would
 * break the embed. Includes BOTH the prod AND the staging Hub: forgetting
 * `hub-staging.gearsupply.com` is the single most common mistake and breaks the
 * whole embed on staging. Extend per-deploy via NEXT_PUBLIC_HUB_ALLOWED_ORIGINS.
 */
export const BAKED_HUB_ORIGINS = [
  "https://hub.gearsupply.com",
  "https://hub-staging.gearsupply.com",
  "https://gs-hub-gearsupply.vercel.app",
  "https://gs-hub-sable.vercel.app",
] as const;

/** The ONE standard env var for extra Hub origins (comma-separated). */
export const HUB_ORIGINS_ENV = "NEXT_PUBLIC_HUB_ALLOWED_ORIGINS";

/** Parse a comma-separated origin list into a trimmed, non-empty array. */
export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Baked origins unioned (deduped) with any comma-separated override. */
export function hubAllowlist(raw?: string | undefined | null): string[] {
  return Array.from(new Set([...BAKED_HUB_ORIGINS, ...parseAllowlist(raw)]));
}

/**
 * Is `origin` allowed? Exact match, or a `https://*.host` wildcard-subdomain
 * entry (e.g. `https://*.vercel.app`). Never matches an empty/`"null"` origin.
 */
export function isAllowedOrigin(origin: string, allowlist: readonly string[]): boolean {
  if (!origin || origin === "null") return false;
  for (const entry of allowlist) {
    if (entry === origin) return true;
    if (matchesWildcard(origin, entry)) return true;
  }
  return false;
}

function matchesWildcard(origin: string, entry: string): boolean {
  const idx = entry.indexOf("://*.");
  if (idx === -1) return false;
  const scheme = entry.slice(0, idx);
  const baseHost = entry.slice(idx + "://*.".length);
  if (!scheme || !baseHost) return false;
  const prefix = `${scheme}://`;
  if (!origin.startsWith(prefix)) return false;
  const host = origin.slice(prefix.length);
  const suffix = `.${baseHost}`;
  return host.endsWith(suffix) && host.length > suffix.length;
}

/**
 * Validate an inbound message as a well-formed SET_SESSION payload, or null.
 * The caller MUST verify the message origin against the allowlist separately.
 */
export function parseHubSession(data: unknown): HubSessionPayload | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.type !== SET_SESSION) return null;
  if (typeof m.userId !== "string" || m.userId.length === 0) return null;
  if (typeof m.email !== "string" || m.email.length === 0) return null;
  if (typeof m.accessToken !== "string" || m.accessToken.length === 0) return null;
  if (typeof m.expiresAt !== "number" || !Number.isFinite(m.expiresAt)) return null;
  const out: HubSessionPayload = {
    type: SET_SESSION,
    userId: m.userId,
    email: m.email,
    accessToken: m.accessToken,
    expiresAt: m.expiresAt,
  };
  if (typeof m.refreshToken === "string" && m.refreshToken.length > 0) {
    out.refreshToken = m.refreshToken;
  }
  return out;
}

export interface CreateHubSessionOptions {
  /** This app's key (e.g. "prospector", "pim", "warehouse"); sent in APP_READY/REQUEST_SESSION. */
  appKey: string;
  /**
   * Adopt the session. Wire to `(t) => supabase.auth.setSession(t)`. Called only
   * for an allow-listed SET_SESSION that carries a refresh token (both tokens are
   * required; calling with an empty refresh token would clear a valid session).
   */
  setSession: (tokens: {
    access_token: string;
    refresh_token: string;
  }) => unknown | Promise<unknown>;
  /** Extra Hub origins beyond the baked list. Defaults to NEXT_PUBLIC_HUB_ALLOWED_ORIGINS. */
  hubAllowedOrigins?: string;
  /** Called after a session is successfully adopted (e.g. flip AuthGate to "authed"). */
  onSession?: (payload: HubSessionPayload) => void;
  /** Test seam; defaults to `window`. */
  target?: Pick<Window, "parent" | "addEventListener" | "removeEventListener">;
}

export interface HubSessionHandle {
  /** Re-ask the Hub to (refresh and) re-post the session — for reconnect/refocus. */
  requestSession: () => void;
  /** Remove the message listener. */
  dispose: () => void;
}

const INERT: HubSessionHandle = { requestSession: () => {}, dispose: () => {} };

/**
 * Start the child side of the Hub session handoff. Returns an inert handle when
 * standalone (not embedded in the Hub iframe). When embedded: posts APP_READY to
 * the concrete Hub origins and listens for an allow-listed SET_SESSION, adopting
 * it via `setSession`. Adopting fires Supabase's SIGNED_IN, which the app's
 * AuthGate observes — no login form is ever shown inside the frame.
 */
export function createHubSession(opts: CreateHubSessionOptions): HubSessionHandle {
  const w =
    opts.target ??
    (typeof window !== "undefined"
      ? (window as unknown as CreateHubSessionOptions["target"])
      : undefined);
  if (!w || !w.parent || w.parent === (w as unknown)) return INERT; // standalone

  const parent = w.parent as Window;
  const allow = hubAllowlist(opts.hubAllowedOrigins ?? readEnvOrigins());
  // postMessage needs a concrete target origin; wildcard entries can't be posted to.
  const concrete = allow.filter((o) => !o.includes("*"));

  const post = (type: typeof APP_READY | typeof REQUEST_SESSION): void => {
    const msg = { type, appKey: opts.appKey };
    if (concrete.length > 0) {
      for (const origin of concrete) parent.postMessage(msg, origin);
    } else {
      parent.postMessage(msg, "*"); // dev-only fallback when nothing is configured
    }
  };

  const onMessage = (event: MessageEvent): void => {
    if (!isAllowedOrigin(event.origin, allow)) return;
    const payload = parseHubSession(event.data);
    if (!payload || !payload.refreshToken) return; // need both tokens to adopt
    Promise.resolve(
      opts.setSession({
        access_token: payload.accessToken,
        refresh_token: payload.refreshToken,
      }),
    )
      .then(() => opts.onSession?.(payload))
      .catch(() => {
        /* no Supabase env / bad token — nothing to adopt into */
      });
  };

  w.addEventListener("message", onMessage as EventListener);
  post(APP_READY);

  return {
    requestSession: () => post(REQUEST_SESSION),
    dispose: () => w.removeEventListener("message", onMessage as EventListener),
  };
}

// Minimal ambient for `process.env` so this browser lib typechecks without
// pulling @types/node. Kept as the literal `process.env.NEXT_PUBLIC_*` so Next's
// build inlines the value in the consumer app.
declare const process: { env: Record<string, string | undefined> };

/** Static read so Next inlines the NEXT_PUBLIC_* value at the consumer's build. */
function readEnvOrigins(): string | undefined {
  try {
    return process.env.NEXT_PUBLIC_HUB_ALLOWED_ORIGINS;
  } catch {
    return undefined;
  }
}
