import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Calendar, Clock, Plus, Trash2, Send, Copy } from 'lucide-react';

export const EmailSummary = () => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<string[]>([]);
  const [newScheduleTime, setNewScheduleTime] = useState('09:00');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [latestSummary, setLatestSummary] = useState<{ content: string; start: string; end: string } | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadSchedules();
      loadLatestSummary();
    }
  }, [user]);

  const loadSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('email_summary_schedules')
        .select('schedule_times')
        .eq('user_id', user?.id)
        .eq('is_active', true);

      if (error) throw error;

      if (Array.isArray(data)) {
        const merged = Array.from(
          new Set(data.flatMap((r: any) => r?.schedule_times || []))
        ).sort();
        setSchedules(merged);
      } else {
        setSchedules([]);
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  };

  const loadLatestSummary = async () => {
    try {
      const { data, error } = await supabase
        .from('email_summaries')
        .select('summary_content, period_start, period_end')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setLatestSummary({
          content: data.summary_content || '',
          start: data.period_start,
          end: data.period_end,
        });
      }
    } catch (error) {
      console.error('Error loading latest summary:', error);
    }
  };

  const copyToClipboard = () => {
    if (latestSummary?.content) {
      navigator.clipboard.writeText(latestSummary.content);
      toast({ title: 'Copié', description: 'Résumé copié dans le presse-papier' });
    }
  };

  const addSchedule = async () => {
    if (!newScheduleTime) {
      toast({ title: 'Erreur', description: 'Veuillez entrer une heure', variant: 'destructive' });
      return;
    }

    const updatedSchedules = [...schedules, newScheduleTime].sort();

    try {
      const { error } = await supabase
        .from('email_summary_schedules')
        .upsert(
          {
            user_id: user?.id,
            schedule_times: updatedSchedules,
            is_active: true,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      setSchedules(updatedSchedules);
      setNewScheduleTime('09:00');
      toast({ title: 'Succès', description: 'Horaire de résumé ajouté' });
    } catch (error) {
      console.error('Error adding schedule:', error);
      toast({ title: 'Erreur', description: 'Impossible d\'ajouter l\'horaire', variant: 'destructive' });
    }
  };

  const removeSchedule = async (time: string) => {
    const updatedSchedules = schedules.filter(s => s !== time);

    try {
      const { error } = await supabase
        .from('email_summary_schedules')
        .upsert(
          {
            user_id: user?.id,
            schedule_times: updatedSchedules,
            is_active: true,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      setSchedules(updatedSchedules);
      toast({ title: 'Succès', description: 'Horaire de résumé supprimé' });
    } catch (error) {
      console.error('Error removing schedule:', error);
      toast({ title: 'Erreur', description: 'Impossible de supprimer l\'horaire', variant: 'destructive' });
    }
  };

  const sendManualSummary = async () => {
    const startVal = startRef.current?.value || '';
    const endVal = endRef.current?.value || '';

    if (!startVal || !endVal) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner les dates', variant: 'destructive' });
      return;
    }

    if (new Date(startVal) > new Date(endVal)) {
      toast({ title: 'Erreur', description: 'La date de début doit être antérieure à la date de fin', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('email-summary', {
        body: {
          userId: user?.id,
          period: 'custom',
          startDate: new Date(startVal).toISOString(),
          endDate: new Date(endVal).toISOString(),
        },
      });

      if (error) throw error;

      await supabase.from('email_summaries').insert({
        user_id: user?.id,
        period_start: new Date(startVal).toISOString(),
        period_end: new Date(endVal).toISOString(),
        summary_content: data.summary,
      });

      toast({ title: 'Succès', description: 'Résumé généré et enregistré' });
      loadLatestSummary();
      if (startRef.current) startRef.current.value = '';
      if (endRef.current) endRef.current.value = '';
    } catch (error: any) {
      console.error('Error sending summary:', error);
      toast({ title: 'Erreur', description: error.message || 'Impossible d\'envoyer le résumé', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const sendLast24hSummary = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const { data, error } = await supabase.functions.invoke('email-summary', {
        body: {
          userId: user?.id,
          period: 'custom',
          startDate: start.toISOString(),
          endDate: now.toISOString(),
        },
      });

      if (error) throw error;

      await supabase.from('email_summaries').insert({
        user_id: user?.id,
        period_start: start.toISOString(),
        period_end: now.toISOString(),
        summary_content: (data as any)?.summary,
      });

      toast({ title: 'Succès', description: 'Résumé des dernières 24h généré' });
      loadLatestSummary();
    } catch (error: any) {
      console.error('Error sending 24h summary:', error);
      toast({ title: 'Erreur', description: error.message || "Échec de l'envoi du résumé 24h", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {latestSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Dernier résumé</span>
              <Button onClick={copyToClipboard} variant="outline" size="sm">
                <Copy className="h-4 w-4 mr-2" />
                Copier
              </Button>
            </CardTitle>
            <CardDescription>
              Du {new Date(latestSummary.start).toLocaleString('fr-FR')} au {new Date(latestSummary.end).toLocaleString('fr-FR')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md">
              {latestSummary.content}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Résumés automatiques
          </CardTitle>
          <CardDescription>
            Configurez les horaires auxquels vous souhaitez recevoir un résumé automatique sur WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="time"
              value={newScheduleTime}
              onChange={(e) => setNewScheduleTime(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addSchedule}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun horaire configuré</p>
            ) : (
              schedules.map((time) => (
                <Badge key={time} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                  {time}
                  <button
                    onClick={() => removeSchedule(time)}
                    className="ml-1 hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>

          {schedules.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Le résumé de chaque horaire couvrira la période depuis le dernier horaire
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Résumé manuel
          </CardTitle>
          <CardDescription>
            Envoyez un résumé immédiat pour une période personnalisée
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Date de début</Label>
              <Input
                id="start-date"
                ref={startRef}
                type="datetime-local"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Date de fin</Label>
              <Input
                id="end-date"
                ref={endRef}
                type="datetime-local"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <Button onClick={sendManualSummary} disabled={loading} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {loading ? 'Envoi en cours...' : 'Envoyer le résumé maintenant'}
            </Button>
            <Button onClick={sendLast24hSummary} disabled={loading} variant="secondary" className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {loading ? 'Test 24h en cours...' : 'Tester le résumé des dernières 24h'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
