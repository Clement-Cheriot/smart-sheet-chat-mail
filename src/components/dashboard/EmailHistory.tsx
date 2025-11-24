import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Mail, Tag, Clock, ChevronDown, Check, X, Lightbulb, Brain, Calendar, MessageSquare, Trash, RefreshCw } from 'lucide-react';
import { RuleReinforcementDialog } from './RuleReinforcementDialog';
import { EmailAIActions } from './EmailAIActions';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EmailRecord {
  id: string;
  sender: string;
  subject: string;
  received_at: string;
  applied_label: string | string[];
  priority_score: number;
  draft_created: boolean;
  draft_id: string | null;
  body_summary: string | null;
  ai_reasoning: string | null;
  suggested_new_label: string | null;
  rule_reinforcement_suggestion: string | null;
  actions_taken: any[];
  label_validation_status: string;
  rule_reinforcement_status: string;
  telegram_notified: boolean;
  ai_analysis: any;
  confidence?: number;
  draft_content?: string;
  auto_response_content?: string;
  rule_reinforcement?: any;
  calendar_details?: any;
  needs_response?: boolean;
  needs_calendar_action?: boolean;
}

export const EmailHistory = () => {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [ruleReinforcementDialogOpen, setRuleReinforcementDialogOpen] = useState(false);
  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadEmails();
      loadExistingLabels();
    }
  }, [user]);

  const loadExistingLabels = async () => {
    try {
      const { data: rulesData } = await supabase
        .from('email_rules')
        .select('label_to_apply')
        .eq('user_id', user?.id)
        .eq('is_active', true);

      const { data: historyData } = await supabase
        .from('email_history')
        .select('applied_label')
        .eq('user_id', user?.id);

      const labels = new Set<string>();
      rulesData?.forEach(r => r.label_to_apply && labels.add(r.label_to_apply));
      historyData?.forEach(h => {
        if (Array.isArray(h.applied_label)) {
          h.applied_label.forEach(l => labels.add(l));
        } else if (h.applied_label) {
          labels.add(h.applied_label);
        }
      });

      setExistingLabels(Array.from(labels));
    } catch (error) {
      console.error('Error loading labels:', error);
    }
  };

  const loadEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('email_history')
        .select('*')
        .eq('user_id', user?.id)
        .order('received_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEmails((data || []) as any);
    } catch (error) {
      console.error('Error loading emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateLabel = async (emailId: string, accepted: boolean) => {
    try {
      const { error } = await supabase
        .from('email_history')
        .update({ label_validation_status: accepted ? 'accepted' : 'rejected' })
        .eq('id', emailId);

      if (error) throw error;

      setEmails(emails.map(e => 
        e.id === emailId ? { ...e, label_validation_status: accepted ? 'accepted' : 'rejected' } : e
      ));

      toast({ 
        title: 'Succès', 
        description: accepted ? 'Label validé' : 'Label rejeté' 
      });
    } catch (error) {
      console.error('Error validating label:', error);
      toast({ title: 'Erreur', description: 'Impossible de valider', variant: 'destructive' });
    }
  };

  const syncEmails = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-sync', {
        body: { userId: user?.id }
      });

      if (error) throw error;

      toast({
        title: 'Synchronisation réussie',
        description: `${data.processedCount} nouveaux emails ont été traités`,
      });
      
      // Reload emails after sync
      await loadEmails();
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
    }
  };

  const [isClearing, setIsClearing] = useState(false);

  const clearAllEmails = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer tout l\'historique des emails ?')) return;
    
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from('email_history')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;

      // Advance sync checkpoint to now to avoid reimporting old emails
      await supabase
        .from('gmail_sync_state')
        .upsert(
          { user_id: user?.id as string, last_synced_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );

      setEmails([]);
      toast({
        title: 'Historique vidé',
        description: 'Le cache a été réinitialisé, les anciens emails ne seront plus rechargés',
      });
    } catch (error: any) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setIsClearing(false);
    }
  };

  const getPriorityColor = (score: number): "default" | "destructive" | "outline" | "secondary" => {
    if (score >= 7) return 'destructive';
    if (score >= 4) return 'default';
    return 'secondary';
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 90) return 'bg-green-500/10 text-green-700 border-green-500/20';
    if (confidence >= 70) return 'bg-orange-500/10 text-orange-700 border-orange-500/20';
    return 'bg-red-500/10 text-red-700 border-red-500/20';
  };

  const getDisplaySender = (s: string) => {
    if (!s) return 'Inconnu';
    const match = s.match(/(.+?)<(.+?)>/);
    if (match) {
      const name = match[1].trim().replace(/"/g, '');
      const email = match[2].trim();
      return `${name} (${email})`;
    }
    return s;
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

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'label': return <Tag className="h-3 w-3" />;
      case 'draft_created': return <Mail className="h-3 w-3" />;
      case 'manual_review': return <Brain className="h-3 w-3" />;
      case 'calendar_needed': return <Calendar className="h-3 w-3" />;
      case 'telegram_urgent': return <MessageSquare className="h-3 w-3" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={syncEmails} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchronisation...' : 'Synchroniser les emails'}
        </Button>
        {emails.length > 0 && (
          <Button variant="outline" onClick={clearAllEmails} disabled={isClearing}>
            <Trash className="mr-2 h-4 w-4" />
            {isClearing ? 'Suppression...' : 'Vider le cache'}
          </Button>
        )}
      </div>
      {emails.map((email) => (
        <Card key={email.id}>
          <Collapsible>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <p className="font-medium truncate">Expéditeur : {getDisplaySender(email.sender)}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Clock className="h-3 w-3" />
                    <span>
                      {new Date(email.received_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })} à {new Date(email.received_at).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-muted-foreground/70">
                      ({formatDistanceToNow(new Date(email.received_at), {
                        addSuffix: true,
                        locale: fr,
                      })})
                    </span>
                  </div>
                  <CardTitle className="text-sm font-medium mb-1">
                    {email.subject || 'Sans objet'}
                  </CardTitle>
                  {email.body_summary && (
                    <CardDescription className="text-xs line-clamp-2">
                      {email.body_summary}
                    </CardDescription>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-2 mb-2">
                    {email.confidence !== undefined && (
                      <Badge className={`text-xs border ${getConfidenceColor(email.confidence)}`}>
                        {email.confidence}%
                      </Badge>
                    )}
                    {email.priority_score && (
                      <Badge variant={getPriorityColor(email.priority_score)} className="text-xs">
                        Priorité {email.priority_score}/10
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Actions effectuées :</p>
                <div className="flex flex-col gap-2">
                  {email.applied_label && Array.isArray(email.applied_label) && email.applied_label.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <Tag className="h-3 w-3 text-primary" />
                      <span className="font-medium">Labels :</span>
                      <div className="flex flex-wrap gap-1">
                        {email.applied_label.map((label: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">{label}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {email.draft_created && email.draft_id && (
                    <div className="flex items-center gap-2 text-xs">
                      <Mail className="h-3 w-3 text-blue-500" />
                      <span className="font-medium">Brouillon créé dans Gmail</span>
                    </div>
                  )}
                  
                  {email.telegram_notified && (
                    <div className="flex items-center gap-2 text-xs">
                      <MessageSquare className="h-3 w-3 text-green-500" />
                      <span className="font-medium">Notification Telegram envoyée</span>
                    </div>
                  )}
                  
                  {email.needs_calendar_action && email.calendar_details && (
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="h-3 w-3 text-orange-500" />
                      <span className="font-medium">Événement calendrier détecté</span>
                    </div>
                  )}

                  {email.rule_reinforcement && 
                   (email.rule_reinforcement.add_keywords?.length > 0 || email.rule_reinforcement.add_domains?.length > 0) && (
                    <div className="flex items-center gap-2 text-xs">
                      <Lightbulb className="h-3 w-3 text-blue-500" />
                      <span className="font-medium">Suggestion de renforcement disponible</span>
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="h-auto p-0 text-xs"
                        onClick={() => {
                          setSelectedEmail(email);
                          setRuleReinforcementDialogOpen(true);
                        }}
                      >
                        Voir
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <EmailAIActions 
                email={email} 
                onUpdate={loadEmails}
                existingLabels={existingLabels}
              />
            </CardContent>

            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full">
                <ChevronDown className="h-4 w-4 mr-2" />
                Voir le raisonnement IA
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-4 space-y-4 border-t">
                {email.ai_reasoning && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Brain className="h-4 w-4" />
                    Raisonnement de l'IA
                  </div>
                  <p className="text-sm text-muted-foreground pl-6">
                    {email.ai_reasoning}
                  </p>
                </div>
                )}

                {email.suggested_new_label && (
                  <div className="space-y-2 p-3 bg-accent/50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      Suggestion de nouveau label
                    </div>
                    <div className="flex items-center justify-between pl-6">
                      <p className="text-sm">{email.suggested_new_label}</p>
                      {email.label_validation_status === 'pending' && (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => validateLabel(email.id, true)}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Accepter
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => validateLabel(email.id, false)}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Refuser
                          </Button>
                        </div>
                      )}
                      {email.label_validation_status === 'accepted' && (
                        <Badge variant="default">Accepté</Badge>
                      )}
                      {email.label_validation_status === 'rejected' && (
                        <Badge variant="destructive">Refusé</Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}

      {selectedEmail && (
        <RuleReinforcementDialog
          email={selectedEmail}
          open={ruleReinforcementDialogOpen}
          onOpenChange={setRuleReinforcementDialogOpen}
          onUpdated={loadEmails}
        />
      )}
    </div>
  );
};
