#!/usr/bin/env node
/*
 * AMAN.C — خادم المعاينة المحلية
 *
 *   node scripts/local-preview.mjs                    # وضع المحاكاة (الافتراضي) على http://127.0.0.1:8080
 *   node scripts/local-preview.mjs --port 9000
 *   node scripts/local-preview.mjs --no-simulation    # يعرض الواجهات كما تُنشر: بلا محاكاة ← «الخدمة غير مهيأة»
 *
 * - يخدم الملفات الثابتة فقط، ولا يتصل بأي خادم خارجي ولا بقاعدة بيانات.
 * - يستمع على الحلقة المحلية (127.0.0.1) حصرًا ويرفض أي عنوان آخر.
 * - وضع المحاكاة هو الوحيد الذي يحقن العلم window.__AMAN_SIMULATION__ وسكربت المحاكاة في صفحتي العميل والإدارة.
 *   ملفات الصفحات نفسها على القرص لا تحتوي أي إشارة إلى المحاكاة، فلا تصل المحاكاة إلى الإنتاج.
 * - في الوضع بلا محاكاة لا يُخدم إلا ما ينشره خط النشر: index.html وclient وadmin وstyles وservices.
 */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, join, extname, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8" };
const PUBLISHED = ["apps", "shared", "assets"];
const RUNTIME_TAG = '<script defer src="../../shared/services/runtime.js"></script>';
const FLAG_TAG = '<script>window.__AMAN_SIMULATION__={enabled:true,source:"local-preview"};</script>';
const ADAPTER_TAG = '<script defer src="../../simulation/simulation-adapter.js"></script>';

function injectSimulation(html) {
 if (!html.includes(RUNTIME_TAG)) throw new Error("صفحة بلا shared/services/runtime.js: لا يمكن حقن المحاكاة.");
 return html.replace(RUNTIME_TAG, FLAG_TAG + RUNTIME_TAG + ADAPTER_TAG);
}

export function startServer({ port = 8080, simulation = true, host = "127.0.0.1" } = {}) {
 if (host !== "127.0.0.1") return Promise.reject(new Error("خادم المعاينة يستمع على 127.0.0.1 فقط."));
 const server = http.createServer(async (req, res) => {
  const send = (code, body, type = "text/plain; charset=utf-8") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" }); res.end(body); };
  try {
   const url = new URL(req.url, "http://127.0.0.1");
   let path = decodeURIComponent(url.pathname);
   if (path === "/__aman/status") return send(200, JSON.stringify({ mode: simulation ? "simulation" : "no-simulation", simulation }), MIME[".json"]);
   if (path.includes("\0")) return send(400, "طلب غير صالح");
   const parts = path.split("/").filter(Boolean);
   const top = parts[0] || "";
   const allowed = top === "" || top === "index.html" || PUBLISHED.includes(top) || (simulation && top === "simulation");
   if (!allowed) return send(404, "غير موجود");
   let file = resolve(join(ROOT, path));
   if (file !== ROOT && !file.startsWith(ROOT + sep)) return send(403, "ممنوع");
   let info = await stat(file).catch(() => null);
   if (info && info.isDirectory()) {
    if (!path.endsWith("/")) { res.writeHead(301, { location: path + "/" }); return res.end(); }
    file = join(file, "index.html"); info = await stat(file).catch(() => null);
   }
   if (!info) return send(404, "غير موجود");
   let body = await readFile(file);
   const type = MIME[extname(file)] || "application/octet-stream";
   if (simulation && extname(file) === ".html" && (top === "apps" && (path.startsWith("/apps/customer/") || path.startsWith("/apps/admin/")))) body = injectSimulation(body.toString("utf8"));
   return send(200, body, type);
  } catch (error) { return send(500, "خطأ في الخادم: " + error.message); }
 });
 return new Promise((ok, bad) => {
  server.once("error", bad);
  server.listen(port, host, () => ok({ server, port: server.address().port, host, simulation, close: () => new Promise(done => server.close(done)) }));
 });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
 const args = process.argv.slice(2);
 const simulation = !args.includes("--no-simulation");
 const portIndex = args.indexOf("--port");
 const port = portIndex >= 0 ? Number(args[portIndex + 1]) : Number(process.env.PORT || 8080);
 if (!Number.isInteger(port) || port < 0 || port > 65535) { console.error("رقم المنفذ غير صالح."); process.exit(1); }
 startServer({ port, simulation }).then(({ port: actual }) => {
  const base = "http://127.0.0.1:" + actual;
  console.log(simulation ? "وضع المحاكاة المحلية مفعّل (بيانات غير حقيقية، بلا اتصال بأي خادم)." : "وضع بلا محاكاة: الواجهات تعرض «الخدمة غير مهيأة» كما في الإنتاج.");
  console.log("واجهة العميل : " + base + "/apps/customer/");
  console.log("واجهة الإدارة: " + base + "/apps/admin/");
  console.log("للإيقاف: اضغط Ctrl+C");
 }).catch(error => {
  console.error(error.code === "EADDRINUSE" ? "المنفذ مستخدم. جرّب: node scripts/local-preview.mjs --port 8081" : "تعذر تشغيل الخادم: " + error.message);
  process.exit(1);
 });
 process.on("SIGINT", () => process.exit(0));
}
