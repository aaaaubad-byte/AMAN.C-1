import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../services/theme.js"), "utf8");

function loadTheme(systemDark = false, saved = null) {
  const values = new Map(saved ? [["aman-display-theme-v1", saved]] : []);
  const root = { dataset: {} };
  const meta = { content: "" };
  const control = { value: "" };
  const source = { media: "(prefers-color-scheme: dark)" };
  const documentHandlers = {};
  const windowHandlers = {};
  const mediaHandlers = {};
  const media = {
    matches: systemDark,
    addEventListener: (name, fn) => { mediaHandlers[name] = fn; }
  };
  const document = {
    documentElement: root,
    querySelector: () => meta,
    querySelectorAll: selector => selector === "[data-theme-setting]" ? [control] : selector === "picture source[data-theme-dark-logo]" ? [source] : [],
    addEventListener: (name, fn) => { documentHandlers[name] = fn; }
  };
  const window = {
    matchMedia: () => media,
    addEventListener: (name, fn) => { windowHandlers[name] = fn; }
  };
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
  runInNewContext(SOURCE, { window, document, localStorage });
  return { root, meta, control, source, documentHandlers, windowHandlers, mediaHandlers, media, values, window };
}

test("السمة الافتراضية تتبع تفضيل النظام وتضبط الشعار ولون المتصفح", () => {
  const dark = loadTheme(true);
  assert.equal(dark.root.dataset.theme, "dark");
  assert.equal(dark.root.dataset.themePreference, "system");
  assert.equal(dark.source.media, "all");
  assert.equal(dark.meta.content, "#182b35");
  const light = loadTheme(false);
  assert.equal(light.root.dataset.theme, "light");
  assert.equal(light.source.media, "not all");
  assert.equal(light.meta.content, "#f4f8fa");
});

test("الاختيار اليدوي يُحفظ ويتجاوز تفضيل النظام", () => {
  const app = loadTheme(false);
  app.control.value = "dark";
  app.documentHandlers.change({ target: { closest: () => app.control } });
  assert.equal(app.values.get("aman-display-theme-v1"), "dark");
  assert.equal(app.root.dataset.theme, "dark");
  app.media.matches = false;
  app.mediaHandlers.change();
  assert.equal(app.root.dataset.theme, "dark");
});

test("تغيير الجهاز ينعكس عند اختيار حسب الجهاز فقط", () => {
  const app = loadTheme(false);
  app.media.matches = true;
  app.mediaHandlers.change();
  assert.equal(app.root.dataset.theme, "dark");
  app.control.value = "light";
  app.documentHandlers.change({ target: { closest: () => app.control } });
  app.media.matches = true;
  app.mediaHandlers.change();
  assert.equal(app.root.dataset.theme, "light");
});
