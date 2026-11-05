import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";

const required = [
  "index.html",
  "apps/customer/index.html", "apps/customer/app.js", "apps/customer/notifications-tabs.js", "apps/customer/manifest.webmanifest", "apps/customer/sw.js",
  "apps/admin/index.html", "apps/admin/app.js", "apps/admin/login.css", "apps/admin/manifest.webmanifest", "apps/admin/sw.js",
  "apps/admin/modules/numbers.js", "apps/admin/modules/requests.js", "apps/admin/modules/customers.js", "apps/admin/modules/tasks-reports.js", "apps/admin/modules/operations.js", "apps/admin/modules/management.js",
  "shared/styles/app.css", "shared/styles/visual-layer.css",
  "shared/services/runtime.js", "shared/services/theme.js", "shared/services/pwa.js", "shared/services/supabase-config.js", "shared/services/supabase-adapter.js",
  "shared/components/visual-layer-loader.js", "shared/components/visual-layer.js", "shared/components/compact-filters.js", "shared/components/pull-to-refresh.js",
  "assets/brand/logo-mark.png", "assets/brand/logo-mark-light.png",
  "assets/icons/customer/icon-192.png", "assets/icons/customer/icon-512.png", "assets/icons/customer/icon-maskable-512.png", "assets/icons/customer/apple-touch-icon.png",
  "assets/icons/admin/icon-192.png", "assets/icons/admin/icon-512.png", "assets/icons/admin/icon-maskable-512.png", "assets/icons/admin/apple-touch-icon.png",
  "simulation/simulation-adapter.js", "scripts/local-preview.mjs", "scripts/build-pwa.mjs"
];
const failures = [];
for (const file of required) {
  if (!existsSync(resolve(file))) failures.push("ملف مفقود: " + file);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
const htmlFiles = ["index.html", "apps/customer/index.html", "apps/admin/index.html"];
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  if (file === "index.html" && !html.includes("shared/components/visual-layer-loader.js")) failures.push("الصفحة الرئيسية لا تحمّل الطبقة المرئية المشتركة");
  if (/(?:\.\.\/)(?:client|admin|services|styles)\//.test(html) || /(?:\.\/)(?:client|admin|services|styles)\//.test(html)) failures.push("مسار قديم في الصفحة: " + file);
  for (const ref of refs) {
    if (/^(https?:|#|mailto:|tel:)/i.test(ref)) continue;
    const target = resolve(dirname(resolve(file)), ref);
    if (!existsSync(target)) failures.push(file + " يشير إلى ملف غير موجود: " + ref);
  }
}
for (const file of ["apps/customer/app.js", "apps/customer/notifications-tabs.js", "apps/admin/app.js", "apps/admin/modules/numbers.js", "apps/admin/modules/requests.js", "apps/admin/modules/customers.js", "apps/admin/modules/tasks-reports.js", "apps/admin/modules/operations.js", "apps/admin/modules/management.js", "shared/services/runtime.js", "shared/services/theme.js", "shared/services/pwa.js", "shared/services/supabase-config.js", "shared/services/supabase-adapter.js", "shared/components/visual-layer-loader.js", "shared/components/visual-layer.js", "shared/components/compact-filters.js", "shared/components/pull-to-refresh.js", "simulation/simulation-adapter.js"]) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) failures.push("خطأ صياغة JavaScript في " + file + ": " + check.stderr);
}
for (const file of ["apps/customer/index.html", "apps/admin/index.html"]) {
  const html = readFileSync(file, "utf8");
  if (/shared\/storage\.js|localStorage/i.test(html)) {
    failures.push("يجب ألا تعتمد واجهة المنتج على تخزين المتصفح التجريبي: " + file);
  }
}
for (const file of ["apps/customer/index.html", "apps/admin/index.html", "index.html"]) {
  const html = readFileSync(file, "utf8");
  if (/simulation|demo-services|__AMAN_SIMULATION__|\?demo=1/i.test(html)) failures.push("صفحة إنتاج تشير إلى المحاكاة: " + file);
}
for (const file of ["apps/customer/index.html", "apps/admin/index.html"]) {
  if (!readFileSync(file, "utf8").includes("shared/services/runtime.js")) failures.push("الصفحة لا تحمّل طبقة الخدمات: " + file);
}
for (const file of ["apps/customer/app.js", "apps/admin/app.js", "apps/admin/modules/numbers.js", "apps/admin/modules/requests.js", "apps/admin/modules/customers.js", "apps/admin/modules/tasks-reports.js", "apps/admin/modules/operations.js", "apps/admin/modules/management.js"]) {
  if (/localStorage|sessionStorage|indexedDB/.test(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))) failures.push("الواجهة تصل إلى التخزين مباشرة بدل طبقة الخدمات: " + file);
}
for (const app of ["apps/customer", "apps/admin"]) {
  const html = readFileSync(app + "/index.html", "utf8");
  if (!html.includes('rel="manifest" href="./manifest.webmanifest"')) failures.push("PWA: الصفحة لا تربط manifest: " + app + "/index.html");
  if (!html.includes('src="../../shared/services/pwa.js"')) failures.push("PWA: الصفحة لا تحمّل pwa.js: " + app + "/index.html");
  for (const file of ["shared/services/pwa.js", app + "/sw.js"]) {
    if (!existsSync(resolve(file))) { failures.push("PWA: ملف مفقود: " + file); continue; }
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (check.status !== 0) failures.push("خطأ صياغة JavaScript في " + file + ": " + check.stderr);
  }
  if (existsSync(resolve(app + "/sw.js")) && !readFileSync(app + "/sw.js", "utf8").includes("__BUILD_ID__")) failures.push("PWA: علامة __BUILD_ID__ مفقودة في " + app + "/sw.js");
  let manifest = null;
  try { manifest = JSON.parse(readFileSync(app + "/manifest.webmanifest", "utf8")); } catch (error) { failures.push("PWA: manifest غير صالح في " + app + ": " + error.message); }
  if (!manifest) continue;
  for (const key of ["id", "name", "short_name", "start_url", "scope", "display", "icons"]) {
    if (!manifest[key]) failures.push("PWA: الحقل «" + key + "» مفقود في " + app + "/manifest.webmanifest");
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const icon of icons) {
    if (!existsSync(resolve(app, icon.src))) failures.push("PWA: أيقونة غير موجودة في " + app + ": " + icon.src);
  }
  if (!icons.some(icon => icon.sizes === "192x192" && icon.type === "image/png")) failures.push("PWA: أيقونة PNG بحجم 192 مفقودة في " + app);
  if (!icons.some(icon => icon.sizes === "512x512" && icon.type === "image/png" && icon.purpose === "any")) failures.push("PWA: أيقونة PNG بحجم 512 مفقودة في " + app);
  if (!icons.some(icon => icon.purpose === "maskable")) failures.push("PWA: أيقونة maskable مفقودة في " + app);
}
if (!existsSync(resolve("scripts/build-pwa.mjs"))) failures.push("PWA: scripts/build-pwa.mjs مفقود");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("نجح الفحص: ملفات المنتج وطبقة الخدمات والمحاكاة موجودة، المسارات سليمة، وصياغة JavaScript صحيحة، ولا يوجد ربط بتخزين الاختبار في وضع الإنتاج.");
