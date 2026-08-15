import { describe, it, expect, vi } from "vitest";
import {
  BAKED_HUB_ORIGINS,
  hubAllowlist,
  isAllowedOrigin,
  parseHubSession,
  createHubSession,
  SET_SESSION,
  APP_READY,
  REQUEST_SESSION,
  type HubSessionPayload,
} from "./hubSession";

const HUB = "https://hub.gearsupply.com";
const HUB_STAGING = "https://hub-staging.gearsupply.com";

function validPayload(over: Partial<HubSessionPayload> = {}): HubSessionPayload {
  return {
    type: SET_SESSION,
    userId: "u1",
    email: "rep@gearsupply.com",
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: 1_800_000_000_000,
    ...over,
  };
}

/** Minimal embedded-window mock: parent !== self, captures listeners + posts. */
function makeEmbeddedWindow() {
  const listeners: Array<(e: MessageEvent) => void> = [];
  const posted: Array<{ msg: unknown; origin: string }> = [];
  const parent = {
    postMessage: (msg: unknown, origin: string) => posted.push({ msg, origin }),
  };
  const w = {
    parent,
    addEventListener: (_type: string, fn: (e: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_type: string, fn: (e: MessageEvent) => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  } as unknown as Window;
  const fire = (e: { origin: string; data: unknown }) =>
    listeners.forEach((fn) => fn(e as MessageEvent));
  return { w, parent, posted, listeners, fire };
}

describe("hubAllowlist", () => {
  it("always bakes in both prod AND staging Hub (the #1 forgotten origin)", () => {
    const list = hubAllowlist(undefined);
    expect(list).toContain(HUB);
    expect(list).toContain(HUB_STAGING);
    expect(BAKED_HUB_ORIGINS).toContain(HUB_STAGING);
  });
  it("merges + dedupes the env override", () => {
    const list = hubAllowlist("https://x.example.com, https://hub.gearsupply.com");
    expect(list).toContain("https://x.example.com");
    expect(list.filter((o) => o === HUB)).toHaveLength(1);
  });
});

describe("isAllowedOrigin", () => {
  it("matches exact + *.vercel.app wildcard, rejects others/empty/null", () => {
    const allow = hubAllowlist("https://*.vercel.app");
    expect(isAllowedOrigin(HUB_STAGING, allow)).toBe(true);
    expect(isAllowedOrigin("https://gs-hub-abc123.vercel.app", allow)).toBe(true);
    expect(isAllowedOrigin("https://evil.com", allow)).toBe(false);
    expect(isAllowedOrigin("", allow)).toBe(false);
    expect(isAllowedOrigin("null", allow)).toBe(false);
  });
});

describe("parseHubSession", () => {
  it("accepts a valid SET_SESSION and keeps the refresh token", () => {
    expect(parseHubSession(validPayload())).toMatchObject({ userId: "u1", refreshToken: "rt" });
  });
  it("rejects wrong type / missing fields", () => {
    expect(parseHubSession({ type: "NOPE" })).toBeNull();
    expect(parseHubSession(validPayload({ accessToken: "" }))).toBeNull();
    expect(parseHubSession(null)).toBeNull();
  });
  it("omits refreshToken when absent (caller must skip adoption)", () => {
    const p = parseHubSession({ ...validPayload(), refreshToken: undefined });
    expect(p?.refreshToken).toBeUndefined();
  });
});

describe("createHubSession", () => {
  it("is inert when standalone (parent === self)", () => {
    const self: Record<string, unknown> = {};
    self.parent = self;
    const setSession = vi.fn();
    const h = createHubSession({
      appKey: "pim",
      setSession,
      target: self as unknown as Window,
    });
    h.requestSession();
    expect(setSession).not.toHaveBeenCalled();
  });

  it("posts APP_READY to every concrete Hub origin on start", () => {
    const { w, posted } = makeEmbeddedWindow();
    createHubSession({ appKey: "prospector", setSession: vi.fn(), target: w, hubAllowedOrigins: "" });
    expect(posted.every((p) => (p.msg as { type: string }).type === APP_READY)).toBe(true);
    expect(posted.map((p) => p.origin)).toContain(HUB);
    expect(posted.map((p) => p.origin)).toContain(HUB_STAGING);
    // wildcard entries are never used as a post target
    expect(posted.map((p) => p.origin)).not.toContain("https://*.vercel.app");
  });

  it("adopts an allow-listed SET_SESSION and calls onSession", async () => {
    const { w, fire } = makeEmbeddedWindow();
    const setSession = vi.fn().mockResolvedValue(undefined);
    const onSession = vi.fn();
    createHubSession({ appKey: "pim", setSession, onSession, target: w, hubAllowedOrigins: "" });
    fire({ origin: HUB_STAGING, data: validPayload() });
    await Promise.resolve();
    await Promise.resolve();
    expect(setSession).toHaveBeenCalledWith({ access_token: "at", refresh_token: "rt" });
    expect(onSession).toHaveBeenCalled();
  });

  it("ignores a SET_SESSION from a disallowed origin", () => {
    const { w, fire } = makeEmbeddedWindow();
    const setSession = vi.fn();
    createHubSession({ appKey: "pim", setSession, target: w, hubAllowedOrigins: "" });
    fire({ origin: "https://evil.com", data: validPayload() });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("ignores a SET_SESSION with no refresh token (won't clear a valid session)", () => {
    const { w, fire } = makeEmbeddedWindow();
    const setSession = vi.fn();
    createHubSession({ appKey: "pim", setSession, target: w, hubAllowedOrigins: "" });
    fire({ origin: HUB, data: { ...validPayload(), refreshToken: undefined } });
    expect(setSession).not.toHaveBeenCalled();
  });

  it("requestSession posts REQUEST_SESSION; dispose removes the listener", () => {
    const { w, posted, fire } = makeEmbeddedWindow();
    const setSession = vi.fn();
    const h = createHubSession({ appKey: "pim", setSession, target: w, hubAllowedOrigins: "" });
    h.requestSession();
    expect(posted.some((p) => (p.msg as { type: string }).type === REQUEST_SESSION)).toBe(true);
    h.dispose();
    fire({ origin: HUB, data: validPayload() });
    expect(setSession).not.toHaveBeenCalled();
  });
});
