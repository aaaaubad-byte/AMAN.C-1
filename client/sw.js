/*
 * AMAN.C — Service Worker لتطبيق العميل.
 * يخزّن موارد التطبيق الثابتة المسموح بها فقط؛ لا يخزّن استجابات خاصة أو بيانات جلسات.
 */
"use strict";
const APP = "client";
const BUILD = "__BUILD_ID__";
const SELF_URL = self.location.href;
const SCOPE = new URL("./", SELF_URL).href;
const PREFIX = "aman-" + APP + "-" + new URL(SCOPE).pathname.replace(/[^a-z0-9]+/gi, "_") + "-";
const CACHE = PREFIX + BUILD;
const ROOT = new URL("../", SELF_URL).href;
const PRECACHE = [
  "./", "./app.js", "./ui-v5.js", "./pwa.js", "./manifest.webmanifest", "./icons/icon-192-v3.png", "./icons/icon-512-v3.png", "./icons/icon-maskable-512-v3.png", "./icons/apple-touch-icon-v3.png",
  "../styles/app.css", "../services/runtime.js", "../services/supabase-config.js", "../services/supabase-adapter.js", "../services/theme.js"
].map(p => new URL(p, SELF_URL).href);
const SHARED_ALLOWED = new Set([
  new URL("../styles/app.css", SELF_URL).href,
  new URL("../services/runtime.js", SELF_URL).href,
  new URL("../services/supabase-config.js", SELF_URL).href,
  new URL("../services/supabase-adapter.js", SELF_URL).href,
  new URL("../services/theme.js", SELF_URL).href
]);
const APP_STATIC = new Set(PRECACHE);
const PRIVATE_HEADERS = /(?:^|,)\s*(?:private|no-store|no-cache|must-revalidate)\b/i;

function handled(req) {
  if (req.method !== "GET" || req.headers.has("range") || req.headers.has("authorization")) return false;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.search) return false;
  if (url.href === SELF_URL) return false;
  if (url.href.startsWith(SCOPE)) {
    if (req.mode === "navigate") return true;
    return APP_STATIC.has(url.href);
  }
  return SHARED_ALLOWED.has(url.href);
}

function cacheable(req, res) {
  if (!res || !res.ok || res.type !== "basic") return false;
  if (res.headers.has("set-cookie") || res.headers.get("vary") === "*") return false;
  const control = res.headers.get("cache-control") || "";
  if (PRIVATE_HEADERS.test(control)) return false;
  if (req.headers.has("authorization")) return false;
  return true;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(PRECACHE.map(async url => {
      const req = new Request(url, { method: "GET", credentials: "omit", cache: "reload" });
      const res = await fetch(req);
      if (!cacheable(req, res)) throw new Error("not cacheable: " + url);
      await cache.put(url, res);
    }));
    if (results[0].status !== "fulfilled") throw new Error("app shell unavailable");
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (cacheable(req, res)) await cache.put(req, res.clone());
    else await cache.delete(req);
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.mode === "navigate") {
      const shell = await cache.match(SCOPE);
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener("fetch", event => {
  if (handled(event.request)) event.respondWith(networkFirst(event.request));
});

self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  else if (data.type === "GET_VERSION" && event.source) event.source.postMessage({ type: "VERSION", app: APP, build: BUILD });
});
