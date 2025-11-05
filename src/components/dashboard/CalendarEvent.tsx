import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { CalendarPlus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const CalendarEvent = () => {
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [eventData, setEventData] = useState({
    title: "",
    date: "",
    time: "10:00",
    duration_minutes: 60,
    location: "",
    attendees: "",
    description: ""
  });

  const createCalendarEvent = async () => {
    if (!user?.id || !eventData.title || !eventData.date) {
      toast({
        title: "Erreur",
        description: "Titre et date sont requis",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);

    try {
      // Combine date and time into ISO string
      const dateTimeString = `${eventData.date}T${eventData.time}:00`;
      
      const { error } = await supabase.functions.invoke('gmail-calendar', {
        body: {
          userId: user.id,
          eventDetails: {
            title: eventData.title,
            date: dateTimeString,
            duration_minutes: eventData.duration_minutes,
            location: eventData.location || undefined,
            attendees: eventData.attendees ? eventData.attendees.split(',').map(e => e.trim()) : undefined,
            description: eventData.description || undefined
          }
        }
      });

      if (error) throw error;

      toast({
        title: "✅ Événement créé",
        description: "L'événement a été ajouté à votre Google Calendar"
      });

      // Reset form
      setEventData({
        title: "",
        date: "",
        time: "10:00",
        duration_minutes: 60,
        location: "",
        attendees: "",
        description: ""
      });

    } catch (error: any) {
      console.error('Error creating calendar event:', error);
      toast({
        title: "Erreur",
        description: error.message || "Impossible de créer l'événement",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="h-5 w-5" />
          Créer un événement Google Calendar
        </CardTitle>
        <CardDescription>
          Ajoutez rapidement un événement à votre calendrier Google
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label htmlFor="title">Titre de l'événement *</Label>
            <Input
              id="title"
              value={eventData.title}
              onChange={(e) => setEventData({ ...eventData, title: e.target.value })}
              placeholder="Réunion d'équipe..."
            />
          </div>
          
          <div>
            <Label htmlFor="date">Date *</Label>
            <Input
              id="date"
              type="date"
              value={eventData.date}
              onChange={(e) => setEventData({ ...eventData, date: e.target.value })}
            />
          </div>
          
          <div>
            <Label htmlFor="time">Heure</Label>
            <Input
              id="time"
              type="time"
              value={eventData.time}
              onChange={(e) => setEventData({ ...eventData, time: e.target.value })}
            />
          </div>
          
          <div>
            <Label htmlFor="duration">Durée (minutes)</Label>
            <Input
              id="duration"
              type="number"
              value={eventData.duration_minutes}
              onChange={(e) => setEventData({ ...eventData, duration_minutes: parseInt(e.target.value) || 60 })}
              min={15}
              step={15}
            />
          </div>
          
          <div>
            <Label htmlFor="location">Lieu</Label>
            <Input
              id="location"
              value={eventData.location}
              onChange={(e) => setEventData({ ...eventData, location: e.target.value })}
              placeholder="Salle de réunion 1..."
            />
          </div>
          
          <div className="col-span-2">
            <Label htmlFor="attendees">Participants (emails séparés par virgule)</Label>
            <Input
              id="attendees"
              value={eventData.attendees}
              onChange={(e) => setEventData({ ...eventData, attendees: e.target.value })}
              placeholder="email1@example.com, email2@example.com"
            />
          </div>
          
          <div className="col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={eventData.description}
              onChange={(e) => setEventData({ ...eventData, description: e.target.value })}
              placeholder="Détails de l'événement..."
              rows={3}
            />
          </div>
        </div>

        <Button 
          onClick={createCalendarEvent} 
          disabled={isCreating || !eventData.title || !eventData.date}
          className="w-full"
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Création en cours...
            </>
          ) : (
            <>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Créer l'événement
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
