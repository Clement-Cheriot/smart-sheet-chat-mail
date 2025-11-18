import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Edit, Plus, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContactGroup {
  id: string;
  name: string;
  google_group_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export const ContactGroupsManager = () => {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    const { data, error } = await supabase
      .from("contact_groups")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les groupes", variant: "destructive" });
    } else {
      setGroups(data || []);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name?.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (editingGroup) {
        // Local update only (no Google API for rename)
        const { error } = await supabase
          .from("contact_groups")
          .update({
            name: formData.name.trim(),
            description: formData.description?.trim() || null,
          })
          .eq("id", editingGroup.id);

        if (error) throw error;
        toast({ title: "Succès", description: "Groupe modifié localement" });
      } else {
        // Create new group in Google Contacts
        const { data, error } = await supabase.functions.invoke('google-contact-group-create', {
          body: {
            groupName: formData.name.trim(),
            description: formData.description?.trim() || null,
          }
        });

        if (error) throw error;
        toast({ title: "Succès", description: "Groupe créé dans Google Contacts" });
      }

      await fetchGroups();
      setIsDialogOpen(false);
      setEditingGroup(null);
      setFormData({ name: "", description: "" });
    } catch (error: any) {
      console.error("Error:", error);
      toast({ 
        title: "Erreur", 
        description: error.message || "Une erreur est survenue", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce groupe ? (sera supprimé uniquement localement, pas dans Google Contacts)")) return;

    const { error } = await supabase
      .from("contact_groups")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Groupe supprimé" });
      fetchGroups();
    }
  };

  const openEditDialog = (group: ContactGroup) => {
    setEditingGroup(group);
    setFormData({ 
      name: group.name, 
      description: group.description || "" 
    });
    setIsDialogOpen(true);
  };

  const openNewDialog = () => {
    setEditingGroup(null);
    setFormData({ name: "", description: "" });
    setIsDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Groupes de contacts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="mb-4">
              <Plus className="mr-2 h-4 w-4" />
              Nouveau groupe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingGroup ? "Modifier le groupe" : "Créer un groupe"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nom du groupe *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="ex: Clients VIP"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description optionnelle"
                  rows={3}
                />
              </div>
              <Button onClick={handleSubmit} disabled={loading} className="w-full">
                {loading ? "Chargement..." : editingGroup ? "Modifier" : "Créer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun groupe. Créez-en un pour organiser vos contacts.
            </p>
          ) : (
            groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium">{group.name}</p>
                  {group.description && (
                    <p className="text-sm text-muted-foreground">{group.description}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(group)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(group.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
