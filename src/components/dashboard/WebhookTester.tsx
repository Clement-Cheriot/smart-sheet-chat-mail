import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Play, Copy, RefreshCw } from 'lucide-react';

export const WebhookTester = () => {
  const [testEmail, setTestEmail] = useState({
    sender: 'test@example.com',
    subject: 'Test urgent',
    body: 'Ceci est un email de test urgent qui nécessite une attention immédiate.',
  });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-processor`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: 'URL copiée',
      description: 'L\'URL du webhook a été copiée dans le presse-papiers',
    });
  };

  const testEmailProcessor = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('email-processor', {
        body: {
          userId: user?.id,
          messageId: `test_${Date.now()}`,
          sender: testEmail.sender,
          subject: testEmail.subject,
          body: testEmail.body,
          receivedAt: new Date().toISOString(),
        }
      });

      if (error) throw error;

      setResult(data);
      toast({
        title: 'Test réussi !',
        description: 'L\'email a été traité avec succès',
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const syncRules = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('sync-sheets-rules', {
        body: { userId: user?.id }
      });

      if (error) throw error;

      toast({
        title: 'Synchronisation réussie',
        description: `${data.syncedRules} règles ont été synchronisées`,
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const syncEmails = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('gmail-sync', {
        body: { userId: user?.id }
      });

      if (error) throw error;

      toast({
        title: 'Synchronisation réussie',
        description: `${data.processedCount} nouveaux emails ont été traités`,
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>URL du Webhook Gmail</CardTitle>
          <CardDescription>
            Utilisez cette URL pour configurer votre webhook Gmail
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-sm" />
            <Button onClick={copyWebhookUrl} variant="outline" size="icon">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm space-y-2">
            <p className="font-medium">Instructions :</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Configurez votre webhook Gmail avec cette URL</li>
              <li>Les emails seront automatiquement traités en temps réel</li>
              <li>Vérifiez l'onglet "Emails" pour voir les résultats</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tester le traitement d'email</CardTitle>
          <CardDescription>
            Simulez la réception d'un email pour tester le système
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="test-sender">Expéditeur</Label>
            <Input
              id="test-sender"
              value={testEmail.sender}
              onChange={(e) => setTestEmail({ ...testEmail, sender: e.target.value })}
              placeholder="sender@example.com"
            />
          </div>

          <div>
            <Label htmlFor="test-subject">Sujet</Label>
            <Input
              id="test-subject"
              value={testEmail.subject}
              onChange={(e) => setTestEmail({ ...testEmail, subject: e.target.value })}
              placeholder="Sujet de l'email"
            />
          </div>

          <div>
            <Label htmlFor="test-body">Corps de l'email</Label>
            <Textarea
              id="test-body"
              value={testEmail.body}
              onChange={(e) => setTestEmail({ ...testEmail, body: e.target.value })}
              placeholder="Contenu de l'email..."
              rows={4}
            />
          </div>

          <Button onClick={testEmailProcessor} disabled={testing} className="w-full">
            <Play className="mr-2 h-4 w-4" />
            {testing ? 'Test en cours...' : 'Tester le traitement'}
          </Button>

          {result && (
            <div className="p-4 bg-success/10 border border-success rounded-lg">
              <p className="font-medium mb-2">Résultat du test :</p>
              <div className="text-sm space-y-1">
                <p>✅ Email traité avec succès</p>
                {result.appliedLabel && <p>🏷️ Label: {result.appliedLabel}</p>}
                {result.priorityScore && <p>📊 Priorité: {result.priorityScore}/10</p>}
                {result.draftCreated && <p>📝 Brouillon créé</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Synchronisation Google Sheets</CardTitle>
          <CardDescription>
            Importez vos règles depuis Google Sheets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={syncRules} variant="outline" className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            Synchroniser les règles
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Format: rule_id | classification | priority | enables | conditions | description
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Récupération des emails</CardTitle>
          <CardDescription>
            Synchronisez vos derniers emails Gmail
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={syncEmails} variant="outline" className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            Récupérer les nouveaux emails
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Les emails seront traités et ajoutés à l'historique
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
