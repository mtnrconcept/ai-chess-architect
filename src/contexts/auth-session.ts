import type { Session, User } from "@supabase/supabase-js";

export type SettledAuthSession = {
  session: Session | null;
  user: User | null;
  loading: false;
};

type SessionLookupResult = {
  data: {
    session: Session | null;
  };
  error?: unknown;
};

type SettleInitialAuthSessionOptions = {
  readSession: () => Promise<SessionLookupResult>;
  isMounted: () => boolean;
  apply: (state: SettledAuthSession) => void;
  onError?: (error: unknown) => void;
};

/**
 * Settles the initial authentication lookup exactly once while mounted.
 * A rejected or explicitly failed lookup is treated as unauthenticated, never
 * as an endless loading state.
 */
export async function settleInitialAuthSession({
  readSession,
  isMounted,
  apply,
  onError,
}: SettleInitialAuthSessionOptions): Promise<void> {
  let session: Session | null = null;

  try {
    const result = await readSession();
    if (result.error) {
      throw result.error;
    }
    session = result.data.session ?? null;
  } catch (error) {
    onError?.(error);
  } finally {
    if (isMounted()) {
      apply({
        session,
        user: session?.user ?? null,
        loading: false,
      });
    }
  }
}
