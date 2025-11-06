import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ChangeLabelDialogProps {
  email: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmailUpdated: () => void;
}

export const ChangeLabelDialog = ({ email, open, onOpenChange, onEmailUpdated }: ChangeLabelDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [newLabelName, setNewLabelName] = useState('');
  const [userReason, setUserReason] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  useEffect(() => {
    if (open) {
      loadExistingLabels();
    }
  }, [open]);

  const loadExistingLabels = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('email_rules')
        .select('label_to_apply')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (error) throw error;

      const labels = [...new Set(data?.map(r => r.label_to_apply).filter(Boolean) || [])];
      setExistingLabels(labels);
    } catch (error) {
      console.error('Error loading labels:', error);
    }
  };

  const handleSubmit = async () => {
    const finalLabel = isCreatingNew ? newLabelName : selectedLabel;

    if (!finalLabel || !userReason.trim()) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: "Veuillez sélectionner/créer un label et expliquer pourquoi.",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const currentLabel = Array.isArray(email.applied_label) 
        ? email.applied_label[0] 
        : email.applied_label;

      // Appel à l'IA feedback
      const { data, error } = await supabase.functions.invoke('ai-feedback', {
        body: {
          email_id: email.id,
          email_subject: email.subject,
          email_sender: email.sender,
          old_label: currentLabel,
          new_label: finalLabel,
          user_reason: userReason
        }
      });

      if (error) throw error;

      toast({
        title: "Label modifié",
        description: `Le label a été changé en "${finalLabel}" et la règle a été enrichie.`,
      });

      onEmailUpdated();
      onOpenChange(false);
      
      // Reset form
      setSelectedLabel('');
      setNewLabelName('');
      setUserReason('');
      setIsCreatingNew(false);
    } catch (error: any) {
      console.error('Error changing label:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Impossible de modifier le label.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Changer le label</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Label actuel</Label>
            <div className="p-2 bg-muted rounded text-sm">
              {Array.isArray(email?.applied_label) 
                ? email.applied_label.join(', ') 
                : email?.applied_label || 'Aucun'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nouveau label</Label>
            <div className="flex items-center gap-2">
              <Button
                variant={!isCreatingNew ? "default" : "outline"}
                size="sm"
                onClick={() => setIsCreatingNew(false)}
              >
                Existant
              </Button>
              <Button
                variant={isCreatingNew ? "default" : "outline"}
                size="sm"
                onClick={() => setIsCreatingNew(true)}
              >
                Créer nouveau
              </Button>
            </div>
            
            {isCreatingNew ? (
              <Input
                placeholder="Nom du nouveau label"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
              />
            ) : (
              <Select value={selectedLabel} onValueChange={setSelectedLabel}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un label" />
                </SelectTrigger>
                <SelectContent>
                  {existingLabels.map(label => (
                    <SelectItem key={label} value={label}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Pourquoi ce changement ? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Expliquez pourquoi vous changez ce label. L'IA utilisera cette information pour s'améliorer."
              value={userReason}
              onChange={(e) => setUserReason(e.target.value)}
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Cette explication aidera l'IA à mieux comprendre vos préférences et à enrichir automatiquement les règles.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};