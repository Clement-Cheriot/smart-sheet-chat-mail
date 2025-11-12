import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, Users, Mail, Phone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

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
        description: error.message || 'Impossible de synchroniser les contacts',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

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
        <CardContent>
          {contacts.length === 0 ? (
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
              {contacts.map((contact) => (
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