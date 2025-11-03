import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const now = new Date();
    const currentHHmm = new Date(now.toISOString()).toISOString().substring(11, 16); // UTC HH:mm

    // Load active schedules
    const { data: schedules, error: schedulesError } = await supabase
      .from("email_summary_schedules")
      .select("user_id, schedule_times, is_active")
      .eq("is_active", true);

    if (schedulesError) throw schedulesError;

    let processed = 0;
    const results: Array<{ user_id: string; triggered: boolean; reason?: string }> = [];

    for (const row of schedules || []) {
      const times: string[] = Array.isArray(row.schedule_times) ? row.schedule_times : [];
      const shouldRun = times.includes(currentHHmm);
      if (!shouldRun) {
        results.push({ user_id: row.user_id, triggered: false, reason: "no matching time" });
        continue;
      }

      // Prevent duplicates within the same minute using last summary end time
      const { data: lastSummary, error: lastErr } = await supabase
        .from("email_summaries")
        .select("period_end")
        .eq("user_id", row.user_id)
        .order("period_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastErr) {
        console.error("Error loading last summary:", lastErr);
      }

      const nowIso = now.toISOString();
      const lastEnd = lastSummary?.period_end ? new Date(lastSummary.period_end as string) : undefined;
      if (lastEnd) {
        const diffMs = Math.abs(now.getTime() - lastEnd.getTime());
        if (diffMs < 55_000) {
          results.push({ user_id: row.user_id, triggered: false, reason: "recent summary exists" });
          continue;
        }
      }

      // Compute start date from last summary end or fallback to 1 hour before now
      const startIso = lastEnd ? lastEnd.toISOString() : new Date(now.getTime() - 60 * 60 * 1000).toISOString();

      try {
        const { data, error } = await supabase.functions.invoke("email-summary", {
          body: {
            userId: row.user_id,
            period: "custom",
            startDate: startIso,
            endDate: nowIso,
          },
        });

        if (error) throw error;

        // Save the summary content for history
        await supabase.from("email_summaries").insert({
          user_id: row.user_id,
          period_start: startIso,
          period_end: nowIso,
          summary_content: (data as any)?.summary ?? null,
        });

        processed += 1;
        results.push({ user_id: row.user_id, triggered: true });
      } catch (err) {
        console.error("Error invoking email-summary for user:", row.user_id, err);
        results.push({ user_id: row.user_id, triggered: false, reason: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ processed, results, at: now.toISOString(), time_match: currentHHmm }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("email-summary-cron error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});