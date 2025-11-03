import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface EditRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: any;
  onSuccess: () => void;
}

export const EditRuleDialog = ({ open, onOpenChange, rule, onSuccess }: EditRuleDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    label_to_apply: rule.label_to_apply || '',
    priority: rule.priority || 'medium',
    sender_pattern: rule.sender_pattern || '',
    keywords: Array.isArray(rule.keywords) ? rule.keywords.join(', ') : '',
    response_template: rule.response_template || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase
        .from('email_rules')
        .update({
          label_to_apply: formData.label_to_apply,
          priority: formData.priority,
          sender_pattern: formData.sender_pattern || null,
          keywords: formData.keywords ? formData.keywords.split(',').map(k => k.trim()).filter(Boolean) : null,
          response_template: formData.response_template || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rule.id);

      if (error) throw error;

      toast({
        title: 'Règle modifiée',
        description: 'La règle a été mise à jour avec succès',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier la règle</DialogTitle>
          <DialogDescription>
            Modifiez les paramètres de la règle de classification
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="label">Label à appliquer *</Label>
            <Input
              id="label"
              value={formData.label_to_apply}
              onChange={(e) => setFormData({ ...formData, label_to_apply: e.target.value })}
              required
              placeholder="Ex: Newsletter, Urgent, Client VIP"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priorité</Label>
            <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Basse</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sender">Domaine expéditeur</Label>
            <Input
              id="sender"
              value={formData.sender_pattern}
              onChange={(e) => setFormData({ ...formData, sender_pattern: e.target.value })}
              placeholder="Ex: @exemple.com, contact@"
            />
            <p className="text-xs text-muted-foreground">
              Laissez vide pour correspondre à tous les expéditeurs
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords">Mots-clés</Label>
            <Input
              id="keywords"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              placeholder="Ex: facture, urgent, meeting (séparés par des virgules)"
            />
            <p className="text-xs text-muted-foreground">
              Séparez les mots-clés par des virgules
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="template">Modèle de réponse (optionnel)</Label>
            <Textarea
              id="template"
              value={formData.response_template}
              onChange={(e) => setFormData({ ...formData, response_template: e.target.value })}
              placeholder="Modèle de réponse automatique..."
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Modification...' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
