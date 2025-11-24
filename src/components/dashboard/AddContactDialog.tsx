import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface AddContactDialogProps {
  email: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContactAdded: () => void;
}

export const AddContactDialog = ({ email, open, onOpenChange, onContactAdded }: AddContactDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  useEffect(() => {
    if (open) {
      loadGroups();
    }
  }, [open]);

  const loadGroups = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('contact_groups')
        .select('id, name')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (error) throw error;
      setGroups(data || []);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const emailMatch = email.sender.match(/<(.+?)>/);
      const senderEmail = emailMatch ? emailMatch[1] : email.sender;
      
      // Add to contact_rules
      const { error: contactError } = await supabase
        .from('contact_rules')
        .insert({
          email: senderEmail,
          name: email.sender.split('<')[0].trim().replace(/"/g, ''),
          user_id: user.id,
        });

      if (contactError) throw contactError;

      // If a group is selected, try to add to that group via Google Contacts
      if (selectedGroupId) {
        const { data: groupData } = await supabase
          .from('contact_groups')
          .select('google_group_id')
          .eq('id', selectedGroupId)
          .single();

        if (groupData?.google_group_id) {
          // Find the contact in google_contacts
          const { data: contactData } = await supabase
            .from('google_contacts')
            .select('contact_id')
            .eq('email', senderEmail)
            .eq('user_id', user.id)
            .maybeSingle();

          if (contactData) {
            // Add contact to group via edge function
            await supabase.functions.invoke('google-contact-add-to-group', {
              body: {
                userId: user.id,
                contactId: contactData.contact_id,
                groupId: groupData.google_group_id,
              }
            });
          }
        }
      }

      toast({ 
        title: 'Contact ajouté', 
        description: selectedGroupId 
          ? 'Le contact a été ajouté avec succès au groupe sélectionné'
          : 'Le contact a été ajouté avec succès'
      });
      
      onContactAdded();
      onOpenChange(false);
      
      // Reset form
      setSelectedGroupId('');
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter ce contact</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Contact</Label>
            <div className="p-2 bg-muted rounded text-sm">
              {email?.sender || 'Inconnu'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ajouter à un groupe (optionnel)</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Aucun groupe (contact seul)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Aucun groupe</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};