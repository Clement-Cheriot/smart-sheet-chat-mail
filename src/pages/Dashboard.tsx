import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Mail, Settings, BarChart3, Webhook } from 'lucide-react';
import { EmailHistory } from '@/components/dashboard/EmailHistory';
import { ApiConfiguration } from '@/components/dashboard/ApiConfiguration';
import { EmailRules } from '@/components/dashboard/EmailRules';
import { WebhookTester } from '@/components/dashboard/WebhookTester';

const Dashboard = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
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
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Email Manager AI</h1>
            <p className="text-sm text-muted-foreground">Dashboard Client</p>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="emails" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto">
            <TabsTrigger value="emails">
              <Mail className="mr-2 h-4 w-4" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="rules">
              <Settings className="mr-2 h-4 w-4" />
              Règles
            </TabsTrigger>
            <TabsTrigger value="config">
              <BarChart3 className="mr-2 h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Webhook className="mr-2 h-4 w-4" />
              Webhooks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="emails" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Historique des emails traités</CardTitle>
                <CardDescription>
                  Consultez tous les emails analysés et traités par l'IA
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmailHistory />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Règles de traitement</CardTitle>
                <CardDescription>
                  Gérez vos règles d'automatisation des emails
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmailRules />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configuration API</CardTitle>
                <CardDescription>
                  Configurez vos clés API pour WhatsApp, Gmail et Google Sheets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApiConfiguration />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <WebhookTester />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
