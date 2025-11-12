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
  sender_patterns_exclude?: string[];
  keywords_exclude?: string[];
  auto_create_events?: boolean;
  created_at: string;
  updated_at: string;
}

export const CalendarRules = () => {
  const [rules, setRules] = useState<CalendarRule[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CalendarRule | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", 
    action_type: "create_event", 
    conditions: "", 
    exclude_noreply: true,
    sender_patterns_exclude: "",
    keywords_exclude: "",
    auto_create_events: false
  });
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
    if (!formData.name?.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis", variant: "destructive" });
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
      
      // Parse sender patterns and keywords
      const senderPatterns = formData.sender_patterns_exclude
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const keywords = formData.keywords_exclude
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const ruleData = {
        name: formData.name.trim(),
        action_type: formData.action_type,
        exclude_noreply: formData.exclude_noreply,
        sender_patterns_exclude: senderPatterns,
        keywords_exclude: keywords,
        auto_create_events: formData.auto_create_events,
        conditions
      };

      if (editingRule) {
        const { error } = await supabase
          .from("calendar_rules")
          .update(ruleData)
          .eq("id", editingRule.id);

        if (error) {
          console.error("Erreur mise à jour:", error);
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Succès", description: "Règle calendrier modifiée" });
      } else {
        const { error } = await supabase
          .from("calendar_rules")
          .insert([{ ...ruleData, user_id: user.id }]);

        if (error) {
          console.error("Erreur insertion:", error);
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Succès", description: "Règle calendrier créée" });
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
    const { error } = await supabase.from("calendar_rules").delete().eq("id", id);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer la règle", variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Règle supprimée" });
      fetchRules();
    }
  };

  const resetForm = () => {
    setFormData({ 
      name: "", 
      action_type: "create_event", 
      conditions: "", 
      exclude_noreply: true,
      sender_patterns_exclude: "",
      keywords_exclude: "",
      auto_create_events: false
    });
    setEditingRule(null);
  };

  const openEditDialog = (rule: CalendarRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      action_type: rule.action_type,
      conditions: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : "",
      exclude_noreply: rule.exclude_noreply,
      sender_patterns_exclude: (rule.sender_patterns_exclude || []).join('\n'),
      keywords_exclude: (rule.keywords_exclude || []).join('\n'),
      auto_create_events: rule.auto_create_events || false
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
              <div className="flex items-center space-x-2">
                <Switch checked={formData.auto_create_events} onCheckedChange={(checked) => setFormData({ ...formData, auto_create_events: checked })} />
                <Label>Créer automatiquement les événements</Label>
              </div>
              <div>
                <Label>Expéditeurs à exclure (un par ligne)</Label>
                <Textarea 
                  rows={3} 
                  value={formData.sender_patterns_exclude} 
                  onChange={(e) => setFormData({ ...formData, sender_patterns_exclude: e.target.value })} 
                  placeholder="netflix.com&#10;calendar-notification@google.com&#10;promotions@"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Les emails contenant ces patterns dans l'expéditeur seront exclus
                </p>
              </div>
              <div>
                <Label>Mots-clés à exclure (un par ligne)</Label>
                <Textarea 
                  rows={3} 
                  value={formData.keywords_exclude} 
                  onChange={(e) => setFormData({ ...formData, keywords_exclude: e.target.value })} 
                  placeholder="promotion&#10;newsletter&#10;publicité&#10;offre"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Les emails contenant ces mots-clés seront exclus
                </p>
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
                <p className="text-xs text-muted-foreground">Création auto: {rule.auto_create_events ? "Oui" : "Non"}</p>
                {rule.sender_patterns_exclude && rule.sender_patterns_exclude.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-2">
                    <strong>Expéditeurs exclus:</strong> {rule.sender_patterns_exclude.join(', ')}
                  </div>
                )}
                {rule.keywords_exclude && rule.keywords_exclude.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    <strong>Mots-clés exclus:</strong> {rule.keywords_exclude.join(', ')}
                  </div>
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
