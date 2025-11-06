import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Bot, Save, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const DEFAULT_PROMPT = `Tu es un assistant de classification d'emails. Tu DOIS appliquer exactement 2 labels :
1. UN label de CATÉGORIE
2. UN label d'ACTION

Tu as accès à la database complète des règles avec :
- Label à appliquer
- Priorité
- Domaines expéditeurs
- Mots-clés
- Description (contient l'historique des feedbacks utilisateur)

Analyse l'email reçu et choisis les 2 labels les plus pertinents en te basant sur :
1. Correspondance domaine expéditeur
2. Présence mots-clés
3. Priorité du label
4. Feedbacks utilisateur dans les descriptions (éléments les plus récents = plus importants)

Sois précis et cohérent avec les apprentissages passés stockés dans les descriptions.`;

export const AiAgentConfig = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [originalPrompt, setOriginalPrompt] = useState(DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [corrections, setCorrections] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadConfig();
      loadCorrections();
    }
  }, [user]);

  const loadConfig = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_api_configs')
        .select('ai_system_prompt')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.ai_system_prompt) {
        setSystemPrompt(data.ai_system_prompt);
        setOriginalPrompt(data.ai_system_prompt);
      }
    } catch (error: any) {
      console.error('Error loading config:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const loadCorrections = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('email_history')
        .select('sender, subject, applied_label, label_validation_notes, rule_reinforcement_suggestion')
        .eq('user_id', user.id)
        .eq('label_validation_status', 'corrected')
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setCorrections(data || []);
    } catch (error: any) {
      console.error('Error loading corrections:', error);
    }
  };

  const saveConfig = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_api_configs')
        .upsert({
          user_id: user.id,
          ai_system_prompt: systemPrompt,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setOriginalPrompt(systemPrompt);
      toast({
        title: "Configuration sauvegardée",
        description: "Le prompt système de l'agent IA a été mis à jour avec succès.",
      });
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de sauvegarder la configuration.",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetToDefault = () => {
    setSystemPrompt(DEFAULT_PROMPT);
  };

  const hasChanges = systemPrompt !== originalPrompt;

  if (loadingData) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">Chargement...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>Configuration de l'Agent IA</CardTitle>
          </div>
          <CardDescription>
            Personnalisez le comportement de l'IA qui analyse vos emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Le prompt système définit les instructions générales de l'agent IA. 
              Toutes les analyses d'emails futurs utiliseront ces instructions.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt Système Utilisateur</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              placeholder="Instructions pour l'agent IA..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {systemPrompt.length} caractères - Ce prompt est envoyé à l'IA en tant qu'instructions système
            </p>
          </div>

          <div className="space-y-2 mt-4">
            <label className="text-sm font-medium">Prompt Complet Envoyé à l'IA (lecture seule)</label>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Ce prompt complet est généré automatiquement et inclut : votre prompt système + la liste des règles avec leurs descriptions enrichies + les instructions de catégorisation.
              </AlertDescription>
            </Alert>
            <Textarea
              value={`PROMPT SYSTÈME (configurable ci-dessus):\n${systemPrompt}\n\n---\n\nINSTRUCTIONS AUTOMATIQUES (générées dynamiquement):\n- Base de données des règles avec descriptions enrichies\n- Labels existants\n- Instructions de catégorisation (1 catégorie + 1 action)\n- Détection phishing/spam\n- Analyse urgence et actions suggérées`}
              readOnly
              rows={12}
              className="font-mono text-xs bg-muted"
            />
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={saveConfig} 
              disabled={loading || !hasChanges}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Sauvegarder
            </Button>
            <Button 
              variant="outline" 
              onClick={resetToDefault}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <CardTitle>Auto-apprentissage</CardTitle>
          </div>
          <CardDescription>
            L'IA apprend de vos corrections passées
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Lorsque vous corrigez un email (changement de label avec explication), 
              l'IA utilise automatiquement ces corrections pour améliorer ses futures analyses.
              Les 10 dernières corrections sont prises en compte.
            </AlertDescription>
          </Alert>

          {corrections.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Corrections récentes ({corrections.length})</h4>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {corrections.map((correction, index) => (
                  <div key={index} className="border rounded-lg p-3 space-y-2">
                    <div className="space-y-1">
                      <p className="text-sm font-medium truncate">{correction.subject}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        De: {correction.sender}
                      </p>
                    </div>
                    {correction.applied_label && (
                      <div className="flex gap-1 flex-wrap">
                        {(Array.isArray(correction.applied_label) 
                          ? correction.applied_label 
                          : [correction.applied_label]
                        ).map((label: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {correction.label_validation_notes && (
                      <p className="text-xs italic text-muted-foreground">
                        "{correction.label_validation_notes}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune correction enregistrée pour le moment. 
              Lorsque vous corrigerez des emails, elles apparaîtront ici.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};