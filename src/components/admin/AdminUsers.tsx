import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { User, Shield, ShieldOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserRecord {
  id: string;
  full_name: string;
  created_at: string;
  email?: string;
  role?: 'admin' | 'user';
}

export const AdminUsers = () => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      // Get profiles with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, created_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge profiles with roles
      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        role: roles?.find(r => r.user_id === profile.id)?.role || 'user' as 'admin' | 'user'
      })) || [];

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAdminRole = async (userId: string, currentRole: 'admin' | 'user') => {
    try {
      if (currentRole === 'admin') {
        // Remove admin role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId);

        if (error) throw error;

        toast({
          title: 'Rôle modifié',
          description: 'L\'utilisateur n\'est plus administrateur.',
        });
      } else {
        // Add admin role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'admin' });

        if (error) throw error;

        toast({
          title: 'Rôle modifié',
          description: 'L\'utilisateur est maintenant administrateur.',
        });
      }

      // Reload users
      loadUsers();
    } catch (error: any) {
      console.error('Error toggling admin role:', error);
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <div
          key={user.id}
          className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{user.full_name || 'Sans nom'}</p>
                  {user.role === 'admin' && (
                    <Badge variant="default" className="text-xs">
                      <Shield className="h-3 w-3 mr-1" />
                      Admin
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Inscrit {formatDistanceToNow(new Date(user.created_at), { addSuffix: true, locale: fr })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Actif</Badge>
              <Button
                variant={user.role === 'admin' ? 'destructive' : 'default'}
                size="sm"
                onClick={() => toggleAdminRole(user.id, user.role || 'user')}
              >
                {user.role === 'admin' ? (
                  <>
                    <ShieldOff className="h-4 w-4 mr-1" />
                    Retirer admin
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-1" />
                    Rendre admin
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
