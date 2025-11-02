import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Mail, Tag, Clock } from 'lucide-react';

interface EmailRecord {
  id: string;
  sender: string;
  subject: string;
  received_at: string;
  applied_label: string;
  priority_score: number;
  draft_created: boolean;
}

export const EmailHistory = () => {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadEmails();
    }
  }, [user]);

  const loadEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('email_history')
        .select('id, sender, subject, received_at, applied_label, priority_score, draft_created')
        .eq('user_id', user?.id)
        .order('received_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEmails(data || []);
    } catch (error) {
      console.error('Error loading emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (score: number): "default" | "destructive" | "outline" | "secondary" => {
    if (score >= 7) return 'destructive';
    if (score >= 4) return 'default';
    return 'secondary';
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Chargement...</div>;
  }

  if (emails.length === 0) {
    return (
      <div className="text-center py-12">
        <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Aucun email traité pour le moment</p>
        <p className="text-sm text-muted-foreground mt-2">
          Configurez vos webhooks Gmail pour commencer
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {emails.map((email) => (
        <div
          key={email.id}
          className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <p className="font-medium truncate">{email.sender}</p>
              </div>
              <p className="text-sm text-muted-foreground truncate mb-2">
                {email.subject || 'Sans objet'}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {email.applied_label && (
                  <Badge variant="outline">
                    <Tag className="h-3 w-3 mr-1" />
                    {email.applied_label}
                  </Badge>
                )}
                {email.priority_score && (
                  <Badge variant={getPriorityColor(email.priority_score)}>
                    Priorité {email.priority_score}/10
                  </Badge>
                )}
                {email.draft_created && (
                  <Badge variant="secondary">Brouillon créé</Badge>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(email.received_at), {
                  addSuffix: true,
                  locale: fr,
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
