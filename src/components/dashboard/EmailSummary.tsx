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
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [latestSummary, setLatestSummary] = useState<{ content: string; start: string; end: string } | null>(null);
  
  // Refs for robust value reading (avoids rare controlled input sync issues)
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

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
    const startRaw = (startRef.current?.value ?? manualStartDate ?? '').trim();
    const endRaw = (endRef.current?.value ?? manualEndDate ?? '').trim();

    if (!startRaw || !endRaw) {
      toast({ title: 'Erreur', description: 'Veuillez insérer les dates de début et de fin', variant: 'destructive' });
      return;
    }

    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);

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

      toast({ title: 'Succès', description: 'Résumé des dernières 24h généré' });
      loadLatestSummary();
    } catch (error: any) {
      console.error('Error sending 24h summary:', error);
      toast({ title: 'Erreur', description: error.message || "Échec de l'envoi du résumé 24h", variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const sendSummaryToWhatsApp = async () => {
    if (!latestSummary?.content) {
      toast({ title: 'Erreur', description: 'Aucun résumé disponible', variant: 'destructive' });
      return;
    }

    setSendingWhatsApp(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-sender', {
        body: {
          userId: user?.id,
          type: 'summary',
          message: `📊 Résumé emails\n\n${latestSummary.content}`,
          useTemplate: false,
        },
      });

      if (error) throw error;

      toast({ title: 'Succès', description: 'Résumé envoyé sur WhatsApp' });
    } catch (error: any) {
      console.error('Error sending to WhatsApp:', error);
      toast({ title: 'Erreur', description: error.message || 'Échec de l\'envoi WhatsApp', variant: 'destructive' });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const generateAudioSummary = async () => {
    if (!latestSummary?.content) {
      toast({ title: 'Erreur', description: 'Aucun résumé disponible', variant: 'destructive' });
      return;
    }

    setGeneratingAudio(true);
    try {
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: {
          summaryText: latestSummary.content,
        },
      });

      if (error) throw error;

      // Play the audio
      const audioBlob = new Blob(
        [Uint8Array.from(atob(data.audioBase64), c => c.charCodeAt(0))],
        { type: 'audio/mpeg' }
      );
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setGeneratingAudio(false);
        toast({ title: 'Succès', description: 'Lecture audio terminée' });
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setGeneratingAudio(false);
        toast({ title: 'Erreur', description: 'Erreur lors de la lecture audio', variant: 'destructive' });
      };

      await audio.play();
    } catch (error: any) {
      console.error('Error generating audio:', error);
      toast({ title: 'Erreur', description: error.message || 'Échec de la génération audio', variant: 'destructive' });
      setGeneratingAudio(false);
    }
  };

  return (
    <div className="space-y-6">
      {latestSummary && (
        <Card>
          <CardHeader>
          <CardTitle className="flex items-center justify-between">
              <span>Dernier résumé</span>
              <div className="flex gap-2">
                <Button onClick={copyToClipboard} variant="outline" size="sm">
                  <Copy className="h-4 w-4 mr-2" />
                  Copier
                </Button>
                <Button onClick={generateAudioSummary} disabled={generatingAudio} variant="outline" size="sm">
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                  {generatingAudio ? 'Génération...' : 'Audio'}
                </Button>
                <Button onClick={sendSummaryToWhatsApp} disabled={sendingWhatsApp} variant="outline" size="sm">
                  <Send className="h-4 w-4 mr-2" />
                  {sendingWhatsApp ? 'Envoi...' : 'WhatsApp'}
                </Button>
              </div>
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
                type="datetime-local"
                step={60}
                value={manualStartDate}
                onChange={(e) => setManualStartDate(e.target.value)}
                ref={startRef}
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
                ref={endRef}
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
