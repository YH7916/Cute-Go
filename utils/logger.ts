import { supabase } from "./supabaseClient";

const LOG_ENABLE_KEY = "enable_supabase_logs";
const LOG_STORAGE_PREFIX = "supabase-log:";
const EVENT_COOLDOWNS: Record<"app_start" | "ai_request", number> = {
  app_start: 12 * 60 * 60 * 1000,
  ai_request: 10 * 60 * 1000,
};

const shouldLogEvent = (eventType: "app_start" | "ai_request") => {
  try {
    if (localStorage.getItem(LOG_ENABLE_KEY) !== "true") return false;

    const storageKey = `${LOG_STORAGE_PREFIX}${eventType}`;
    const now = Date.now();
    const lastLoggedAt = Number(localStorage.getItem(storageKey) || "0");
    const cooldown = EVENT_COOLDOWNS[eventType] || 0;

    if (lastLoggedAt && now - lastLoggedAt < cooldown) return false;

    localStorage.setItem(storageKey, String(now));
    return true;
  } catch {
    return false;
  }
};

export const logEvent = async (eventType: "app_start" | "ai_request") => {
  try {
    if (!shouldLogEvent(eventType)) return;

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
