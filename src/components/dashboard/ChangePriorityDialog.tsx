import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ChangePriorityDialogProps {
  email: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmailUpdated: () => void;
}

export const ChangePriorityDialog = ({ email, open, onOpenChange, onEmailUpdated }: ChangePriorityDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [newPriority, setNewPriority] = useState<string>(String(email.priority_score || 5));
  const [userReason, setUserReason] = useState('');

  const handleSubmit = async () => {
    if (!userReason.trim()) {
      toast({
        variant: "destructive",
        title: "Champs requis",
        description: "Veuillez expliquer pourquoi vous changez la priorité.",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('email_history')
        .update({ priority_score: Number(newPriority) })
        .eq('id', email.id);

      if (error) throw error;

      toast({
        title: "Priorité modifiée",
        description: `La priorité a été changée à ${newPriority}/10.`,
      });

      onEmailUpdated();
      onOpenChange(false);
      
      // Reset form
      setUserReason('');
    } catch (error: any) {
      console.error('Error changing priority:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message || "Impossible de modifier la priorité.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Changer la priorité</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Priorité actuelle</Label>
            <div className="p-2 bg-muted rounded text-sm">
              {email?.priority_score || 5}/10
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nouvelle priorité</Label>
            <Select value={newPriority} onValueChange={setNewPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((priority) => (
                  <SelectItem key={priority} value={String(priority)}>
                    Priorité {priority}/10
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Pourquoi ce changement ? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              placeholder="Expliquez pourquoi vous changez cette priorité. L'IA utilisera cette information pour s'améliorer."
              value={userReason}
              onChange={(e) => setUserReason(e.target.value)}
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Cette explication aidera l'IA à mieux comprendre vos préférences et à ajuster ses scores de priorité.
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