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
  MessageSquare
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
          <Alert>
            <Bot className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Raisonnement IA</p>
                <p className="text-sm">
                  {((aiAnalysis.reasoning || email.ai_reasoning || '').substring(0, 150))}
                  {(aiAnalysis.reasoning || email.ai_reasoning || '').length > 150 ? '...' : ''}
                </p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                  {(email.confidence !== undefined && email.confidence !== null) && (
                    <span>Confiance: {email.confidence}%</span>
                  )}
                  {(email.priority_score || aiAnalysis.urgency) && (
                    <span>Urgence: {email.priority_score || aiAnalysis.urgency}/10</span>
                  )}
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Brouillon généré */}
          {email.draft_content && (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Brouillon de réponse généré</p>
                  <p className="text-sm whitespace-pre-wrap">{email.draft_content}</p>
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

          {/* Suggestions */}
          <div className="space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Suggestions
            </p>

            {/* Créer nouveau label suggéré */}
            {aiAnalysis.suggested_label && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleCreateLabel(aiAnalysis.suggested_label)}
                disabled={loading}
                className="w-full justify-start"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Créer le label "{aiAnalysis.suggested_label}"
              </Button>
            )}

            {/* Créer événement calendrier */}
            {email.needs_calendar_action && calendarDetails && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleCreateCalendarEvent}
                disabled={loading}
                className="w-full justify-start"
              >
                <Calendar className="mr-2 h-4 w-4" />
                Créer événement "{calendarDetails.title}" le {calendarDetails.date}
              </Button>
            )}

            {!aiAnalysis.suggested_label && !email.needs_calendar_action && (
              <p className="text-sm text-muted-foreground">Aucune suggestion disponible</p>
            )}
          </div>

          {/* Actions effectuées */}
          {email.actions_taken && email.actions_taken.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Actions effectuées
              </p>
              <div className="space-y-1">
                {email.actions_taken.map((action: string, i: number) => (
                  <p key={i} className="text-sm text-muted-foreground">• {action}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};