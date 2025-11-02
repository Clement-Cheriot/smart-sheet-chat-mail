import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Mail, Zap, Shield, BarChart } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Email Manager AI</h1>
          <Button onClick={() => navigate('/auth')}>
            Se connecter
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-5xl font-bold tracking-tight">
              Gérez vos emails avec l'IA
            </h2>
            <p className="text-xl text-muted-foreground">
              Automatisez le tri, la priorisation et les réponses de vos emails via WhatsApp
            </p>
          </div>

          <div className="flex justify-center gap-4">
            <Button size="lg" onClick={() => navigate('/auth')}>
              Commencer gratuitement
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/auth')}>
              En savoir plus
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
            <div className="p-6 bg-card border rounded-lg">
              <Mail className="h-8 w-8 text-primary mb-4" />
              <h3 className="font-semibold mb-2">Analyse intelligente</h3>
              <p className="text-sm text-muted-foreground">
                L'IA analyse et classe automatiquement vos emails
              </p>
            </div>

            <div className="p-6 bg-card border rounded-lg">
              <Zap className="h-8 w-8 text-accent mb-4" />
              <h3 className="font-semibold mb-2">Actions automatiques</h3>
              <p className="text-sm text-muted-foreground">
                Règles personnalisables pour automatiser le traitement
              </p>
            </div>

            <div className="p-6 bg-card border rounded-lg">
              <Shield className="h-8 w-8 text-success mb-4" />
              <h3 className="font-semibold mb-2">WhatsApp intégré</h3>
              <p className="text-sm text-muted-foreground">
                Recevez des alertes et résumés directement sur WhatsApp
              </p>
            </div>

            <div className="p-6 bg-card border rounded-lg">
              <BarChart className="h-8 w-8 text-warning mb-4" />
              <h3 className="font-semibold mb-2">Dashboard complet</h3>
              <p className="text-sm text-muted-foreground">
                Suivez et gérez tous vos emails en un seul endroit
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
