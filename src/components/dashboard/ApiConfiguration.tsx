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
    whatsapp_api_token: '',
    whatsapp_phone_number_id: '',
    whatsapp_recipient_number: '',
    google_sheets_id: '',
    whatsapp_threshold: 8,
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
        .select('whatsapp_api_token, whatsapp_phone_number_id, whatsapp_recipient_number, google_sheets_id, whatsapp_threshold')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setConfig({
          whatsapp_api_token: data.whatsapp_api_token || '',
          whatsapp_phone_number_id: data.whatsapp_phone_number_id || '',
          whatsapp_recipient_number: data.whatsapp_recipient_number || '',
          google_sheets_id: data.google_sheets_id || '',
          whatsapp_threshold: data.whatsapp_threshold || 8,
        });
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const testWhatsApp = async (sendTest: boolean = false) => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-healthcheck', {
        body: {
          userId: user?.id,
          sendTest,
        },
      });

      if (error) throw error;

      setTestResult(data);
      
      if (data.valid) {
        toast({
          title: '✅ WhatsApp valide',
          description: sendTest 
            ? 'Configuration valide et message test envoyé !' 
            : 'Configuration validée avec succès',
        });
      } else {
        toast({
          title: '❌ Erreur WhatsApp',
          description: data.error || 'Configuration invalide',
          variant: 'destructive',
        });
      }
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

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_api_configs')
        .upsert({
          user_id: user?.id,
          ...config,
        }, {
          onConflict: 'user_id'
        });

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
          <Label htmlFor="whatsapp-token">WhatsApp API Token</Label>
          <div className="flex gap-2 mt-2">
            <Input
              id="whatsapp-token"
              type={showTokens ? 'text' : 'password'}
              value={config.whatsapp_api_token}
              onChange={(e) => setConfig({ ...config, whatsapp_api_token: e.target.value })}
              placeholder="Votre token WhatsApp Business API"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowTokens(!showTokens)}
            >
              {showTokens ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="whatsapp-phone">WhatsApp Phone Number ID</Label>
          <Input
            id="whatsapp-phone"
            value={config.whatsapp_phone_number_id}
            onChange={(e) => setConfig({ ...config, whatsapp_phone_number_id: e.target.value })}
            placeholder="ID du numéro de téléphone"
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor="whatsapp-recipient">Numéro WhatsApp destinataire</Label>
          <Input
            id="whatsapp-recipient"
            value={config.whatsapp_recipient_number}
            onChange={(e) => setConfig({ ...config, whatsapp_recipient_number: e.target.value })}
            placeholder="+33612345678"
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Format international avec le +, ex: +33612345678
          </p>
        </div>

        <div>
          <Label htmlFor="whatsapp-threshold">Seuil d'urgence WhatsApp (1-10)</Label>
          <Input
            id="whatsapp-threshold"
            type="number"
            min="1"
            max="10"
            value={config.whatsapp_threshold}
            onChange={(e) => setConfig({ ...config, whatsapp_threshold: parseInt(e.target.value) || 8 })}
            className="mt-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Recevoir une alerte WhatsApp si la priorité de l'email est ≥ ce seuil (défaut: 8)
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
        
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => testWhatsApp(false)} disabled={testing} variant="outline">
            {testing ? 'Test...' : 'Vérifier WhatsApp'}
          </Button>
          <Button onClick={() => testWhatsApp(true)} disabled={testing} variant="outline">
            {testing ? 'Envoi...' : 'Tester avec message'}
          </Button>
        </div>
      </div>

      {testResult && (
        <div className={`p-4 rounded-lg ${testResult.valid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <p className={`text-sm font-medium ${testResult.valid ? 'text-green-900' : 'text-red-900'}`}>
            {testResult.valid ? '✅ Configuration valide' : '❌ Configuration invalide'}
          </p>
          {testResult.details && (
            <div className="mt-2 text-xs text-muted-foreground">
              <p>Numéro: {testResult.details.display_phone_number}</p>
              <p>Nom vérifié: {testResult.details.verified_name}</p>
              <p>Qualité: {testResult.details.quality_rating}</p>
            </div>
          )}
          {testResult.testResult && (
            <p className="mt-2 text-xs">
              {testResult.testResult.success 
                ? `✅ Message test envoyé (ID: ${testResult.testResult.messageId})` 
                : `❌ Échec envoi test: ${testResult.testResult.error}`}
            </p>
          )}
          {testResult.error && (
            <p className="mt-2 text-xs text-red-700">{testResult.error}</p>
          )}
        </div>
      )}

      <div className="bg-muted/50 p-4 rounded-lg space-y-2">
        <p className="text-sm font-medium">Note importante :</p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>Gmail OAuth sera configuré via les webhooks Gmail</li>
          <li>Vos clés sont stockées de manière sécurisée et chiffrée</li>
          <li>Vous recevrez des alertes WhatsApp uniquement si configuré</li>
        </ul>
      </div>
    </div>
  );
};
