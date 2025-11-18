import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LogOut, Mail, Settings, BarChart3 } from 'lucide-react';
import { EmailHistory } from '@/components/dashboard/EmailHistory';
import { ApiConfiguration } from '@/components/dashboard/ApiConfiguration';
import { EmailRules } from '@/components/dashboard/EmailRules';
import { GmailConnect } from '@/components/dashboard/GmailConnect';
import { EmailSummary } from '@/components/dashboard/EmailSummary';
import { AiAgentConfig } from '@/components/dashboard/AiAgentConfig';
import { SignatureRules } from '@/components/dashboard/SignatureRules';
import { DraftRules } from '@/components/dashboard/DraftRules';
import { AutoResponseRules } from '@/components/dashboard/AutoResponseRules';
import { CalendarRules } from '@/components/dashboard/CalendarRules';
import { ContactRules } from '@/components/dashboard/ContactRules';
import { GroupBasedRules } from '@/components/dashboard/GroupBasedRules';

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
          <TabsList className="flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="emails">Emails</TabsTrigger>
            <TabsTrigger value="summary">Résumés</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
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

          <TabsContent value="summary" className="space-y-6">
            <EmailSummary />
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>
                  Gérez toutes vos configurations et règles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="gmail" className="space-y-6">
                  <TabsList className="flex flex-wrap gap-1 h-auto">
                    <TabsTrigger value="gmail">Gmail</TabsTrigger>
                    <TabsTrigger value="rules">Règles Label</TabsTrigger>
                    <TabsTrigger value="signatures">Signatures</TabsTrigger>
                    <TabsTrigger value="drafts">Brouillons</TabsTrigger>
                    <TabsTrigger value="auto-response">Réponses Auto</TabsTrigger>
                    <TabsTrigger value="calendar">Calendrier</TabsTrigger>
                    <TabsTrigger value="contacts">Contacts</TabsTrigger>
                    <TabsTrigger value="ai">Agent IA</TabsTrigger>
                    <TabsTrigger value="api">API/Token</TabsTrigger>
                  </TabsList>

                  <TabsContent value="gmail" className="space-y-4">
                    <GmailConnect />
                  </TabsContent>

                  <TabsContent value="rules" className="space-y-4">
                    <EmailRules />
                  </TabsContent>

                  <TabsContent value="signatures" className="space-y-4">
                    <SignatureRules />
                  </TabsContent>

                  <TabsContent value="drafts" className="space-y-4">
                    <DraftRules />
                  </TabsContent>

                  <TabsContent value="auto-response" className="space-y-4">
                    <AutoResponseRules />
                  </TabsContent>

                  <TabsContent value="calendar" className="space-y-4">
                    <CalendarRules />
                  </TabsContent>

                  <TabsContent value="contacts" className="space-y-4">
                    <GroupBasedRules />
                    <ContactRules />
                  </TabsContent>

                  <TabsContent value="ai" className="space-y-4">
                    <AiAgentConfig />
                  </TabsContent>

                  <TabsContent value="api" className="space-y-4">
                    <ApiConfiguration />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;
