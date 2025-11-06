import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Trash2, Edit, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DraftRule {
  id: string;
  name: string;
  template: string;
  signature_id: string | null;
  conditions: any;
  created_at: string;
  updated_at: string;
}

interface Signature {
  id: string;
  name: string;
}

export const DraftRules = () => {
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DraftRule | null>(null);
  const [formData, setFormData] = useState({ name: "", template: "", signature_id: "", conditions: "" });
  const { toast } = useToast();

  useEffect(() => {
    fetchRules();
    fetchSignatures();
  }, []);

  const fetchRules = async () => {
    const { data, error } = await supabase
      .from("draft_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les règles", variant: "destructive" });
    } else {
      setRules(data || []);
    }
  };

  const fetchSignatures = async () => {
    const { data } = await supabase.from("signature_rules").select("id, name");
    setSignatures(data || []);
  };

  const handleSubmit = async () => {
    if (!formData.name?.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis", variant: "destructive" });
      return;
    }
    if (!formData.template?.trim()) {
      toast({ title: "Erreur", description: "Le template est requis", variant: "destructive" });
      return;
    }

    try {
      let conditions = null;
      if (formData.conditions?.trim()) {
        try {
          conditions = JSON.parse(formData.conditions);
        } catch (parseError) {
          toast({ title: "Erreur", description: "Le JSON des conditions est invalide", variant: "destructive" });
          return;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Erreur", description: "Utilisateur non connecté", variant: "destructive" });
        return;
      }
      
      const ruleData = {
        name: formData.name.trim(),
        template: formData.template.trim(),
        signature_id: formData.signature_id === "none" ? null : formData.signature_id || null,
        conditions
      };

      if (editingRule) {
        const { error } = await supabase
          .from("draft_rules")
          .update(ruleData)
          .eq("id", editingRule.id);

        if (error) {
          console.error("Erreur mise à jour:", error);
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Succès", description: "Règle de brouillon modifiée" });
      } else {
        const { error } = await supabase
          .from("draft_rules")
          .insert([{ ...ruleData, user_id: user.id }]);

        if (error) {
          console.error("Erreur insertion:", error);
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Succès", description: "Règle de brouillon créée" });
      }
      
      await fetchRules();
      setIsDialogOpen(false);
      resetForm();
    } catch (e: any) {
      console.error("Erreur handleSubmit:", e);
      toast({ title: "Erreur", description: e.message || "Erreur inattendue", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("draft_rules").delete().eq("id", id);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer la règle", variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Règle supprimée" });
      fetchRules();
    }
  };

  const resetForm = () => {
    setFormData({ name: "", template: "", signature_id: "none", conditions: "" });
    setEditingRule(null);
  };

  const openEditDialog = (rule: DraftRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      template: rule.template,
      signature_id: rule.signature_id || "none",
      conditions: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : ""
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Règles de Brouillons</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nouvelle règle</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingRule ? "Modifier" : "Créer"} une règle de brouillon</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nom</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <Label>Template</Label>
                <Textarea rows={6} value={formData.template} onChange={(e) => setFormData({ ...formData, template: e.target.value })} />
              </div>
              <div>
                <Label>Signature</Label>
                <Select value={formData.signature_id} onValueChange={(value) => setFormData({ ...formData, signature_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une signature" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {signatures.map((sig) => (
                      <SelectItem key={sig.id} value={sig.id}>{sig.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Conditions (JSON optionnel)</Label>
                <Textarea rows={4} value={formData.conditions} onChange={(e) => setFormData({ ...formData, conditions: e.target.value })} placeholder='{"labels": ["PRO"], "keywords": ["urgent"]}' />
              </div>
              <Button onClick={handleSubmit}>{editingRule ? "Modifier" : "Créer"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {rules.map((rule) => (
          <Card key={rule.id} className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{rule.name}</h3>
                <pre className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{rule.template}</pre>
                {rule.signature_id && (
                  <p className="text-xs text-muted-foreground mt-2">Signature: {signatures.find(s => s.id === rule.signature_id)?.name}</p>
                )}
                {rule.conditions && (
                  <pre className="text-xs text-muted-foreground mt-2 bg-muted p-2 rounded">
                    {JSON.stringify(rule.conditions, null, 2)}
                  </pre>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => openEditDialog(rule)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(rule.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
