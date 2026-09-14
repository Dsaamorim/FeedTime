importScripts("config.js");

const TICK_ALARM = "feedtime-tick";
const TICK_MINUTES = 1;
const IDLE_THRESHOLD_SECONDS = 300;
const MAX_PENDING_LOGS = 1000;

function matchPlatform(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "facebook.com" || host.endsWith(".facebook.com")) return "facebook";
    if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  } catch (e) {
  }
  return null;
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getSession() {
  const { feedtimeSession } = await chrome.storage.session.get("feedtimeSession");
  return feedtimeSession || null;
}
async function setSession(session) {
  if (session) await chrome.storage.session.set({ feedtimeSession: session });
  else await chrome.storage.session.remove("feedtimeSession");
}

async function isUserIdle() {
  return new Promise((resolve) => {
    chrome.idle.queryState(IDLE_THRESHOLD_SECONDS, (state) => resolve(state === "locked"));
  });
}

async function bufferSeconds(platform, seconds) {
  if (seconds <= 0) return;
  const key = todayKey();
  const store = await chrome.storage.local.get(["todayTotals", "pendingLogs"]);

  let todayTotals = store.todayTotals;
  if (!todayTotals || todayTotals.date !== key) {
    todayTotals = { date: key, facebook: 0, linkedin: 0 };
  }
  todayTotals[platform] = (todayTotals[platform] || 0) + seconds;

  const pendingLogs = store.pendingLogs || [];
  pendingLogs.push({ platform, log_date: key, seconds });
  while (pendingLogs.length > MAX_PENDING_LOGS) pendingLogs.shift();

  await chrome.storage.local.set({ todayTotals, pendingLogs });
}

async function settle(stop) {
  const session = await getSession();
  if (!session) return;
  const elapsedSeconds = Math.floor((Date.now() - session.startedAt) / 1000);
  if (elapsedSeconds > 0) await bufferSeconds(session.platform, elapsedSeconds);

  if (stop) await setSession(null);
  else await setSession({ ...session, startedAt: Date.now() });
}

async function evaluate() {
  const idle = await isUserIdle();
  if (idle) {
    await settle(true);
    return;
  }

  const windows = await chrome.windows
    .getAll({ populate: true, windowTypes: ["normal"] })
    .catch(() => []);

  let match = null;
  for (const win of windows) {
    if (win.state === "minimized") continue;
    const tab = (win.tabs || []).find((t) => t.active);
    if (!tab) continue;
    const platform = matchPlatform(tab.url);
    if (platform) {
      match = { platform, tabId: tab.id };
      break;
    }
  }

  const session = await getSession();

  if (session && (!match || session.tabId !== match.tabId || session.platform !== match.platform)) {
    await settle(true);
  }

  if (match && (!session || session.tabId !== match.tabId || session.platform !== match.platform)) {
    await setSession({ platform: match.platform, tabId: match.tabId, startedAt: Date.now() });
  }
}

async function ensureAccessToken() {
  const { authSession } = await chrome.storage.local.get("authSession");
  if (!authSession) return null;

  if (authSession.expires_at && Date.now() < authSession.expires_at - 60_000) {
    return authSession;
  }
  if (!authSession.refresh_token) return null;

  try {
    const resp = await fetch(
      `${FEEDTIME_CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: FEEDTIME_CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ refresh_token: authSession.refresh_token })
      }
    );
    if (!resp.ok) throw new Error("refresh falhou");
    const data = await resp.json();
    const updated = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      user_id: data.user?.id || authSession.user_id,
      email: data.user?.email || authSession.email
    };
    await chrome.storage.local.set({ authSession: updated });
    return updated;
  } catch (e) {
    await chrome.storage.local.remove("authSession");
    return null;
  }
}

async function flushPending() {
  const { pendingLogs } = await chrome.storage.local.get("pendingLogs");
  if (!pendingLogs || pendingLogs.length === 0) return;

  const auth = await ensureAccessToken();
  if (!auth) return;

  const rows = pendingLogs.map((row) => ({ ...row, user_id: auth.user_id }));

  try {
    const resp = await fetch(`${FEEDTIME_CONFIG.SUPABASE_URL}/rest/v1/time_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: FEEDTIME_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${auth.access_token}`,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(rows)
    });
    if (resp.ok) {
      await chrome.storage.local.set({ pendingLogs: [] });
    }
  } catch (e) {
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
  evaluate();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
  evaluate();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TICK_ALARM) return;
  settle(false).then(() => flushPending());
});

chrome.tabs.onActivated.addListener(() => evaluate());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") evaluate();
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await getSession();
  if (session && session.tabId === tabId) await settle(true);
});
chrome.windows.onFocusChanged.addListener(() => evaluate());
chrome.idle.onStateChanged.addListener(() => evaluate());

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "feedtime-flush-now") flushPending();
});
