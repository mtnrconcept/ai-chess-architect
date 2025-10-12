import { FormEvent, useEffect, useState } from 'react';
import { z, type ZodIssue } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Une adresse e-mail est requise.')
  .max(254, "L'adresse e-mail est trop longue.")
  .email("Le format de l'adresse e-mail est invalide.")
  .transform(value => value.toLowerCase());

const strongPasswordSchema = z
  .string()
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
  .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères.')
  .refine(value => /[A-Z]/.test(value), 'Incluez au moins une lettre majuscule.')
  .refine(value => /[a-z]/.test(value), 'Incluez au moins une lettre minuscule.')
  .refine(value => /\d/.test(value), 'Incluez au moins un chiffre.')
  .refine(value => /[^A-Za-z0-9]/.test(value), 'Incluez au moins un caractère spécial.')
  .refine(value => value.trim() === value, 'Le mot de passe ne doit pas commencer ou se terminer par un espace.');

const confirmPasswordSchema = z
  .string()
  .min(1, 'La confirmation du mot de passe est requise.')
  .max(128, 'La confirmation du mot de passe est trop longue.');

const signUpSchema = z
  .object({
    email: emailSchema,
    password: strongPasswordSchema,
    confirmPassword: confirmPasswordSchema,
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Les mots de passe ne correspondent pas.',
        path: ['confirmPassword'],
      });
    }
  });

const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Le mot de passe est requis.')
    .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères.'),
});

const SignUp = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'signin') {
      setMode('signin');
    } else if (modeParam === 'signup') {
      setMode('signup');
    }
  }, [searchParams]);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    const presentValidationIssues = (issues: ZodIssue[]) => {
      const primaryIssue = issues[0];
      const description = primaryIssue?.message ?? 'Les informations fournies sont invalides.';
      toast({
        title: 'Validation requise',
        description,
        variant: 'destructive',
      });
    };

    let credentials: { email: string; password: string } | null = null;

    if (mode === 'signup') {
      const parsed = signUpSchema.safeParse({ email, password, confirmPassword });
      if (!parsed.success) {
        presentValidationIssues(parsed.error.issues);
        return;
      }

      credentials = { email: parsed.data.email, password: parsed.data.password };
    } else {
      const parsed = signInSchema.safeParse({ email, password });
      if (!parsed.success) {
        presentValidationIssues(parsed.error.issues);
        return;
      }

      credentials = parsed.data;
    }

    if (!credentials) {
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
        });

        if (error) {
          toast({
            title: 'Une erreur est survenue',
            description: error.message,
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: 'Compte créé !',
          description: "Vous êtes maintenant connecté et pouvez créer vos règles.",
        });
        resetForm();
        navigate('/profile');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (error) {
          toast({
            title: 'Une erreur est survenue',
            description: error.message,
            variant: 'destructive',
          });
          return;
        }

        toast({
          title: 'Connexion réussie',
          description: 'Bon retour parmi nous !',
        });
        resetForm();
        navigate('/generator');
      }
    } catch (error: unknown) {
      console.error('Auth fatal:', error);

      const envUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
      const description = /example\.com/i.test(envUrl)
        ? 'Mauvaise configuration Supabase (VITE_SUPABASE_URL = example.com). Corrige tes variables Lovable.'
        : error instanceof Error
        ? error.message
        : "Impossible de terminer l'opération.";

      toast({
        title: 'Une erreur est survenue',
        description,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card/80 backdrop-blur">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl">Vous êtes déjà connecté</CardTitle>
            <CardDescription>
              Accédez à votre profil pour gérer vos règles personnalisées.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button asChild variant="premium" className="w-full">
              <Link to="/profile">Aller vers mon profil</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/generator">Utiliser le générateur de règles</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-card/80 backdrop-blur">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
            {mode === 'signup' ? 'Créer un compte' : 'Se connecter'}
          </CardTitle>
          <CardDescription>
            {mode === 'signup'
              ? 'Accédez à toutes les fonctionnalités du générateur de règles.'
              : 'Reprenez la création de règles personnalisées.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-left">
              <Label htmlFor="email">Adresse e-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nom@example.com"
                required
              />
            </div>
            <div className="space-y-2 text-left">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {mode === 'signup' && (
              <div className="space-y-2 text-left">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" variant="premium" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Traitement...
                </>
              ) : mode === 'signup' ? (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Créer mon compte
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Me connecter
                </>
              )}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              {mode === 'signup' ? (
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Vous avez déjà un compte ? Connectez-vous
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Nouveau sur Chess Rules Engine ? Créez un compte
                </button>
              )}
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default SignUp;
