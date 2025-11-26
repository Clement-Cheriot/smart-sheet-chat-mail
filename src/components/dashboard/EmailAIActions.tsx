import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { UserPlus, Mail, Calendar, Tag, Send, Edit, TrendingUp, Plus } from 'lucide-react';
import { ChangeLabelDialog } from './ChangeLabelDialog';
import { ChangePriorityDialog } from './ChangePriorityDialog';
import { AddContactDialog } from './AddContactDialog';
import { ApplyNewLabelDialog } from './ApplyNewLabelDialog';

interface EmailAIActionsProps {
  email: any;
  onUpdate: () => void;
  existingLabels: string[];
}

export const EmailAIActions = ({ email, onUpdate, existingLabels }: EmailAIActionsProps) => {
  const [processing, setProcessing] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [applyLabelDialogOpen, setApplyLabelDialogOpen] = useState(false);
  const [suggestedLabelForDialog, setSuggestedLabelForDialog] = useState<string | undefined>();


  const handleCreateDraft = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('gmail-actions', {
        body: {
          action: 'create_draft',
          userId: email.user_id,
          messageId: email.gmail_message_id,
          draftContent: email.draft_content || 'Merci pour votre email. Je reviendrai vers vous prochainement.',
        },
      });

      if (error) throw error;

      toast({ title: 'Brouillon créé', description: 'Le brouillon a été créé dans Gmail' });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleAutoReply = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('gmail-actions', {
        body: {
          action: 'send_reply',
          userId: email.user_id,
          messageId: email.gmail_message_id,
          replyContent: email.auto_response_content || 'Merci pour votre email.',
        },
      });

      if (error) throw error;

      toast({ title: 'Réponse envoyée', description: 'La réponse automatique a été envoyée' });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleAddToCalendar = async () => {
    if (!email.calendar_details) {
      toast({ title: 'Erreur', description: 'Aucun détail de calendrier disponible', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase.functions.invoke('gmail-calendar', {
        body: {
          userId: email.user_id,
          eventDetails: email.calendar_details,
        },
      });

      if (error) throw error;

      toast({ title: 'Événement créé', description: 'L\'événement a été ajouté au calendrier' });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const aiAnalysis = email.ai_analysis || {};
  const showAddContact = aiAnalysis.should_add_to_contacts;
  const showCreateDraft = email.needs_response && email.draft_content;
  const showAutoReply = email.needs_response && email.auto_response_content;
  const showCreateLabel = aiAnalysis.suggested_label;
  const showAddCalendar = email.needs_calendar_action && email.calendar_details;

  return (
    <>
      <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
        {/* Actions standards toujours disponibles */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Actions disponibles :</p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLabelDialogOpen(true)}
              disabled={processing}
            >
              <Edit className="h-3 w-3 mr-1" />
              Changer le label
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSuggestedLabelForDialog(undefined);
                setApplyLabelDialogOpen(true);
              }}
              disabled={processing}
            >
              <Plus className="h-3 w-3 mr-1" />
              Appliquer un nouveau label
            </Button>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPriorityDialogOpen(true)}
              disabled={processing}
            >
              <TrendingUp className="h-3 w-3 mr-1" />
              Changer la priorité
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setContactDialogOpen(true)}
              disabled={processing}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Ajouter au contact
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateDraft}
              disabled={processing}
            >
              <Mail className="h-3 w-3 mr-1" />
              Rédiger un brouillon
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoReply}
              disabled={processing}
            >
              <Send className="h-3 w-3 mr-1" />
              Répondre automatiquement
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleAddToCalendar}
              disabled={processing}
            >
              <Calendar className="h-3 w-3 mr-1" />
              Créer un événement calendrier
            </Button>
          </div>
        </div>

        {/* Actions suggérées par l'IA */}
        {(showAddContact || showCreateDraft || showAutoReply || showCreateLabel || showAddCalendar) && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Actions suggérées par l'IA :</p>
            <div className="flex flex-wrap gap-2">
              {showAddContact && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setContactDialogOpen(true)}
                  disabled={processing}
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  Ajouter ce contact
                </Button>
              )}

              {showCreateLabel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSuggestedLabelForDialog(aiAnalysis.suggested_label);
                    setApplyLabelDialogOpen(true);
                  }}
                  disabled={processing}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  Créer label: {aiAnalysis.suggested_label}
                </Button>
              )}

              {showCreateDraft && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCreateDraft}
                  disabled={processing}
                >
                  <Mail className="h-3 w-3 mr-1" />
                  Créer un brouillon
                </Button>
              )}

              {showAutoReply && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAutoReply}
                  disabled={processing}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Répondre automatiquement
                </Button>
              )}

              {showAddCalendar && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddToCalendar}
                  disabled={processing}
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  Ajouter au calendrier
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <ChangeLabelDialog
        email={email}
        open={labelDialogOpen}
        onOpenChange={setLabelDialogOpen}
        onEmailUpdated={onUpdate}
      />

      <ChangePriorityDialog
        email={email}
        open={priorityDialogOpen}
        onOpenChange={setPriorityDialogOpen}
        onEmailUpdated={onUpdate}
      />

      <AddContactDialog
        email={email}
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
        onContactAdded={onUpdate}
      />

      <ApplyNewLabelDialog
        email={email}
        open={applyLabelDialogOpen}
        onOpenChange={setApplyLabelDialogOpen}
        onEmailUpdated={onUpdate}
        suggestedLabel={suggestedLabelForDialog}
      />
    </>
  );
};
