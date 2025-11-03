import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Calendar, Clock, Plus, Trash2, Send } from 'lucide-react';

export const EmailSummary = () => {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<string[]>([]);
  const [newScheduleTime, setNewScheduleTime] = useState('09:00');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadSchedules();
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
    console.log('Manual dates:', { manualStartDate, manualEndDate });
    
    // Fallback: read from DOM if state is empty (some browsers can miss onChange)
    const startVal = manualStartDate || startRef.current?.value || (document.getElementById('start-date') as HTMLInputElement)?.value || '';
    const endVal = manualEndDate || endRef.current?.value || (document.getElementById('end-date') as HTMLInputElement)?.value || '';

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

      // Save summary to database
      await supabase.from('email_summaries').insert({
        user_id: user?.id,
        period_start: new Date(startVal).toISOString(),
        period_end: new Date(endVal).toISOString(),
        summary_content: data.summary, // textual summary returned by function
      });

      toast({ title: 'Succès', description: 'Résumé envoyé sur WhatsApp' });
      setManualStartDate('');
      setManualEndDate('');
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

      toast({ title: 'Succès', description: 'Résumé des dernières 24h envoyé' });
    } catch (error: any) {
      console.error('Error sending 24h summary:', error);
      toast({ title: 'Erreur', description: error.message || "Échec de l'envoi du résumé 24h", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
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
                value={manualStartDate}
                onChange={(e) => {
                  console.log('Start date changed:', e.target.value);
                  setManualStartDate(e.target.value);
                }}
              />
              {manualStartDate && (
                <p className="text-xs text-muted-foreground">
                  {new Date(manualStartDate).toLocaleString('fr-FR')}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Date de fin</Label>
              <Input
                id="end-date"
                ref={endRef}
                type="datetime-local"
                value={manualEndDate}
                onChange={(e) => {
                  console.log('End date changed:', e.target.value);
                  setManualEndDate(e.target.value);
                }}
              />
              {manualEndDate && (
                <p className="text-xs text-muted-foreground">
                  {new Date(manualEndDate).toLocaleString('fr-FR')}
                </p>
              )}
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
