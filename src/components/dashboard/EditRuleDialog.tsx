import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { ContactGroupSelector } from './ContactGroupSelector';

interface EditRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: any;
  onSuccess: () => void;
  ruleType?: 'label' | 'draft' | 'auto-reply' | 'notification';
}

export const EditRuleDialog = ({ open, onOpenChange, rule, onSuccess, ruleType = 'label' }: EditRuleDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    label_to_apply: rule.label_to_apply || '',
    priority: rule.priority || 'medium',
    sender_pattern: rule.sender_pattern || '',
    keywords: Array.isArray(rule.keywords) ? rule.keywords.join(', ') : '',
    response_template: rule.response_template || '',
    description: rule.description || '',
    create_draft: rule.create_draft || ruleType === 'draft',
    auto_reply: rule.auto_reply || ruleType === 'auto-reply',
    notify_urgent: rule.notify_urgent || ruleType === 'notification',
    contact_id: rule.contact_id || null,
    contact_group_id: rule.contact_group_id || null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const ruleData: any = {
        priority: formData.priority,
        sender_pattern: formData.sender_pattern || null,
        keywords: formData.keywords ? formData.keywords.split(',').map(k => k.trim()).filter(Boolean) : null,
        description: formData.description || '',
        exclude_newsletters: true, // Géré par keywords négatifs maintenant
        exclude_marketing: true,   // Géré par keywords négatifs maintenant
        contact_id: formData.contact_id || null,
        contact_group_id: formData.contact_group_id || null,
      };

      // Type-specific fields
      if (ruleType === 'label') {
        ruleData.label_to_apply = formData.label_to_apply;
        ruleData.create_draft = false;
        ruleData.auto_reply = false;
        ruleData.notify_urgent = false;
        ruleData.response_template = null;
      } else if (ruleType === 'draft') {
        ruleData.label_to_apply = null;
        ruleData.create_draft = true;
        ruleData.auto_reply = false;
        ruleData.notify_urgent = false;
        ruleData.response_template = null;
      } else if (ruleType === 'auto-reply') {
        ruleData.label_to_apply = null;
        ruleData.create_draft = false;
        ruleData.auto_reply = true;
        ruleData.notify_urgent = false;
        ruleData.response_template = formData.response_template || null;
      } else if (ruleType === 'notification') {
        ruleData.label_to_apply = null;
        ruleData.create_draft = false;
        ruleData.auto_reply = false;
        ruleData.notify_urgent = true;
        ruleData.response_template = null;
      }

      let error;
      if (rule.id) {
        // Update existing rule
        ruleData.updated_at = new Date().toISOString();
        const result = await supabase
          .from('email_rules')
          .update(ruleData)
          .eq('id', rule.id);
        error = result.error;
      } else {
        // Create new rule
        ruleData.user_id = rule.user_id;
        ruleData.is_active = true;
        ruleData.rule_order = 999; // Will be ordered later
        const result = await supabase
          .from('email_rules')
          .insert([ruleData]);
        error = result.error;
      }

      if (error) throw error;

      toast({
        title: rule.id ? 'Règle modifiée' : 'Règle créée',
        description: rule.id ? 'La règle a été mise à jour avec succès' : 'La règle a été créée avec succès',
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
          <DialogTitle>{rule.id ? 'Modifier' : 'Créer'} une règle</DialogTitle>
          <DialogDescription>
            {ruleType === 'label' && 'Créez une règle pour appliquer automatiquement un label'}
            {ruleType === 'draft' && 'Créez une règle pour générer automatiquement un brouillon de réponse'}
            {ruleType === 'auto-reply' && 'Créez une règle pour envoyer automatiquement une réponse'}
            {ruleType === 'notification' && 'Créez une règle pour recevoir des notifications urgentes'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {ruleType === 'label' && (
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
          )}

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
              placeholder="Ex: urgent, facture, -newsletter, -marketing"
            />
            <p className="text-xs text-muted-foreground">
              Séparez les mots-clés par des virgules. Préfixez par "-" pour exclure (ex: -newsletter)
            </p>
          </div>

          <ContactGroupSelector
            contactId={formData.contact_id}
            contactGroupId={formData.contact_group_id}
            onContactChange={(id) => setFormData({ ...formData, contact_id: id })}
            onGroupChange={(id) => setFormData({ ...formData, contact_group_id: id })}
          />

          {ruleType === 'auto-reply' && (
            <div className="space-y-2">
              <Label htmlFor="template">Modèle de réponse automatique *</Label>
              <Textarea
                id="template"
                value={formData.response_template}
                onChange={(e) => setFormData({ ...formData, response_template: e.target.value })}
                placeholder="Votre modèle de réponse automatique..."
                rows={4}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">Description / Notes (éditable par vous et l'IA)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ajoutez des notes, contexte ou instructions pour l'IA. L'IA ajoutera aussi des feedbacks ici lors de l'apprentissage."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Cette description est utilisée par l'IA pour affiner sa compréhension de cette règle. 
              L'IA enrichira automatiquement cette section avec vos corrections.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (rule.id ? 'Modification...' : 'Création...') : (rule.id ? 'Enregistrer' : 'Créer')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
