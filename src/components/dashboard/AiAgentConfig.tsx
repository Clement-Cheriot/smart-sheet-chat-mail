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

const DEFAULT_PROMPT = `Tu analyses les emails et génères un JSON structuré avec toutes les actions nécessaires.

DONNÉES DISPONIBLES :
- Règles Labels (label_rules) : nom, priorité, domaines, mots-clés, description
- Règles Signatures (signature_rules) : nom, contenu, conditions
- Règles Brouillons (draft_rules) : nom, template, signature_id, conditions
- Règles Réponses Auto (auto_response_rules) : nom, template, signature_id, conditions, délai
- Règles Calendrier (calendar_rules) : nom, type d'action, conditions, exclusion no-reply
- Règles Contacts (contact_rules) : email, nom, signature préférée, ton préféré

TON RÔLE :
1. Calculer urgency (1-10) et confidence (0-100%)
2. Appliquer minimum 1 category_label + 1 action_label
3. Identifier la règle utilisée (matched_label)
4. Si aucune règle : proposer suggested_label
5. Générer reasoning détaillé en français
6. Si "Actions/A répondre" : générer draft_content en utilisant draft_rules + signature_rules + contact_rules
7. Si règle auto_response applicable : générer auto_response_content
8. Si urgency ≥ 8 : is_urgent_whatsapp = true
9. Si mots-clés calendrier détectés ("réunion", "meeting", "rdv") ET sender sans "no-reply" : needs_calendar_action = true + calendar_details
10. Si label appliqué mais nouveaux mots-clés/domaines détectés : remplir rule_reinforcement

LABELS ACTIONS OBLIGATOIRES :
- Actions/A répondre : Email nécessitant réponse → needs_response=true + draft_content obligatoire
- Actions/Automatique : Réponse auto envoyée/prévue → auto_response_content
- Actions/A supprimer : Spam/phishing/indésirable
- Actions/Revue Manuelle : Incertitude (confidence < 70%)
- Actions/Rien à faire : Email informatif légitime

FORMAT DE SORTIE JSON :
{
  "urgency": number,
  "confidence": number,
  "reasoning": string,
  "category_label": string,
  "action_label": string,
  "applied_labels": string[],
  "matched_label": string | null,
  "suggested_label": string | null,
  "needs_response": boolean,
  "draft_content": string | null,
  "auto_response_content": string | null,
  "is_urgent_whatsapp": boolean,
  "needs_calendar_action": boolean,
  "calendar_details": {
    "date": string,
    "title": string,
    "description": string
  } | null,
  "rule_reinforcement": {
    "label": string,
    "add_keywords": string[],
    "add_domains": string[]
  } | null
}`;

export const AiAgentConfig = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [originalPrompt, setOriginalPrompt] = useState(DEFAULT_PROMPT);
  const [categorizationRules, setCategorizationRules] = useState('');
  const [originalCategorizationRules, setOriginalCategorizationRules] = useState('');
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
        .select('ai_system_prompt, ai_categorization_rules')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.ai_system_prompt) {
        setSystemPrompt(data.ai_system_prompt);
        setOriginalPrompt(data.ai_system_prompt);
      }
      
      if (data?.ai_categorization_rules) {
        setCategorizationRules(data.ai_categorization_rules);
        setOriginalCategorizationRules(data.ai_categorization_rules);
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
          ai_categorization_rules: categorizationRules,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setOriginalPrompt(systemPrompt);
      setOriginalCategorizationRules(categorizationRules);
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

  const hasChanges = systemPrompt !== originalPrompt || categorizationRules !== originalCategorizationRules;

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
            <label className="text-sm font-medium">Instructions de Catégorisation (Éditable)</label>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Ces instructions définissent les labels disponibles et les règles de catégorisation. 
                Modifiez-les pour ajouter de nouveaux labels ou changer les règles de priorité.
              </AlertDescription>
            </Alert>
            <Textarea
              value={categorizationRules}
              onChange={(e) => setCategorizationRules(e.target.value)}
              rows={12}
              placeholder="Instructions de catégorisation..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {categorizationRules.length} caractères - Ces instructions sont ajoutées au prompt envoyé à l'IA
            </p>
          </div>

          <div className="space-y-2 mt-4">
            <label className="text-sm font-medium">Prompt Complet Envoyé à l'IA (lecture seule)</label>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Voici le prompt COMPLET réellement envoyé à l'IA (google/gemini-2.5-flash-lite). Il combine votre prompt système personnalisé + toutes vos règles actives avec leurs descriptions enrichies + vos instructions de catégorisation.
              </AlertDescription>
            </Alert>
            <Textarea
              value={`PROMPT SYSTÈME (configurable ci-dessus):\n${systemPrompt}\n\n---\n\nRÈGLES ACTIVES (générées dynamiquement depuis votre DB):\n📋 BASE DE DONNÉES DES RÈGLES (avec historique des feedbacks):\n\n[Pour chaque règle active]\n1. Label: "[label]" | Priorité: [high/medium/low] | Domaine: [pattern] | Mots-clés: [keywords]\n   📚 Feedbacks utilisateur:\n   [description enrichie par vos corrections]\n\n📋 RÈGLES SIGNATURES:\n[Pour chaque signature]\nNom: [name] | Contenu: [content] | Conditions: [conditions]\n\n📋 RÈGLES BROUILLONS:\n[Pour chaque draft_rule]\nNom: [name] | Template: [template] | Signature ID: [signature_id] | Conditions: [conditions]\n\n📋 RÈGLES RÉPONSES AUTO:\n[Pour chaque auto_response_rule]\nNom: [name] | Template: [template] | Signature ID: [signature_id] | Délai: [delay_minutes]min | Conditions: [conditions]\n\n📋 RÈGLES CALENDRIER:\n[Pour chaque calendar_rule]\nNom: [name] | Action: [action_type] | Conditions: [conditions] | Exclure no-reply: [exclude_noreply]\n\n📋 RÈGLES CONTACTS:\n[Pour chaque contact_rule]\nEmail: [email] | Nom: [name] | Signature préférée: [preferred_signature_id] | Ton: [preferred_tone] | Notes: [notes]\n\n---\n\nINSTRUCTIONS DE CATÉGORISATION (configurables ci-dessus):\n${categorizationRules}\n\n---\n\nFORMAT DE RÉPONSE ATTENDU:\nJSON avec les champs:\n- urgency: number (1-10)\n- confidence: number (0-100)\n- reasoning: string (explication EN FRANÇAIS)\n- category_label: string (OBLIGATOIRE)\n- action_label: string (OBLIGATOIRE - commence par "Actions/")\n- applied_labels: string[] (tous les labels appliqués)\n- matched_label: string | null (règle utilisée)\n- suggested_label: string | null (si aucune règle)\n- needs_response: boolean\n- draft_content: string | null (si needs_response=true)\n- auto_response_content: string | null (si applicable)\n- is_urgent_whatsapp: boolean (true si urgency >= 8)\n- needs_calendar_action: boolean\n- calendar_details: {date, title, description} | null\n- rule_reinforcement: {label, add_keywords[], add_domains[]} | null`}
              readOnly
              rows={16}
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