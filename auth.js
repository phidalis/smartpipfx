(() => {
  "use strict";

  const USERS_KEY = "sp-users";
  const SESSION_KEY = "sp-session";
  const THEME_KEY = "sp-theme";
  const ADMIN_KEY = "sp-admin";
  const ADMIN_SESSION_KEY = "sp-admin-session";
  const ADMIN_EMAIL = "admin@smartpip.com";
  const ADMIN_PASSWORD = "123456";
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

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

  function getUsers() {
    const users = readStorage(USERS_KEY, []);
    return Array.isArray(users) ? users : [];
  }

  function getSession() {
    return readStorage(SESSION_KEY, null);
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

  function setSession(user) {
    return writeStorage(SESSION_KEY, { id: user.id, name: user.name, email: user.email });
  }

  function showError(element, message) {
    if (!element) return;
    element.textContent = message;
  }

  function clearErrorOnInput(form, errorElement) {
    if (!form || !errorElement) return;
    form.addEventListener("input", () => {
      errorElement.textContent = "";
    });
  }

  function setupSignup() {
    const form = $("#signupForm");
    if (!form) return;

    const errorElement = $("#signupError");
    clearErrorOnInput(form, errorElement);

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const name = $("#signupName").value.trim().replace(/\s+/g, " ");
      const email = $("#signupEmail").value.trim().toLowerCase();
      const password = $("#signupPassword").value;
      const confirm = $("#signupConfirm").value;

      if (name.length < 2) {
        showError(errorElement, "Please enter your full name.");
        return;
      }
      if (!EMAIL_PATTERN.test(email)) {
        showError(errorElement, "Please enter a valid email address.");
        return;
      }
      if (password.length < 6) {
        showError(errorElement, "Password must be at least 6 characters.");
        return;
      }
      if (password !== confirm) {
        showError(errorElement, "Passwords do not match.");
        return;
      }

      const users = getUsers();
      if (users.some((user) => user.email === email)) {
        showError(errorElement, "An account with this email already exists. Please log in.");
        return;
      }

      const salt = createSalt();
      const user = {
        id: `${Date.now()}-${salt.slice(0, 6)}`,
        name,
        email,
        salt,
        passwordHash: hashPassword(password, salt),
        createdAt: new Date().toISOString()
      };

      users.push(user);
      if (!writeStorage(USERS_KEY, users)) {
        showError(errorElement, "Could not save your account. Check browser storage settings.");
        return;
      }
      if (!setSession(user)) {
        showError(errorElement, "Could not start your session. Check browser storage settings.");
        return;
      }

      window.location.replace("dashboard.html");
    });
  }

  function setupLogin() {
    const form = $("#loginForm");
    if (!form) return;

    const errorElement = $("#loginError");
    clearErrorOnInput(form, errorElement);

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const email = $("#loginEmail").value.trim().toLowerCase();
      const password = $("#loginPassword").value;

      if (!EMAIL_PATTERN.test(email)) {
        showError(errorElement, "Please enter a valid email address.");
        return;
      }
      if (!password) {
        showError(errorElement, "Please enter your password.");
        return;
      }

      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        ensureAdminCredentials();
        window.localStorage.removeItem(SESSION_KEY);
        writeStorage(ADMIN_SESSION_KEY, { email: ADMIN_EMAIL });
        window.location.replace("admin.html");
        return;
      }

      const user = getUsers().find((item) => item.email === email);
      const valid = user && user.salt && hashPassword(password, user.salt) === user.passwordHash;

      if (!valid) {
        showError(errorElement, "Incorrect email or password.");
        return;
      }
      if (!setSession(user)) {
        showError(errorElement, "Could not start your session. Check browser storage settings.");
        return;
      }

      window.location.replace("dashboard.html");
    });
  }

  function setupTheme() {
    const buttons = $$("[data-theme-toggle]");
    if (!buttons.length) return;

    const barColors = { dark: "#060D14", light: "#F3F6F5" };
    let current = "light";
    try {
      const saved = window.localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") current = saved;
    } catch (error) {
      current = "light";
    }

    function apply(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      const bar = document.querySelector('meta[name="theme-color"]');
      if (bar) bar.setAttribute("content", barColors[theme]);
      buttons.forEach((button) => button.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`));
    }

    apply(current);

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        current = current === "dark" ? "light" : "dark";
        apply(current);
        try {
          window.localStorage.setItem(THEME_KEY, current);
        } catch (error) {
          /* the selected mode still applies for this visit */
        }
      });
    });
  }

  if (($("#loginForm") || $("#signupForm")) && getSession()) {
    window.location.replace("dashboard.html");
    return;
  }

  setupSignup();
  setupLogin();
  setupTheme();
})();
