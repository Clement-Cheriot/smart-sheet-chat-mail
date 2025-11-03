import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarEventRequest {
  userId: string;
  eventDetails: {
    title: string;
    date: string; // ISO date string
    duration_minutes: number;
    location?: string;
    attendees?: string[];
    description?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, eventDetails }: CalendarEventRequest = await req.json();
    console.log('Creating calendar event for user:', userId);

    // Get user's Gmail credentials
    const { data: config, error: configError } = await supabase
      .from('user_api_configs')
      .select('gmail_credentials')
      .eq('user_id', userId)
      .maybeSingle();

    if (configError || !config?.gmail_credentials) {
      throw new Error('Gmail credentials not found. Please reconnect Gmail.');
    }

    const credentials = config.gmail_credentials as any;
    const accessToken = credentials.access_token;

    // Calculate start and end times
    const startTime = new Date(eventDetails.date);
    const endTime = new Date(startTime.getTime() + eventDetails.duration_minutes * 60000);

    // Prepare Calendar API event
    const event = {
      summary: eventDetails.title,
      location: eventDetails.location || '',
      description: eventDetails.description || '',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'Europe/Paris',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Europe/Paris',
      },
      attendees: eventDetails.attendees?.map(email => ({ email })) || [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 }, // 30 minutes before
        ],
      },
    };

    // Create event via Google Calendar API
    const calendarResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error('Calendar API error:', errorText);
      throw new Error(`Failed to create calendar event: ${calendarResponse.status}`);
    }

    const calendarData = await calendarResponse.json();
    console.log('Calendar event created:', calendarData.id);

    // Log activity
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action_type: 'calendar_event_created',
      action_details: {
        event_id: calendarData.id,
        title: eventDetails.title,
        date: eventDetails.date,
      },
      status: 'success',
    });

    return new Response(
      JSON.stringify({
        success: true,
        eventId: calendarData.id,
        htmlLink: calendarData.htmlLink,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error creating calendar event:', error);

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
