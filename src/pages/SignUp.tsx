import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { z } from 'zod';

type AuthFormErrors = Partial<Record<'email' | 'password' | 'confirmPassword', string>>;

const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .regex(/[A-Z]/, 'Incluez au moins une lettre majuscule dans votre mot de passe.')
  .regex(/[a-z]/, 'Incluez au moins une lettre minuscule dans votre mot de passe.')
  .regex(/\d/, 'Incluez au moins un chiffre dans votre mot de passe.')
  .regex(/[^A-Za-z0-9]/, 'Incluez au moins un caractère spécial.');

const signInSchema = z.object({
  email: z.string().trim().email('Veuillez fournir une adresse e-mail valide.'),
  password: passwordSchema,
});

const signUpSchema = signInSchema
  .extend({
    confirmPassword: z
      .string()
      .min(1, 'La confirmation du mot de passe est requise.'),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Les mots de passe ne correspondent pas.',
      });
    }
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
  const [errors, setErrors] = useState<AuthFormErrors>({});

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
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) return;

    if (mode === 'signup') {
      const result = signUpSchema.safeParse({ email, password, confirmPassword });
      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        setErrors({
          email: fieldErrors.email?.[0],
          password: fieldErrors.password?.[0],
          confirmPassword: fieldErrors.confirmPassword?.[0],
        });
        return;
      }
      setErrors({});

      setLoading(true);

      try {
        const { error } = await supabase.auth.signUp({
          email: result.data.email,
          password: result.data.password,
        });

        if (error) throw error;

        toast({
          title: 'Compte créé !',
          description: "Vous êtes maintenant connecté et pouvez créer vos règles.",
        });
        resetForm();
        navigate('/profile');
      } catch (error) {
        console.error('Auth error:', error);
        const message = error instanceof Error ? error.message : "Impossible de terminer l'opération.";
        toast({
          title: 'Une erreur est survenue',
          description: message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }

      return;
    }

    const result = signInSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      });
      return;
    }
    setErrors({});

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      });

      if (error) throw error;

      toast({
        title: 'Connexion réussie',
        description: 'Bon retour parmi nous !',
      });
      resetForm();
      navigate('/generator');
    } catch (error) {
      console.error('Auth error:', error);
      const message = error instanceof Error ? error.message : "Impossible de terminer l'opération.";
      toast({
        title: 'Une erreur est survenue',
        description: message,
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
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (errors.email) {
                    setErrors(prev => ({ ...prev, email: undefined }));
                  }
                }}
                placeholder="nom@example.com"
                required
                aria-invalid={errors.email ? 'true' : 'false'}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email}
                </p>
              )}
            </div>
            <div className="space-y-2 text-left">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (errors.password) {
                    setErrors(prev => ({ ...prev, password: undefined }));
                  }
                }}
                placeholder="••••••••"
                required
                aria-invalid={errors.password ? 'true' : 'false'}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password}
                </p>
              )}
            </div>
            {mode === 'signup' && (
              <div className="space-y-2 text-left">
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    if (errors.confirmPassword) {
                      setErrors(prev => ({ ...prev, confirmPassword: undefined }));
                    }
                  }}
                  placeholder="••••••••"
                  required
                  aria-invalid={errors.confirmPassword ? 'true' : 'false'}
                  aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                />
                {errors.confirmPassword && (
                  <p id="confirm-password-error" className="text-sm text-destructive">
                    {errors.confirmPassword}
                  </p>
                )}
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
                  onClick={() => {
                    setMode('signin');
                    setErrors({});
                  }}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Vous avez déjà un compte ? Connectez-vous
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrors({});
                  }}
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
