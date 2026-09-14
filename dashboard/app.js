const client = supabase.createClient(FEEDTIME_CONFIG.SUPABASE_URL, FEEDTIME_CONFIG.SUPABASE_ANON_KEY);

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
}

function dateKey(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function last7Dates() {
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

function niceMaxSeconds(maxSeconds) {
  const maxMinutes = maxSeconds / 60;
  const steps = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600, 720];
  for (const step of steps) if (maxMinutes <= step) return step * 60;
  return Math.ceil(maxMinutes / 60) * 60 * 60;
}

const loginSection = document.getElementById("loginSection");
const appSection = document.getElementById("appSection");
const whoBox = document.getElementById("whoBox");
const authMessage = document.getElementById("authMessage");

function showMessage(text, kind) {
  authMessage.textContent = text || "";
  authMessage.className = "message" + (kind ? ` message--${kind}` : "");
}

async function refreshAuthUI() {
  const { data } = await client.auth.getSession();
  const session = data.session;
  if (session) {
    loginSection.hidden = true;
    appSection.hidden = false;
    whoBox.hidden = false;
    document.getElementById("whoEmail").textContent = session.user.email || session.user.id;
    loadData();
  } else {
    loginSection.hidden = false;
    appSection.hidden = true;
    whoBox.hidden = true;
  }
}

document.getElementById("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  showMessage("Entrando…");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) { showMessage(error.message, "error"); return; }
  showMessage("");
  refreshAuthUI();
});

document.getElementById("signUpBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || password.length < 6) {
    showMessage("Preencha e-mail e uma senha com 6+ caracteres.", "error");
    return;
  }
  showMessage("Criando conta…");
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) { showMessage(error.message, "error"); return; }
  if (data.session) {
    showMessage("");
    refreshAuthUI();
  } else {
    showMessage("Conta criada. Confirme seu e-mail e depois entre.", "ok");
  }
});

document.getElementById("signOutBtn").addEventListener("click", async () => {
  await client.auth.signOut();
  refreshAuthUI();
});

document.getElementById("refreshBtn").addEventListener("click", loadData);
client.auth.onAuthStateChange(() => refreshAuthUI());
window.addEventListener("focus", () => { if (!appSection.hidden) loadData(); });

async function loadData() {
  const dates = last7Dates();
  const fromKey = dateKey(dates[0]);

  const { data, error } = await client
    .from("daily_totals")
    .select("log_date,platform,seconds")
    .gte("log_date", fromKey);

  if (error) {
    console.error("Feedtime: erro ao carregar dados", error);
    return;
  }

  const byDate = {};
  for (const d of dates) byDate[dateKey(d)] = { linkedin: 0, facebook: 0 };
  for (const row of data || []) {
    if (byDate[row.log_date]) byDate[row.log_date][row.platform] = row.seconds;
  }

  render(dates, byDate);
}

function render(dates, byDate) {
  const rows = dates.map((d) => ({ date: d, key: dateKey(d), ...byDate[dateKey(d)] }));
  const weekTotalLinkedin = rows.reduce((a, r) => a + r.linkedin, 0);
  const weekTotalFacebook = rows.reduce((a, r) => a + r.facebook, 0);
  const weekTotal = weekTotalLinkedin + weekTotalFacebook;

  document.getElementById("emptySection").hidden = weekTotal > 0;
  document.getElementById("tilesSection").hidden = weekTotal === 0;
  document.getElementById("chartSection").hidden = weekTotal === 0;
  if (weekTotal === 0) return;

  const today = rows[rows.length - 1];
  document.getElementById("tileToday").textContent = formatDuration(today.linkedin + today.facebook);
  document.getElementById("tileTodayLinkedin").textContent = formatDuration(today.linkedin);
  document.getElementById("tileTodayFacebook").textContent = formatDuration(today.facebook);

  document.getElementById("tileWeek").textContent = formatDuration(weekTotal);
  document.getElementById("tileWeekLinkedin").textContent = formatDuration(weekTotalLinkedin);
  document.getElementById("tileWeekFacebook").textContent = formatDuration(weekTotalFacebook);

  document.getElementById("tileAvg").textContent = formatDuration(weekTotal / 7);

  renderChart(rows);
  renderTable(rows);
}

function renderChart(rows) {
  const maxRaw = Math.max(...rows.map((r) => Math.max(r.linkedin, r.facebook)), 0);
  const scaleMax = niceMaxSeconds(maxRaw || 1);

  const yAxis = document.getElementById("yAxis");
  yAxis.innerHTML = `<span>${formatDuration(scaleMax)}</span><span>${formatDuration(scaleMax / 2)}</span><span>0min</span>`;

  const plot = document.getElementById("plot");
  const tooltip = document.getElementById("tooltip");
  plot.querySelectorAll(".day-col").forEach((el) => el.remove());

  rows.forEach((r) => {
    const col = document.createElement("div");
    col.className = "day-col";

    const bLinkedin = document.createElement("div");
    bLinkedin.className = "bar bar--linkedin";
    bLinkedin.style.height = `${Math.min(100, (r.linkedin / scaleMax) * 100)}%`;

    const bFacebook = document.createElement("div");
    bFacebook.className = "bar bar--facebook";
    bFacebook.style.height = `${Math.min(100, (r.facebook / scaleMax) * 100)}%`;

    col.appendChild(bLinkedin);
    col.appendChild(bFacebook);

    const label = `${WEEKDAYS[r.date.getDay()]}, ${r.date.getDate()}/${r.date.getMonth() + 1} — LinkedIn ${formatDuration(r.linkedin)} · Facebook ${formatDuration(r.facebook)}`;
    col.addEventListener("mouseenter", () => {
      tooltip.textContent = label;
      tooltip.classList.add("show");
    });
    col.addEventListener("mousemove", (e) => {
      const rect = plot.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left}px`;
      tooltip.style.top = `${e.clientY - rect.top}px`;
    });
    col.addEventListener("mouseleave", () => tooltip.classList.remove("show"));

    plot.appendChild(col);
  });

  const xAxis = document.getElementById("xAxis");
  xAxis.innerHTML = rows.map((r) => `<span>${WEEKDAYS[r.date.getDay()]}</span>`).join("");
}

function renderTable(rows) {
  const tbody = document.getElementById("dataTableBody");
  tbody.innerHTML = rows
    .map((r) => {
      const label = `${WEEKDAYS[r.date.getDay()]} ${r.date.getDate()}/${r.date.getMonth() + 1}`;
      return `<tr><td>${label}</td><td class="num">${formatDuration(r.linkedin)}</td><td class="num">${formatDuration(r.facebook)}</td><td class="num">${formatDuration(r.linkedin + r.facebook)}</td></tr>`;
    })
    .join("");
}

document.getElementById("toggleTableBtn").addEventListener("click", (e) => {
  const table = document.getElementById("dataTable");
  table.hidden = !table.hidden;
  e.target.textContent = table.hidden ? "Ver como tabela" : "Ocultar tabela";
});

refreshAuthUI();
