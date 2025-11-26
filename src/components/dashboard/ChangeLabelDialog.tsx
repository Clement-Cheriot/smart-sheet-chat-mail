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
  const [currentLabelToChange, setCurrentLabelToChange] = useState<string>('');

  useEffect(() => {
    if (open) {
      loadExistingLabels();
      // Pré-sélectionner le premier label si disponible
      const labels = Array.isArray(email?.applied_label) ? email.applied_label : [email?.applied_label].filter(Boolean);
      if (labels.length > 0) {
        setCurrentLabelToChange(labels[0]);
      }
    }
  }, [open, email]);

  const loadExistingLabels = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Charger les labels depuis les règles
      const { data: rulesData } = await supabase
        .from('email_rules')
        .select('label_to_apply')
        .eq('user_id', user.id)
        .eq('is_active', true);

      // Charger les labels depuis l'historique
      const { data: historyData } = await supabase
        .from('email_history')
        .select('applied_label')
        .eq('user_id', user.id);

      // Combiner et dédupliquer les labels
      const rulesLabels = rulesData?.map(r => r.label_to_apply).filter(Boolean) || [];
      const historyLabels = historyData?.flatMap(h => h.applied_label || []).filter(Boolean) || [];
      const allLabels = [...new Set([...rulesLabels, ...historyLabels])].sort();
      
      setExistingLabels(allLabels);
    } catch (error) {
      console.error('Error loading labels:', error);
    }
  };

  const handleSubmit = async () => {
    const finalLabel = isCreatingNew ? newLabelName : selectedLabel;

    if (!currentLabelToChange || !finalLabel || !userReason.trim()) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: "Veuillez sélectionner le label à changer, le nouveau label et expliquer pourquoi.",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Appel à l'IA feedback
      const { data, error } = await supabase.functions.invoke('ai-feedback', {
        body: {
          email_id: email.id,
          email_subject: email.subject,
          email_sender: email.sender,
          old_label: currentLabelToChange,
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
      setCurrentLabelToChange('');
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
            <Label>Label à changer <span className="text-destructive">*</span></Label>
            <Select value={currentLabelToChange} onValueChange={setCurrentLabelToChange}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le label à modifier" />
              </SelectTrigger>
              <SelectContent>
                {(Array.isArray(email?.applied_label) ? email.applied_label : [email?.applied_label].filter(Boolean)).map(label => (
                  <SelectItem key={label} value={label}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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