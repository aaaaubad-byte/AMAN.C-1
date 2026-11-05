import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";

const required = [
  "index.html", "client/index.html", "client/app.js",
  "admin/index.html", "admin/app.js", "admin/phase3-a5-a8.js", "admin/phase3-a9-a12.js", "admin/phase3-a13-a17.js", "admin/phase4-a18-a25.js", "admin/phase5-a26-a31.js", "styles/app.css", "services/runtime.js", "simulation/simulation-adapter.js", "scripts/local-preview.mjs"
];
const failures = [];
for (const file of required) {
  if (!existsSync(resolve(file))) failures.push("ملف مفقود: " + file);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
const htmlFiles = ["index.html", "client/index.html", "admin/index.html"];
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  for (const ref of refs) {
    if (/^(https?:|#|mailto:|tel:)/i.test(ref)) continue;
    const target = resolve(dirname(resolve(file)), ref);
    if (!existsSync(target)) failures.push(file + " يشير إلى ملف غير موجود: " + ref);
  }
}
for (const file of ["client/app.js", "admin/app.js", "admin/phase3-a5-a8.js", "admin/phase3-a9-a12.js", "admin/phase3-a13-a17.js", "admin/phase4-a18-a25.js", "admin/phase5-a26-a31.js", "services/runtime.js", "services/supabase-config.js", "services/supabase-adapter.js", "simulation/simulation-adapter.js"]) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) failures.push("خطأ صياغة JavaScript في " + file + ": " + check.stderr);
}
for (const file of ["client/index.html", "admin/index.html"]) {
  const html = readFileSync(file, "utf8");
  if (/shared\/storage\.js|localStorage/i.test(html)) {
    failures.push("يجب ألا تعتمد واجهة المنتج على تخزين المتصفح التجريبي: " + file);
  }
}
for (const file of ["client/index.html", "admin/index.html", "index.html"]) {
  const html = readFileSync(file, "utf8");
  if (/simulation|demo-services|__AMAN_SIMULATION__|\?demo=1/i.test(html)) failures.push("صفحة إنتاج تشير إلى المحاكاة: " + file);
}
for (const file of ["client/index.html", "admin/index.html"]) {
  if (!readFileSync(file, "utf8").includes("services/runtime.js")) failures.push("الصفحة لا تحمّل طبقة الخدمات: " + file);
}
for (const file of ["client/app.js", "admin/app.js", "admin/phase3-a5-a8.js", "admin/phase3-a9-a12.js", "admin/phase3-a13-a17.js", "admin/phase4-a18-a25.js", "admin/phase5-a26-a31.js"]) {
  if (/localStorage|sessionStorage|indexedDB/.test(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))) failures.push("الواجهة تصل إلى التخزين مباشرة بدل طبقة الخدمات: " + file);
}
for (const app of ["client", "admin"]) {
  const html = readFileSync(app + "/index.html", "utf8");
  if (!html.includes('rel="manifest" href="./manifest.webmanifest"')) failures.push("PWA: الصفحة لا تربط manifest: " + app + "/index.html");
  if (!html.includes('src="./pwa.js"')) failures.push("PWA: الصفحة لا تحمّل pwa.js: " + app + "/index.html");
  for (const file of [app + "/pwa.js", app + "/sw.js"]) {
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
