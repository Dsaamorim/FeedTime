function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

async function render() {
  const [{ todayTotals }, { feedtimeSession }, { authSession }] = await Promise.all([
    chrome.storage.local.get("todayTotals"),
    chrome.storage.session.get("feedtimeSession"),
    chrome.storage.local.get("authSession")
  ]);

  const base =
    todayTotals && todayTotals.date === todayKey()
      ? todayTotals
      : { facebook: 0, linkedin: 0 };

  let liveFacebook = 0;
  let liveLinkedin = 0;
  if (feedtimeSession) {
    const elapsed = Math.floor((Date.now() - feedtimeSession.startedAt) / 1000);
    if (feedtimeSession.platform === "facebook") liveFacebook = elapsed;
    if (feedtimeSession.platform === "linkedin") liveLinkedin = elapsed;
  }

  document.getElementById("linkedinTime").textContent = formatDuration(
    (base.linkedin || 0) + liveLinkedin
  );
  document.getElementById("facebookTime").textContent = formatDuration(
    (base.facebook || 0) + liveFacebook
  );

  document.getElementById("idleNote").hidden = !!feedtimeSession;

  const badge = document.getElementById("authBadge");
  if (authSession && authSession.access_token) {
    badge.textContent = authSession.email || "sincronizado";
    badge.classList.add("auth-badge--on");
  } else {
    badge.textContent = "não sincronizado";
    badge.classList.remove("auth-badge--on");
  }
}

document.getElementById("dashboardLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: FEEDTIME_CONFIG.DASHBOARD_URL });
});
document.getElementById("optionsLink").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
setInterval(render, 1000);
