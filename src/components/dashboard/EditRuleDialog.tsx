import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
    create_draft: rule.create_draft || false,
    auto_reply: rule.auto_reply || false,
    exclude_newsletters: rule.exclude_newsletters !== false,
    exclude_marketing: rule.exclude_marketing !== false,
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
          create_draft: formData.create_draft,
          auto_reply: formData.auto_reply,
          exclude_newsletters: formData.exclude_newsletters,
          exclude_marketing: formData.exclude_marketing,
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

          <div className="space-y-3 pt-2 border-t">
            <Label className="text-base">Actions automatiques</Label>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="create_draft"
                checked={formData.create_draft}
                onCheckedChange={(checked) => setFormData({ ...formData, create_draft: checked as boolean })}
              />
              <label
                htmlFor="create_draft"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Créer un brouillon de réponse
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto_reply"
                checked={formData.auto_reply}
                onCheckedChange={(checked) => setFormData({ ...formData, auto_reply: checked as boolean })}
              />
              <label
                htmlFor="auto_reply"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Réponse automatique (à développer)
              </label>
            </div>

            {(formData.create_draft || formData.auto_reply) && (
              <>
                <div className="pl-6 space-y-2 pt-2 border-l-2">
                  <p className="text-xs text-muted-foreground mb-2">Exclure les brouillons/réponses pour :</p>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="exclude_newsletters"
                      checked={formData.exclude_newsletters}
                      onCheckedChange={(checked) => setFormData({ ...formData, exclude_newsletters: checked as boolean })}
                    />
                    <label
                      htmlFor="exclude_newsletters"
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Newsletters
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="exclude_marketing"
                      checked={formData.exclude_marketing}
                      onCheckedChange={(checked) => setFormData({ ...formData, exclude_marketing: checked as boolean })}
                    />
                    <label
                      htmlFor="exclude_marketing"
                      className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Marketing / Publicités
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
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
