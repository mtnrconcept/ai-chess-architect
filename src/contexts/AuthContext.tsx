import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  supabase,
  isSupabaseConfigured,
  supabaseDiagnostics,
  type SupabaseDiagnostics,
} from "@/integrations/supabase/client";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fallbackAuthContextValue: AuthContextValue = {
  user: null,
  session: null,
  loading: false,
  signOut: async () => {
    throw new Error(
      "Supabase n'est pas configuré : impossible de se déconnecter.",
    );
  },
  refreshUser: async () => {
    throw new Error(
      "Supabase n'est pas configuré : impossible de rafraîchir l'utilisateur.",
    );
  },
};

type MissingSupabaseConfigProps = {
  diagnostics: SupabaseDiagnostics;
};

const MissingSupabaseConfig = ({ diagnostics }: MissingSupabaseConfigProps) => (
  <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 overflow-x-hidden bg-background px-6 py-12 text-center">
    <div className="w-full min-w-0 max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold text-destructive sm:text-3xl">
        Configuration Supabase manquante
      </h1>
      <p className="text-muted-foreground">
        Aucune instance Supabase n'est configurée pour cet environnement.
        Renseigne les variables
        <code className="mx-1 inline-block max-w-full rounded bg-muted px-2 py-0.5 [overflow-wrap:anywhere]">
          VITE_SUPABASE_URL
        </code>
        et une clé publique
        <code className="mx-1 inline-block max-w-full rounded bg-muted px-2 py-0.5 [overflow-wrap:anywhere]">
          VITE_SUPABASE_PUBLISHABLE_KEY
        </code>
        ou
        <code className="mx-1 inline-block max-w-full rounded bg-muted px-2 py-0.5 [overflow-wrap:anywhere]">
          VITE_SUPABASE_ANON_KEY
        </code>
        dans l'environnement Vercel ciblé, puis reconstruis le déploiement. Une
        clé
        <code className="mx-1 inline-block max-w-full rounded bg-muted px-2 py-0.5 [overflow-wrap:anywhere]">
          service_role
        </code>
        ou{" "}
        <code className="mx-1 inline-block max-w-full rounded bg-muted px-2 py-0.5 [overflow-wrap:anywhere]">
          sb_secret_…
        </code>
        est volontairement refusée dans le navigateur.
      </p>
      {diagnostics.problems.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-left text-sm">
          <p className="mb-2 font-medium text-destructive">
            Problèmes détectés :
          </p>
          <ul className="list-disc space-y-1 break-words pl-5 text-destructive">
            {diagnostics.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="break-words text-xs text-muted-foreground">
        Projet détecté :{" "}
        <code className="max-w-full rounded bg-muted px-1 py-0.5 [overflow-wrap:anywhere]">
          {diagnostics.projectId ?? "inconnu"}
        </code>{" "}
        • URL brute :{" "}
        <code className="max-w-full rounded bg-muted px-1 py-0.5 [overflow-wrap:anywhere]">
          {diagnostics.rawUrl ?? "non fournie"}
        </code>
      </p>
    </div>
  </div>
);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const shouldRenderFallback = !isSupabaseConfigured || !supabase;

  useEffect(() => {
    if (shouldRenderFallback || !supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadUser = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setSession(initialSession ?? null);
      setUser(initialSession?.user ?? null);
      setLoading(false);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session ?? null);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [shouldRenderFallback]);

  if (shouldRenderFallback) {
    return (
      <AuthContext.Provider value={fallbackAuthContextValue}>
        <MissingSupabaseConfig diagnostics={supabaseDiagnostics} />
      </AuthContext.Provider>
    );
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  };

  const refreshUser = async () => {
    setLoading(true);
    const {
      data: { session: refreshedSession },
    } = await supabase.auth.getSession();
    setSession(refreshedSession ?? null);
    setUser(refreshedSession?.user ?? null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, loading, signOut: handleSignOut, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Hook colocated with the provider to preserve the public module API.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
