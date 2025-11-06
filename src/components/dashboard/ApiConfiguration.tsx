import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Save, Eye, EyeOff } from 'lucide-react';

export const ApiConfiguration = () => {
  const [config, setConfig] = useState({
    telegram_bot_token: '',
    telegram_chat_id: '',
    telegram_threshold: 8,
  });
  const [showTokens, setShowTokens] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('user_api_configs')
        .select('telegram_bot_token, telegram_chat_id, telegram_threshold')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setConfig({
          telegram_bot_token: data.telegram_bot_token || '',
          telegram_chat_id: data.telegram_chat_id || '',
          telegram_threshold: data.telegram_threshold || 8,
        });
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const testTelegram = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-sender', {
        body: {
          userId: user?.id,
          message: '🤖 Test de configuration Telegram réussi !',
        },
      });

      if (error) throw error;

      toast({
        title: '✅ Telegram OK',
        description: 'Message test envoyé avec succès',
      });
      setTestResult({ valid: true });
    } catch (error: any) {
      toast({
        title: '❌ Erreur Telegram',
        description: error.message || 'Configuration invalide',
        variant: 'destructive',
      });
      setTestResult({ valid: false, error: error.message });
    } finally {
      setTesting(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_api_configs')
        .upsert(
          {
            user_id: user?.id,
            ...config,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      toast({
        title: 'Configuration sauvegardée',
        description: 'Vos clés API ont été mises à jour avec succès.',
      });
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const setupWebhook = async () => {
    if (!config.telegram_bot_token) {
      toast({
        title: 'Configuration manquante',
        description: 'Veuillez d\'abord sauvegarder votre token Telegram',
        variant: 'destructive',
      });
      return;
    }

    setSettingWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke('telegram-webhook-setup', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) throw error;

      toast({
        title: '✅ Webhook configuré',
        description: 'Votre bot peut maintenant recevoir des commandes',
      });
    } catch (error: any) {
      toast({
        title: '❌ Erreur webhook',
        description: error.message || 'Impossible de configurer le webhook',
        variant: 'destructive',
      });
    } finally {
      setSettingWebhook(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="telegram-token">Telegram Bot Token</Label>
          <div className="flex gap-2 mt-2">
            <Input
              id="telegram-token"
              type={showTokens ? 'text' : 'password'}
              value={config.telegram_bot_token}
              onChange={(e) => setConfig({ ...config, telegram_bot_token: e.target.value })}
              placeholder="Votre token de bot Telegram (de @BotFather)"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowTokens(!showTokens)}
            >
              {showTokens ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Créez un bot avec @BotFather sur Telegram pour obtenir le token
          </p>
        </div>

        <div>
          <Label htmlFor="telegram-chat">Telegram Chat ID</Label>
          <Input
            id="telegram-chat"
            value={config.telegram_chat_id}
            onChange={(e) => setConfig({ ...config, telegram_chat_id: e.target.value })}
            placeholder="Votre Chat ID (obtenez-le avec @userinfobot)"
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Utilisez @userinfobot sur Telegram pour obtenir votre Chat ID
          </p>
        </div>

        <div>
          <Label htmlFor="telegram-threshold">Seuil d'urgence Telegram (1-10)</Label>
          <Input
            id="telegram-threshold"
            type="number"
            min="1"
            max="10"
            value={config.telegram_threshold}
            onChange={(e) => setConfig({ ...config, telegram_threshold: parseInt(e.target.value) || 8 })}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Recevoir une alerte Telegram si la priorité de l'email est ≥ ce seuil (défaut: 8)
          </p>
        </div>

      </div>

      <div className="grid grid-cols-1 gap-2">
        <Button onClick={saveConfig} disabled={saving} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Sauvegarde...' : 'Sauvegarder la configuration'}
        </Button>
        
        <Button onClick={setupWebhook} disabled={settingWebhook || !config.telegram_bot_token} variant="secondary" className="w-full">
          {settingWebhook ? 'Configuration...' : '🔗 Configurer le webhook automatiquement'}
        </Button>
        
        <Button onClick={testTelegram} disabled={testing} variant="outline" className="w-full">
          {testing ? 'Test...' : 'Tester Telegram (envoie un message)'}
        </Button>
      </div>

      {testResult && (
        <div className={`p-4 rounded-lg ${testResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <p className={`text-sm font-medium ${testResult.valid ? 'text-green-900' : 'text-red-900'}`}>
            {testResult.valid ? '✅ Configuration valide - Message test envoyé' : '❌ Configuration invalide'}
          </p>
          {testResult.error && (
            <p className="mt-2 text-xs text-red-700">{testResult.error}</p>
          )}
        </div>
      )}

      <div className="bg-muted/50 p-4 rounded-lg space-y-2">
        <p className="text-sm font-medium">📱 Configuration du bot Telegram :</p>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">1. Créer votre bot :</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Cherchez @BotFather sur Telegram</li>
              <li>• Envoyez /newbot</li>
              <li>• Donnez un nom (ex: "Mon Assistant Email")</li>
              <li>• Donnez un username (ex: "mon_assistant_email_bot")</li>
              <li>• <span className="font-semibold text-foreground">Récupérez le token</span> (ex: 123456:ABC-DEF...)</li>
            </ul>
          </div>
          
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">2. Obtenir votre Chat ID :</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Cherchez @userinfobot sur Telegram</li>
              <li>• Envoyez /start</li>
              <li>• <span className="font-semibold text-foreground">Récupérez votre Chat ID</span> (ex: 123456789)</li>
            </ul>
          </div>
          
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">3. Activer votre bot :</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li className="font-semibold text-destructive">• IMPORTANT : Cherchez votre bot sur Telegram et envoyez-lui /start</li>
            </ul>
          </div>
          
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">4. Sauvegarder et tester :</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Remplissez le token et Chat ID ci-dessus</li>
              <li>• Cliquez sur "Sauvegarder la configuration"</li>
              <li>• Cliquez sur "Tester Telegram" pour vérifier</li>
            </ul>
          </div>
          
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">5. Configurer le webhook (pour les commandes) :</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4">
              <li>• Cliquez sur le bouton "🔗 Configurer le webhook automatiquement" ci-dessus</li>
              <li>• Cela permettra à votre bot de recevoir et répondre aux commandes</li>
              <li>• Commandes disponibles :</li>
              <li className="ml-4">• <code className="text-xs bg-background p-1 rounded">résumé</code> - Résumé des dernières 24h</li>
              <li className="ml-4">• <code className="text-xs bg-background p-1 rounded">résumé 3 jours</code> - Résumé des 3 derniers jours</li>
              <li className="ml-4">• <code className="text-xs bg-background p-1 rounded">résumé 1 semaine</code> - Résumé de la dernière semaine</li>
              <li className="ml-4">• <code className="text-xs bg-background p-1 rounded">résumé 48h</code> - Résumé des 48 dernières heures</li>
              <li className="ml-4">• <code className="text-xs bg-background p-1 rounded">/help</code> - Afficher l'aide</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-destructive mt-2">
          ⚠️ Si vous avez "chat not found", c'est que vous n'avez pas fait l'étape 3 !
        </p>
      </div>
    </div>
  );
};
