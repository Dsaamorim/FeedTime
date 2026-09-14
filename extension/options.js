const client = supabase.createClient(
  FEEDTIME_CONFIG.SUPABASE_URL,
  FEEDTIME_CONFIG.SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const loggedOutView = document.getElementById("loggedOutView");
const loggedInView = document.getElementById("loggedInView");
const messageEl = document.getElementById("authMessage");

function showMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = "message" + (kind ? ` message--${kind}` : "");
}

async function saveSession(session, user) {
  await chrome.storage.local.set({
    authSession: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Date.now() + session.expires_in * 1000,
      user_id: user.id,
      email: user.email
    }
  });
  chrome.runtime.sendMessage({ type: "feedtime-flush-now" }).catch(() => {});
}

async function refreshView() {
  const { authSession } = await chrome.storage.local.get("authSession");
  document.getElementById("dashboardLink").href = FEEDTIME_CONFIG.DASHBOARD_URL;
  if (authSession && authSession.access_token) {
    document.getElementById("userEmail").textContent = authSession.email || authSession.user_id;
    loggedOutView.hidden = true;
    loggedInView.hidden = false;
  } else {
    loggedOutView.hidden = false;
    loggedInView.hidden = true;
  }
}

document.getElementById("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  showMessage("Entrando…");
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    showMessage(error.message, "error");
    return;
  }
  await saveSession(data.session, data.user);
  showMessage("Login feito com sucesso.", "ok");
  refreshView();
});

document.getElementById("signUpBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  if (!email || password.length < 6) {
    showMessage("Preencha e-mail e uma senha com 6+ caracteres para criar a conta.", "error");
    return;
  }
  showMessage("Criando conta…");
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    showMessage(error.message, "error");
    return;
  }
  if (data.session) {
    await saveSession(data.session, data.user);
    showMessage("Conta criada e conectada.", "ok");
    refreshView();
  } else {
    showMessage("Conta criada. Confirme seu e-mail (verifique a caixa de entrada) e depois faça login.", "ok");
  }
});

document.getElementById("signOutBtn").addEventListener("click", async () => {
  await chrome.storage.local.remove("authSession");
  refreshView();
});

refreshView();
