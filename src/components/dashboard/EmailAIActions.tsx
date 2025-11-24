import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { UserPlus, Mail, Calendar, Tag, Send } from 'lucide-react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface EmailAIActionsProps {
  email: any;
  onUpdate: () => void;
  existingLabels: string[];
}

export const EmailAIActions = ({ email, onUpdate, existingLabels }: EmailAIActionsProps) => {
  const [processing, setProcessing] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [newLabel, setNewLabel] = useState('');
  const [isCreatingNewLabel, setIsCreatingNewLabel] = useState(false);

  const handleAddToContacts = async () => {
    setProcessing(true);
    try {
      const emailMatch = email.sender.match(/<(.+?)>/);
      const senderEmail = emailMatch ? emailMatch[1] : email.sender;
      
      const { error } = await supabase
        .from('contact_rules')
        .insert({
          email: senderEmail,
          name: email.sender.split('<')[0].trim().replace(/"/g, ''),
          user_id: email.user_id,
        });

      if (error) throw error;

      toast({ title: 'Contact ajouté', description: 'Le contact a été ajouté avec succès' });
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateLabel = async () => {
    const labelToApply = isCreatingNewLabel ? newLabel : selectedLabel;
    if (!labelToApply) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner ou créer un label', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      const emailMatch = email.sender.match(/<(.+?)>/);
      const senderEmail = emailMatch ? emailMatch[1] : email.sender;
      const domain = senderEmail.split('@')[1];

      const { error } = await supabase
        .from('email_rules')
        .insert({
          description: `Label auto-créé depuis l'email "${email.subject}"`,
          sender_pattern: `*@${domain}`,
          label_to_apply: labelToApply,
          is_active: true,
          user_id: email.user_id,
        });

      if (error) throw error;

      toast({ title: 'Label créé', description: `Le label "${labelToApply}" a été créé et appliqué` });
      setSelectedLabel('');
      setNewLabel('');
      setIsCreatingNewLabel(false);
      onUpdate();
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

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

  if (!showAddContact && !showCreateDraft && !showAutoReply && !showCreateLabel && !showAddCalendar) {
    return null;
  }

  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
      <p className="text-xs font-medium text-muted-foreground">Actions IA disponibles :</p>
      <div className="flex flex-wrap gap-2">
        {showAddContact && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddToContacts}
            disabled={processing}
          >
            <UserPlus className="h-3 w-3 mr-1" />
            Ajouter ce contact
          </Button>
        )}

        {showCreateLabel && (
          <div className="flex items-center gap-2 w-full">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCreatingNewLabel(!isCreatingNewLabel)}
              disabled={processing}
            >
              <Tag className="h-3 w-3 mr-1" />
              Créer et appliquer un label
            </Button>
            {isCreatingNewLabel ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  placeholder="Nouveau label..."
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="h-8"
                />
                <Button size="sm" onClick={handleCreateLabel} disabled={processing || !newLabel}>
                  Créer
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1">
                <Select value={selectedLabel} onValueChange={setSelectedLabel}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Choisir un label..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingLabels.map((label) => (
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleCreateLabel} disabled={processing || !selectedLabel}>
                  Appliquer
                </Button>
              </div>
            )}
          </div>
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
      
      {aiAnalysis.suggested_label && (
        <div className="mt-2">
          <Badge variant="outline" className="text-xs">
            Label suggéré : {aiAnalysis.suggested_label}
          </Badge>
        </div>
      )}
    </div>
  );
};
