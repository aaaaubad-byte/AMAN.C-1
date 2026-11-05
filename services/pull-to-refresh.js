/* AMAN.C — سحب موحد للأسفل لتحديث بيانات الشاشة الحالية. */
(() => {
  "use strict";
  const handlers = new Map();
  let startY = 0, startX = 0, pulling = false, refreshing = false, distance = 0;
  const threshold = 76;
  const indicator = document.createElement("div");
  indicator.id = "aman-pull-indicator";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.textContent = "اسحب للأسفل للتحديث";
  Object.assign(indicator.style, {
    position:"fixed",zIndex:"9999",top:"calc(env(safe-area-inset-top, 0px) + 8px)",
    left:"50%",transform:"translate(-50%, -64px)",opacity:"0",pointerEvents:"none",
    padding:"9px 15px",borderRadius:"999px",background:"var(--navy, #173c52)",
    color:"#fff",fontSize:"12px",fontWeight:"700",boxShadow:"0 4px 16px #10243526",
    transition:"transform .18s ease, opacity .18s ease",whiteSpace:"nowrap"
  });
  function screenName() {
    if (window.AMANAdminNavigation) {
      const current = window.AMANAdminNavigation.current;
      if (current === "login") return "";
      if (current === "requests" && !document.getElementById("request-detail-view")?.hidden) return "requests-detail";
      const generic = document.getElementById("admin-generic-view");
      if (generic && !generic.hidden) {
        if (generic.dataset.noPullRefresh === "true") return "";
        if (generic.dataset.pullScreen) return generic.dataset.pullScreen;
      }
      return current || "";
    }
    return window.AMANClientNavigation?.current || "";
  }
  function atTop(target) {
    if ((document.scrollingElement?.scrollTop || window.scrollY || 0) > 0) return false;
    let node = target instanceof Element ? target : null;
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight && node.scrollTop > 0) return false;
      node = node.parentElement;
    }
    return true;
  }
  function show(text, offset) {
    indicator.textContent = text;
    indicator.style.opacity = "1";
    indicator.style.transform = "translate(-50%, " + offset + "px)";
  }
  function hide() {
    indicator.style.opacity = "0";
    indicator.style.transform = "translate(-50%, -64px)";
  }
  function register(name, callback) {
    if (typeof name === "string" && typeof callback === "function") handlers.set(name, callback);
  }
  async function run() {
    if (refreshing) return;
    const callback = handlers.get(screenName());
    if (!callback) { hide(); return; }
    refreshing = true;
    show("جارٍ تحديث البيانات…", 8);
    let succeeded = false;
    try {
      const result = await callback();
      succeeded = result !== false && result?.success !== false;
    } catch (error) {
      succeeded = false;
    }
    refreshing = false;
    if (succeeded) {
      hide();
      return;
    }
    show("تعذر تحديث البيانات", 8);
    window.setTimeout(hide, 1500);
  }
  function onStart(event) {
    if (refreshing || !event.touches || event.touches.length !== 1) return;
    const target = event.target;
    if (target.closest?.("input, textarea, select, button, a, form, [contenteditable=true], dialog, [data-no-pull-refresh]")) return;
    if (!atTop(target)) return;
    startY = event.touches[0].clientY;
    startX = event.touches[0].clientX;
    distance = 0;
    pulling = true;
  }
  function onMove(event) {
    if (!pulling || refreshing || !event.touches || event.touches.length !== 1) return;
    const dy = event.touches[0].clientY - startY;
    const dx = Math.abs(event.touches[0].clientX - startX);
    if (dy <= 0 || dx > dy || !atTop(event.target)) { pulling = false; hide(); return; }
    distance = dy;
    if (dy > 7 && event.cancelable) event.preventDefault();
    show(dy >= threshold ? "اترك للتحديث" : "اسحب للأسفل للتحديث", Math.min(8 + dy * .35, 42));
  }
  function onEnd() {
    if (!pulling) return;
    pulling = false;
    if (distance >= threshold) run();
    else hide();
  }
  document.addEventListener("touchstart", onStart, {passive:true});
  document.addEventListener("touchmove", onMove, {passive:false});
  document.addEventListener("touchend", onEnd, {passive:true});
  document.addEventListener("touchcancel", onEnd, {passive:true});
  document.addEventListener("DOMContentLoaded", () => document.body.append(indicator), {once:true});
  if (document.body) document.body.append(indicator);
  window.AMANPullToRefresh = Object.freeze({register});
})();