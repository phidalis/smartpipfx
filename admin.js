(() => {
  "use strict";

  const USERS_KEY = "sp-users";
  const STATE_PREFIX = "sp-state-v2:";
  const ADMIN_KEY = "sp-admin";
  const ADMIN_SESSION_KEY = "sp-admin-session";
  const ADMIN_EMAIL = "admin@smartpip.com";
  const ADMIN_PASSWORD = "123456";
  const PLANS_KEY = "sp-plans";
  const SUPPORT_KEY = "sp-support-messages";
  const LOG_KEY = "sp-admin-log";
  const THEME_KEY = "sp-theme";
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const DAY = 86400000;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  let currentAdmin = null;
  let editingPlanId = null;
  let appBound = false;
  let toastTimer;

  function readStorage(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function createSalt() {
    const bytes = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function hashPassword(password, salt) {
    const input = `${salt}:${password}`;
    let first = 0x811C9DC5;
    let second = 0x01000193;

    for (let round = 0; round < 4; round += 1) {
      for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index);
        first = Math.imul(first ^ code, 16777619);
        second = Math.imul(second + code + round, 2246822519);
        second = (second << 13) | (second >>> 19);
      }
      first = Math.imul(first ^ round, 16777619);
    }

    return (first >>> 0).toString(16).padStart(8, "0") + (second >>> 0).toString(16).padStart(8, "0");
  }

  function ensureAdminCredentials() {
    const existing = readStorage(ADMIN_KEY, null);
    const emailMatches = existing && String(existing.email).toLowerCase() === ADMIN_EMAIL;
    const passwordMatches = existing && existing.salt && hashPassword(ADMIN_PASSWORD, existing.salt) === existing.passwordHash;
    if (emailMatches && passwordMatches) return existing;

    const salt = createSalt();
    const admin = {
      ...(existing || {}),
      email: ADMIN_EMAIL,
      salt,
      passwordHash: hashPassword(ADMIN_PASSWORD, salt),
      createdAt: existing && existing.createdAt ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    writeStorage(ADMIN_KEY, admin);
    return admin;
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function formatMoney(value) {
    const number = Number(value) || 0;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number);
  }

  function amountOf(transaction) {
    return Math.abs(Number(transaction && transaction.amount) || 0);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  const themeBarColors = { light: "#F3F6F5", dark: "#20252B" };

  function loadTheme() {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      return saved === "dark" || saved === "light" ? saved : "light";
    } catch (error) {
      return "light";
    }
  }

  function applyTheme(theme) {
    const selected = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", selected);
    const bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute("content", themeBarColors[selected]);

    $$("[data-admin-theme]").forEach((button) => {
      const active = button.dataset.adminTheme === selected;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-checked", String(active));
    });
  }

  function setupTheme() {
    $$("[data-admin-theme]").forEach((button) => {
      button.addEventListener("click", () => {
        const selected = button.dataset.adminTheme === "dark" ? "dark" : "light";
        applyTheme(selected);
        try {
          window.localStorage.setItem(THEME_KEY, selected);
        } catch (error) {
          /* the selected theme still applies for this visit */
        }
        showToast(`${selected === "dark" ? "Dark" : "Light"} mode enabled.`);
      });
    });

    window.addEventListener("storage", (event) => {
      if (event.key === THEME_KEY) applyTheme(loadTheme());
    });

    applyTheme(loadTheme());
  }

  function getUsers() {
    const users = readStorage(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
  }

  function saveUsers(users) {
    writeStorage(USERS_KEY, users);
  }

  function getPlans() {
    const plans = readStorage(PLANS_KEY, []);
    return Array.isArray(plans) ? plans : [];
  }

  function savePlans(plans) {
    writeStorage(PLANS_KEY, plans);
  }

  function getLog() {
    const log = readStorage(LOG_KEY, []);
    return Array.isArray(log) ? log : [];
  }

  function getSupportMessages() {
    const messages = readStorage(SUPPORT_KEY, []);
    return Array.isArray(messages) ? messages : [];
  }

  function saveSupportMessages(messages) {
    writeStorage(SUPPORT_KEY, messages);
  }

  function addLog(action, detail) {
    const log = getLog();
    log.unshift({ id: uid("log"), action, detail, time: new Date().toISOString() });
    writeStorage(LOG_KEY, log.slice(0, 60));
  }

  function getStates() {
    const users = getUsers();
    const states = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key || !key.startsWith(STATE_PREFIX)) continue;
      const state = readStorage(key, null);
      if (!state || !state.user || !state.wallet) continue;
      const email = normalizeEmail(state.user.email || key.slice(STATE_PREFIX.length));
      const user = users.find((item) => normalizeEmail(item.email) === email) || null;
      states.push({ key, state, user, email });
    }

    return states;
  }

  function findState(email) {
    const wanted = normalizeEmail(email);
    return getStates().find((entry) => entry.email === wanted) || null;
  }

  function getInvestments(entry) {
    const investments = entry.state.investment && entry.state.investment.investments;
    return Array.isArray(investments) ? investments : [];
  }

  function investmentStats(state) {
    const investments = getInvestments({ state });
    const active = investments.filter((item) => item.status === "active");
    return {
      invested: Number((state.investment && state.investment.total) || 0),
      active: active.reduce((sum, item) => sum + (Number(item.principal) || 0), 0),
      actual: active.reduce((sum, item) => sum + (Number(item.payoutAmount) || 0), 0)
    };
  }

  function collectTransactions(type) {
    const rows = [];
    getStates().forEach((entry) => {
      const transactions = Array.isArray(entry.state.transactions) ? entry.state.transactions : [];
      transactions.forEach((transaction) => {
        if (!type || transaction.type === type) {
          rows.push({ entry, transaction });
        }
      });
    });
    return rows.sort((a, b) => new Date(b.transaction.date) - new Date(a.transaction.date));
  }

  function showToast(message) {
    const toast = $("#adminToast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function setError(selector, message) {
    const element = $(selector);
    if (element) element.textContent = message || "";
  }

  function showOnly(screen) {
    ["#adminSetup", "#adminLogin", "#adminApp"].forEach((selector) => {
      const element = $(selector);
      if (element) element.hidden = selector !== screen;
    });
  }

  function init() {
    setupTheme();
    ensureAdminCredentials();
    const admin = readStorage(ADMIN_KEY, null);
    const session = readStorage(ADMIN_SESSION_KEY, null);

    if (!admin || !admin.email) {
      showOnly("#adminSetup");
      bindSetup();
      return;
    }

    if (!session || normalizeEmail(session.email) !== normalizeEmail(admin.email)) {
      showOnly("#adminLogin");
      bindLogin();
      return;
    }

    currentAdmin = admin;
    showOnly("#adminApp");
    bindApp();
    renderAll();
  }

  function bindSetup() {
    const form = $("#setupForm");
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "true";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = normalizeEmail($("#setupEmail").value);
      const password = $("#setupPassword").value;
      const confirm = $("#setupConfirm").value;

      if (!EMAIL_PATTERN.test(email)) return setError("#setupError", "Enter a valid admin email.");
      if (password.length < 6) return setError("#setupError", "Password must be at least 6 characters.");
      if (password !== confirm) return setError("#setupError", "Passwords do not match.");

      const salt = createSalt();
      currentAdmin = {
        email,
        salt,
        passwordHash: hashPassword(password, salt),
        createdAt: new Date().toISOString()
      };
      writeStorage(ADMIN_KEY, currentAdmin);
      writeStorage(ADMIN_SESSION_KEY, { email });
      setError("#setupError", "");
      addLog("Admin access created", `Admin account set for ${email}.`);
      showOnly("#adminApp");
      bindApp();
      renderAll();
      showToast("Admin access created.");
    });
  }

  function bindLogin() {
    const form = $("#loginForm");
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "true";

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const admin = readStorage(ADMIN_KEY, null);
      const email = normalizeEmail($("#loginEmail").value);
      const password = $("#loginPassword").value;

      if (!admin || email !== normalizeEmail(admin.email)) {
        return setError("#loginError", "Invalid admin email or password.");
      }
      if (hashPassword(password, admin.salt) !== admin.passwordHash) {
        return setError("#loginError", "Invalid admin email or password.");
      }

      currentAdmin = admin;
      writeStorage(ADMIN_SESSION_KEY, { email: admin.email });
      setError("#loginError", "");
      showOnly("#adminApp");
      bindApp();
      renderAll();
      showToast("Welcome back.");
    });
  }

  function isMobileAdminMenu() {
    return Boolean(window.matchMedia && window.matchMedia("(max-width: 620px)").matches);
  }

  function isAdminMenuOpen() {
    const app = $("#adminApp");
    return Boolean(app && app.classList.contains("is-menu-open"));
  }

  function setAdminMenu(open) {
    const app = $("#adminApp");
    if (!app) return;
    app.classList.toggle("is-menu-open", open);
    const backdrop = $("#adminMenuBackdrop");
    if (backdrop) backdrop.hidden = !open;
    const toggle = $("#adminMenuToggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close admin menu" : "Open admin menu");
    }
  }

  function bindApp() {
    if (appBound) return;
    appBound = true;

    $$("[data-admin-section]").forEach((button) => {
      button.addEventListener("click", () => {
        if (isMobileAdminMenu() && !isAdminMenuOpen()) {
          setAdminMenu(true);
          return;
        }
        showSection(button.dataset.adminSection);
        if (isMobileAdminMenu()) setAdminMenu(false);
      });
    });

    const menuToggle = $("#adminMenuToggle");
    if (menuToggle) {
      menuToggle.addEventListener("click", () => setAdminMenu(!isAdminMenuOpen()));
    }

    const menuBackdrop = $("#adminMenuBackdrop");
    if (menuBackdrop) {
      menuBackdrop.addEventListener("click", () => setAdminMenu(false));
    }

    document.addEventListener("pointerdown", (event) => {
      if (!isMobileAdminMenu() || !isAdminMenuOpen()) return;
      const sidebar = $("#adminSidebar");
      const toggle = $("#adminMenuToggle");
      if (sidebar && sidebar.contains(event.target)) return;
      if (toggle && toggle.contains(event.target)) return;
      setAdminMenu(false);
    });

    window.addEventListener("resize", () => {
      if (!isMobileAdminMenu()) setAdminMenu(false);
    });

    $("#adminLogout").addEventListener("click", () => {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      currentAdmin = null;
      setAdminMenu(false);
      showOnly("#adminLogin");
      bindLogin();
    });

    $("#planForm").addEventListener("submit", savePlan);
    $("#planReset").addEventListener("click", resetPlanForm);
    $("#planTable").addEventListener("click", handlePlanAction);
    $("#userSearch").addEventListener("input", renderUsers);
    $("#userTable").addEventListener("click", handleUserAction);
    $("#manualDepositForm").addEventListener("submit", saveManualDeposit);
    $("#withdrawTable").addEventListener("click", handleWithdrawAction);
    $("#payoutTable").addEventListener("click", handlePayoutAction);
    $("#supportFilter").addEventListener("change", renderSupport);
    $("#supportTable").addEventListener("click", handleSupportAction);
    $("#adminSettingsForm").addEventListener("submit", saveAdminSettings);
    $("#clearLog").addEventListener("click", clearLog);
    $("#modalClose").addEventListener("click", closeModal);
    $("#adminModal").addEventListener("click", (event) => {
      if (event.target.id === "adminModal") closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
        setAdminMenu(false);
      }
    });
  }

  function showSection(name) {
    const titles = {
      overview: "Overview",
      plans: "Investment Plans",
      users: "Users",
      deposits: "Deposits",
      withdrawals: "Withdrawals",
      payouts: "Investments",
      support: "Support",
      settings: "Admin Settings"
    };

    $$("[data-admin-section]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.adminSection === name);
    });
    $$("[data-section]").forEach((section) => {
      const active = section.dataset.section === name;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    });
    $("#adminPageTitle").textContent = titles[name] || "Overview";
  }

  function renderAll() {
    renderOverview();
    renderPlans();
    renderUsers();
    renderDeposits();
    renderWithdrawals();
    renderPayouts();
    renderSupport();
    renderSettings();
  }

  function renderOverview() {
    const states = getStates();
    const plans = getPlans();
    const deposits = collectTransactions("deposit");
    const withdrawals = collectTransactions("withdrawal").filter((row) => row.transaction.status !== "rejected");
    const pending = withdrawals.filter((row) => row.transaction.status === "pending");

    let invested = 0;
    let active = 0;
    let actual = 0;

    states.forEach((entry) => {
      const stats = investmentStats(entry.state);
      invested += stats.invested;
      active += stats.active;
      actual += stats.actual;
    });

    const depositTotal = deposits.reduce((sum, row) => sum + amountOf(row.transaction), 0);
    const withdrawalTotal = withdrawals.reduce((sum, row) => sum + amountOf(row.transaction), 0);

    $("#statUsers").textContent = String(getUsers().length);
    $("#statDeposits").textContent = formatMoney(depositTotal);
    $("#statWithdrawals").textContent = formatMoney(withdrawalTotal);
    $("#statInvested").textContent = formatMoney(invested);
    $("#statActive").textContent = formatMoney(active);
    $("#statActual").textContent = formatMoney(actual);
    $("#statPending").textContent = String(pending.length);
    $("#statPlans").textContent = String(plans.filter((plan) => plan.status === "active").length);
    $("#statSupport").textContent = String(getSupportMessages().filter((item) => item.status === "open").length);

    renderLog("#adminRecentLog", getLog().slice(0, 5), true);
  }

  function renderLog(selector, entries, compact) {
    const container = $(selector);
    if (!container) return;

    if (!entries.length) {
      container.innerHTML = `<div class="empty-row" style="padding:18px 10px;color:var(--muted);text-align:center">No activity recorded yet.</div>`;
      return;
    }

    container.innerHTML = entries.map((entry) => `
      <div class="log-entry">
        <svg class="icon"><use href="#a-check"></use></svg>
        <span><strong style="color:var(--text)">${escapeHtml(entry.action)}</strong> · ${escapeHtml(entry.detail)}</span>
        <time>${escapeHtml(compact ? formatDateTime(entry.time) : formatDate(entry.time))}</time>
      </div>
    `).join("");
  }

  function renderPlans() {
    const plans = getPlans();
    const body = $("#planTable");
    $("#planCount").textContent = `${plans.length} ${plans.length === 1 ? "plan" : "plans"}`;

    if (!plans.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6">No plans yet. Create one to let users invest.</td></tr>`;
      return;
    }

    body.innerHTML = plans.map((plan) => `
      <tr>
        <td><strong>${escapeHtml(plan.name)}</strong><small>Created ${escapeHtml(formatDate(plan.createdAt))}</small></td>
        <td class="num">${escapeHtml(formatMoney(plan.minAmount))}</td>
        <td class="num">${escapeHtml(plan.periodDays)} day${Number(plan.periodDays) === 1 ? "" : "s"}</td>
        <td class="num"><strong style="color:var(--green)">${escapeHtml(formatMoney(plan.payoutAmount))}</strong></td>
        <td><span class="badge ${escapeHtml(plan.status)}">${escapeHtml(plan.status)}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-ghost btn-small" type="button" data-plan-action="edit" data-id="${escapeHtml(plan.id)}">Edit</button>
            <button class="btn btn-ghost btn-small" type="button" data-plan-action="toggle" data-id="${escapeHtml(plan.id)}">${plan.status === "active" ? "Disable" : "Enable"}</button>
            <button class="btn btn-danger btn-small" type="button" data-plan-action="delete" data-id="${escapeHtml(plan.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function resetPlanForm() {
    editingPlanId = null;
    $("#planForm").reset();
    $("#planError").textContent = "";
    $("#planFormTitle").textContent = "Create investment plan";
    $("#planSubmit").textContent = "Save Plan";
  }

  function savePlan(event) {
    event.preventDefault();
    const name = $("#planName").value.trim();
    const minAmount = Number($("#planMin").value);
    const periodDays = Number($("#planDays").value);
    const payoutAmount = Number($("#planPayout").value);
    const status = $("#planActive").checked ? "active" : "inactive";

    if (!name) return setError("#planError", "Enter a plan name.");
    if (!Number.isFinite(minAmount) || minAmount <= 0) return setError("#planError", "Enter a valid minimum amount.");
    if (!Number.isInteger(periodDays) || periodDays < 1) return setError("#planError", "Enter a valid number of days.");
    if (!Number.isFinite(payoutAmount) || payoutAmount < minAmount) {
      return setError("#planError", "Actual payout must be at least the minimum amount.");
    }

    const plans = getPlans();

    if (editingPlanId) {
      const index = plans.findIndex((plan) => plan.id === editingPlanId);
      if (index >= 0) {
        plans[index] = { ...plans[index], name, minAmount, periodDays, payoutAmount, status };
        addLog("Plan updated", `${name} now pays ${formatMoney(payoutAmount)} after ${periodDays} day(s).`);
      }
    } else {
      plans.unshift({
        id: uid("plan"),
        name,
        minAmount,
        periodDays,
        payoutAmount,
        status,
        createdAt: new Date().toISOString()
      });
      addLog("Plan created", `${name} pays ${formatMoney(payoutAmount)} after ${periodDays} day(s).`);
    }

    savePlans(plans);
    setError("#planError", "");
    resetPlanForm();
    renderAll();
    showToast("Investment plan saved.");
  }

  function handlePlanAction(event) {
    const button = event.target.closest("[data-plan-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.planAction;
    const plans = getPlans();
    const plan = plans.find((item) => item.id === id);
    if (!plan) return;

    if (action === "edit") {
      editingPlanId = id;
      $("#planName").value = plan.name;
      $("#planMin").value = plan.minAmount;
      $("#planDays").value = plan.periodDays;
      $("#planPayout").value = plan.payoutAmount;
      $("#planActive").checked = plan.status === "active";
      $("#planFormTitle").textContent = "Edit investment plan";
      $("#planSubmit").textContent = "Update Plan";
      $("#planName").focus();
      return;
    }

    if (action === "toggle") {
      plan.status = plan.status === "active" ? "inactive" : "active";
      addLog("Plan updated", `${plan.name} is now ${plan.status}.`);
    }

    if (action === "delete") {
      const remaining = plans.filter((item) => item.id !== id);
      savePlans(remaining);
      addLog("Plan deleted", `${plan.name} was removed.`);
      if (editingPlanId === id) resetPlanForm();
      renderAll();
      showToast("Plan deleted.");
      return;
    }

    savePlans(plans);
    renderAll();
  }

  function renderUsers() {
    const query = $("#userSearch").value.trim().toLowerCase();
    const body = $("#userTable");
    const users = getUsers().filter((user) => {
      return !query || `${user.name} ${user.email}`.toLowerCase().includes(query);
    });

    if (!users.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7">No users found.</td></tr>`;
      return;
    }

    body.innerHTML = users.map((user) => {
      const entry = findState(user.email);
      const stats = entry ? investmentStats(entry.state) : { invested: 0, active: 0, actual: 0 };
      const status = user.status || "active";

      return `
        <tr>
          <td><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></td>
          <td><span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span></td>
          <td class="num">${escapeHtml(formatMoney(entry ? entry.state.wallet.balance : 0))}</td>
          <td class="num">${escapeHtml(formatMoney(stats.invested))}</td>
          <td class="num">${escapeHtml(formatMoney(stats.active))}</td>
          <td class="num"><strong style="color:var(--green)">${escapeHtml(formatMoney(stats.actual))}</strong></td>
          <td><div class="row-actions"><button class="btn btn-ghost btn-small" type="button" data-user-action="view" data-id="${escapeHtml(user.id)}">Manage</button></div></td>
        </tr>
      `;
    }).join("");
  }

  function handleUserAction(event) {
    const button = event.target.closest("[data-user-action]");
    if (!button) return;
    const user = getUsers().find((item) => item.id === button.dataset.id);
    if (!user) return;
    openUserModal(user);
  }

  function openUserModal(user) {
    const entry = findState(user.email);
    const state = entry ? entry.state : null;
    const stats = state ? investmentStats(state) : { invested: 0, active: 0, actual: 0 };
    const investments = entry ? getInvestments(entry) : [];
    const status = user.status || "active";

    $("#modalTitle").textContent = `Manage ${user.name}`;
    $("#modalBody").innerHTML = `
      <div class="detail-grid">
        <div class="detail"><span>Email</span><strong>${escapeHtml(user.email)}</strong></div>
        <div class="detail"><span>Account status</span><strong>${escapeHtml(status)}</strong></div>
        <div class="detail"><span>Joined</span><strong>${escapeHtml(formatDate(user.createdAt))}</strong></div>
        <div class="detail"><span>Wallet balance</span><strong>${escapeHtml(formatMoney(state ? state.wallet.balance : 0))}</strong></div>
        <div class="detail"><span>Invested since</span><strong>${escapeHtml(formatMoney(stats.invested))}</strong></div>
        <div class="detail"><span>Active investment</span><strong>${escapeHtml(formatMoney(stats.active))}</strong></div>
        <div class="detail"><span>Actual amount due</span><strong style="color:var(--green)">${escapeHtml(formatMoney(stats.actual))}</strong></div>
        <div class="detail"><span>Investments</span><strong>${investments.length}</strong></div>
      </div>

      <div class="modal-divider"></div>
      <h3 style="margin:0 0 12px;font-size:13px">Adjust wallet balance</h3>
      <div class="admin-form">
        <label>Amount (use - to debit)<input id="adjustAmount" type="number" step="0.01" placeholder="0.00"></label>
        <label>Reason<input id="adjustReason" type="text" placeholder="Admin adjustment"></label>
        <p class="form-error" id="adjustError"></p>
        <div class="modal-actions">
          <button class="btn btn-primary btn-small" type="button" data-modal-action="adjust" data-id="${escapeHtml(user.id)}">Apply Adjustment</button>
          <button class="btn btn-ghost btn-small" type="button" data-modal-action="status" data-id="${escapeHtml(user.id)}">${status === "active" ? "Suspend User" : "Activate User"}</button>
          <button class="btn btn-danger btn-small" type="button" data-modal-action="password" data-id="${escapeHtml(user.id)}">Reset Password</button>
        </div>
      </div>

      <div class="modal-divider"></div>
      <h3 style="margin:0 0 12px;font-size:13px">Investment records</h3>
      ${investments.length ? `
        <div class="table-wrap"><table style="min-width:520px"><thead><tr><th>Plan</th><th>Principal</th><th>Actual</th><th>Maturity</th><th>Status</th></tr></thead><tbody>
        ${investments.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.planName || "Investment")}</strong></td>
            <td class="num">${escapeHtml(formatMoney(item.principal))}</td>
            <td class="num">${escapeHtml(formatMoney(item.payoutAmount))}</td>
            <td>${escapeHtml(formatDate(item.maturityDate))}</td>
            <td><span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td>
          </tr>
        `).join("")}
        </tbody></table></div>
      ` : `<p class="muted">This user has no investment records yet.</p>`}
    `;

    $("#modalBody").onclick = handleModalAction;
    $("#adminModal").hidden = false;
  }

  function handleModalAction(event) {
    const button = event.target.closest("[data-modal-action]");
    if (!button) return;

    const user = getUsers().find((item) => item.id === button.dataset.id);
    if (!user) return;
    const action = button.dataset.modalAction;

    if (action === "adjust") {
      const amount = Number($("#adjustAmount").value);
      const reason = $("#adjustReason").value.trim() || "Admin adjustment";
      const entry = findState(user.email);
      if (!entry) return setError("#adjustError", "No wallet state found for this user.");
      if (!Number.isFinite(amount) || amount === 0) return setError("#adjustError", "Enter a non-zero amount.");
      if (amount < 0 && Math.abs(amount) > entry.state.wallet.balance) {
        return setError("#adjustError", "Debit amount exceeds the user's balance.");
      }

      entry.state.wallet.balance = Number((entry.state.wallet.balance + amount).toFixed(2));
      entry.state.transactions.unshift({
        id: uid("tx"),
        type: "admin_adjust",
        title: reason,
        amount: Math.abs(amount),
        direction: amount > 0 ? "in" : "out",
        date: new Date().toISOString(),
        status: "completed"
      });
      entry.state.notifications.unshift({
        id: uid("note"),
        title: reason,
        text: `${formatMoney(Math.abs(amount))} ${amount > 0 ? "credited to" : "debited from"} your wallet.`,
        date: new Date().toISOString(),
        read: false
      });
      writeStorage(entry.key, entry.state);
      addLog("Balance adjusted", `${user.name}: ${formatMoney(amount)} (${reason}).`);
      renderAll();
      openUserModal(user);
      showToast("Wallet balance updated.");
      return;
    }

    if (action === "status") {
      const users = getUsers();
      const target = users.find((item) => item.id === user.id);
      target.status = target.status === "active" ? "suspended" : "active";
      saveUsers(users);
      addLog("User status changed", `${target.name} is now ${target.status}.`);
      renderAll();
      openUserModal(target);
      showToast("User status updated.");
      return;
    }

    if (action === "password") {
      const users = getUsers();
      const target = users.find((item) => item.id === user.id);
      const temporaryPassword = `SP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const salt = createSalt();
      target.salt = salt;
      target.passwordHash = hashPassword(temporaryPassword, salt);
      saveUsers(users);
      addLog("Password reset", `Temporary password issued for ${target.name}.`);
      renderAll();
      openUserModal(target);
      setError("#adjustError", `Temporary password: ${temporaryPassword}`);
      showToast("Temporary password generated.");
    }
  }

  function closeModal() {
    const modal = $("#adminModal");
    if (modal) modal.hidden = true;
  }

  function renderDeposits() {
    const users = getUsers();
    const select = $("#depositUser");
    if (select) {
      select.innerHTML = users.length
        ? users.map((user) => `<option value="${escapeHtml(user.email)}">${escapeHtml(user.name)} · ${escapeHtml(user.email)}</option>`).join("")
        : `<option value="">No users available</option>`;
    }

    const rows = collectTransactions("deposit");
    const body = $("#depositTable");

    if (!rows.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="4">No deposits recorded yet.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map(({ entry, transaction }) => `
      <tr>
        <td><strong>${escapeHtml(entry.user ? entry.user.name : entry.state.user.name)}</strong><small>${escapeHtml(entry.email)}</small></td>
        <td class="num"><strong style="color:var(--green)">${escapeHtml(formatMoney(amountOf(transaction)))}</strong></td>
        <td>${escapeHtml(formatDate(transaction.date))}</td>
        <td><span class="badge ${escapeHtml(transaction.status || "completed")}">${escapeHtml(transaction.status || "completed")}</span></td>
      </tr>
    `).join("");
  }

  function saveManualDeposit(event) {
    event.preventDefault();
    const email = $("#depositUser").value;
    const amount = Number($("#manualDepositAmount").value);
    const entry = findState(email);

    if (!entry) return setError("#manualDepositError", "Select a user first.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("#manualDepositError", "Enter a valid amount.");

    entry.state.wallet.balance = Number((entry.state.wallet.balance + amount).toFixed(2));
    entry.state.transactions.unshift({
      id: uid("tx"),
      type: "deposit",
      title: "Manual Deposit",
      amount,
      direction: "in",
      date: new Date().toISOString(),
      status: "completed"
    });
    entry.state.notifications.unshift({
      id: uid("note"),
      title: "Deposit completed",
      text: `${formatMoney(amount)} was credited to your wallet by admin.`,
      date: new Date().toISOString(),
      read: false
    });
    writeStorage(entry.key, entry.state);
    addLog("Manual deposit", `${formatMoney(amount)} credited to ${entry.email}.`);
    setError("#manualDepositError", "");
    $("#manualDepositAmount").value = "";
    renderAll();
    showToast("Deposit credited.");
  }

  function renderWithdrawals() {
    const rows = collectTransactions("withdrawal");
    const body = $("#withdrawTable");
    $("#withdrawCount").textContent = `${rows.length} ${rows.length === 1 ? "request" : "requests"}`;

    if (!rows.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="5">No withdrawal requests yet.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map(({ entry, transaction }) => {
      const status = transaction.status || "pending";
      const actions = status === "pending"
        ? `<div class="row-actions">
            <button class="btn btn-primary btn-small" type="button" data-withdraw-action="approve" data-key="${escapeHtml(entry.key)}" data-id="${escapeHtml(transaction.id)}">Approve</button>
            <button class="btn btn-danger btn-small" type="button" data-withdraw-action="reject" data-key="${escapeHtml(entry.key)}" data-id="${escapeHtml(transaction.id)}">Reject</button>
          </div>`
        : `—`;

      return `
        <tr>
          <td><strong>${escapeHtml(entry.user ? entry.user.name : entry.state.user.name)}</strong><small>${escapeHtml(entry.email)}</small></td>
          <td class="num">${escapeHtml(formatMoney(amountOf(transaction)))}</td>
          <td>${escapeHtml(formatDate(transaction.date))}</td>
          <td><span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span></td>
          <td>${actions}</td>
        </tr>
      `;
    }).join("");
  }

  function handleWithdrawAction(event) {
    const button = event.target.closest("[data-withdraw-action]");
    if (!button) return;

    const state = readStorage(button.dataset.key, null);
    if (!state || !Array.isArray(state.transactions)) return;
    const transaction = state.transactions.find((item) => item.id === button.dataset.id);
    if (!transaction || transaction.status !== "pending") return;

    const amount = amountOf(transaction);

    if (button.dataset.withdrawAction === "approve") {
      transaction.status = "completed";
      addLog("Withdrawal approved", `${formatMoney(amount)} for ${state.user.email}.`);
    } else {
      transaction.status = "rejected";
      state.wallet.balance = Number((state.wallet.balance + amount).toFixed(2));
      state.notifications.unshift({
        id: uid("note"),
        title: "Withdrawal rejected",
        text: `Your ${formatMoney(amount)} withdrawal was rejected and refunded.`,
        date: new Date().toISOString(),
        read: false
      });
      addLog("Withdrawal rejected", `${formatMoney(amount)} refunded to ${state.user.email}.`);
    }

    writeStorage(button.dataset.key, state);
    renderAll();
    showToast(`Withdrawal ${transaction.status}.`);
  }

  function renderPayouts() {
    const rows = [];
    getStates().forEach((entry) => {
      getInvestments(entry).forEach((investment) => rows.push({ entry, investment }));
    });
    rows.sort((a, b) => new Date(b.investment.startDate) - new Date(a.investment.startDate));

    const body = $("#payoutTable");
    $("#investmentCount").textContent = `${rows.length} ${rows.length === 1 ? "investment" : "investments"}`;

    if (!rows.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7">No investments recorded yet.</td></tr>`;
      return;
    }

    body.innerHTML = rows.map(({ entry, investment }) => `
      <tr>
        <td><strong>${escapeHtml(entry.user ? entry.user.name : entry.state.user.name)}</strong><small>${escapeHtml(entry.email)}</small></td>
        <td>${escapeHtml(investment.planName || "Investment")}</td>
        <td class="num">${escapeHtml(formatMoney(investment.principal))}</td>
        <td class="num"><strong style="color:var(--green)">${escapeHtml(formatMoney(investment.payoutAmount))}</strong></td>
        <td>${escapeHtml(formatDate(investment.maturityDate))}</td>
        <td><span class="badge ${escapeHtml(investment.status)}">${escapeHtml(investment.status)}</span></td>
        <td>${investment.status === "active"
          ? `<button class="btn btn-primary btn-small" type="button" data-payout-action="settle" data-key="${escapeHtml(entry.key)}" data-id="${escapeHtml(investment.id)}">Mark paid</button>`
          : `—`}</td>
      </tr>
    `).join("");
  }

  function renderSupport() {
    const filter = $("#supportFilter") ? $("#supportFilter").value || "all" : "all";
    const body = $("#supportTable");
    const messages = getSupportMessages()
      .filter((item) => filter === "all" || (item.status || "open") === filter)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!messages.length) {
      body.innerHTML = `<tr class="empty-row"><td colspan="5">No support messages found.</td></tr>`;
      return;
    }

    body.innerHTML = messages.map((item) => `
      <tr>
        <td><strong>${escapeHtml(item.userName || "User")}</strong><small>${escapeHtml(item.userEmail || "—")}</small></td>
        <td><strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml(String(item.message || "").slice(0, 70))}${String(item.message || "").length > 70 ? "…" : ""}</small></td>
        <td>${escapeHtml(formatDateTime(item.date))}</td>
        <td><span class="badge ${escapeHtml(item.status || "open")}">${escapeHtml(item.status || "open")}</span></td>
        <td><button class="btn btn-ghost btn-small" type="button" data-support-action="view" data-id="${escapeHtml(item.id)}">${item.reply ? "View Reply" : "Respond"}</button></td>
      </tr>
    `).join("");
  }

  function handleSupportAction(event) {
    const button = event.target.closest("[data-support-action]");
    if (!button) return;
    const message = getSupportMessages().find((item) => item.id === button.dataset.id);
    if (message) openSupportModal(message);
  }

  function openSupportModal(message) {
    $("#modalTitle").textContent = "Support message";
    $("#modalBody").innerHTML = `
      <div class="detail-grid">
        <div class="detail"><span>From</span><strong>${escapeHtml(message.userName || "User")}</strong></div>
        <div class="detail"><span>Email</span><strong>${escapeHtml(message.userEmail || "—")}</strong></div>
        <div class="detail"><span>Received</span><strong>${escapeHtml(formatDateTime(message.date))}</strong></div>
        <div class="detail"><span>Status</span><strong>${escapeHtml(message.status || "open")}</strong></div>
      </div>
      <div class="modal-divider"></div>
      <h3 style="margin:0 0 8px;font-size:13px">${escapeHtml(message.subject)}</h3>
      <p style="color:var(--text-2);line-height:1.6;white-space:pre-wrap;margin:0 0 18px">${escapeHtml(message.message)}</p>
      ${message.reply ? `<div class="support-reply"><strong>Your reply · ${escapeHtml(formatDateTime(message.replyDate))}</strong><p>${escapeHtml(message.reply)}</p></div><div class="modal-divider"></div>` : ""}
      <label style="display:grid;gap:7px;color:var(--text-2);font-size:12.5px;font-weight:600">
        ${message.reply ? "Update reply" : "Your reply"}
        <textarea id="supportReplyText" rows="5" maxlength="2000" placeholder="Type your response...">${escapeHtml(message.reply || "")}</textarea>
      </label>
      <p class="form-error" id="supportReplyError" role="alert"></p>
      <div class="modal-actions">
        <button class="btn btn-primary btn-small" type="button" data-support-reply="${escapeHtml(message.id)}">Send Reply</button>
      </div>
    `;
    $("#modalBody").onclick = handleSupportReply;
    $("#adminModal").hidden = false;
  }

  function handleSupportReply(event) {
    const button = event.target.closest("[data-support-reply]");
    if (!button) return;

    const reply = $("#supportReplyText").value.trim();
    if (!reply) return setError("#supportReplyError", "Enter a reply before sending.");

    const messages = getSupportMessages();
    const message = messages.find((item) => item.id === button.dataset.supportReply);
    if (!message) return;

    message.reply = reply;
    message.replyDate = new Date().toISOString();
    message.status = "replied";
    saveSupportMessages(messages);

    const entry = findState(message.userEmail);
    if (entry) {
      entry.state.notifications.unshift({
        id: uid("note"),
        icon: "i-support",
        title: "Support reply",
        description: `Admin replied to "${message.subject}".`,
        time: "Just now",
        unread: true
      });
      writeStorage(entry.key, entry.state);
    }

    addLog("Support replied", `Reply sent to ${message.userEmail || "a user"} for "${message.subject}".`);
    renderAll();
    closeModal();
    showToast("Support reply sent.");
  }

  function handlePayoutAction(event) {
    const button = event.target.closest("[data-payout-action]");
    if (!button || button.dataset.payoutAction !== "settle") return;

    const state = readStorage(button.dataset.key, null);
    if (!state || !state.investment || !Array.isArray(state.investment.investments)) return;
    const investment = state.investment.investments.find((item) => item.id === button.dataset.id);
    if (!investment || investment.status !== "active") return;

    settleInvestment(state, investment, "Investment settled by admin.");
    writeStorage(button.dataset.key, state);
    addLog("Investment paid", `${formatMoney(investment.payoutAmount)} paid to ${state.user.email}.`);
    renderAll();
    showToast("Investment marked as paid.");
  }

  function settleInvestment(state, investment, title) {
    investment.status = "completed";
    investment.paidAt = new Date().toISOString();
    state.wallet.balance = Number((state.wallet.balance + Number(investment.payoutAmount)).toFixed(2));
    state.transactions.unshift({
      id: uid("tx"),
      type: "profit",
      title: title || "Investment Payout",
      amount: Number(investment.payoutAmount),
      direction: "in",
      date: new Date().toISOString(),
      status: "completed"
    });
    state.notifications.unshift({
      id: uid("note"),
      title: "Investment payout",
      text: `${formatMoney(investment.payoutAmount)} from ${investment.planName || "your investment"} is now in your wallet.`,
      date: new Date().toISOString(),
      read: false
    });
  }

  function settleMaturedInvestments() {
    let changed = false;
    const now = Date.now();

    getStates().forEach((entry) => {
      const investments = getInvestments(entry);
      investments.forEach((investment) => {
        if (investment.status !== "active") return;
        const maturity = new Date(investment.maturityDate).getTime();
        if (Number.isFinite(maturity) && maturity <= now) {
          settleInvestment(entry.state, investment, "Investment Payout");
          addLog("Investment matured", `${formatMoney(investment.payoutAmount)} paid to ${entry.email}.`);
          changed = true;
        }
      });
      if (changed) writeStorage(entry.key, entry.state);
      changed = false;
    });
  }

  function renderSettings() {
    if (currentAdmin && $("#settingsEmail")) {
      $("#settingsEmail").value = currentAdmin.email;
    }
    renderLog("#adminLog", getLog(), false);
  }

  function saveAdminSettings(event) {
    event.preventDefault();
    const admin = readStorage(ADMIN_KEY, null);
    if (!admin) return;

    const email = normalizeEmail($("#settingsEmail").value);
    const current = $("#settingsCurrent").value;
    const nextPassword = $("#settingsNew").value;

    if (hashPassword(current, admin.salt) !== admin.passwordHash) {
      return setError("#settingsError", "Current password is incorrect.");
    }
    if (!EMAIL_PATTERN.test(email)) return setError("#settingsError", "Enter a valid admin email.");
    if (nextPassword && nextPassword.length < 6) {
      return setError("#settingsError", "New password must be at least 6 characters.");
    }

    const salt = nextPassword ? createSalt() : admin.salt;
    const updated = {
      ...admin,
      email,
      salt,
      passwordHash: nextPassword ? hashPassword(nextPassword, salt) : admin.passwordHash,
      updatedAt: new Date().toISOString()
    };

    writeStorage(ADMIN_KEY, updated);
    writeStorage(ADMIN_SESSION_KEY, { email });
    currentAdmin = updated;
    $("#settingsCurrent").value = "";
    $("#settingsNew").value = "";
    addLog("Admin settings saved", `Admin email is now ${email}.`);
    setError("#settingsError", "");
    renderAll();
    showToast("Admin settings saved.");
  }

  function clearLog() {
    if (!window.confirm("Clear all admin activity?")) return;
    writeStorage(LOG_KEY, []);
    renderAll();
    showToast("Activity log cleared.");
  }

  document.addEventListener("DOMContentLoaded", () => {
    settleMaturedInvestments();
    init();
  });
})();
