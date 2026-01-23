import { supabase } from "./supabaseClient";

export const logEvent = async (eventType: "app_start" | "ai_request") => {
  try {
    // Get current user (if any)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Fire and forget - don't await to avoid blocking UI
    supabase
      .from("activity_logs")
      .insert({
        event_type: eventType,
        user_id: user?.id || null,
      })
      .then(({ error }) => {
        if (error) console.warn("Log failed:", error.message);
      });
  } catch (e) {
    // Fail silently to avoid interrupting gameplay
  }
};
