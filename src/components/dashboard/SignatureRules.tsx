import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Trash2, Edit, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Signature {
  id: string;
  name: string;
  content: string;
  conditions: any;
  created_at: string;
  updated_at: string;
}

export const SignatureRules = () => {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSignature, setEditingSignature] = useState<Signature | null>(null);
  const [formData, setFormData] = useState({ name: "", content: "", conditions: "" });
  const { toast } = useToast();

  useEffect(() => {
    fetchSignatures();
  }, []);

  const fetchSignatures = async () => {
    const { data, error } = await supabase
      .from("signature_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erreur", description: "Impossible de charger les signatures", variant: "destructive" });
    } else {
      setSignatures(data || []);
    }
  };

  const handleSubmit = async () => {
    const conditions = formData.conditions ? JSON.parse(formData.conditions) : null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    if (editingSignature) {
      const { error } = await supabase
        .from("signature_rules")
        .update({ name: formData.name, content: formData.content, conditions })
        .eq("id", editingSignature.id);

      if (error) {
        toast({ title: "Erreur", description: "Impossible de modifier la signature", variant: "destructive" });
      } else {
        toast({ title: "Succès", description: "Signature modifiée" });
        fetchSignatures();
        setIsDialogOpen(false);
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from("signature_rules")
        .insert([{ name: formData.name, content: formData.content, conditions, user_id: user.id }]);

      if (error) {
        toast({ title: "Erreur", description: "Impossible de créer la signature", variant: "destructive" });
      } else {
        toast({ title: "Succès", description: "Signature créée" });
        fetchSignatures();
        setIsDialogOpen(false);
        resetForm();
      }
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("signature_rules").delete().eq("id", id);

    if (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer la signature", variant: "destructive" });
    } else {
      toast({ title: "Succès", description: "Signature supprimée" });
      fetchSignatures();
    }
  };

  const resetForm = () => {
    setFormData({ name: "", content: "", conditions: "" });
    setEditingSignature(null);
  };

  const openEditDialog = (signature: Signature) => {
    setEditingSignature(signature);
    setFormData({
      name: signature.name,
      content: signature.content,
      conditions: signature.conditions ? JSON.stringify(signature.conditions, null, 2) : ""
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Signatures</h2>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Nouvelle signature</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingSignature ? "Modifier" : "Créer"} une signature</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nom</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <Label>Contenu</Label>
                <Textarea rows={6} value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} />
              </div>
              <div>
                <Label>Conditions (JSON optionnel)</Label>
                <Textarea rows={4} value={formData.conditions} onChange={(e) => setFormData({ ...formData, conditions: e.target.value })} placeholder='{"labels": ["PRO"], "keywords": ["urgent"]}' />
              </div>
              <Button onClick={handleSubmit}>{editingSignature ? "Modifier" : "Créer"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {signatures.map((sig) => (
          <Card key={sig.id} className="p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{sig.name}</h3>
                <pre className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{sig.content}</pre>
                {sig.conditions && (
                  <pre className="text-xs text-muted-foreground mt-2 bg-muted p-2 rounded">
                    {JSON.stringify(sig.conditions, null, 2)}
                  </pre>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => openEditDialog(sig)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(sig.id)}>
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
