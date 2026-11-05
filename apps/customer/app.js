/*
 * AMAN.C — تطبيق العميل
 * يتعامل مع البيانات عبر window.AMANClientServices فقط (services/runtime.js).
 * لا يقرأ localStorage ولا يحتوي بيانات ثابتة ولا يعرض نجاحًا قبل تأكيد الخدمة.
 *
 * D3 (docs/DECISIONS.md): شاشتا تسجيل الدخول وإنشاء الحساب، وحارس جلسة: لا رئيسية ولا شاشة داخلية دون جلسة.
 * الشاشات العامة (boot/login/signup) هي الوحيدة المتاحة بلا جلسة، وأي محاولة تنقل لغيرها تُحوَّل إلى تسجيل الدخول.
 * فقدان الجلسة أثناء الاستخدام (auth_required من أي عملية) يعيد المستخدم إلى تسجيل الدخول برسالة واضحة.
 */
(() => {
"use strict";

const $ = id => document.getElementById(id);
/* واجهة الخدمات مع كشف انتهاء الجلسة: تُقرأ من window في كل استدعاء ليتسنى استبدالها في الاختبارات. */
const AUTH_EXEMPT = new Set(["getSession", "signIn", "signUp", "signOut"]);
const svc = () => {
 const raw = window.AMANClientServices, out = {};
 Object.keys(raw).forEach(name => {
  out[name] = async payload => {
   const result = await raw[name](payload);
   if (result && result.success !== true && result.code === "auth_required" && !AUTH_EXEMPT.has(name)) sessionLost();
   return result;
  };
 });
 return out;
};
const runtime = () => window.AMANServices;
const fmt = value => runtime().formatDateTime(value);

const screenIds = ["boot", "login", "signup", "home", "numbers", "operations", "operation-detail", "protection", "review", "result", "account", "notifications", "number-alerts", "report", "aman-service"];
const PUBLIC_SCREENS = new Set(["boot", "login", "signup"]);
const screens = Object.fromEntries(screenIds.map(id => [id, $(id + "-screen")]));
const tabs = [...document.querySelectorAll("[data-tab]")];
const numberSheet = $("number-sheet");
const tabForScreen = { home: "home", numbers: "numbers", operations: "operations" };

const numberStatusLabels = { protected: "محمي", inactive: "غير نشط", confiscated: "منتهي-مصادر", not_subscribed: "غير مشترك", other_protected: "محمي" };
const stateClass = { protected: "state-active", inactive: "state-wait", confiscated: "state-expired", not_subscribed: "state-off", other_protected: "state-active" };
const requestStatusLabels = { pending: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض" };
const operationLabels = { activation: "اشتراك", extension: "تمديد الاشتراك", reactivation: "تنشيط" };
const accountTypeLabels = { user: "مستخدم", customer: "عميل" };

/* ---------- الحالة ---------- */
let currentScreen = "boot", previousScreen = "home";
let session = null;
const lists = {
 numbers: { state: "idle", items: [], message: "" },
 operations: { state: "idle", items: [], message: "" },
 notifications: { state: "idle", items: [], message: "" }
};
let lastNumber = null, lastNumberSource = "home";
let protectionContext = null, protectionCatalog = { packages: [], payment_methods: [] }, protectionSubmitting = false;
let alertsToken = 0, searchToken = 0;
let reportNumber = null, reportSubmitting = false;

/* ---------- أدوات ---------- */
const normalizeDigits = value => String(value ?? "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
const normalizePhone = value => normalizeDigits(value).replace(/[^0-9]/g, "");
const has = value => value !== null && value !== undefined && value !== "";
/* جدول أيقونات SVG ثابتة داخلية (ليست من بيانات المستخدم) */
const svgIcon = d => '<svg class="aman-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
const ICONS = {
 clock: svgIcon('<path class="icon-fill" d="M12 2.4a9.6 9.6 0 1 0 0 19.2 9.6 9.6 0 0 0 0-19.2Z"/><path class="icon-accent" d="M11 5.8h2v6.1l4.1 2.4-1 1.7-5.1-3V5.8Z"/><path class="icon-cut" d="M12 2.4v2.1"/>'),
 user: svgIcon('<path class="icon-fill" d="M12 2.5a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2Z"/><path class="icon-accent" d="M3 21c.4-4.5 4-7.2 9-7.2s8.6 2.7 9 7.2H3Z"/><path class="icon-cut" d="M8.5 15.2 12 18l3.5-2.8"/>'),
 alert: svgIcon('<path class="icon-fill" d="M12 2 21 5.5v6.2c0 5-3.6 8.7-9 10.3-5.4-1.6-9-5.3-9-10.3V5.5L12 2Z"/><path class="icon-accent" d="M11 6.5h2v7h-2zM11 15.5h2v2h-2z"/>'),
 phone: svgIcon('<path class="icon-fill" d="M7 1.8h10A2.8 2.8 0 0 1 19.8 4.6v14.8a2.8 2.8 0 0 1-2.8 2.8H7a2.8 2.8 0 0 1-2.8-2.8V4.6A2.8 2.8 0 0 1 7 1.8Z"/><path class="icon-accent" d="M7.2 5h9.6v12H7.2z"/><path class="icon-cut" d="M10 19.2h4"/>'),
 search: svgIcon('<path class="icon-fill" d="M10.5 2.2a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6Z"/><path class="icon-accent" d="m16.5 15.1 5.3 5.3-1.5 1.5-5.3-5.3z"/><path class="icon-cut" d="M6.8 10.5a3.7 3.7 0 0 1 3.7-3.7"/>'),
 check: svgIcon('<path class="icon-fill" d="M12 2 21 5.5v6.2c0 5-3.6 8.7-9 10.3-5.4-1.6-9-5.3-9-10.3V5.5L12 2Z"/><path class="icon-accent" d="m7.1 11.8 3.2 3.2 6.8-7 1.5 1.5-8.3 8.5-4.7-4.7z"/>'),
 close: svgIcon('<path class="icon-fill" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"/><path class="icon-accent" d="m8 6.6 4 4 4-4 1.4 1.4-4 4 4 4-1.4 1.4-4-4-4 4L6.6 16l4-4-4-4L8 6.6Z"/>'),
 logout: svgIcon('<path class="icon-fill" d="M4 2.5h9a2 2 0 0 1 2 2v3h-2v-3H4v15h9v-3h2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2Z"/><path class="icon-accent" d="M14.2 7.2 19 12l-4.8 4.8-1.4-1.4 2.4-2.4H7v-2h8.2l-2.4-2.4 1.4-1.4Z"/>'),
 bell: svgIcon('<path class="icon-fill" d="M18 9a6 6 0 0 0-12 0c0 6.1-2.2 7.1-3 8.8-.2.5.2 1.2.8 1.2h16.4c.6 0 1-.7.8-1.2-.8-1.7-3-2.7-3-8.8Z"/><path class="icon-accent" d="M9.2 20h5.6a2.8 2.8 0 0 1-5.6 0Z"/><path class="icon-cut" d="M9 5.5a4 4 0 0 1 5.2 0"/>')
};
function el(tag, cls, content) {
 const n = document.createElement(tag); if (cls) n.className = cls;
 if (tag === "button" && cls && /\bbtn\b/.test(cls) && content !== undefined) {
  const label = document.createElement("span"); label.textContent = content;
  const value = String(content);
  const name = /بحث/.test(value) ? "search" : /إعادة المحاولة|تحديث/.test(value) ? "clock" : /تسجيل الخروج/.test(value) ? "logout" : /تسجيل الدخول|دخول/.test(value) ? "user" : /إلغاء|إغلاق/.test(value) ? "close" : /حفظ|تأكيد|إرسال|متابعة|اعتماد/.test(value) ? "check" : null;
  if (name && ICONS[name]) { const holder = document.createElement("span"); holder.className = "button-icon"; holder.innerHTML = ICONS[name]; n.classList.add("has-icon"); n.append(holder, label); }
  else n.textContent = content;
 } else if (content !== undefined) n.textContent = content;
 return n;
}
function iconEl(cls, name) { const n = el("span", cls); n.innerHTML = ICONS[name] || ""; return n; }
function setMessage(node, message, kind = "error") { if (!node) return; node.textContent = message; node.className = kind === "success" ? "notice-success" : kind === "info" ? "notice-info" : "notice-error"; }
function detailBlock(label, value, dir) { const b = el("div", "detail-block"), l = el("div", "detail-label", label), v = el("div", "detail-value", value); if (dir) v.dir = dir; b.append(l, v); return b; }
function emptyBox(icon, title, text, action) {
 const box = el("div", "soft-surface empty-state");
 const ic = el("div", "empty-icon"); ic.innerHTML = ICONS[icon] || "";
 box.append(ic, el("strong", "", title));
 if (text) box.append(el("p", "", text));
 if (action) { const b = el("button", "btn btn-outline", action.label); b.type = "button"; b.addEventListener("click", action.run); box.append(b); }
 return box;
}
function serviceProblem(result) { return result && result.message ? result.message : "تعذر إتمام العملية."; }

/* ---------- التنقل وحارس الجلسة (D3) ---------- */
function renderAuthFoot() {
 const st = runtime().status();
 const text = !st.configured ? runtime().notConfiguredMessage : st.simulation ? "وضع المحاكاة: لا تُدخل بياناتك الحقيقية." : "";
 $("login-foot").textContent = text; $("signup-foot").textContent = text;
}
function navigate(name, { scroll = true, remember = true } = {}) {
 if (!screens[name]) return false;
 /* الحارس: بلا جلسة لا شاشة غير عامة؛ ومع جلسة لا عودة لشاشات الدخول. */
 if (!session && !PUBLIC_SCREENS.has(name)) name = "login";
 else if (session && PUBLIC_SCREENS.has(name)) name = "home";
 if (remember && name !== currentScreen) previousScreen = currentScreen;
 currentScreen = name;
 Object.entries(screens).forEach(([key, node]) => { if (node) node.hidden = key !== name; });
 const bare = PUBLIC_SCREENS.has(name);
 $("topbar-actions").style.display = bare ? "none" : "";
 $("bottom-nav").style.display = bare ? "none" : "";
 if (name === "login" || name === "signup") renderAuthFoot();
 tabs.forEach(node => node.classList.toggle("active", node.dataset.tab === tabForScreen[name]));
 closeNumberSheet();
 if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
 /* تحديث هادئ للقوائم عند الدخول إلى شاشاتها لتعكس ما اعتمدته الإدارة منذ آخر تحميل. */
 if (session) {
  if (name === "home" || name === "numbers") refreshNumbers(true);
  if (name === "operations") refreshOperations(true);
  if (name === "notifications") refreshNotifications(true);
 }
 document.dispatchEvent(new CustomEvent("aman:screenchange", { detail: { screen: name, previous: previousScreen } }));
 return true;
}
function backToPrevious() { navigate(previousScreen || "home", { remember: false }); }
function returnToNumber() { if (lastNumber) openNumberDetails(lastNumber, lastNumberSource); else navigate(lastNumberSource || "home", { remember: false }); }
window.AMANClientNavigation = Object.freeze({ navigate, back: backToPrevious, get current() { return currentScreen; }, get previous() { return previousScreen; } });

function clearPrivateState() {
 lastNumber = null; protectionContext = null; reportNumber = null; alertsToken++; searchToken++;
 closeNumberSheet();
 ["login-password", "signup-password", "signup-confirm", "current-password", "new-password", "payment-reference", "phone-search"].forEach(id => { const n = $(id); if (n) n.value = ""; });
 $("search-message").textContent = "";
}
function showLogin(message, kind = "info") {
 clearPrivateState();
 setMessage($("login-message"), message || "", kind);
 navigate("login");
}
function sessionLost() {
 if (!session) return;
 session = null;
 resetLists("");
 Object.values(lists).forEach(l => { l.state = "signedout"; });
 renderAccount(); renderAll();
 showLogin("انتهت الجلسة. سجّل الدخول من جديد.", "error");
}

tabs.forEach(node => node.addEventListener("click", () => navigate(node.dataset.tab)));
document.querySelectorAll("[data-navigate]").forEach(node => node.addEventListener("click", () => navigate(node.dataset.navigate)));
document.querySelectorAll("[data-back]").forEach(node => node.addEventListener("click", backToPrevious));
document.querySelectorAll("[data-back-number]").forEach(node => node.addEventListener("click", returnToNumber));
$("show-all-numbers").addEventListener("click", () => navigate("numbers"));
$("account-button").addEventListener("click", () => { renderAccount(); navigate("account"); });
$("notifications-button").addEventListener("click", () => navigate("notifications"));

function closeNumberSheet() { if (numberSheet) numberSheet.hidden = true; }
$("close-sheet").addEventListener("click", closeNumberSheet);
$("sheet-done").addEventListener("click", closeNumberSheet);
numberSheet.addEventListener("click", event => { if (event.target === numberSheet) closeNumberSheet(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeNumberSheet(); });

/* ---------- تحميل البيانات من الخدمات ---------- */
function resetLists(message) {
 Object.values(lists).forEach(l => { l.state = "idle"; l.items = []; l.message = message || ""; });
}
/* silent: نحافظ على البيانات المعروضة أثناء التحديث؛ الفشل لا يمسح القائمة ولا يترك التحميل معلقًا. */
async function loadList(name, call, silent = false) {
 const list = lists[name], wasReady = list.state === "ready";
 if (!(silent && wasReady)) { list.state = "loading"; list.message = ""; renderAll(); }
 let result;
 try { result = await call(); }
 catch {
  if (!session) return false;
  if (silent && wasReady) { list.state = "ready"; list.message = "تعذر الاتصال بالخدمة. البيانات المعروضة قد تكون قديمة."; }
  else { list.items = []; list.state = "error"; list.message = "تعذر الاتصال بالخدمة. حاول مرة أخرى."; }
  renderAll();
  return false;
 }
 if (!session) return false;
 if (result.success === true) { list.items = Array.isArray(result.items) ? result.items : []; list.state = "ready"; list.message = ""; }
 else if (silent && wasReady) { list.state = "ready"; list.message = serviceProblem(result); }
 else { list.items = []; list.state = result.code === "auth_required" ? "signedout" : "error"; list.message = serviceProblem(result); }
 renderAll();
 return result.success === true;
}
const refreshNumbers = silent => loadList("numbers", () => svc().listMyNumbers(), silent === true);
const refreshOperations = silent => loadList("operations", () => svc().listMyOperations(), silent === true);
const refreshNotifications = silent => loadList("notifications", () => svc().getNotifications(), silent === true);
if (window.AMANPullToRefresh) {
 window.AMANPullToRefresh.register("home", () => refreshNumbers(true));
 window.AMANPullToRefresh.register("numbers", () => refreshNumbers(true));
 window.AMANPullToRefresh.register("operations", () => refreshOperations(true));
 window.AMANPullToRefresh.register("notifications", () => refreshNotifications(true));
 window.AMANPullToRefresh.register("number-alerts", () => lastNumber ? openNumberAlerts(lastNumber) : Promise.resolve());
 window.AMANPullToRefresh.register("account", () => loadSession());
}

/* يحدد الجلسة الحالية؛ لا ينتظر القوائم (تعرض حالة التحميل بنفسها). يُرجع نتيجة الخدمة. */
async function loadSession() {
 const result = await svc().getSession();
 if (result.success === true && result.user) {
  session = result.user;
  renderAccount();
  refreshNumbers(); refreshOperations(); refreshNotifications();
 } else {
  session = null;
  resetLists(result.success === true ? "" : serviceProblem(result));
  Object.values(lists).forEach(l => { l.state = result.success === true ? "signedout" : "error"; });
  renderAccount(); renderAll();
 }
 return result;
}

/* ---------- حالات القوائم المشتركة ---------- */
function listStateBox(name, retry, emptyTitle, emptyText) {
 const list = lists[name];
 if (list.state === "loading") return emptyBox("clock", "جارٍ التحميل…");
 if (list.state === "signedout") return emptyBox("user", "سجّل الدخول للمتابعة", "تظهر بياناتك بعد تسجيل الدخول.", { label: "تسجيل الدخول", run: () => showLogin() });
 if (list.state === "error") return emptyBox("alert", "تعذر تحميل البيانات", list.message, { label: "إعادة المحاولة", run: retry });
 if (list.state === "idle") return emptyBox("clock", "جارٍ التحضير…");
 if (!list.items.length) return emptyBox("phone", emptyTitle, emptyText);
 return null;
}

/* ---------- الأرقام ---------- */
function numberCard(item, source) {
 const b = el("button", "phone-card"); b.type = "button";
 const info = el("span", "phone-info"), phone = el("strong", "", item.phone); phone.dir = "ltr";
 const meta = [item.company, item.remaining_label || (item.ends_at ? "ينتهي " + fmt(item.ends_at) : "")].filter(Boolean).join(" · ");
 info.append(phone, el("small", "", meta));
 b.append(iconEl("phone-icon", "phone"), info, el("span", "state " + (stateClass[item.status] || "state-off"), numberStatusLabels[item.status] || "—"));
 b.addEventListener("click", () => openNumberDetails(item, source));
 return b;
}
function renderHomeNumbers() {
 const host = $("my-numbers"); host.replaceChildren();
 const box = listStateBox("numbers", () => refreshNumbers(), "لا توجد أرقام مرتبطة بحسابك", "تظهر أرقامك بعد اعتماد الاشتراك.");
 if (box) host.append(box); else lists.numbers.items.slice(0, 3).forEach(n => host.append(numberCard(n, "home")));
}
function renderNumbers() {
 const host = $("numbers-list"); host.replaceChildren();
 const box = listStateBox("numbers", () => refreshNumbers(), "لا توجد أرقام", "تظهر الأرقام بعد اعتماد الاشتراك. البحث لا يضيف الرقم إلى حسابك.");
 if (box) { host.append(box); updateCompanyFilter(); return; }
 const query = normalizePhone($("numbers-search").value), company = $("numbers-company-filter").value, status = $("numbers-status-filter").value;
 const filtered = lists.numbers.items.filter(i => (!query || normalizePhone(i.phone).includes(query)) && (!company || i.company_id === company) && (!status || i.status === status));
 if (!filtered.length) { host.append(emptyBox("search", "لا توجد نتائج مطابقة", "عدّل البحث أو التصفية.")); updateCompanyFilter(); return; }
 filtered.forEach(n => host.append(numberCard(n, "numbers")));
 updateCompanyFilter();
}
function updateCompanyFilter() {
 const select = $("numbers-company-filter"), current = select.value;
 const companies = [...new Map(lists.numbers.items.filter(n => n.company_id && n.company).map(n => [n.company_id, n.company])).entries()];
 select.replaceChildren(new Option("كل الشركات", ""));
 companies.forEach(([id, name]) => select.add(new Option(name, id)));
 if (companies.some(([id]) => id === current)) select.value = current;
}
["numbers-search", "numbers-company-filter", "numbers-status-filter"].forEach(id => $(id).addEventListener("input", renderNumbers));
$("clear-numbers-search").addEventListener("click", () => { $("numbers-search").value = ""; renderNumbers(); $("numbers-search").focus(); });

/* ---------- تفاصيل الرقم: النماذج الخمسة وفق مصفوفة الإجراءات (مرجع العميل 6) ---------- */
function openNumberDetails(number, source = "numbers") {
 if (!number || !number.phone) return false;
 lastNumber = number; lastNumberSource = source; previousScreen = source;
 const status = number.status;
 $("sheet-title").textContent = "تفاصيل الرقم";
 $("sheet-phone").textContent = number.phone;
 const badge = numberSheet.querySelector(".state");
 badge.textContent = numberStatusLabels[status] || "غير متاح";
 badge.className = "state " + (stateClass[status] || "state-off");
 const rows = [["شركة الاتصالات", number.company]];
 if (status === "protected") rows.push(["باقة الحماية", number.package_name], ["مدة الحماية", number.duration_days ? number.duration_days + " يوم" : null], ["بداية الحماية", fmt(number.starts_at)], ["نهاية الحماية", fmt(number.ends_at)], ["المدة المتبقية", number.remaining_label]);
 if (status === "inactive" || status === "confiscated") rows.push(["الباقة السابقة", number.package_name], ["بداية الفترة السابقة", has(number.starts_at) ? fmt(number.starts_at) : null], ["تاريخ الانتهاء", has(number.ends_at) ? fmt(number.ends_at) : null]);
 if (status === "inactive") rows.push(["آخر يوم للتنشيط", has(number.last_activation_date) ? fmt(number.last_activation_date) : null]);
 const extra = $("sheet-details-extra"); extra.replaceChildren();
 rows.filter(([, v]) => has(v) && v !== "—").forEach(([l, v]) => extra.append(detailBlock(l, v)));
 const notes = {
  not_subscribed: "لا توجد حماية لهذا الرقم حاليًا.",
  protected: "الرقم محمي في حسابك.",
  other_protected: "هذا الرقم محمي لدى عميل آخر. لا يمكنك الاشتراك فيه أو الاطلاع على بياناته.",
  inactive: "انتهت الحماية السابقة؛ يمكن التنشيط خلال المهلة.",
  confiscated: "انتهت مهلة التنشيط؛ لا يمكن تنشيط الرقم."
 };
 const privacy = $("sheet-privacy-note"); privacy.hidden = false; privacy.textContent = notes[status] || ""; privacy.hidden = !notes[status];
 const actions = $("sheet-actions"); actions.replaceChildren();
 const add = (label, run, cls = "btn btn-block") => { const b = el("button", cls, label); b.type = "button"; b.addEventListener("click", run); actions.append(b); };
 if (status === "not_subscribed") add(operationLabels.activation, () => openProtection(number, "activation"));
 if (status === "protected") { add(operationLabels.extension, () => openProtection(number, "extension")); add("التنبيهات", () => openNumberAlerts(number), "btn btn-outline btn-block"); }
 if (status === "inactive") { add(operationLabels.reactivation, () => openProtection(number, "reactivation")); add("التنبيهات", () => openNumberAlerts(number), "btn btn-outline btn-block"); }
 if (status === "other_protected") add("تقديم بلاغ", () => openReport(number));
 numberSheet.hidden = false;
 return true;
}

/* ---------- البحث (C-01) ---------- */
$("phone-search").addEventListener("input", event => {
 event.target.value = normalizeDigits(event.target.value).replace(/[^0-9]/g, "");
 $("search-message").textContent = "";
});
$("search-form").addEventListener("submit", async event => {
 event.preventDefault();
 const input = $("phone-search"), message = $("search-message"), submit = event.currentTarget.querySelector('button[type="submit"]');
 const phone = normalizePhone(input.value);
 if (!phone) { setMessage(message, "أدخل رقم الهاتف بصيغته المحلية."); input.focus(); return; }
 if (phone.length < 7 || phone.length > 15) { setMessage(message, "تحقق من طول الرقم المدخل."); input.focus(); return; }
 if (!runtime().isConfigured()) { setMessage(message, runtime().notConfiguredMessage); return; }
 if (!session) { showLogin("سجّل الدخول للبحث عن حالة الرقم."); return; }
 const token = ++searchToken;
 submit.disabled = true; setMessage(message, "جارٍ التحقق من الرقم…", "info");
 const result = await svc().lookupNumber({ phone });
 submit.disabled = false;
 if (token !== searchToken || !session) return;
 if (result.success === true && result.number) { message.textContent = ""; message.className = ""; openNumberDetails(result.number, "home"); return; }
 setMessage(message, serviceProblem(result));
});

/* ---------- العمليات (C-04/C-05) ---------- */
function renderOperations() {
 const host = $("operations-list"); host.replaceChildren();
 const box = listStateBox("operations", () => refreshOperations(), "لا توجد عمليات", "تظهر طلباتك بعد إرسالها. تبدأ الحماية بعد اعتماد الاشتراك.");
 if (box) { host.append(box); return; }
 const query = normalizeDigits($("operations-search").value).trim(), status = $("operations-status-filter").value;
 const filtered = lists.operations.items.filter(i => (!query || normalizeDigits(i.phone).includes(query) || String(i.request_number || i.id || "").includes(query)) && (!status || i.status === status));
 if (!filtered.length) { host.append(emptyBox("search", "لا توجد نتائج مطابقة", "لا توجد عملية تطابق البحث أو الحالة.")); return; }
 filtered.forEach(item => {
  const b = el("button", "operation-card"); b.type = "button";
  const main = el("span", "operation-main"), phone = el("small", "", item.phone); phone.dir = "ltr";
  main.append(el("strong", "", operationLabels[item.type] || "عملية حماية"), phone, el("small", "", fmt(item.created_at)));
  const side = el("span", "operation-side");
  side.append(el("b", "state " + (item.status === "approved" ? "state-active" : item.status === "rejected" ? "state-expired" : "state-wait"), requestStatusLabels[item.status] || "—"), el("strong", "", has(item.price_yer) ? Number(item.price_yer).toLocaleString("ar") + " ر.ي" : ""));
  b.append(main, side);
  b.addEventListener("click", () => openOperationDetails(item));
  host.append(b);
 });
}
$("operations-search").addEventListener("input", renderOperations);
$("operations-status-filter").addEventListener("change", renderOperations);

function openOperationDetails(item) {
 if (!item) return false;
 const rows = [["رقم الطلب", item.request_number || item.id], ["نوع العملية", operationLabels[item.type]], ["رقم الهاتف", item.phone, "ltr"], ["شركة الاتصالات", item.company], ["الباقة", item.package_name], ["المدة", item.duration_days ? item.duration_days + " يوم" : null], ["السعر", has(item.price_yer) ? Number(item.price_yer).toLocaleString("ar") + " ر.ي" : null], ["وسيلة الدفع", item.payment_method], ["مرجع الدفع", item.payment_reference, "ltr"], ["تاريخ الطلب", fmt(item.created_at)], ["حالة الطلب", requestStatusLabels[item.status]]];
 if (item.status === "rejected") rows.push(["سبب الرفض", item.rejection_reason], ["توضيح الرفض", item.rejection_note]);
 const content = $("operation-detail-content"); content.replaceChildren();
 rows.filter(([, v]) => has(v)).forEach(([l, v, d]) => content.append(detailBlock(l, v, d)));
 const actions = el("div", "detail-actions");
 [["نسخ رقم الطلب", item.request_number || item.id], ["نسخ مرجع الدفع", item.payment_reference]].filter(p => p[1]).forEach(([label, value]) => {
  const b = el("button", "btn btn-outline", label); b.type = "button";
  b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(String(value)); b.textContent = "تم النسخ"; } catch { b.textContent = "تعذر النسخ"; } });
  actions.append(b);
 });
 content.append(actions);
 navigate("operation-detail");
 return true;
}

/* ---------- الحماية (C-06) والمراجعة (C-07) والنتيجة (C-08) ---------- */
function allowedOperation(number) { return ({ not_subscribed: "activation", protected: "extension", inactive: "reactivation" })[number.status] || null; }
async function openProtection(number, type) {
 if (!number || allowedOperation(number) !== type) return false;
 if (!session) { showLogin(); return false; }
 protectionContext = { phone: number.phone, company: number.company, company_id: number.company_id, type, number };
 $("protection-phone").textContent = number.phone;
 $("protection-company").textContent = number.company || "";
 $("protection-type").textContent = operationLabels[type];
 $("payment-reference").value = ""; $("protection-message").textContent = "";
 populateCatalog({ packages: [], payment_methods: [] });
 $("package-summary").textContent = "جارٍ تحميل الباقات المعتمدة…";
 $("protection-continue").disabled = true;
 navigate("protection");
 const result = await svc().getProtectionCatalog({ company_id: number.company_id, operation_type: type });
 if (!protectionContext || protectionContext.phone !== number.phone) return true;
 if (result.success === true) { protectionCatalog = { packages: result.packages || [], payment_methods: result.payment_methods || [] }; populateCatalog(protectionCatalog); $("protection-continue").disabled = false; }
 else setMessage($("protection-message"), serviceProblem(result));
 return true;
}
function populateCatalog(catalog) {
 protectionCatalog = catalog;
 const ps = $("protection-package"), ms = $("protection-payment");
 const packages = catalog.packages.filter(p => p && p.id && p.name && p.company_id === protectionContext?.company_id && p.operation_type === protectionContext?.type);
 ps.replaceChildren(new Option("اختر الباقة المتاحة", ""));
 packages.forEach(p => ps.add(new Option(p.name + " — " + p.duration_days + " يوم — " + Number(p.price_yer).toLocaleString("ar") + " ر.ي", p.id)));
 ms.replaceChildren(new Option("اختر وسيلة الدفع", ""));
 catalog.payment_methods.forEach(p => ms.add(new Option(p.name, p.id)));
 $("package-summary").textContent = packages.length ? "اختر الباقة المتاحة." : "لا توجد باقات متاحة حاليًا.";
 $("payment-instructions").textContent = "تعليمات الدفع بعد اختيار الوسيلة.";
}
$("protection-package").addEventListener("change", event => {
 const p = protectionCatalog.packages.find(x => x.id === event.target.value);
 $("package-summary").textContent = p ? "المدة: " + p.duration_days + " يوم — السعر: " + Number(p.price_yer).toLocaleString("ar") + " ر.ي" : "اختر الباقة المعتمدة.";
});
$("protection-payment").addEventListener("change", event => {
 const m = protectionCatalog.payment_methods.find(x => x.id === event.target.value);
 $("payment-instructions").textContent = m ? ((m.account_number ? "رقم الحساب: " + m.account_number + "\n" : "") + (m.instructions || "لا توجد تعليمات إضافية.")) : "تعليمات الدفع المعتمدة ستظهر بعد اختيار الوسيلة.";
 const ref = $("payment-reference"); ref.required = Boolean(m ? m.reference_required !== false : true);
 ref.placeholder = ref.required ? "أدخل مرجع عملية الدفع" : "مرجع الدفع غير مطلوب لهذه الوسيلة.";
});
$("protection-form").addEventListener("submit", event => {
 event.preventDefault();
 const msg = $("protection-message");
 const p = protectionCatalog.packages.find(x => x.id === $("protection-package").value);
 const m = protectionCatalog.payment_methods.find(x => x.id === $("protection-payment").value);
 const ref = $("payment-reference").value.trim();
 if (!p || !m) { setMessage(msg, "اختر الباقة ووسيلة الدفع."); return; }
 if (m.reference_required !== false && !ref) { setMessage(msg, "أدخل مرجع الدفع لهذه الوسيلة."); return; }
 if (ref && m.reference_pattern) { try { if (!new RegExp(m.reference_pattern).test(ref)) { setMessage(msg, "صيغة مرجع الدفع غير مطابقة."); return; } } catch { setMessage(msg, "تعذر التحقق من صيغة مرجع الدفع؛ راجع إعدادات وسيلة الدفع."); return; } }
 protectionContext = { ...protectionContext, package: p, paymentMethod: m, paymentReference: ref };
 const rows = [["الرقم", protectionContext.phone], ["الشركة", protectionContext.company], ["نوع العملية", operationLabels[protectionContext.type]], ["الباقة", p.name], ["المدة", p.duration_days + " يوم"], ["السعر", Number(p.price_yer).toLocaleString("ar") + " ر.ي"], ["وسيلة الدفع", m.name]];
 if (ref) rows.push(["مرجع الدفع", ref]);
 const host = $("review-details"); host.replaceChildren();
 rows.forEach(([a, b]) => { const r = el("div", "review-row"); r.append(el("span", "", a), el("strong", "", b)); host.append(r); });
 $("review-message").textContent = "";
 navigate("review");
});
$("confirm-protection").addEventListener("click", async () => {
 if (protectionSubmitting || !protectionContext || !protectionContext.package) return;
 const button = $("confirm-protection"), c = protectionContext;
 protectionSubmitting = true; button.disabled = true; button.textContent = "جارٍ الإرسال…";
 const result = await svc().submitProtectionRequest({ phone: c.phone, company_id: c.company_id, operation_type: c.type, package_id: c.package.id, payment_method_id: c.paymentMethod.id, payment_reference: c.paymentReference });
 protectionSubmitting = false; button.disabled = false; button.textContent = "تأكيد وإرسال الطلب";
 if (!session) return;
 const confirmed = result.success === true && Boolean(result.request_id);
 const content = $("result-content"); content.replaceChildren();
 $("result-title").textContent = confirmed ? "تم إرسال الطلب" : "تعذر تأكيد إرسال الطلب";
 $("result-description").textContent = confirmed ? "طلبك قيد المراجعة. تبدأ الحماية بعد اعتماد الإدارة." : "لم يتأكد إرسال الطلب. راجع العمليات قبل إعادة المحاولة.";
 if (confirmed) {
  const box = el("div", "result-success"); box.append(el("strong", "", "طلبك قيد المراجعة"), el("div", "detail-label", "رقم الطلب"));
  const num = el("div", "detail-value", result.request_number || result.request_id); num.dir = "ltr"; box.append(num); content.append(box);
  refreshOperations();
 } else content.append(el("div", "alert-note", serviceProblem(result)));
 $("result-retry").hidden = confirmed;
 navigate("result");
});
$("protection-back").addEventListener("click", returnToNumber);
$("review-back").addEventListener("click", () => navigate("protection"));
$("result-to-operations").addEventListener("click", () => navigate("operations"));
$("result-to-number").addEventListener("click", returnToNumber);
$("result-retry").addEventListener("click", () => navigate("review"));

/* ---------- تنبيهات الرقم (C-11): قراءة التنبيهات المرتبطة بهذا الرقم فقط ---------- */
async function openNumberAlerts(number) {
 if (!number || !number.phone) return false;
 const token = ++alertsToken, msg = $("number-alerts-message"), host = $("number-alerts-list");
 $("alerts-phone").textContent = number.phone; $("alerts-company").textContent = number.company || "";
 $("alerts-status").textContent = numberStatusLabels[number.status] || "";
 host.replaceChildren(); setMessage(msg, "جارٍ تحميل التنبيهات…", "info");
 navigate("number-alerts");
 const result = await svc().listNumberAlerts({ phone: number.phone });
 if (token !== alertsToken || !session) return true;
 if (result.success !== true) { setMessage(msg, serviceProblem(result)); const retry = el("button", "btn btn-outline", "إعادة المحاولة"); retry.type = "button"; retry.addEventListener("click", () => openNumberAlerts(number)); host.append(retry); return true; }
 msg.textContent = ""; msg.className = "";
 const items = result.items || [];
 if (!items.length) { host.append(emptyBox("bell", "لا توجد تنبيهات لهذا الرقم")); return true; }
 items.forEach(a => { const card = el("article", "surface notification-card"), head = el("div", "notification-head"); head.append(el("strong", "", a.title), el("span", "state " + (a.read_at ? "state-off" : "state-wait"), a.read_at ? "مقروء" : "جديد")); card.append(head, el("p", "", a.body), el("small", "", fmt(a.created_at))); host.append(card); });
 return true;
}

/* ---------- تقديم بلاغ (C-12): من «محمي لدى عميل آخر» فقط ---------- */
function openReport(number) {
 if (!number || number.status !== "other_protected") return false;
 reportNumber = number;
 $("report-phone-display").textContent = number.phone; $("report-company-display").textContent = number.company || "";
 $("report-form").reset(); $("report-text-wrap").hidden = true; setMessage($("report-message"), "", "info");
 navigate("report");
 return true;
}
document.querySelectorAll('input[name="reason_code"]').forEach(r => r.addEventListener("change", () => { $("report-text-wrap").hidden = $("report-form").elements.reason_code.value !== "other"; }));
$("report-form").addEventListener("submit", async event => {
 event.preventDefault();
 if (reportSubmitting || !reportNumber) return;
 const msg = $("report-message"), button = $("report-submit");
 const reason = $("report-form").elements.reason_code.value, text = $("report-description").value.trim();
 if (!reason) { setMessage(msg, "اختر سبب البلاغ."); return; }
 if (reason === "other" && !text) { setMessage(msg, "أدخل توضيح البلاغ لسبب «سبب آخر»."); return; }
 reportSubmitting = true; button.disabled = true; button.textContent = "جارٍ الإرسال…";
 const result = await svc().submitReport({ phone: reportNumber.phone, reason_code: reason, reason_text: reason === "other" ? text : "" });
 reportSubmitting = false; button.disabled = false; button.textContent = "إرسال البلاغ";
 if (!session) return;
 if (result.success === true && result.report_id) { setMessage(msg, "تم استلام البلاغ. رقم البلاغ: " + result.report_id, "success"); $("report-form").reset(); $("report-text-wrap").hidden = true; }
 else setMessage(msg, "لم يتم تأكيد استلام البلاغ. " + serviceProblem(result));
});

/* ---------- المصادقة (D3): شاشتا تسجيل الدخول وإنشاء الحساب ---------- */
$("login-to-signup").addEventListener("click", () => { setMessage($("signup-message"), "", "info"); navigate("signup"); });
$("signup-to-login").addEventListener("click", () => { setMessage($("login-message"), "", "info"); navigate("login"); });
/* بعد نجاح الدخول أو الإنشاء: نؤكد الجلسة من الخدمة ثم نفتح الرئيسية؛ إن لم تتأكد نبقى على الشاشة الحالية برسالة. */
async function afterAuth(messageNode) {
 ["login-password", "signup-password", "signup-confirm"].forEach(id => { $(id).value = ""; });
 await loadSession();
 if (!session) { setMessage(messageNode, "تعذر تأكيد الجلسة بعد الدخول. حاول مرة أخرى."); return; }
 messageNode.textContent = "";
 navigate("home");
}
$("login-form").addEventListener("submit", async event => {
 event.preventDefault();
 const msg = $("login-message"), button = $("login-submit");
 const email = $("login-email").value.trim(), password = $("login-password").value;
 button.disabled = true; setMessage(msg, "جارٍ التحقق…", "info");
 const result = await svc().signIn({ email, password });
 button.disabled = false;
 if (result.success !== true) { setMessage(msg, serviceProblem(result)); return; }
 await afterAuth(msg);
});
$("signup-form").addEventListener("submit", async event => {
 event.preventDefault();
 const msg = $("signup-message"), button = $("signup-submit");
 const email = $("signup-email").value.trim(), password = $("signup-password").value, confirm = $("signup-confirm").value;
 if (password !== confirm) { setMessage(msg, "كلمتا المرور غير متطابقتين."); return; }
 button.disabled = true; setMessage(msg, "جارٍ إنشاء الحساب…", "info");
 const result = await svc().signUp({ email, password });
 button.disabled = false;
 if (result.success !== true) { setMessage(msg, serviceProblem(result)); return; }
 await afterAuth(msg);
});

/* ---------- الحساب (C-09) ---------- */
function renderAccount() {
 $("account-signed-in").hidden = !session;
 if (!session) return;
 $("account-email").textContent = session.email || "";
 $("account-type").textContent = accountTypeLabels[session.account_type] || "مستخدم";
 if (document.activeElement !== $("profile-name")) $("profile-name").value = session.full_name || "";
}
$("profile-form").addEventListener("submit", async event => {
 event.preventDefault();
 const msg = $("profile-message"), result = await svc().updateProfile({ full_name: $("profile-name").value.trim() });
 if (!session) return;
 if (result.success === true) { setMessage(msg, "تم تحديث البيانات.", "success"); await loadSession(); } else setMessage(msg, serviceProblem(result));
});
$("password-form").addEventListener("submit", async event => {
 event.preventDefault();
 const msg = $("password-message"), form = event.currentTarget;
 const current_password = $("current-password").value, new_password = $("new-password").value;
 if (new_password.length < 4) { setMessage(msg, "كلمة المرور الجديدة يجب ألا تقل عن 4 أحرف."); return; }
 const result = await svc().changePassword({ current_password, new_password });
 if (!session) return;
 if (result.success === true) { form.reset(); setMessage(msg, "تم تحديث كلمة المرور.", "success"); } else setMessage(msg, serviceProblem(result));
});
$("account-signout").addEventListener("click", () => { $("signout-confirm").hidden = false; $("account-signout").hidden = true; });
$("signout-confirm-no").addEventListener("click", () => { $("signout-confirm").hidden = true; $("account-signout").hidden = false; });
$("signout-confirm-yes").addEventListener("click", async () => {
 const msg = $("signout-message"), result = await svc().signOut();
 $("signout-confirm").hidden = true; $("account-signout").hidden = false;
 if (result.success === true || result.code === "auth_required") { msg.textContent = ""; await loadSession(); showLogin("تم تسجيل الخروج.", "success"); }
 else setMessage(msg, serviceProblem(result));
});

/* ---------- الإشعارات (C-10) ---------- */
function renderNotifications() {
 const host = $("notifications-list"), filter = $("notification-filter").value;
 host.replaceChildren();
 const box = listStateBox("notifications", () => refreshNotifications(), "لا توجد إشعارات", "تظهر إشعاراتك هنا.");
 $("notifications-dot").hidden = !lists.notifications.items.some(n => !n.read_at);
 if (box) { host.append(box); return; }
 const items = lists.notifications.items.filter(n => filter === "all" || (filter === "unread" && !n.read_at) || (filter === "read" && n.read_at));
 if (!items.length) { host.append(emptyBox("bell", "لا توجد إشعارات في هذا التصنيف")); return; }
 items.forEach(item => {
  const card = el("article", "surface notification-card"), head = el("div", "notification-head");
  head.append(el("strong", "", item.title || "إشعار من أمان"), el("span", "state " + (item.read_at ? "state-off" : "state-wait"), item.read_at ? "مقروء" : "جديد"));
  card.append(head, el("p", "", item.body || ""), el("small", "", fmt(item.created_at)));
  if (!item.read_at) { const b = el("button", "quiet-link", "تحديد كمقروء"); b.type = "button"; b.addEventListener("click", () => markRead(item.id)); card.append(b); }
  host.append(card);
 });
}
async function markRead(id) {
 const result = await svc().markNotificationRead({ notification_id: id });
 if (!session) return;
 if (result.success === true) await refreshNotifications(true); else { const note = el("p", "notice-error", serviceProblem(result)); $("notifications-list").prepend(note); }
}
$("notification-filter").addEventListener("change", renderNotifications);


function renderAll() { renderHomeNumbers(); renderNumbers(); renderOperations(); renderNotifications(); }

/* ---------- الإقلاع: لا شاشة داخلية قبل تأكيد الجلسة ---------- */
renderAll();
navigate("boot", { scroll: false, remember: false });
(async () => {
 const result = await loadSession();
 if (session) { navigate("home", { scroll: false, remember: false }); return; }
 /* بلا جلسة: تسجيل الدخول. فشل غير «الخدمة غير مهيأة» (مثل تعذر الاتصال) يُعرض برسالته. */
 const problem = result.success !== true && result.code !== "service_not_configured" ? serviceProblem(result) : "";
 clearPrivateState();
 setMessage($("login-message"), problem, "error");
 navigate("login", { scroll: false, remember: false });
})();
})();
