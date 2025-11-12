import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';
import { Tag, Star, Mail, Send, Trash, Check, ChevronsUpDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const [openCombobox, setOpenCombobox] = useState(false);

  const currentLabels = email.applied_label || [];

  useEffect(() => {
    const fetchExistingLabels = async () => {
      if (!user?.id) return;
      
      // Récupérer les labels depuis email_rules
      const { data: rulesData } = await supabase
        .from('email_rules')
        .select('label_to_apply')
        .eq('user_id', user.id)
        .not('label_to_apply', 'is', null);

      const labelsFromRules = rulesData?.map(r => r.label_to_apply).filter(Boolean) || [];

      // Récupérer les labels depuis email_history
      const { data: historyData } = await supabase
        .from('email_history')
        .select('applied_label')
        .eq('user_id', user.id)
        .not('applied_label', 'is', null);

      const labelsFromHistory = historyData?.flatMap(h => h.applied_label || []) || [];

      // Combiner et dédupliquer
      const allLabels = [...new Set([...labelsFromRules, ...labelsFromHistory])];
      setExistingLabels(allLabels);
    };

    if (open) {
      fetchExistingLabels();
    }
  }, [user?.id, open]);

  const handleChangeLabel = async () => {
    if (!newLabel.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez entrer un label', variant: 'destructive' });
      return;
    }

    if (!labelExplanation.trim()) {
      toast({ title: 'Erreur', description: 'L\'explication est obligatoire', variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      // Si c'est un nouveau label, créer une règle automatiquement
      const isNewLabel = !existingLabels.includes(newLabel);
      
      if (isNewLabel) {
        const { error: ruleError } = await supabase
          .from('email_rules')
          .insert({
            user_id: user?.id,
            label_to_apply: newLabel,
            keywords: [],
            is_active: true,
            rule_order: 0
          });

        if (ruleError) {
          console.error('Erreur lors de la création de la règle:', ruleError);
          // On continue quand même avec le changement de label
        }
      }
      // Apply label in Gmail
      const { error: gmailError } = await supabase.functions.invoke('gmail-actions', {
        body: {
          action: 'apply_label',
          userId: user?.id,
          messageId: email.gmail_message_id,
          label: newLabel,
          oldLabel: (selectedOldLabel && selectedOldLabel !== 'none') ? selectedOldLabel : undefined
        }
      });

      if (gmailError) throw gmailError;

      // Update database - replace old label with new one if specified, otherwise add to array
      const updatedLabels = (selectedOldLabel && selectedOldLabel !== 'none')
        ? currentLabels.filter((l: string) => l !== selectedOldLabel).concat(newLabel)
        : currentLabels.concat(newLabel);

      const { error: updateError } = await supabase
        .from('email_history')
        .update({ 
          applied_label: updatedLabels,
          label_validation_status: 'corrected',
          label_validation_notes: labelExplanation,
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

        // Déclencher automatiquement le renforcement de la règle
        try {
          const { error: reinforcementError } = await supabase.functions.invoke('rule-reinforcement', {
            body: {
              emailHistoryId: email.id,
              userId: user?.id
            }
          });

          if (reinforcementError) {
            console.error('Erreur lors du renforcement:', reinforcementError);
            // On continue quand même, ce n'est pas bloquant
          } else {
            console.log('Renforcement de règle appliqué automatiquement');
          }
        } catch (e) {
          console.error('Échec du renforcement automatique:', e);
        }
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
                <SelectItem value="calendar">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Ajouter au calendrier
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
                      <SelectItem value="none">Aucun - ajouter un nouveau label</SelectItem>
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
                <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={openCombobox}
                      className="w-full justify-between"
                    >
                      {newLabel || "Sélectionner ou créer un label..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Rechercher ou créer un label..." 
                        value={newLabel}
                        onValueChange={setNewLabel}
                      />
                      <CommandList>
                        <CommandEmpty>
                          Appuyez sur Entrée pour créer "{newLabel}"
                        </CommandEmpty>
                        <CommandGroup>
                          {existingLabels.map((label) => (
                            <CommandItem
                              key={label}
                              value={label}
                              onSelect={(currentValue) => {
                                setNewLabel(currentValue);
                                setOpenCombobox(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  newLabel === label ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Explication (obligatoire - pour renforcer l'IA) *</Label>
                <Textarea
                  value={labelExplanation}
                  onChange={(e) => setLabelExplanation(e.target.value)}
                  placeholder="Pourquoi ce label est plus approprié ? Cela aidera l'IA à mieux apprendre."
                  rows={3}
                  required
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

          {action === 'calendar' && (
            <div className="space-y-3">
              {email.calendar_details ? (
                <>
                  <div className="bg-muted p-3 rounded-lg space-y-2 text-sm">
                    <p><strong>Titre:</strong> {email.calendar_details.title || email.subject}</p>
                    <p><strong>Date:</strong> {email.calendar_details.date}</p>
                    {email.calendar_details.location && (
                      <p><strong>Lieu:</strong> {email.calendar_details.location}</p>
                    )}
                    {email.calendar_details.duration_minutes && (
                      <p><strong>Durée:</strong> {email.calendar_details.duration_minutes} minutes</p>
                    )}
                  </div>
                  <Button onClick={async () => {
                    setProcessing(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('gmail-calendar', {
                        body: {
                          userId: user?.id,
                          eventDetails: {
                            title: email.calendar_details.title || email.subject,
                            date: email.calendar_details.date,
                            duration_minutes: email.calendar_details.duration_minutes || 60,
                            location: email.calendar_details.location,
                            attendees: email.calendar_details.attendees,
                            description: email.calendar_details.description || email.body_summary,
                          }
                        }
                      });

                      if (error) throw error;

                      await supabase
                        .from('email_history')
                        .update({ needs_calendar_action: false })
                        .eq('id', email.id);

                      toast({ title: 'Succès', description: 'Événement ajouté au calendrier' });
                      onUpdate();
                      onOpenChange(false);
                    } catch (error: any) {
                      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
                    } finally {
                      setProcessing(false);
                    }
                  }} disabled={processing} className="w-full">
                    {processing ? 'Ajout...' : 'Ajouter au calendrier'}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun détail d'événement détecté pour cet email.
                </p>
              )}
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
