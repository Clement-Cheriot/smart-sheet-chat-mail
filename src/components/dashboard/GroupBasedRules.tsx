import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Plus, Users, Tag } from 'lucide-react';

interface Contact {
  id: string;
  email: string;
  name: string | null;
  labels: string[] | null;
}

export const GroupBasedRules = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [labelName, setLabelName] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadContacts();
    }
  }, [user]);

  const loadContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('google_contacts')
        .select('id, email, name, labels')
        .eq('user_id', user?.id);

      if (error) throw error;

      setContacts(data || []);
      
      // Extract unique groups
      const groups = new Set<string>();
      (data || []).forEach((contact: Contact) => {
        contact.labels?.forEach(label => groups.add(label));
      });
      setAvailableGroups(Array.from(groups).sort());
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const createLabelRuleForGroup = async () => {
    if (!selectedGroup || !labelName) {
      toast({
        title: 'Champs manquants',
        description: 'Veuillez sélectionner un groupe et entrer un nom de label',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Get all emails from the selected group
      const groupContacts = contacts.filter(c => c.labels?.includes(selectedGroup));
      const emails = groupContacts.map(c => c.email);

      if (emails.length === 0) {
        toast({
          title: 'Aucun contact',
          description: 'Aucun contact trouvé dans ce groupe',
          variant: 'destructive',
        });
        return;
      }

      // Create a sender pattern that matches any of these emails
      // Using regex OR pattern: (email1|email2|email3)
      const escapedEmails = emails.map(email => 
        email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      const senderPattern = `(${escapedEmails.join('|')})`;

      // Create the email rule
      const { error } = await supabase
        .from('email_rules')
        .insert({
          user_id: user?.id,
          sender_pattern: senderPattern,
          label_to_apply: labelName,
          description: `[${new Date().toISOString().split('T')[0]}] Règle créée pour le groupe "${selectedGroup}" (${emails.length} contacts)`,
          priority: 'medium',
          is_active: true,
          exclude_newsletters: true,
          exclude_marketing: true,
        });

      if (error) throw error;

      toast({
        title: 'Règle créée',
        description: `Règle de label "${labelName}" créée pour ${emails.length} contacts du groupe "${selectedGroup}"`,
      });

      setIsDialogOpen(false);
      setSelectedGroup('');
      setLabelName('');
    } catch (error: any) {
      console.error('Error creating rule:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Erreur lors de la création de la règle',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Règles basées sur les groupes
        </CardTitle>
        <CardDescription>
          Créez automatiquement des règles de label pour tous les membres d'un groupe de contacts Google
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Créer une règle de groupe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer une règle basée sur un groupe</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Groupe de contacts</Label>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un groupe" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroups.map(group => (
                      <SelectItem key={group} value={group}>
                        {group} ({contacts.filter(c => c.labels?.includes(group)).length} contacts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nom du label à appliquer</Label>
                <Input
                  placeholder="ex: Clients VIP"
                  value={labelName}
                  onChange={(e) => setLabelName(e.target.value)}
                />
              </div>

              {selectedGroup && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Cette règle appliquera le label "<strong>{labelName || '...'}</strong>" à tous les emails provenant de{' '}
                    <strong>{contacts.filter(c => c.labels?.includes(selectedGroup)).length}</strong> contacts du groupe{' '}
                    "<strong>{selectedGroup}</strong>"
                  </p>
                </div>
              )}

              <Button 
                onClick={createLabelRuleForGroup} 
                disabled={loading || !selectedGroup || !labelName}
                className="w-full"
              >
                <Tag className="mr-2 h-4 w-4" />
                {loading ? 'Création...' : 'Créer la règle'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {availableGroups.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-4">
            Aucun groupe trouvé. Synchronisez d'abord vos contacts Google.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
