import { useEffect, useRef } from "react";
import {
  createHubSession,
  type CreateHubSessionOptions,
  type HubSessionHandle,
} from "./hubSession";

/**
 * React wrapper for {@link createHubSession}. Starts the Hub session handoff on
 * mount and tears it down on unmount; inert when standalone. Returns a stable
 * `requestSession()` for reconnect (call it from an AuthGate "Retry"/refocus).
 *
 * Mount this ABOVE your AuthGate so the SET_SESSION listener is live before auth
 * resolves. Options are read once on mount (pass a stable `setSession`, e.g.
 * `(t) => supabase.auth.setSession(t)`).
 */
export function useHubSession(opts: CreateHubSessionOptions): { requestSession: () => void } {
  const handleRef = useRef<HubSessionHandle | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const handle = createHubSession({
      ...optsRef.current,
      setSession: (t) => optsRef.current.setSession(t),
      onSession: (p) => optsRef.current.onSession?.(p),
    });
    handleRef.current = handle;
    return () => {
      handle.dispose();
      handleRef.current = null;
    };
    // Start once on mount; latest callbacks are read via optsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { requestSession: () => handleRef.current?.requestSession() };
}
