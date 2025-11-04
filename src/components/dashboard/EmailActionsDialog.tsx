import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Tag, Star, Mail, Send, Trash } from 'lucide-react';

interface EmailActionsDialogProps {
  email: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export const EmailActionsDialog = ({ email, open, onOpenChange, onUpdate }: EmailActionsDialogProps) => {
  const { user } = useAuth();
  const [action, setAction] = useState<string>('');
  const [selectedOldLabel, setSelectedOldLabel] = useState<string>('');
  const [newLabel, setNewLabel] = useState('');
  const [labelExplanation, setLabelExplanation] = useState('');
  const [newPriority, setNewPriority] = useState(email.priority_score?.toString() || '5');
  const [processing, setProcessing] = useState(false);

  const currentLabels = email.applied_label || [];

  const handleChangeLabel = async () => {
    if (!newLabel.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez entrer un label', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      // Apply label in Gmail
      const { error: gmailError } = await supabase.functions.invoke('gmail-actions', {
        body: {
          action: 'apply_label',
          userId: user?.id,
          messageId: email.gmail_message_id,
          label: newLabel,
          oldLabel: selectedOldLabel || undefined
        }
      });

      if (gmailError) throw gmailError;

      // Update database - replace old label with new one if specified, otherwise add to array
      const updatedLabels = selectedOldLabel 
        ? currentLabels.filter((l: string) => l !== selectedOldLabel).concat(newLabel)
        : currentLabels.concat(newLabel);

      const { error: updateError } = await supabase
        .from('email_history')
        .update({ 
          applied_label: updatedLabels,
          ai_reasoning: labelExplanation 
            ? `${email.ai_reasoning}\n\n[Correction manuelle]: ${labelExplanation}`
            : email.ai_reasoning
        })
        .eq('id', email.id);

      if (updateError) throw updateError;

      // Store label correction for future learning
      if (labelExplanation) {
        await supabase.from('activity_logs').insert({
          user_id: user?.id,
          action_type: 'label_correction',
          action_details: {
            email_id: email.id,
            old_label: selectedOldLabel || null,
            new_label: newLabel,
            explanation: labelExplanation
          },
          status: 'success'
        });
      }

      toast({ title: 'Succès', description: 'Label modifié dans Gmail et l\'application' });
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleChangePriority = async () => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from('email_history')
        .update({ priority_score: parseInt(newPriority) })
        .eq('id', email.id);

      if (error) throw error;

      toast({ title: 'Succès', description: 'Priorité modifiée' });
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateDraft = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-actions', {
        body: {
          action: 'create_draft',
          userId: user?.id,
          messageId: email.gmail_message_id,
          emailContext: {
            sender: email.sender,
            subject: email.subject,
            body: email.body_summary
          }
        }
      });

      if (error) throw error;

      await supabase
        .from('email_history')
        .update({ draft_created: true, draft_id: data.draftId })
        .eq('id', email.id);

      toast({ title: 'Succès', description: 'Brouillon créé dans Gmail' });
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleAutoReply = async () => {
    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-actions', {
        body: {
          action: 'send_reply',
          userId: user?.id,
          messageId: email.gmail_message_id,
          emailContext: {
            sender: email.sender,
            subject: email.subject,
            body: email.body_summary
          }
        }
      });

      if (error) throw error;

      toast({ title: 'Succès', description: 'Réponse automatique envoyée' });
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet email de l\'historique ?')) return;

    setProcessing(true);
    try {
      const { error } = await supabase
        .from('email_history')
        .delete()
        .eq('id', email.id);

      if (error) throw error;

      toast({ title: 'Succès', description: 'Email supprimé de l\'historique' });
      onUpdate();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Actions sur l'email</DialogTitle>
          <DialogDescription>Choisissez une action à effectuer</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir une action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="label">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Changer le label
                  </div>
                </SelectItem>
                <SelectItem value="priority">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Changer la priorité
                  </div>
                </SelectItem>
                <SelectItem value="draft">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Créer un brouillon
                  </div>
                </SelectItem>
                <SelectItem value="reply">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Répondre automatiquement
                  </div>
                </SelectItem>
                <SelectItem value="delete">
                  <div className="flex items-center gap-2">
                    <Trash className="h-4 w-4" />
                    Supprimer
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {action === 'label' && (
            <div className="space-y-3">
              {currentLabels.length > 0 && (
                <div>
                  <Label>Label à remplacer (optionnel)</Label>
                  <Select value={selectedOldLabel} onValueChange={setSelectedOldLabel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Aucun - ajouter un nouveau label" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucun - ajouter un nouveau label</SelectItem>
                      {currentLabels.map((label: string) => (
                        <SelectItem key={label} value={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Nouveau label</Label>
                <Input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ex: Urgent/Client, Formation, etc."
                />
              </div>
              <div>
                <Label>Explication (optionnel - pour renforcer l'IA)</Label>
                <Textarea
                  value={labelExplanation}
                  onChange={(e) => setLabelExplanation(e.target.value)}
                  placeholder="Pourquoi ce label est plus approprié ? Cela aidera l'IA à mieux apprendre."
                  rows={3}
                />
              </div>
              <Button onClick={handleChangeLabel} disabled={processing} className="w-full">
                {processing ? 'Modification...' : 'Modifier le label'}
              </Button>
            </div>
          )}

          {action === 'priority' && (
            <div className="space-y-3">
              <div>
                <Label>Nouvelle priorité (1-10)</Label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <SelectItem key={n} value={n.toString()}>
                        Priorité {n}/10
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleChangePriority} disabled={processing} className="w-full">
                {processing ? 'Modification...' : 'Modifier la priorité'}
              </Button>
            </div>
          )}

          {action === 'draft' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Un brouillon de réponse sera créé dans votre Gmail en utilisant l'IA.
              </p>
              <Button onClick={handleCreateDraft} disabled={processing} className="w-full">
                {processing ? 'Création...' : 'Créer le brouillon'}
              </Button>
            </div>
          )}

          {action === 'reply' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Une réponse automatique sera générée et envoyée immédiatement.
              </p>
              <Button onClick={handleAutoReply} disabled={processing} className="w-full">
                {processing ? 'Envoi...' : 'Envoyer la réponse'}
              </Button>
            </div>
          )}

          {action === 'delete' && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                ⚠️ Cet email sera supprimé de l'historique (action irréversible).
              </p>
              <Button onClick={handleDelete} disabled={processing} variant="destructive" className="w-full">
                {processing ? 'Suppression...' : 'Supprimer l\'email'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
