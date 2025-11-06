import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Trash2, Edit, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CalendarRule {
  id: string;
  name: string;
  action_type: string;
  conditions: any;
  exclude_noreply: boolean;
  created_at: string;
  updated_at: string;
}

export const CalendarRules = () => {
  const [rules, setRules] = useState<CalendarRule[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CalendarRule | null>(null);
  const [formData, setFormData] = useState({ name: "", action_type: "create_event", conditions: "", exclude_noreply: true });
  const { toast } = useToast();

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    const { data, error } = await supabase
      .from("calendar_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les règles", variant: "destructive" });
    } else {
      setRules(data || []);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({ title: "Erreur", description: "Le nom est requis", variant: "destructive" });
      return;
    }

    try {
      const conditions = formData.conditions ? JSON.parse(formData.conditions) : null;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Erreur", description: "Utilisateur non connecté", variant: "destructive" });
        return;
      }
      
      if (editingRule) {
        const { error } = await supabase
          .from("calendar_rules")
          .update({ name: formData.name, action_type: formData.action_type, conditions, exclude_noreply: formData.exclude_noreply })
          .eq("id", editingRule.id);

        if (error) {
          console.error("Erreur mise à jour:", error);
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Succès", description: "Règle modifiée" });
          fetchRules();
          setIsDialogOpen(false);
          resetForm();
        }
      } else {
        const { error } = await supabase
          .from("calendar_rules")
          .insert([{ name: formData.name, action_type: formData.action_type, conditions, exclude_noreply: formData.exclude_noreply, user_id: user.id }]);

        if (error) {
          console.error("Erreur insertion:", error);
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Succès", description: "Règle créée" });
          fetchRules();
          setIsDialogOpen(false);
          resetForm();
        }
      }
    } catch (e) {
      console.error("Erreur:", e);
      toast({ title: "Erreur", description: "Erreur lors de la validation des données", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("calendar_rules").delete().eq("id", id);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer la règle", variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Règle supprimée" });
      fetchRules();
    }
  };

  const resetForm = () => {
    setFormData({ name: "", action_type: "create_event", conditions: "", exclude_noreply: true });
    setEditingRule(null);
  };

  const openEditDialog = (rule: CalendarRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      action_type: rule.action_type,
      conditions: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : "",
      exclude_noreply: rule.exclude_noreply
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Règles Calendrier</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nouvelle règle</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingRule ? "Modifier" : "Créer"} une règle calendrier</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nom</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <Label>Type d'action</Label>
                <Select value={formData.action_type} onValueChange={(value) => setFormData({ ...formData, action_type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="create_event">Créer événement</SelectItem>
                    <SelectItem value="remind">Rappeler</SelectItem>
                    <SelectItem value="decline">Décliner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch checked={formData.exclude_noreply} onCheckedChange={(checked) => setFormData({ ...formData, exclude_noreply: checked })} />
                <Label>Exclure les no-reply</Label>
              </div>
              <div>
                <Label>Conditions (JSON optionnel)</Label>
                <Textarea rows={4} value={formData.conditions} onChange={(e) => setFormData({ ...formData, conditions: e.target.value })} placeholder='{"keywords": ["réunion", "meeting", "rdv"]}' />
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
                <p className="text-sm text-muted-foreground">Action: {rule.action_type}</p>
                <p className="text-xs text-muted-foreground">Exclure no-reply: {rule.exclude_noreply ? "Oui" : "Non"}</p>
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
