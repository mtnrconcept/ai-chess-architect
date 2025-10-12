import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  supabaseDiagnostics,
  type SupabaseDiagnostics,
} from '@/integrations/supabase/client';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fallbackAuthContextValue: AuthContextValue = {
  user: null,
  loading: false,
  signOut: async () => {
    throw new Error("Supabase n'est pas configuré : impossible de se déconnecter.");
  },
  refreshUser: async () => {
    throw new Error("Supabase n'est pas configuré : impossible de rafraîchir l'utilisateur.");
  },
};

type MissingSupabaseConfigProps = {
  diagnostics: SupabaseDiagnostics;
};

const MissingSupabaseConfig = ({ diagnostics }: MissingSupabaseConfigProps) => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 py-12 text-center">
    <div className="max-w-xl space-y-4">
      <h1 className="text-3xl font-semibold text-destructive">Configuration Supabase manquante</h1>
      <p className="text-muted-foreground">
        Aucune instance Supabase n'est configurée pour cet environnement. Renseigne les variables
        <code className="mx-1 rounded bg-muted px-2 py-0.5">VITE_SUPABASE_URL</code>
        (ou <code className="mx-1 rounded bg-muted px-2 py-0.5">SUPABASE_URL</code>) et une clé
        <code className="mx-1 rounded bg-muted px-2 py-0.5">VITE_SUPABASE_ANON_KEY</code>
        ou
        <code className="mx-1 rounded bg-muted px-2 py-0.5">VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</code>
        (ou leurs équivalents <code className="mx-1 rounded bg-muted px-2 py-0.5">SUPABASE_ANON_KEY</code> /{' '}
        <code className="mx-1 rounded bg-muted px-2 py-0.5">SUPABASE_PUBLISHABLE_DEFAULT_KEY</code>) dans Lovable puis relance le déploiement.
      </p>
      {diagnostics.problems.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-left text-sm">
          <p className="mb-2 font-medium text-destructive">Problèmes détectés :</p>
          <ul className="list-disc space-y-1 pl-5 text-destructive">
            {diagnostics.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Projet détecté :{' '}
        <code className="rounded bg-muted px-1 py-0.5">
          {diagnostics.projectId ?? 'inconnu'}
        </code>{' '}
        • URL brute :{' '}
        <code className="rounded bg-muted px-1 py-0.5">
          {diagnostics.rawUrl ?? 'non fournie'}
        </code>
      </p>
    </div>
  </div>
);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  if (!isSupabaseConfigured || !supabase) {
    return (
      <AuthContext.Provider value={fallbackAuthContextValue}>
        <MissingSupabaseConfig diagnostics={supabaseDiagnostics} />
      </AuthContext.Provider>
    );
  }

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const {
        data: { user: initialUser }
      } = await supabase.auth.getUser();

      if (isMounted) {
        setUser(initialUser);
        setLoading(false);
      }
    };

    loadUser();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  };

  const refreshUser = async () => {
    setLoading(true);
    const {
      data: { user: refreshedUser }
    } = await supabase.auth.getUser();
    setUser(refreshedUser ?? null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut: handleSignOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
