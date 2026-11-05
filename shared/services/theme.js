/* AMAN.C display-theme preference: system by default; light/dark are explicit overrides. */
(() => {
  "use strict";
  const KEY = "aman-display-theme-v1";
  const VALID = new Set(["system", "light", "dark"]);
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function preference() {
    try {
      const stored = localStorage.getItem(KEY);
      return VALID.has(stored) ? stored : "system";
    } catch {
      return "system";
    }
  }

  function apply() {
    const pref = preference();
    const resolved = pref === "system" ? (media && media.matches ? "dark" : "light") : pref;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = pref;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === "dark" ? "#182b35" : "#f4f8fa";
    document.querySelectorAll("[data-theme-setting]").forEach(control => {
      control.value = pref;
    });
    document.querySelectorAll("picture source[data-theme-dark-logo]").forEach(source => {
      source.media = resolved === "dark" ? "all" : "not all";
    });
  }

  window.AMANTheme = Object.freeze({ getPreference: preference, apply });
  apply();

  document.addEventListener("change", event => {
    const control = event.target && event.target.closest && event.target.closest("[data-theme-setting]");
    if (!control || !VALID.has(control.value)) return;
    try {
      localStorage.setItem(KEY, control.value);
    } catch {
      // Keep the selected theme active for this page even when storage is unavailable.
    }
    apply();
  });

  if (media) {
    const onSystemChange = () => { if (preference() === "system") apply(); };
    if (media.addEventListener) media.addEventListener("change", onSystemChange);
    else if (media.addListener) media.addListener(onSystemChange);
  }
  window.addEventListener("storage", event => {
    if (event.key === KEY) apply();
  });
  document.addEventListener("DOMContentLoaded", apply);
})();
