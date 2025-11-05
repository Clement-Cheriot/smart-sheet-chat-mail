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
    google_sheets_id: '',
    telegram_threshold: 8,
  });
  const [showTokens, setShowTokens] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
        .select('telegram_bot_token, telegram_chat_id, google_sheets_id, telegram_threshold')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setConfig({
          telegram_bot_token: data.telegram_bot_token || '',
          telegram_chat_id: data.telegram_chat_id || '',
          google_sheets_id: data.google_sheets_id || '',
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

        <div>
          <Label htmlFor="sheets-id">Google Sheets ID</Label>
          <Input
            id="sheets-id"
            value={config.google_sheets_id}
            onChange={(e) => setConfig({ ...config, google_sheets_id: e.target.value })}
            placeholder="ID de votre Google Sheet avec les règles"
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            L'ID se trouve dans l'URL de votre Google Sheet
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Button onClick={saveConfig} disabled={saving} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Sauvegarde...' : 'Sauvegarder la configuration'}
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
        <p className="text-sm font-medium">⚠️ Configuration Telegram (à suivre dans l'ordre) :</p>
        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Créez un bot avec @BotFather et obtenez le token</li>
          <li>Obtenez votre Chat ID avec @userinfobot</li>
          <li className="font-semibold text-foreground">IMPORTANT : Cherchez votre bot sur Telegram et envoyez-lui /start</li>
          <li>Sauvegardez la configuration ci-dessus</li>
          <li>Testez avec le bouton "Tester Telegram"</li>
        </ol>
        <p className="text-xs text-destructive mt-2">
          Si vous avez "chat not found", c'est que vous n'avez pas fait l'étape 3 !
        </p>
      </div>
    </div>
  );
};
