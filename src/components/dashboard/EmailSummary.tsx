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
  const [telegramTextAuto, setTelegramTextAuto] = useState(false);
  const [telegramAudioAuto, setTelegramAudioAuto] = useState(false);
  const [telegramTextManual, setTelegramTextManual] = useState(false);
  const [telegramAudioManual, setTelegramAudioManual] = useState(false);

  useEffect(() => {
    if (user) {
      loadSchedules();
      loadLatestSummary();
    }
  }, [user]);

  // Prefill manual date range with last 24h to avoid empty inputs
  const toLocalInputValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };

  useEffect(() => {
    if (user && !manualStartDate && !manualEndDate) {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      setManualStartDate(toLocalInputValue(start));
      setManualEndDate(toLocalInputValue(now));
    }
  }, [user]);

  const loadSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('email_summary_schedules')
        .select('schedule_times, telegram_text, telegram_audio')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const times = Array.isArray(data.schedule_times) ? data.schedule_times : [];
        setSchedules(times.sort());
        setTelegramTextAuto(data.telegram_text || false);
        setTelegramAudioAuto(data.telegram_audio || false);
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
            telegram_text: telegramTextAuto,
            telegram_audio: telegramAudioAuto,
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
            telegram_text: telegramTextAuto,
            telegram_audio: telegramAudioAuto,
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
    // Simple validation - just check both dates exist
    if (!manualStartDate?.trim() || !manualEndDate?.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner les dates de début et de fin', variant: 'destructive' });
      return;
    }

    const startDate = new Date(manualStartDate);
    const endDate = new Date(manualEndDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      toast({ title: 'Erreur', description: 'Format de date invalide', variant: 'destructive' });
      return;
    }

    if (startDate > endDate) {
      toast({ title: 'Erreur', description: 'La date de début doit être antérieure à la date de fin', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('email-summary', {
        body: {
          userId: user?.id,
          period: 'custom',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          sendTelegramText: telegramTextManual,
          sendTelegramAudio: telegramAudioManual,
        },
      });

      if (error) throw error;

      await supabase.from('email_summaries').insert({
        user_id: user?.id,
        period_start: startDate.toISOString(),
        period_end: endDate.toISOString(),
        summary_content: (data as any)?.summary,
      });

      toast({ title: 'Succès', description: 'Résumé généré et enregistré' });
      loadLatestSummary();
      // Ne pas réinitialiser les dates pour permettre un second envoi immédiat
    } catch (error: any) {
      console.error('Error sending summary:', error);
      toast({ title: 'Erreur', description: error.message || 'Impossible d\'envoyer le résumé', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const saveTelegramPreferences = async () => {
    try {
      const { error } = await supabase
        .from('email_summary_schedules')
        .upsert(
          {
            user_id: user?.id,
            schedule_times: schedules,
            is_active: true,
            telegram_text: telegramTextAuto,
            telegram_audio: telegramAudioAuto,
          },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      toast({ title: 'Succès', description: 'Préférences Telegram mises à jour' });
    } catch (error) {
      console.error('Error saving telegram preferences:', error);
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder les préférences', variant: 'destructive' });
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
            Configurez les horaires auxquels vous souhaitez recevoir un résumé automatique sur Telegram
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
            <>
              <p className="text-sm text-muted-foreground">
                Le résumé de chaque horaire couvrira la période depuis le dernier horaire
              </p>
              
              <div className="space-y-3 pt-4 border-t">
                <Label>Options d'envoi Telegram</Label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="telegram-text-auto"
                    checked={telegramTextAuto}
                    onChange={(e) => {
                      setTelegramTextAuto(e.target.checked);
                      saveTelegramPreferences();
                    }}
                    className="h-4 w-4"
                  />
                  <label htmlFor="telegram-text-auto" className="text-sm cursor-pointer">
                    Envoyer en texte sur Telegram
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="telegram-audio-auto"
                    checked={telegramAudioAuto}
                    onChange={(e) => {
                      setTelegramAudioAuto(e.target.checked);
                      saveTelegramPreferences();
                    }}
                    className="h-4 w-4"
                  />
                  <label htmlFor="telegram-audio-auto" className="text-sm cursor-pointer">
                    Envoyer en audio sur Telegram
                  </label>
                </div>
              </div>
            </>
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
                type="datetime-local"
                step={60}
                value={manualStartDate}
                onChange={(e) => setManualStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">Date de fin</Label>
              <Input
                id="end-date"
                type="datetime-local"
                step={60}
                value={manualEndDate}
                onChange={(e) => setManualEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t">
            <Label>Options d'envoi Telegram</Label>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="telegram-text-manual"
                checked={telegramTextManual}
                onChange={(e) => setTelegramTextManual(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="telegram-text-manual" className="text-sm cursor-pointer">
                Envoyer en texte sur Telegram
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="telegram-audio-manual"
                checked={telegramAudioManual}
                onChange={(e) => setTelegramAudioManual(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="telegram-audio-manual" className="text-sm cursor-pointer">
                Envoyer en audio sur Telegram
              </label>
            </div>
          </div>

          <Button onClick={sendManualSummary} disabled={loading} className="w-full">
            <Send className="h-4 w-4 mr-2" />
            {loading ? 'Envoi en cours...' : 'Envoyer le résumé maintenant'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
