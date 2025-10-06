import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Library, PlayCircle, Crown, UserCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-5xl w-full text-center space-y-8">
          {/* Icon & Title */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Crown className="text-primary" size={64} />
              <h1 className="text-6xl md:text-7xl font-bold bg-gradient-gold bg-clip-text text-transparent">
                Chess Rules Engine
              </h1>
            </div>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              Créez et jouez avec des règles d'échecs personnalisées alimentées par l'IA
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link to="/generator">
              <Button variant="premium" size="lg" className="text-lg px-8 py-6">
                <Sparkles size={24} />
                Générateur de Règles
              </Button>
            </Link>

            <Link to="/lobby">
              <Button variant="gold" size="lg" className="text-lg px-8 py-6">
                <Library size={24} />
                Lobby des Règles
              </Button>
            </Link>

            <Link to="/play">
              <Button variant="secondary" size="lg" className="text-lg px-8 py-6">
                <PlayCircle size={24} />
                Jouer
              </Button>
            </Link>

            <Link to={user ? '/profile' : '/signup'}>
              <Button variant="outline" size="lg" className="text-lg px-8 py-6">
                <UserCircle size={24} />
                {user ? 'Mon Profil' : "Créer un compte"}
              </Button>
            </Link>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="bg-card border border-border rounded-xl p-6 space-y-3">
              <Sparkles className="text-primary mx-auto" size={40} />
              <h3 className="text-xl font-bold">IA Générative</h3>
              <p className="text-muted-foreground">
                Décrivez votre règle et laissez l'IA la créer pour vous
              </p>
            </div>
            
            <div className="bg-card border border-border rounded-xl p-6 space-y-3">
              <Library className="text-accent mx-auto" size={40} />
              <h3 className="text-xl font-bold">40 Règles Préinstallées</h3>
              <p className="text-muted-foreground">
                Mouvements, attaques, défenses et comportements uniques
              </p>
            </div>
            
            <div className="bg-card border border-border rounded-xl p-6 space-y-3">
              <PlayCircle className="text-secondary mx-auto" size={40} />
              <h3 className="text-xl font-bold">Échiquier Interactif</h3>
              <p className="text-muted-foreground">
                Jouez avec vos règles personnalisées en temps réel
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="p-6 text-center text-muted-foreground border-t border-border">
        <p>Propulsé par Lovable Cloud & Lovable AI</p>
      </footer>
    </div>
  );
};

export default Index;
