import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ApplyNewLabelDialogProps {
  email: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmailUpdated: () => void;
  suggestedLabel?: string;
}

export const ApplyNewLabelDialog = ({ 
  email, 
  open, 
  onOpenChange, 
  onEmailUpdated,
  suggestedLabel 
}: ApplyNewLabelDialogProps) => {
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApply = async () => {
    const labelToApply = suggestedLabel || newLabel;
    
    if (!labelToApply.trim()) {
      toast({
        variant: "destructive",
        title: "Champ requis",
        description: "Veuillez saisir un nom de label.",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Créer la règle avec le nouveau label
      const { error: ruleError } = await supabase
        .from('email_rules')
        .insert({
          user_id: user.id,
          label_to_apply: labelToApply,
          description: `Label créé et appliqué depuis l'email: ${email.subject || 'Sans objet'}`,
          priority: 'medium',
          is_active: true
        });

      if (ruleError) throw ruleError;

      // Appliquer le label à cet email
      const currentLabels = Array.isArray(email.applied_label) ? email.applied_label : [email.applied_label].filter(Boolean);
      const updatedLabels = [...currentLabels, labelToApply];

      const { error: updateError } = await supabase
        .from('email_history')
        .update({ 
          applied_label: updatedLabels,
          suggested_new_label: null 
        })
        .eq('id', email.id);

      if (updateError) throw updateError;

      toast({
        title: "Label créé et appliqué",
        description: `Le label "${labelToApply}" a été créé et appliqué à cet email.`,
      });

      setNewLabel('');
      onOpenChange(false);
      onEmailUpdated();
    } catch (error: any) {
      console.error('Error applying label:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Appliquer un nouveau label</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {suggestedLabel ? (
            <div className="space-y-2">
              <Label>Label suggéré par l'IA</Label>
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">{suggestedLabel}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Ce label sera créé et appliqué à cet email
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="newLabel">Nouveau label <span className="text-destructive">*</span></Label>
              <Input
                id="newLabel"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Travail/Projets"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleApply} disabled={loading}>
            {loading ? 'Application...' : 'Créer et appliquer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
