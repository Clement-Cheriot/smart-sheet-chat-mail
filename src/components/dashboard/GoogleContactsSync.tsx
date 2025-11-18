import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, Users, Mail, Phone, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Contact {
  id: string;
  contact_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  labels: string[] | null;
  notes: string | null;
  last_synced_at: string;
}

export const GoogleContactsSync = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string }>>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadContacts();
    }
  }, [user]);

  const loadContacts = async () => {
    try {
      const { data, error } = (await supabase
        .from('google_contacts' as any)
        .select('*')
        .eq('user_id', user?.id)
        .order('name', { ascending: true })) as any;

      if (error) throw error;

      setContacts((data || []) as any);
      
      // Get contact groups to map IDs to names
      const { data: groupsData } = await supabase
        .from('contact_groups')
        .select('id, name, google_group_id')
        .eq('user_id', user?.id);

      // Create a map of google_group_id to group name
      const groupMap = new Map<string, string>();
      (groupsData || []).forEach((group: any) => {
        if (group.google_group_id) {
          groupMap.set(group.google_group_id, group.name);
        }
      });

      // Extract unique groups with their names
      const groupsSet = new Map<string, string>();
      (data || []).forEach((contact: Contact) => {
        contact.labels?.forEach(labelId => {
          const groupName = groupMap.get(labelId);
          if (groupName) {
            groupsSet.set(labelId, groupName);
          }
        });
      });
      
      const groupsArray = Array.from(groupsSet, ([id, name]) => ({ id, name }));
      setAvailableGroups(groupsArray.sort((a, b) => a.name.localeCompare(b.name)));
      
      if (data && data.length > 0) {
        const mostRecent = data.reduce((latest: Date, contact: any) => {
          const contactDate = new Date(contact.last_synced_at);
          return contactDate > latest ? contactDate : latest;
        }, new Date(0));
        setLastSync(mostRecent);
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les contacts',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const syncContacts = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('google-contacts-sync');

      if (error) throw error;

      toast({
        title: 'Synchronisation réussie',
        description: 'Vos contacts Google ont été synchronisés',
      });

      await loadContacts();
    } catch (error: any) {
      console.error('Error syncing contacts:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Erreur lors de la synchronisation',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const createContactRulesForGroup = async (groupName: string) => {
    try {
      const groupContacts = contacts.filter(c => c.labels?.includes(groupName));
      
      if (groupContacts.length === 0) {
        toast({
          title: 'Aucun contact',
          description: 'Aucun contact dans ce groupe',
          variant: 'destructive',
        });
        return;
      }

      // Check which contacts don't already have rules
      const { data: existingRules } = await supabase
        .from('contact_rules')
        .select('email')
        .eq('user_id', user?.id);

      const existingEmails = new Set(existingRules?.map(r => r.email) || []);
      const newContacts = groupContacts.filter(c => !existingEmails.has(c.email));

      if (newContacts.length === 0) {
        toast({
          title: 'Aucun nouveau contact',
          description: 'Tous les contacts de ce groupe ont déjà des règles',
        });
        return;
      }

      // Create contact rules for new contacts
      const rulesToInsert = newContacts.map(contact => ({
        user_id: user?.id,
        email: contact.email,
        name: contact.name,
        notes: `Ajouté depuis le groupe: ${groupName}`,
        auto_reply_enabled: false,
      }));

      const { error } = await supabase
        .from('contact_rules')
        .insert(rulesToInsert);

      if (error) throw error;

      toast({
        title: 'Règles créées',
        description: `${newContacts.length} règles de contact créées pour le groupe "${groupName}"`,
      });
    } catch (error: any) {
      console.error('Error creating contact rules:', error);
      toast({
        title: 'Erreur',
        description: error.message || 'Erreur lors de la création des règles',
        variant: 'destructive',
      });
    }
  };

  const filteredContacts = selectedGroup === 'all' 
    ? contacts 
    : contacts.filter(c => c.labels?.includes(selectedGroup));

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Chargement...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Contacts Google
              </CardTitle>
              <CardDescription>
                {contacts.length} contact{contacts.length > 1 ? 's' : ''} synchronisé{contacts.length > 1 ? 's' : ''}
                {lastSync && (
                  <span className="ml-2">
                    • Dernière sync {formatDistanceToNow(lastSync, { addSuffix: true, locale: fr })}
                  </span>
                )}
              </CardDescription>
            </div>
            <Button onClick={syncContacts} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Synchronisation...' : 'Synchroniser'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter and Group Actions */}
          {availableGroups.length > 0 && (
            <div className="flex gap-2 items-center">
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrer par groupe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les contacts</SelectItem>
                  {availableGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name} ({contacts.filter(c => c.labels?.includes(group.id)).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedGroup !== 'all' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const groupName = availableGroups.find(g => g.id === selectedGroup)?.name;
                    if (groupName) createContactRulesForGroup(groupName);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Créer règles pour "{availableGroups.find(g => g.id === selectedGroup)?.name}"
                </Button>
              )}
            </div>
          )}

          {filteredContacts.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Aucun contact synchronisé
              </p>
              <Button onClick={syncContacts} disabled={syncing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                Synchroniser maintenant
              </Button>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {contact.name || 'Sans nom'}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {contact.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3" />
                          {contact.email}
                        </span>
                      )}
                      {contact.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {contact.phone}
                        </span>
                      )}
                    </div>
                    {contact.labels && contact.labels.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {contact.labels.map((label, i) => (
                          <span
                            key={i}
                            className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};