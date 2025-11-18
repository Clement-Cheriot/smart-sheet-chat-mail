import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle2, 
  Calendar, 
  Tag, 
  AlertCircle,
  Lightbulb,
  FileText,
  Bot,
  MessageSquare,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';

interface EmailDetailsDialogProps {
  email: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmailUpdated: () => void;
}

export const EmailDetailsDialog = ({ email, open, onOpenChange, onEmailUpdated }: EmailDetailsDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!email) return null;

  const aiAnalysis = email.ai_analysis || {};
  const calendarDetails = email.calendar_details;

  const handleCreateLabel = async (labelName: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('email_rules')
        .insert({
          user_id: user.id,
          label_to_apply: labelName,
          description: `[${new Date().toISOString().split('T')[0]}] Label créé automatiquement par IA`,
          priority: 'medium',
          is_active: true
        });

      if (error) throw error;

      toast({
        title: "Label créé",
        description: `Le label "${labelName}" a été ajouté à vos règles.`,
      });

      onEmailUpdated();
    } catch (error: any) {
      console.error('Error creating label:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de créer le label.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCalendarEvent = async () => {
    if (!calendarDetails) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Appel à la fonction edge gmail-calendar
      const { data, error } = await supabase.functions.invoke('gmail-calendar', {
        body: {
          action: 'create',
          summary: calendarDetails.title,
          description: calendarDetails.description,
          start: calendarDetails.date,
        }
      });

      if (error) throw error;

      toast({
        title: "Événement créé",
        description: `"${calendarDetails.title}" a été ajouté à votre calendrier.`,
      });

      onEmailUpdated();
    } catch (error: any) {
      console.error('Error creating calendar event:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de créer l'événement calendrier.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Détails de l'email</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informations de base */}
          <div className="space-y-2">
            <p className="text-sm font-medium">De: {email.sender}</p>
            <p className="text-sm font-medium">Sujet: {email.subject}</p>
            <p className="text-xs text-muted-foreground">
              Reçu: {new Date(email.received_at).toLocaleString('fr-FR')}
            </p>
          </div>

          {/* Labels appliqués */}
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Labels appliqués
            </p>
            <div className="flex gap-2 flex-wrap">
              {(Array.isArray(email.applied_label) ? email.applied_label : [email.applied_label]).map((label: string, i: number) => (
                <Badge key={i} variant="secondary">{label}</Badge>
              ))}
            </div>
          </div>

          {/* Raisonnement IA */}
          {(aiAnalysis.reasoning || email.ai_reasoning) && (
            <Alert className={aiAnalysis.reasoning === 'AI analysis unavailable, using defaults' ? 'border-orange-200 bg-orange-50 dark:bg-orange-950' : ''}>
              <Bot className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">
                    {aiAnalysis.reasoning === 'AI analysis unavailable, using defaults' ? '⚠️ Erreur d\'analyse IA' : 'Raisonnement IA'}
                  </p>
                  <p className="text-sm">
                    {aiAnalysis.reasoning || email.ai_reasoning}
                  </p>
                  <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                    {(email.confidence !== undefined && email.confidence !== null) && (
                      <span>Confiance: {email.confidence}%</span>
                    )}
                    {(email.priority_score || aiAnalysis.urgency) && (
                      <span>Priorité: {email.priority_score || aiAnalysis.urgency}/10</span>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Brouillon généré */}
          {email.draft_content && (
            <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950">
              <FileText className="h-4 w-4 text-blue-600" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium text-blue-900 dark:text-blue-100">📝 Brouillon de réponse généré</p>
                  <div className="p-3 bg-white dark:bg-gray-800 rounded-md border border-blue-200">
                    <p className="text-sm whitespace-pre-wrap">{email.draft_content}</p>
                  </div>
                  {email.draft_id && (
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Ce brouillon est disponible dans Gmail
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Réponse automatique */}
          {email.auto_response_content && (
            <Alert>
              <MessageSquare className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Réponse automatique</p>
                  <p className="text-sm whitespace-pre-wrap">{email.auto_response_content}</p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Suggestions et Actions IA */}
          {(email.suggested_new_label || email.needs_calendar_action || email.draft_content) && (
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Actions IA disponibles
              </p>

              {/* Proposition de nouveau label */}
              {email.suggested_new_label && (
                <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950">
                  <Lightbulb className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-blue-900 dark:text-blue-100">💡 Proposition de label</p>
                        <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                          L'IA suggère de créer le label "<strong>{email.suggested_new_label}</strong>" pour mieux catégoriser ce type d'email.
                        </p>
                        {email.rule_reinforcement_suggestion && (
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            {email.rule_reinforcement_suggestion}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => handleCreateLabel(email.suggested_new_label)}
                          disabled={loading}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <ThumbsUp className="h-4 w-4 mr-1" />
                          Valider
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={async () => {
                            try {
                              await supabase
                                .from('email_history')
                                .update({ suggested_new_label: null, rule_reinforcement_suggestion: null })
                                .eq('id', email.id);
                              toast({ title: "Proposition refusée" });
                              onEmailUpdated();
                            } catch (error) {
                              console.error(error);
                            }
                          }}
                        >
                          <ThumbsDown className="h-4 w-4 mr-1" />
                          Refuser
                        </Button>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Créer événement calendrier */}
              {email.needs_calendar_action && calendarDetails && (
                <Alert className="border-green-200 bg-green-50 dark:bg-green-950">
                  <Calendar className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-green-900 dark:text-green-100">📅 Événement calendrier suggéré</p>
                        <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                          <strong>{calendarDetails.title}</strong>
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                          Date : {calendarDetails.date}
                        </p>
                      </div>
                      <Button 
                        variant="default"
                        size="sm"
                        onClick={handleCreateCalendarEvent}
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        Créer l'événement
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Actions effectuées */}
          {email.actions_taken && email.actions_taken.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Actions effectuées
              </p>
              <div className="space-y-1">
                {email.actions_taken.map((action: any, i: number) => {
                  if (action.type === 'label') {
                    return (
                      <p key={i} className="text-sm text-muted-foreground">
                        • Application de labels : {Array.isArray(action.value) ? action.value.join(', ') : action.value}
                      </p>
                    );
                  }
                  if (action.type === 'needs_manual_review') {
                    return (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-300">
                          🚩 Revue manuelle requise
                        </Badge>
                        {action.reasoning && (
                          <span className="text-xs text-muted-foreground">({action.reasoning})</span>
                        )}
                      </div>
                    );
                  }
                  if (action.type === 'telegram_urgent') {
                    return (
                      <p key={i} className="text-sm text-green-600 dark:text-green-400">
                        ✓ Notification urgente Telegram envoyée
                      </p>
                    );
                  }
                  if (action.type === 'telegram_error') {
                    return (
                      <p key={i} className="text-sm text-orange-600 dark:text-orange-400">
                        ⚠️ Notification d'erreur Telegram envoyée ({action.reasoning})
                      </p>
                    );
                  }
                  if (action.type === 'draft_created') {
                    return (
                      <p key={i} className="text-sm text-blue-600 dark:text-blue-400">
                        ✓ Brouillon créé dans Gmail
                      </p>
                    );
                  }
                  if (action.type === 'auto_reply_sent') {
                    return (
                      <p key={i} className="text-sm text-green-600 dark:text-green-400">
                        ✓ Réponse automatique envoyée
                      </p>
                    );
                  }
                  return (
                    <p key={i} className="text-sm text-muted-foreground">
                      • {typeof action === 'string' ? action : JSON.stringify(action)}
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};