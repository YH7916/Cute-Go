const LOG_ENABLE_KEY = "enable_local_logs";
const LOG_STORAGE_PREFIX = "local-log:";
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

    const historyKey = `${LOG_STORAGE_PREFIX}history`;
    const history = JSON.parse(localStorage.getItem(historyKey) || "[]") as Array<{
      eventType: "app_start" | "ai_request";
      at: string;
    }>;
    history.push({ eventType, at: new Date().toISOString() });
    localStorage.setItem(historyKey, JSON.stringify(history.slice(-50)));
  } catch {
    // Fail silently to avoid interrupting gameplay
  }
};
