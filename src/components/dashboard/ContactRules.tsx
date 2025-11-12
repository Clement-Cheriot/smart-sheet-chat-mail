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
import { GoogleContactsSync } from "./GoogleContactsSync";

interface ContactRule {
  id: string;
  email: string;
  name: string | null;
  preferred_signature_id: string | null;
  preferred_tone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Signature {
  id: string;
  name: string;
}

export const ContactRules = () => {
  const [contacts, setContacts] = useState<ContactRule[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactRule | null>(null);
  const [formData, setFormData] = useState({ email: "", name: "", preferred_signature_id: "", preferred_tone: "", notes: "" });
  const { toast } = useToast();

  useEffect(() => {
    fetchContacts();
    fetchSignatures();
  }, []);

  const fetchContacts = async () => {
    const { data, error } = await supabase
      .from("contact_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les contacts", variant: "destructive" });
    } else {
      setContacts(data || []);
    }
  };

  const fetchSignatures = async () => {
    const { data } = await supabase.from("signature_rules").select("id, name");
    setSignatures(data || []);
  };

  const handleSubmit = async () => {
    if (!formData.email?.trim()) {
      toast({ title: "Erreur", description: "L'email est requis", variant: "destructive" });
      return;
    }
    
    // Validation basique de l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
      toast({ title: "Erreur", description: "Format d'email invalide", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Erreur", description: "Utilisateur non connecté", variant: "destructive" });
        return;
      }
      
      const contactData = {
        email: formData.email.trim().toLowerCase(),
        name: formData.name?.trim() || null,
        preferred_signature_id: formData.preferred_signature_id === "none" ? null : formData.preferred_signature_id || null,
        preferred_tone: formData.preferred_tone === "none" ? null : formData.preferred_tone || null,
        notes: formData.notes?.trim() || null
      };

      if (editingContact) {
        const { error } = await supabase
          .from("contact_rules")
          .update(contactData)
          .eq("id", editingContact.id);

        if (error) {
          console.error("Erreur mise à jour:", error);
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Succès", description: "Contact modifié" });
      } else {
        const { error } = await supabase
          .from("contact_rules")
          .insert([{ ...contactData, user_id: user.id }]);

        if (error) {
          console.error("Erreur insertion:", error);
          toast({ title: "Erreur", description: error.message, variant: "destructive" });
          return;
        }
        toast({ title: "Succès", description: "Contact créé" });
      }
      
      await fetchContacts();
      setIsDialogOpen(false);
      resetForm();
    } catch (e: any) {
      console.error("Erreur handleSubmit:", e);
      toast({ title: "Erreur", description: e.message || "Erreur inattendue", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("contact_rules").delete().eq("id", id);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer le contact", variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Contact supprimé" });
      fetchContacts();
    }
  };

  const resetForm = () => {
    setFormData({ email: "", name: "", preferred_signature_id: "none", preferred_tone: "none", notes: "" });
    setEditingContact(null);
  };

  const openEditDialog = (contact: ContactRule) => {
    setEditingContact(contact);
    setFormData({
      email: contact.email,
      name: contact.name || "",
      preferred_signature_id: contact.preferred_signature_id || "none",
      preferred_tone: contact.preferred_tone || "none",
      notes: contact.notes || ""
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <GoogleContactsSync />
      
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Règles Contacts</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nouveau contact</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingContact ? "Modifier" : "Créer"} un contact</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email *</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div>
                <Label>Nom</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <Label>Signature préférée</Label>
                <Select value={formData.preferred_signature_id} onValueChange={(value) => setFormData({ ...formData, preferred_signature_id: value })}>
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
                <Label>Ton préféré</Label>
                <Select value={formData.preferred_tone} onValueChange={(value) => setFormData({ ...formData, preferred_tone: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un ton" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    <SelectItem value="formel">Formel</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
              </div>
              <Button onClick={handleSubmit}>{editingContact ? "Modifier" : "Créer"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {contacts.map((contact) => (
          <Card key={contact.id} className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{contact.name || contact.email}</h3>
                {contact.name && <p className="text-sm text-muted-foreground">{contact.email}</p>}
                {contact.preferred_tone && <p className="text-xs text-muted-foreground mt-1">Ton: {contact.preferred_tone}</p>}
                {contact.preferred_signature_id && (
                  <p className="text-xs text-muted-foreground">Signature: {signatures.find(s => s.id === contact.preferred_signature_id)?.name}</p>
                )}
                {contact.notes && <p className="text-sm text-muted-foreground mt-2">{contact.notes}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => openEditDialog(contact)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(contact.id)}>
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
