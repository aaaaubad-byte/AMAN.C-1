/*
 * AMAN.C — تسجيل Service Worker وإشعار التحديث (PWA) لتطبيق الإدارة.
 *
 * - يسجّل ./sw.js بنطاق هذا التطبيق فقط (updateViaCache: "none" ليفحص المتصفح الملف من الشبكة دائمًا).
 * - يفحص وجود إصدار جديد عند التحميل، وعند عودة التطبيق للواجهة، وعند عودة الاتصال، وكل 15 دقيقة.
 * - عند وصول إصدار جديد يعرض شريطًا صغيرًا غير مانع (تحديث الآن / لاحقًا). لا يُعاد تحميل الصفحة
 *   إلا بعد ضغط المدير «تحديث الآن»، فلا تُقاطَع عملية إدارية جارية. وإن اختار «لاحقًا» أو تجاهله،
 *   تُطبَّق النسخة الجديدة تلقائيًا عند فتح التطبيق مرة أخرى بعد إغلاقه.
 * - لا يخزّن شيئًا في المتصفح ولا يلمس جلسة المدير (تبقى في sessionStorage كما صُمّمت).
 */
(() => {
"use strict";
if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

const CHECK_MS = 15 * 60 * 1000;
let reg = null, applying = false, dismissed = false, bar = null;

function check() { if (reg) reg.update().catch(() => {}); }

function button(label, primary) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.cssText = "min-height:36px;padding:6px 14px;border-radius:8px;font:inherit;font-weight:800;cursor:pointer;border:1px solid " + (primary ? "#e5edf1" : "#83a7ba") + ";background:" + (primary ? "#e5edf1" : "transparent") + ";color:" + (primary ? "#102d45" : "#fff");
  return b;
}

function hideBanner() { if (bar) { bar.remove(); bar = null; } }

function apply(worker) {
  applying = true;
  const target = (reg && reg.waiting) || worker;
  if (target) target.postMessage({ type: "SKIP_WAITING" });
  /* احتياط: إن لم يحدث تبديل للعامل خلال ثوانٍ نعيد التحميل مباشرة (الشبكة أولًا تضمن ملفات حديثة). */
  setTimeout(() => location.reload(), 4000);
}

function showBanner(worker) {
  if (dismissed || bar) return;
  bar = document.createElement("div");
  bar.id = "aman-update-banner";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.dir = "rtl";
  bar.style.cssText = "position:fixed;z-index:2147483000;right:12px;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 84px);max-width:520px;margin:auto;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:13px;background:#102d45;color:#fff;font:700 13px/1.6 Tajawal,sans-serif;box-shadow:0 10px 30px #10243566";
  const msg = document.createElement("span");
  msg.textContent = "يتوفر إصدار جديد من التطبيق.";
  const actions = document.createElement("span");
  actions.style.cssText = "display:flex;gap:8px";
  const now = button("تحديث الآن", true), later = button("لاحقًا", false);
  now.addEventListener("click", () => { now.disabled = true; now.textContent = "جارٍ التحديث…"; apply(worker); });
  later.addEventListener("click", () => { dismissed = true; hideBanner(); });
  actions.append(now, later);
  bar.append(msg, actions);
  document.body.append(bar);
}

function watch(r) {
  if (r.waiting && navigator.serviceWorker.controller) showBanner(r.waiting);
  r.addEventListener("updatefound", () => {
    const w = r.installing;
    if (!w) return;
    w.addEventListener("statechange", () => {
      if (w.state === "installed" && navigator.serviceWorker.controller) showBanner(w);
    });
  });
}

navigator.serviceWorker.addEventListener("controllerchange", () => {
  /* لا نعيد التحميل إلا إذا طلب المدير التحديث (تجنّب إعادة التحميل عند أول تثبيت). */
  if (applying) location.reload();
});

function start() {
  navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" })
    .then(r => { reg = r; watch(r); check(); })
    .catch(() => { /* التطبيق يعمل من المتصفح بدون Service Worker */ });
}
if (document.readyState === "complete") start(); else window.addEventListener("load", start);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
window.addEventListener("online", check);
setInterval(check, CHECK_MS);
})();
