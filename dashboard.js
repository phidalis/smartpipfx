(() => {
  "use strict";

  const SESSION_KEY = "sp-session";
  const USERS_KEY = "sp-users";
  const STATE_PREFIX = "sp-state-v2:";
  const PLANS_KEY = "sp-plans";
  const SUPPORT_KEY = "sp-support-messages";
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function getUsers() {
    const users = readJson(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
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

  function dayLabel(daysAgo, time) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return time ? `${day} · ${time}` : day;
  }

  function createDefaultData(name) {
    return {
      user: { name: name || "Investor" },
      wallet: { balance: 0 },
      investment: {
        total: 0,
        growth: 0,
        investments: []
      },
      transactions: [],
      notifications: []
    };
  }

  const session = readJson(SESSION_KEY, null);
  if (!session || !session.email) {
    window.location.replace("index.html");
    return;
  }

  let stateKey = `${STATE_PREFIX}${String(session.email).toLowerCase()}`;
  const savedData = readJson(stateKey, null);
  const appData = savedData && savedData.user && savedData.wallet ? savedData : createDefaultData(session.name);
  appData.user = { name: session.name || appData.user.name || "Investor", email: session.email };
  if (!Array.isArray(appData.investment.investments)) appData.investment.investments = [];
  if (!Array.isArray(appData.transactions)) appData.transactions = [];
  if (!Array.isArray(appData.notifications)) appData.notifications = [];

  const account = getUsers().find((item) => String(item.email).toLowerCase() === String(session.email).toLowerCase());
  if (account && account.status === "suspended") {
    window.localStorage.removeItem(SESSION_KEY);
    window.location.replace("index.html");
    return;
  }

  function saveData() {
    try {
      window.localStorage.setItem(stateKey, JSON.stringify(appData));
    } catch (error) {
      /* storage can be unavailable; the current visit still works */
    }
  }

  function logout() {
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* storage can be unavailable; navigation still returns to the landing page */
    }
    window.location.replace("index.html");
  }

  if (!savedData) saveData();

  const transactionIcons = {
      deposit: "i-deposit",
      investment: "i-trend",
      profit: "i-profit",
      withdrawal: "i-withdraw-small",
    activation: "i-check-circle",
    pending: "i-history",
    rejected: "i-info"
  };

  const validRoutes = new Set(["home", "deposit", "invest", "withdraw", "support", "settings", "history"]);
  const routeTitles = {
    home: "Dashboard",
    deposit: "Deposit",
    invest: "Invest",
    withdraw: "Withdraw",
    support: "Support",
    settings: "Settings",
    history: "Transaction History"
  };
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const formatMoney = (value) => currencyFormatter.format(value);
  const formatSignedMoney = (value) => `${value > 0 ? "+" : ""}${formatMoney(value)}`;
  const formatGrowth = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  const formatGrowthPrecise = (value) => `${value > 0 ? "+" : ""}${Number(value || 0).toFixed(2)}%`;
  const roundMoney = (value) => Math.round(value * 100) / 100;
  const formatAxis = (value) => {
    const absolute = Math.abs(value);
    if (absolute >= 1000) return `$${(value / 1000).toFixed(absolute >= 10000 ? 0 : 1)}k`;
    return `$${Math.round(value)}`;
  };
  const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));

  function getPlans() {
    const plans = readJson(PLANS_KEY, []);
    return Array.isArray(plans) ? plans : [];
  }

  function getSupportMessages() {
    const messages = readJson(SUPPORT_KEY, []);
    return Array.isArray(messages) ? messages : [];
  }

  function saveSupportMessages(messages) {
    writeJson(SUPPORT_KEY, messages);
  }

  function formatSupportDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function getActiveInvestments() {
    return appData.investment.investments.filter((item) => item.status === "active");
  }

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function getInvestmentTiming(investment, now) {
    const start = new Date(investment.startDate).getTime();
    const end = new Date(investment.maturityDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return {
        start: Number.isFinite(start) ? start : now,
        end: Number.isFinite(end) ? end : now,
        progress: investment.status === "completed" ? 1 : 0
      };
    }
    return { start, end, progress: clamp((now - start) / (end - start), 0, 1) };
  }

  function investmentSeed(investment) {
    const key = `${investment.id || ""}|${investment.planName || ""}|${Number(investment.principal) || 0}|${Number(investment.payoutAmount) || 0}|${investment.startDate || ""}`;
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) % 1000003;
    }
    return hash;
  }

  function investmentBaseValue(investment, now) {
    const principal = Math.max(0, Number(investment.principal) || 0);
    const payout = Math.max(principal, Number(investment.payoutAmount) || principal);
    const timing = getInvestmentTiming(investment, now);
    const progress = investment.status === "completed" ? 1 : timing.progress;
    return roundMoney(clamp(principal + (payout - principal) * progress, principal, payout));
  }

  function investmentCurrentValue(investment, now) {
    const principal = Math.max(0, Number(investment.principal) || 0);
    const payout = Math.max(principal, Number(investment.payoutAmount) || principal);
    const base = investmentBaseValue(investment, now);
    const timing = getInvestmentTiming(investment, now);
    const progress = investment.status === "completed" ? 1 : timing.progress;
    if (progress <= 0 || progress >= 1) return base;

    const expectedProfit = Math.max(0, payout - principal);
    const amplitude = Math.min(expectedProfit * 0.05, principal * 0.0005);
    if (amplitude <= 0) return base;

    const seed = investmentSeed(investment);
    const seconds = now / 1000;
    const wave = Math.sin(seconds * 0.61 + seed) * 0.5
      + Math.sin(seconds * 1.37 + seed * 0.37) * 0.32
      + Math.sin(seconds * 2.93 + seed * 0.73) * 0.18;
    const fluctuation = wave * amplitude * Math.sin(Math.PI * progress);
    return roundMoney(clamp(base + fluctuation, principal, payout));
  }

  function investmentChartValue(investment, now) {
    const principal = Math.max(0, Number(investment.principal) || 0);
    const payout = Math.max(principal, Number(investment.payoutAmount) || principal);
    const timing = getInvestmentTiming(investment, now);
    const progress = investment.status === "completed" ? 1 : timing.progress;
    const base = principal + (payout - principal) * progress;
    if (progress <= 0 || progress >= 1) return roundMoney(clamp(base, principal, payout));

    const expectedProfit = Math.max(0, payout - principal);
    const amplitude = Math.min(expectedProfit * 0.3, principal * 0.004);
    if (amplitude <= 0) return roundMoney(clamp(base, principal, payout));

    const seed = investmentSeed(investment);
    const wave = Math.sin(progress * Math.PI * 10 + seed) * 0.45
      + Math.sin(progress * Math.PI * 19 + seed * 0.37) * 0.35
      + Math.sin(progress * Math.PI * 33 + seed * 0.73) * 0.2;
    const seconds = now / 1000;
    const liveWave = Math.sin(seconds * 0.83 + seed) * 0.6
      + Math.sin(seconds * 1.71 + seed * 0.29) * 0.4;
    const fluctuation = (wave * 0.65 + liveWave * 0.35) * amplitude * Math.sin(Math.PI * progress);
    return roundMoney(clamp(base + fluctuation, principal, payout));
  }

  function investmentStats(now = Date.now()) {
    const active = getActiveInvestments();
    const activePrincipal = roundMoney(active.reduce((sum, item) => sum + (Number(item.principal) || 0), 0));
    const targetAmount = roundMoney(active.reduce((sum, item) => sum + (Number(item.payoutAmount) || 0), 0));
    const currentAmount = roundMoney(active.reduce((sum, item) => sum + investmentCurrentValue(item, now), 0));
    const targetProfit = Math.max(0, roundMoney(targetAmount - activePrincipal));
    const earnedProfit = roundMoney(clamp(currentAmount - activePrincipal, 0, targetProfit));
    const growth = activePrincipal > 0 ? roundMoney((earnedProfit / activePrincipal) * 100) : 0;
    const targetGrowth = activePrincipal > 0 ? roundMoney((targetProfit / activePrincipal) * 100) : 0;
    const progress = targetProfit > 0 ? clamp(earnedProfit / targetProfit, 0, 1) : (active.length ? 1 : 0);

    return {
      invested: roundMoney(appData.investment.total),
      active: activePrincipal,
      actual: targetAmount,
      current: currentAmount,
      profit: earnedProfit,
      targetProfit,
      growth,
      targetGrowth,
      progress,
      activeCount: active.length
    };
  }

  function buildChartData(now = Date.now()) {
    const active = getActiveInvestments();
    if (!active.length) return [];

    const timings = active.map((item) => getInvestmentTiming(item, now));
    const start = Math.min(...timings.map((item) => item.start));
    const end = Math.max(...timings.map((item) => item.end));
    const from = Number.isFinite(start) ? Math.min(start, now) : now;
    const to = Number.isFinite(end) && end > from ? Math.max(now, from + 1) : from + 1;
    const sampleCount = 28;
    const displayValue = investmentStats(now).current;

    return Array.from({ length: sampleCount }, (_, index) => {
      const at = from + ((to - from) * index) / (sampleCount - 1);
      const date = new Date(at);
      const position = index / (sampleCount - 1);
      const chartValue = roundMoney(active.reduce((sum, item) => sum + investmentChartValue(item, at), 0));
      const endBlend = clamp((position - 0.82) / 0.18, 0, 1);
      const value = roundMoney(chartValue + (displayValue - chartValue) * endBlend);
      return {
        value,
        date: Number.isNaN(date.getTime())
          ? "Investment"
          : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      };
    });
  }

  function settleMaturedInvestments() {
    let changed = false;
    const now = Date.now();

    getActiveInvestments().forEach((investment) => {
      const maturity = new Date(investment.maturityDate).getTime();
      if (!Number.isFinite(maturity) || maturity > now) return;

      investment.status = "completed";
      investment.paidAt = new Date().toISOString();
      appData.wallet.balance = roundMoney(appData.wallet.balance + Number(investment.payoutAmount));
      addTransaction({
        type: "profit",
        title: `${investment.planName || "Investment"} Payout`,
        amount: Number(investment.payoutAmount),
        status: "completed"
      });
      addNotification({
        icon: "i-trend",
        title: "Investment payout",
        description: `${formatMoney(investment.payoutAmount)} from ${investment.planName || "your investment"} is now in your wallet.`
      });
      changed = true;
    });

    if (changed) saveData();
    return changed;
  }

  const chartState = {
    coords: [],
    animated: false,
    allZero: false,
    width: 320,
    paddingTop: 26,
    paddingBottom: 16,
    height: 150
  };

  let toastTimer;

  function renderBindings() {
    const stats = investmentStats();
    const values = {
      welcomeName: appData.user.name,
      profileInitial: appData.user.name.trim().charAt(0).toUpperCase(),
      profilePanelName: appData.user.name,
      walletBalance: formatMoney(appData.wallet.balance),
      invested: formatMoney(stats.invested),
      activeInvestment: formatMoney(stats.active),
      profitAmount: formatMoney(stats.profit),
      actualAmount: formatMoney(stats.actual),
      investGrowth: formatGrowth(stats.growth),
      liveTargetGrowth: formatGrowthPrecise(stats.targetGrowth)
    };

    Object.entries(values).forEach(([key, value]) => {
      $$(`[data-bind="${key}"]`).forEach((element) => {
        element.textContent = value;
      });
    });

    $$("[data-max-balance]").forEach((element) => {
      element.max = appData.wallet.balance.toFixed(2);
    });
  }

  function setAnimatedValue(element, value, formatter) {
    if (!element) return;
    const next = Number(value) || 0;
    const previous = element.dataset.value === undefined ? next : Number(element.dataset.value) || 0;
    element.dataset.value = String(next);
    if (element.growthFrame) window.cancelAnimationFrame(element.growthFrame);

    if (previous === next || typeof window.performance === "undefined") {
      element.textContent = formatter(next);
      return;
    }

    const started = window.performance.now();
    const duration = 420;
    const tick = (time) => {
      const ratio = clamp((time - started) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - ratio, 3);
      element.textContent = formatter(previous + (next - previous) * eased);
      element.growthFrame = ratio < 1 ? window.requestAnimationFrame(tick) : null;
    };
    element.growthFrame = window.requestAnimationFrame(tick);
  }

  function updateLiveGrowth(now = Date.now()) {
    const stats = investmentStats(now);
    renderBindings();

    setAnimatedValue($("#currentValue"), stats.current, formatMoney);
    setAnimatedValue($("#profitEarned"), stats.profit, formatSignedMoney);

    const percent = $("#liveGrowthPct");
    if (percent) percent.textContent = formatGrowthPrecise(stats.growth);

    const updated = $("#growthUpdated");
    if (updated) {
      updated.textContent = `Updated ${new Date(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
    }

    const message = $("#growthMessage");
    if (message) {
      message.textContent = stats.activeCount
        ? `Your active investment of ${formatMoney(stats.active)} is growing.`
        : "No active investment right now. Invest in a plan to start growing.";
    }

    const endpointLabel = $("#chartEndpointLabel");
    if (!stats.activeCount && endpointLabel) endpointLabel.hidden = true;
    renderChart(now);
  }

  function setupLiveGrowth() {
    updateLiveGrowth();

    const refresh = $("#growthRefresh");
    if (refresh) {
      refresh.addEventListener("click", () => {
        const changed = settleMaturedInvestments();
        if (changed) {
          renderActiveInvestments();
          renderTransactions();
          renderNotifications();
        }
        updateLiveGrowth();
        showToast("Investment growth refreshed.");
      });
    }

    let lastSettlement = Date.now();
    window.setInterval(() => {
      const home = $("#page-home");
      if (!home || home.hidden) return;

      const now = Date.now();
      if (now - lastSettlement >= 15000) {
        const changed = settleMaturedInvestments();
        lastSettlement = now;
        if (changed) {
          renderActiveInvestments();
          renderTransactions();
          renderNotifications();
        }
      }
      updateLiveGrowth(now);
    }, 1000);
  }

  function renderPlanOptions() {
    const select = $("#investPlan");
    const submit = $("#investForm button[type='submit']");
    const error = $("#investError");
    if (!select) return;

    const plans = getPlans().filter((plan) => plan.status === "active");
    if (!plans.length) {
      select.innerHTML = `<option value="">No active plans available</option>`;
      select.disabled = true;
      if (submit) submit.disabled = true;
      if (error) error.textContent = "Ask an admin to create an investment plan first.";
      return;
    }

    select.disabled = false;
    if (submit) submit.disabled = false;
    if (error) error.textContent = "";
    select.innerHTML = plans.map((plan) => {
      const label = `${plan.name} · ${formatMoney(plan.payoutAmount)} after ${plan.periodDays} day${Number(plan.periodDays) === 1 ? "" : "s"} · min ${formatMoney(plan.minAmount)}`;
      return `<option value="${escapeHtml(plan.id)}" data-min="${Number(plan.minAmount)}" data-payout="${Number(plan.payoutAmount)}" data-days="${Number(plan.periodDays)}" data-name="${escapeHtml(plan.name)}">${escapeHtml(label)}</option>`;
    }).join("");
  }

  function renderActiveInvestments() {
    const container = $("#activeInvestmentList");
    if (!container) return;

    const active = getActiveInvestments();
    if (!active.length) {
      container.innerHTML = `<div class="active-investment-empty">No active investment is running right now.</div>`;
      return;
    }

    container.innerHTML = active.map((investment) => `
      <article class="active-investment-item">
        <div>
          <strong>${escapeHtml(investment.planName || "Investment")}</strong>
          <span>Principal ${formatMoney(investment.principal)} · matures ${new Date(investment.maturityDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
        <span class="investment-payout">${formatMoney(investment.payoutAmount)}</span>
      </article>
    `).join("");
  }

  function renderSupportMessages() {
    const container = $("#supportList");
    if (!container) return;

    const messages = getSupportMessages()
      .filter((item) => String(item.userEmail).toLowerCase() === String(session.email).toLowerCase());

    if (!messages.length) {
      container.innerHTML = `<div class="support-empty">You have not sent any support messages yet.</div>`;
      return;
    }

    container.innerHTML = messages.map((item) => `
      <article class="support-item">
        <div class="support-item-head">
          <strong>${escapeHtml(item.subject)}</strong>
          <time>${escapeHtml(formatSupportDate(item.date))}</time>
        </div>
        <p>${escapeHtml(item.message)}</p>
        <span class="support-status ${escapeHtml(item.status || "open")}">${escapeHtml(item.status || "open")}</span>
        ${item.reply ? `
          <div class="support-reply">
            <strong>Admin reply · ${escapeHtml(formatSupportDate(item.replyDate))}</strong>
            <p>${escapeHtml(item.reply)}</p>
          </div>
        ` : ""}
      </article>
    `).join("");
  }

  function renderTransactions() {
    if (!appData.transactions.length) {
      const emptyMarkup = `<div class="empty-state">
        <span class="empty-icon"><svg class="icon"><use href="#i-history"></use></svg></span>
        <strong>No transactions yet</strong>
        <span>Your deposits, investments and withdrawals will appear here.</span>
      </div>`;

      ["#transactionList", "#historyList"].forEach((selector) => {
        const container = $(selector);
        if (container) container.innerHTML = emptyMarkup;
      });
      return;
    }

    const markup = appData.transactions.map((item) => {
      const isPositive = item.amount >= 0;
      const sign = isPositive ? "+" : "-";
      const amountClass = item.status === "pending"
        ? "amount-pending"
        : item.status === "rejected"
          ? "amount-rejected"
          : isPositive
            ? "amount-positive"
            : "amount-negative";
      const icon = transactionIcons[item.type] || "i-info";

      return `<div class="transaction-row">
        <span class="tx-icon tx-${escapeHtml(item.type)}"><svg class="icon"><use href="#${icon}"></use></svg></span>
        <span class="tx-body">
          <strong class="tx-title">${escapeHtml(item.title)}</strong>
          <span class="tx-date">${escapeHtml(item.date)}${item.status === "pending" ? ' <span class="tx-status">Pending</span>' : ""}</span>
        </span>
        <span class="tx-amount ${amountClass}">${sign} ${formatMoney(Math.abs(item.amount))}</span>
      </div>`;
    }).join("");

    ["#transactionList", "#historyList"].forEach((selector) => {
      const container = $(selector);
      if (container) container.innerHTML = markup;
    });
  }

  function updateNotificationBadge() {
    const unread = appData.notifications.filter((item) => item.unread).length;
    const dot = $("#notifyDot");
    const toggle = $("#notificationToggle");

    if (dot) dot.classList.toggle("is-hidden", unread === 0);
    if (toggle) toggle.setAttribute("aria-label", unread ? `Notifications, ${unread} unread` : "Notifications");

    $$('[data-bind="notifyCount"]').forEach((element) => {
      element.textContent = unread ? `${unread} new` : "All read";
    });
  }

  function renderNotifications() {
    const list = $("#notificationList");
    if (!list) return;

    list.innerHTML = appData.notifications.length
      ? appData.notifications.map((item) => `<button class="notification-item" type="button" data-notification-id="${escapeHtml(item.id)}">
        <span class="notification-icon"><svg class="icon"><use href="#${item.icon || "i-info"}"></use></svg></span>
        <span class="notification-body">
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.description)}</small>
          <em>${escapeHtml(item.time)}</em>
        </span>
        ${item.unread ? '<span class="unread-dot" aria-label="Unread"></span>' : ""}
      </button>`).join("")
      : `<div class="notification-empty">
        <span class="empty-icon"><svg class="icon"><use href="#i-bell"></use></svg></span>
        <strong>No notifications</strong>
        <span>Account updates will show up here.</span>
      </div>`;

    updateNotificationBadge();
  }

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function addTransaction({ type, title, amount, status }) {
    const time = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    appData.transactions.unshift({
      id: makeId("tx"),
      type,
      title,
      amount,
      status,
      date: dayLabel(0, time)
    });
    appData.transactions = appData.transactions.slice(0, 30);
  }

  function addNotification({ icon, title, description }) {
    appData.notifications.unshift({
      id: makeId("note"),
      icon,
      title,
      description,
      time: "Just now",
      unread: true
    });
    appData.notifications = appData.notifications.slice(0, 10);
  }

  function setupMoneyForms() {
    renderPlanOptions();
    const depositForm = $("#depositForm");
    if (depositForm) {
      depositForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = $("#depositAmount");
        const error = $("#depositError");
        const amount = roundMoney(Number(input.value));

        if (!Number.isFinite(amount) || amount <= 0) {
          error.textContent = "Enter an amount greater than $0.";
          input.focus();
          return;
        }

        error.textContent = "";
        appData.wallet.balance = roundMoney(appData.wallet.balance + amount);
        addTransaction({ type: "deposit", title: "Demo Deposit", amount, status: "completed" });
        addNotification({
          icon: "i-deposit",
          title: "Deposit completed",
          description: `${formatMoney(amount)} was added to your available balance.`
        });
        saveData();
        renderBindings();
        renderTransactions();
        renderNotifications();
        input.value = "";
        showToast(`${formatMoney(amount)} deposited.`);
      });
    }

    const withdrawForm = $("#withdrawForm");
    if (withdrawForm) {
      withdrawForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = $("#withdrawAmount");
        const error = $("#withdrawError");
        const amount = roundMoney(Number(input.value));

        if (!Number.isFinite(amount) || amount <= 0) {
          error.textContent = "Enter an amount greater than $0.";
          input.focus();
          return;
        }

        if (amount > appData.wallet.balance) {
          error.textContent = "That amount is more than your available balance.";
          input.focus();
          return;
        }

        error.textContent = "";
        appData.wallet.balance = roundMoney(appData.wallet.balance - amount);
        addTransaction({ type: "withdrawal", title: "Withdrawal Request", amount: -amount, status: "pending" });
        addNotification({
          icon: "i-history",
          title: "Withdrawal pending",
          description: `${formatMoney(amount)} is being reviewed before payout.`
        });
        saveData();
        renderBindings();
        renderTransactions();
        renderNotifications();
        input.value = "";
        showToast("Withdrawal request submitted. Status: Pending.");
      });
    }

    const investForm = $("#investForm");
    if (investForm) {
      investForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const select = $("#investPlan");
        const input = $("#investAmount");
        const error = $("#investError");
        const option = select.selectedOptions[0];
        const amount = roundMoney(Number(input.value));

        if (!option || !option.value) {
          error.textContent = "Select an active investment plan.";
          select.focus();
          return;
        }

        if (!Number.isFinite(amount) || amount <= 0) {
          error.textContent = "Enter an amount greater than $0.";
          input.focus();
          return;
        }

        const minimum = Number(option.dataset.min);
        if (Number.isFinite(minimum) && amount < minimum) {
          error.textContent = `This plan requires at least ${formatMoney(minimum)}.`;
          input.focus();
          return;
        }

        if (amount > appData.wallet.balance) {
          error.textContent = "That amount is more than your available balance.";
          input.focus();
          return;
        }

        const payout = roundMoney(Number(option.dataset.payout) * (amount / minimum));
        const periodDays = Number(option.dataset.days);
        const now = new Date();

        error.textContent = "";
        appData.wallet.balance = roundMoney(appData.wallet.balance - amount);
        appData.investment.total = roundMoney(appData.investment.total + amount);
        appData.investment.investments.unshift({
          id: makeId("inv"),
          planId: option.value,
          planName: option.dataset.name,
          principal: amount,
          payoutAmount: payout,
          periodDays,
          startDate: now.toISOString(),
          maturityDate: new Date(now.getTime() + periodDays * 86400000).toISOString(),
          status: "active"
        });

        addTransaction({ type: "investment", title: `${option.dataset.name} Investment`, amount: -amount, status: "completed" });
        addNotification({
          icon: "i-trend",
          title: "Investment is running",
          description: `${formatMoney(amount)} is active. Your actual amount will be ${formatMoney(payout)} after ${periodDays} day${periodDays === 1 ? "" : "s"}.`
        });
        saveData();
        updateLiveGrowth(now);
        renderActiveInvestments();
        renderTransactions();
        renderNotifications();
        input.value = "";
        showToast(`${formatMoney(amount)} invested. Actual amount: ${formatMoney(payout)}.`);
      });
    }
  }

  function setupSupportForm() {
    const form = $("#supportForm");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const subjectInput = $("#supportSubject");
      const messageInput = $("#supportMessage");
      const error = $("#supportError");
      const subject = subjectInput.value.trim();
      const message = messageInput.value.trim();

      if (!subject) {
        error.textContent = "Enter a subject for your message.";
        subjectInput.focus();
        return;
      }
      if (!message) {
        error.textContent = "Enter your message.";
        messageInput.focus();
        return;
      }

      const messages = getSupportMessages();
      messages.unshift({
        id: makeId("msg"),
        userId: session.id,
        userName: appData.user.name,
        userEmail: session.email,
        subject,
        message,
        status: "open",
        date: new Date().toISOString(),
        reply: "",
        replyDate: ""
      });
      saveSupportMessages(messages);
      addNotification({
        icon: "i-support",
        title: "Support message sent",
        description: `Admin has received "${subject}" and will reply here.`,
        time: "Just now",
        unread: true
      });
      saveData();
      renderSupportMessages();
      renderNotifications();
      error.textContent = "";
      form.reset();
      showToast("Support message sent to admin.");
    });
  }

  function findAccountUser(users) {
    return users.find((item) => item.id === session.id) || users.find((item) => item.email === session.email);
  }

  function migrateStateKey(previousKey, nextKey) {
    if (nextKey === previousKey) return true;
    try {
      window.localStorage.setItem(nextKey, window.localStorage.getItem(previousKey) || JSON.stringify(appData));
      window.localStorage.removeItem(previousKey);
      stateKey = nextKey;
      return true;
    } catch (error) {
      return false;
    }
  }

  function setupAccountSettings() {
    const accountForm = $("#accountForm");
    if (accountForm) {
      const nameInput = $("#accountName");
      const emailInput = $("#accountEmail");
      const error = $("#accountError");
      if (nameInput) nameInput.value = appData.user.name;
      if (emailInput) emailInput.value = appData.user.email;
      [nameInput, emailInput].forEach((input) => {
        if (input) input.addEventListener("input", () => { error.textContent = ""; });
      });

      accountForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = nameInput.value.trim().replace(/\s+/g, " ");
        const email = emailInput.value.trim().toLowerCase();

        if (name.length < 2) {
          error.textContent = "Please enter your full name.";
          return;
        }
        if (!EMAIL_PATTERN.test(email)) {
          error.textContent = "Please enter a valid email address.";
          return;
        }

        const users = getUsers();
        const user = findAccountUser(users);
        if (!user) {
          error.textContent = "Your account could not be found.";
          return;
        }
        if (users.some((item) => item.id !== user.id && item.email === email)) {
          error.textContent = "An account with this email already exists.";
          return;
        }

        const previousKey = stateKey;
        const nextKey = `${STATE_PREFIX}${email}`;

        user.name = name;
        user.email = email;
        if (!writeJson(USERS_KEY, users)) {
          error.textContent = "Could not save your account. Check browser storage settings.";
          return;
        }

        session.name = name;
        session.email = email;
        if (!writeJson(SESSION_KEY, session)) {
          error.textContent = "Could not update your session. Check browser storage settings.";
          return;
        }

        appData.user = { name, email };
        saveData();
        if (!migrateStateKey(previousKey, nextKey)) {
          error.textContent = "Account saved, but portfolio data could not be moved to the new email.";
          return;
        }

        error.textContent = "";
        renderBindings();
        showToast("Account information updated.");
      });
    }

    const passwordForm = $("#passwordForm");
    if (passwordForm) {
      const currentInput = $("#currentPassword");
      const newInput = $("#newPassword");
      const confirmInput = $("#confirmPassword");
      const error = $("#passwordError");
      [currentInput, newInput, confirmInput].forEach((input) => {
        if (input) input.addEventListener("input", () => { error.textContent = ""; });
      });

      passwordForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const current = currentInput.value;
        const next = newInput.value;
        const confirm = confirmInput.value;

        if (!current) {
          error.textContent = "Enter your current password.";
          return;
        }
        if (next.length < 6) {
          error.textContent = "New password must be at least 6 characters.";
          return;
        }
        if (next !== confirm) {
          error.textContent = "New passwords do not match.";
          return;
        }

        const users = getUsers();
        const user = findAccountUser(users);
        if (!user || hashPassword(current, user.salt) !== user.passwordHash) {
          error.textContent = "Current password is incorrect.";
          return;
        }

        user.salt = createSalt();
        user.passwordHash = hashPassword(next, user.salt);
        if (!writeJson(USERS_KEY, users)) {
          error.textContent = "Could not save your password. Check browser storage settings.";
          return;
        }

        passwordForm.reset();
        error.textContent = "";
        showToast("Password updated.");
      });
    }
  }

  function closeDropdowns() {
    ["notificationPanel", "profilePanel"].forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = true;
    });
    ["notificationToggle", "profileToggle"].forEach((id) => {
      const toggle = document.getElementById(id);
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });
  }

  function setupDropdowns() {
    const pairs = [
      { toggleId: "notificationToggle", panelId: "notificationPanel" },
      { toggleId: "profileToggle", panelId: "profilePanel" }
    ];

    pairs.forEach(({ toggleId, panelId }) => {
      const toggle = document.getElementById(toggleId);
      const panel = document.getElementById(panelId);
      if (!toggle || !panel) return;

      toggle.addEventListener("click", () => {
        const shouldOpen = panel.hidden;
        closeDropdowns();
        if (shouldOpen) {
          panel.hidden = false;
          toggle.setAttribute("aria-expanded", "true");
        }
      });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#notificationToggle, #notificationPanel")) {
        const panel = $("#notificationPanel");
        const toggle = $("#notificationToggle");
        if (panel) panel.hidden = true;
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
      if (!event.target.closest("#profileToggle, #profilePanel")) {
        const panel = $("#profilePanel");
        const toggle = $("#profileToggle");
        if (panel) panel.hidden = true;
        if (toggle) toggle.setAttribute("aria-expanded", "false");
      }
    });

    const notificationList = $("#notificationList");
    if (notificationList) {
      notificationList.addEventListener("click", (event) => {
        const button = event.target.closest("[data-notification-id]");
        if (!button) return;

        const notification = appData.notifications.find((item) => item.id === button.dataset.notificationId);
        if (!notification) return;

        if (notification.unread) {
          notification.unread = false;
          saveData();
          renderNotifications();
          showToast("Notification marked as read.");
        } else {
          showToast(notification.title);
        }
      });
    }

    $$("[data-profile-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const label = button.dataset.profileAction;
        closeDropdowns();
        if (label === "Profile Settings" || label === "Account Information" || label === "Security") {
          navigate("settings");
          if (label !== "Profile Settings") {
            const cardId = label === "Security" ? "securityCard" : "accountInfoCard";
            window.setTimeout(() => {
              const card = document.getElementById(cardId);
              if (!card) return;
              card.scrollIntoView({ behavior: "smooth", block: "center" });
              const input = card.querySelector("input");
              if (input) input.focus({ preventScroll: true });
            }, 80);
          }
          return;
        }
        if (label === "Admin Panel") {
          window.location.href = "admin.html";
          return;
        }
        if (label === "Logout") {
          logout();
          return;
        }
        showToast(`${label} will be available soon.`);
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDropdowns();
    });
  }

  function moveIndicator() {
    const active = $(".nav-item.is-active");
    const indicator = $("#navIndicator");
    if (!active || !indicator) return;

    const center = active.offsetLeft + active.offsetWidth / 2;
    indicator.style.transform = `translateX(${center - indicator.offsetWidth / 2}px)`;
  }

  function navigate(route, initial = false) {
    if (!validRoutes.has(route)) return;

    $$(".page").forEach((page) => {
      const isActive = page.dataset.page === route;
      page.hidden = !isActive;
      page.classList.toggle("is-active", isActive);
    });

    const navRoute = route === "history" ? "invest" : route === "settings" ? "home" : route;
    $$(".nav-item, .side-nav-item").forEach((item) => {
      const isActive = item.dataset.route === navRoute;
      item.classList.toggle("is-active", isActive);
      if (isActive) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });

    const desktopTitle = $("#desktopPageTitle");
    if (desktopTitle) desktopTitle.textContent = routeTitles[route] || "Dashboard";

    moveIndicator();
    closeDropdowns();
    hideTooltip();
    if (route === "home" && !initial) window.requestAnimationFrame(renderChart);
    if (route === "support") renderSupportMessages();

    if (!initial) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      const main = $("#mainContent");
      if (main) main.focus({ preventScroll: true });
    }
  }

  function setupNavigation() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-route]");
      if (!trigger) return;

      const route = trigger.dataset.route;
      if (!route) return;

      if (trigger.tagName === "A") event.preventDefault();
      navigate(route);
    });

    let resizeFrame;
    const onResize = () => {
      moveIndicator();
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const home = $("#page-home");
        if (home && !home.hidden) updateLiveGrowth();
      });
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
  }

  function buildSmoothPath(points) {
    if (points.length < 2) return "";

    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[index - 1] || points[index];
      const current = points[index];
      const next = points[index + 1];
      const following = points[index + 2] || next;

      const control1X = current.x + (next.x - previous.x) / 6;
      const control1Y = current.y + (next.y - previous.y) / 6;
      const control2X = next.x - (following.x - current.x) / 6;
      const control2Y = next.y - (following.y - current.y) / 6;

      path += ` C ${control1X.toFixed(2)} ${control1Y.toFixed(2)}, ${control2X.toFixed(2)} ${control2Y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }

    return path;
  }

  function renderChart(now = Date.now(), motion = false) {
    const data = buildChartData(now);
    const line = $("#chartLine");
    const area = $("#chartArea");
    const pointsGroup = $("#chartPoints");
    const empty = $("#chartEmpty");
    if (!line || !area || !pointsGroup) return;

    if (!data.length) {
      line.setAttribute("d", "");
      area.setAttribute("d", "");
      pointsGroup.innerHTML = "";
      chartState.coords = [];
      chartState.allZero = true;
      const grid = $("#chartGrid");
      if (grid) grid.innerHTML = "";
      const endpoint = $("#chartEndpoint");
      if (endpoint) endpoint.style.display = "none";
      const endpointLabel = $("#chartEndpointLabel");
      if (endpointLabel) endpointLabel.hidden = true;
      if (empty) empty.hidden = false;
      hideTooltip();
      return;
    }

    if (empty) empty.hidden = true;

    const wrap = $("#chartWrap");
    const svg = $("#investmentChart");
    const box = motion ? null : (wrap ? wrap.getBoundingClientRect() : null);
    const width = motion ? chartState.width : (box && box.width > 0 ? Math.round(box.width) : 320);
    const height = motion ? chartState.height : (box && box.height > 0 ? Math.round(box.height) : 150);
    const paddingX = 18;
    const paddingTop = 26;
    const paddingBottom = 16;
    chartState.width = width;
    chartState.paddingTop = paddingTop;
    chartState.paddingBottom = paddingBottom;
    chartState.height = height;
    if (!motion && svg) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    if (!motion) hideTooltip();

    const values = data.map((item) => item.value);
    chartState.allZero = values.every((value) => value === 0);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const spread = high - low;
    const min = chartState.allZero ? 0 : Math.max(0, low - spread * 0.15);
    const max = chartState.allZero ? 1 : high + (spread || Math.abs(high) || 100) * 0.15;

    const grid = $("#chartGrid");
    if (!motion && grid) {
      const gridTop = paddingTop;
      const gridBottom = height - paddingBottom;
      grid.innerHTML = [0, .5, 1].map((ratio) => {
        const y = gridTop + ratio * (gridBottom - gridTop);
        return `<line class="chart-grid-line" x1="${paddingX}" y1="${y.toFixed(2)}" x2="${width - 6}" y2="${y.toFixed(2)}"></line>`;
      }).join("");
    }

    const stepX = data.length > 1 ? (width - paddingX * 2) / (data.length - 1) : 0;
    const coords = data.map((item, index) => ({
      ...item,
      x: paddingX + index * stepX,
      y: height - paddingBottom - ((item.value - min) / (max - min)) * (height - paddingTop - paddingBottom)
    }));

    chartState.coords = coords;

    const linePath = buildSmoothPath(coords);
    const last = coords[coords.length - 1];
    const first = coords[0];

    line.setAttribute("d", linePath);
    area.setAttribute("d", chartState.allZero ? "" : `${linePath} L ${last.x.toFixed(2)} ${height} L ${first.x.toFixed(2)} ${height} Z`);

    const pointsEl = $("#chartPoints");
    if (!motion) {
      if (chartState.animated) {
        line.style.strokeDasharray = "none";
        line.style.strokeDashoffset = "0";
        area.classList.toggle("is-visible", !chartState.allZero);
        if (pointsEl) pointsEl.classList.add("is-static");
      } else {
        const length = line.getTotalLength();
        line.style.strokeDasharray = String(length);
        line.style.strokeDashoffset = String(length);
      }

      pointsGroup.innerHTML = `<g class="chart-point is-endpoint" data-index="${coords.length - 1}" tabindex="0" role="button" aria-label="${escapeHtml(formatMoney(last.value))} on ${escapeHtml(last.date)}" style="--point-delay:.35s">
        <circle class="point-halo" cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="9"></circle>
        <circle class="point-core" cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="4"></circle>
      </g>`;
    }

    const endpoint = $("#chartEndpoint");
    if (endpoint) {
      endpoint.style.display = "";
      endpoint.setAttribute("cx", last.x.toFixed(2));
      endpoint.setAttribute("cy", last.y.toFixed(2));
    }

    const endpointLabel = $("#chartEndpointLabel");
    if (endpointLabel) {
      endpointLabel.hidden = false;
      endpointLabel.textContent = formatMoney(last.value);
      endpointLabel.style.left = `${clamp(last.x, 58, width - 58).toFixed(2)}px`;
      endpointLabel.style.top = `${Math.max(20, last.y).toFixed(2)}px`;
    }
  }

  function startChartAnimation() {
    if (chartState.animated) return;
    chartState.animated = true;

    const line = $("#chartLine");
    const area = $("#chartArea");
    const points = $("#chartPoints");
    if (!line || !area) return;

    line.classList.add("is-ready");
    if (points) points.classList.add("is-animated");
    requestAnimationFrame(() => {
      line.style.strokeDashoffset = "0";
      area.classList.toggle("is-visible", !chartState.allZero);
    });
  }

  function startChartMotion() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let lastFrame = 0;
    const frame = (time) => {
      const home = $("#page-home");
      if (home && !home.hidden && chartState.coords.length && time - lastFrame >= 32) {
        lastFrame = time;
        renderChart(Date.now(), true);
      }
      window.requestAnimationFrame(frame);
    };
    window.requestAnimationFrame(frame);
  }

  function setupChartObserver() {
    const card = $("#growthCard");
    if (!card) return;

    if (!("IntersectionObserver" in window)) {
      startChartAnimation();
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          startChartAnimation();
          observer.disconnect();
        }
      });
    }, { threshold: 0.25 });

    observer.observe(card);
  }

  function hideTooltip() {
    const tooltip = $("#chartTooltip");
    const crosshair = $("#chartCrosshair");
    if (tooltip) tooltip.hidden = true;
    if (crosshair) crosshair.classList.remove("is-visible");
    $$(".chart-point.is-selected").forEach((point) => point.classList.remove("is-selected"));
  }

  function showTooltip(index) {
    const point = chartState.coords[index];
    const tooltip = $("#chartTooltip");
    const wrap = $("#chartWrap");
    if (!point || !tooltip || !wrap) return;

    $$(".chart-point.is-selected").forEach((selected) => selected.classList.remove("is-selected"));
    const group = $(`#chartPoints .chart-point[data-index="${index}"]`);
    if (group) group.classList.add("is-selected");

    const crosshair = $("#chartCrosshair");
    if (crosshair) {
      crosshair.setAttribute("x1", point.x.toFixed(2));
      crosshair.setAttribute("x2", point.x.toFixed(2));
      crosshair.setAttribute("y1", chartState.paddingTop);
      crosshair.setAttribute("y2", chartState.height - chartState.paddingBottom);
      crosshair.classList.add("is-visible");
    }

    $("#tooltipValue").textContent = formatMoney(point.value);
    $("#tooltipDate").textContent = point.date;
    tooltip.hidden = false;

    const wrapRect = wrap.getBoundingClientRect();
    const pointRect = group ? group.getBoundingClientRect() : wrapRect;
    const pointX = pointRect.left + pointRect.width / 2 - wrapRect.left;
    const pointY = pointRect.top + pointRect.height / 2 - wrapRect.top;

    let left = pointX - tooltip.offsetWidth / 2;
    left = Math.max(4, Math.min(left, wrapRect.width - tooltip.offsetWidth - 4));

    let top = pointY - tooltip.offsetHeight - 12;
    if (top < 4) top = pointY + 12;
    top = Math.min(top, wrapRect.height - tooltip.offsetHeight - 4);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(4, top)}px`;
  }

  function setupChartInteraction() {
    const pointsGroup = $("#chartPoints");

    if (pointsGroup) {
      pointsGroup.addEventListener("click", (event) => {
        const point = event.target.closest(".chart-point");
        if (point) showTooltip(Number(point.dataset.index));
      });

      pointsGroup.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const point = event.target.closest(".chart-point");
        if (!point) return;
        event.preventDefault();
        showTooltip(Number(point.dataset.index));
      });
    }

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#chartWrap")) hideTooltip();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideTooltip();
    });
  }

  const THEME_KEY = "sp-theme";
  const themeBarColors = { light: "#F3F6F5", dark: "#060D14" };

  function loadTheme() {
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      return saved === "dark" || saved === "light" ? saved : "light";
    } catch (error) {
      return "light";
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      /* storage can be unavailable (private mode); the theme still applies for this visit */
    }
  }

  function applyTheme(theme) {
    const selected = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", selected);

    const bar = document.querySelector('meta[name="theme-color"]');
    if (bar) bar.setAttribute("content", themeBarColors[selected]);

    $$("[data-theme-option]").forEach((button) => {
      const isActive = button.dataset.themeOption === selected;
      button.classList.toggle("is-selected", isActive);
      button.setAttribute("aria-checked", String(isActive));
    });
  }

  function setupTheme() {
    $$("[data-theme-option]").forEach((button) => {
      button.addEventListener("click", () => {
        const selected = button.dataset.themeOption === "dark" ? "dark" : "light";
        applyTheme(selected);
        saveTheme(selected);
        showToast(`${selected === "dark" ? "Dark" : "Light"} mode enabled.`);
      });
    });

    applyTheme(loadTheme());
  }

  function init() {
    settleMaturedInvestments();
    renderBindings();
    renderActiveInvestments();
    renderSupportMessages();
    setupTheme();
    renderTransactions();
    renderNotifications();
    setupDropdowns();
    setupNavigation();
    setupMoneyForms();
    setupSupportForm();
    window.addEventListener("storage", (event) => {
      if (event.key === SUPPORT_KEY) {
        renderSupportMessages();
        renderNotifications();
      }
      if (event.key === stateKey) {
        settleMaturedInvestments();
        updateLiveGrowth();
        renderActiveInvestments();
        renderTransactions();
        renderNotifications();
      }
    });
    setupAccountSettings();
    setupLiveGrowth();
    setupChartInteraction();
    setupChartObserver();
    startChartMotion();
    navigate("home", true);
    requestAnimationFrame(moveIndicator);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
