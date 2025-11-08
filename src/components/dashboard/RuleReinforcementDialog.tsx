import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Globe, Check, X } from 'lucide-react';

interface RuleReinforcementDialogProps {
  email: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export const RuleReinforcementDialog = ({ email, open, onOpenChange, onUpdated }: RuleReinforcementDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!email || !email.rule_reinforcement) return null;

  const ruleReinforcement = email.rule_reinforcement;
  const hasKeywords = ruleReinforcement.add_keywords && ruleReinforcement.add_keywords.length > 0;
  const hasDomains = ruleReinforcement.add_domains && ruleReinforcement.add_domains.length > 0;

  const handleAccept = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data: existingRule, error: fetchError } = await supabase
        .from('email_rules')
        .select('*')
        .eq('user_id', user.id)
        .eq('label_to_apply', ruleReinforcement.label)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!existingRule) {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: "Règle introuvable.",
        });
        return;
      }

      let updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (hasKeywords) {
        const newKeywords = [...new Set([
          ...(existingRule.keywords || []),
          ...ruleReinforcement.add_keywords
        ])];
        updateData.keywords = newKeywords;
      }

      if (hasDomains) {
        const existingDomains = existingRule.sender_pattern?.split('|') || [];
        const newDomains = [...new Set([...existingDomains, ...ruleReinforcement.add_domains])];
        updateData.sender_pattern = newDomains.join('|');
      }

      updateData.description = existingRule.description
        ? `${existingRule.description}\n[${new Date().toISOString().split('T')[0]}] Règle enrichie par IA`
        : `[${new Date().toISOString().split('T')[0]}] Règle enrichie par IA`;

      const { error: updateError } = await supabase
        .from('email_rules')
        .update(updateData)
        .eq('id', existingRule.id);

      if (updateError) throw updateError;

      await supabase
        .from('email_history')
        .update({ rule_reinforcement_status: 'accepted' })
        .eq('id', email.id);

      toast({
        title: "Règle enrichie",
        description: "Les suggestions ont été appliquées.",
      });

      onUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error enriching rule:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'enrichir la règle.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await supabase
        .from('email_history')
        .update({ rule_reinforcement_status: 'rejected' })
        .eq('id', email.id);

      toast({
        title: "Suggestion rejetée",
        description: "Le renforcement n'a pas été appliqué.",
      });

      onUpdated();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error rejecting:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de rejeter la suggestion.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renforcement de règle</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            L'IA suggère d'enrichir la règle <Badge variant="outline">{ruleReinforcement.label}</Badge> avec les éléments suivants :
          </p>

          {hasKeywords && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4" />
                Mots-clés suggérés
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {ruleReinforcement.add_keywords.map((kw: string, i: number) => (
                  <Badge key={i} variant="secondary">{kw}</Badge>
                ))}
              </div>
            </div>
          )}

          {hasDomains && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe className="h-4 w-4" />
                Domaines suggérés
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {ruleReinforcement.add_domains.map((domain: string, i: number) => (
                  <Badge key={i} variant="secondary">{domain}</Badge>
                ))}
              </div>
            </div>
          )}

          {ruleReinforcement.reasoning && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Justification :</p>
              <p className="text-sm text-muted-foreground pl-6">
                {ruleReinforcement.reasoning.substring(0, 200)}
                {ruleReinforcement.reasoning.length > 200 ? '...' : ''}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleReject} disabled={loading}>
            <X className="mr-2 h-4 w-4" />
            Refuser
          </Button>
          <Button onClick={handleAccept} disabled={loading}>
            <Check className="mr-2 h-4 w-4" />
            Accepter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};