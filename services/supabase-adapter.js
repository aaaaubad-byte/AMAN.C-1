/*
 * AMAN.C — محوّل Supabase (ينفّذ عقود services/CONTRACTS.md فوق Supabase Auth ودوال RPC الموجودة).
 *
 * - يستخدم المفتاح العام فقط (services/supabase-config.js). لا أسرار هنا.
 * - عميلان منفصلان (عميل/إدارة) بمفتاحَي تخزين مختلفين لأن الصفحتين على النطاق نفسه.
 *   جلسة العميل في localStorage. جلسة المدير في sessionStorage (تنتهي بإغلاق التبويب)،
 *   إلا إذا اختار المدير «تذكرني» عند الدخول فتُحفظ في localStorage على ذلك الجهاز حتى يسجّل الخروج.
 * - كل التحقق من الصلاحيات والعزل يتم داخل قاعدة البيانات (SECURITY DEFINER + aman.adm()/aman.cust()).
 * - لا إعادة محاولة تلقائية للعمليات المغيِّرة عند انقطاع الشبكة (تفاديًا للتكرار)،
 *   والاستثناء الوحيد محاولة واحدة بعد تجديد JWT منتهٍ لأن الطلب لم يُنفَّذ أصلًا.
 * - لا يسجّل نفسه إن وُجد علم المحاكاة المحلية (المعاينة التجريبية المنشورة تستخدم المحاكاة).
 */
(() => {
"use strict";
const sim = window.__AMAN_SIMULATION__;
if (sim && sim.enabled === true) return;
if (!window.AMANServices) { console.error("AMAN supabase: services/runtime.js must load first."); return; }

const TIMEOUT_MS = 20000;
const MSG = {
 unreachable: "تعذر الاتصال بالخدمة. تحقق من الإنترنت ثم أعد المحاولة.",
 unconfirmed: "تعذر الاتصال بالخدمة. لم يتم تأكيد نتيجة العملية؛ تحقق من حالتها قبل إعادة المحاولة.",
 session: "انتهت الجلسة أو لا توجد جلسة. سجّل الدخول.",
 unexpected: "وصلت استجابة غير متوقعة من الخادم.",
 unexpectedMut: "وصلت استجابة غير متوقعة من الخادم. لم يتم تأكيد نتيجة العملية.",
 failed: "تعذر تنفيذ العملية. حاول لاحقًا.",
 rate: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
 config: "إعدادات الاتصال بقاعدة البيانات غير مكتملة.",
 library: "تعذر تحميل مكتبة الاتصال. تحقق من الإنترنت ثم أعد تحميل الصفحة.",
 login: "تعذر تسجيل الدخول. تحقق من البيانات.",
 adminLogin: "تعذر تسجيل الدخول أو أن الحساب غير مخوّل للإدارة."
};

class Fault extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => ({ success: false, code, message });
const AUTH = () => fail("auth_required", MSG.session);

/* ---------- العملاء ---------- */
const clients = {};
const ADMIN_AUTH_KEY = "aman_c_admin_auth";
const ADMIN_REMEMBER_KEY = "aman_c_admin_remember";
function webStore(kind) {
 try { const s = window[kind]; if (!s) return undefined; s.setItem("__aman_t", "1"); s.removeItem("__aman_t"); return s; } catch { return undefined; }
}
/* تخزين جلسة المدير: sessionStorage افتراضيًا، وlocalStorage فقط عند وجود علم «تذكرني» (يُكتب عند الدخول). */
function adminStorage() {
 const ls = webStore("localStorage"), ss = webStore("sessionStorage");
 if (!ss) return undefined;
 const remembered = () => { try { return !!ls && ls.getItem(ADMIN_REMEMBER_KEY) === "1"; } catch { return false; } };
 const active = () => (remembered() ? ls : ss);
 return {
  getItem: k => active().getItem(k),
  setItem: (k, v) => active().setItem(k, v),
  removeItem: k => { try { ss.removeItem(k); } catch { /* تجاهل */ } try { if (ls) ls.removeItem(k); } catch { /* تجاهل */ } }
 };
}
function setAdminRemember(on) {
 const ls = webStore("localStorage");
 if (!ls) return;
 try {
  if (on) ls.setItem(ADMIN_REMEMBER_KEY, "1");
  else { ls.removeItem(ADMIN_REMEMBER_KEY); ls.removeItem(ADMIN_AUTH_KEY); }
 } catch { /* تجاهل */ }
}
function getClient(scope) {
 if (clients[scope]) return clients[scope];
 const lib = window.supabase;
 if (!lib || typeof lib.createClient !== "function") throw new Fault("service_unreachable", MSG.library);
 const cfg = window.AMAN_SUPABASE_CONFIG;
 if (!cfg || !cfg.url || !cfg.publishableKey) throw new Fault("service_not_configured", MSG.config);
 const auth = { storageKey: "aman_c_" + scope + "_auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false };
 if (scope === "admin") { const st = adminStorage(); if (st) auth.storage = st; }
 clients[scope] = lib.createClient(cfg.url, cfg.publishableKey, { auth });
 return clients[scope];
}

/* ---------- تصنيف الأخطاء ---------- */
const NET_RE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|econn|enotfound|timeout|timed out|abort/i;
function isNetwork(err, status) {
 if (!err) return false;
 const msg = String(err.message || ""), code = String(err.code || "");
 if (err.name === "AbortError" || err.name === "AuthRetryableFetchError") return true;
 if (NET_RE.test(msg)) return true;
 return (Number(status) === 0 || status === undefined) && !code && !err.status && msg.length > 0 && /typeerror/i.test(msg);
}
function isAuthErr(err, status) {
 const s = Number(status || err.status) || 0, code = String(err.code || ""), msg = String(err.message || "");
 return s === 401 || code === "PGRST301" || code === "PGRST303" || code === "42501" || /jwt|not authenticated|permission denied/i.test(msg);
}
function isRate(err, status) {
 const s = Number(status || err.status) || 0, code = String(err.code || "");
 return s === 429 || /rate_limit/i.test(code);
}
function failureFrom(err, status, mutating) {
 if (isNetwork(err, status)) return fail("service_unreachable", mutating ? MSG.unconfirmed : MSG.unreachable);
 if (isRate(err, status)) return fail("rate_limited", MSG.rate);
 if (isAuthErr(err, status)) return AUTH();
 return fail("request_failed", MSG.failed);
}

/* ---------- الجلسة ---------- */
async function sessionOf(sb) {
 let r;
 try { r = await sb.auth.getSession(); } catch (e) { throw new Fault("service_unreachable", MSG.unreachable); }
 if (r && r.error) { if (isNetwork(r.error)) throw new Fault("service_unreachable", MSG.unreachable); return null; }
 return (r && r.data && r.data.session) || null;
}
async function localSignOut(sb) { try { await sb.auth.signOut({ scope: "local" }); } catch { /* تجاهل */ } }

/* ---------- استدعاء RPC ---------- */
async function invoke(sb, fn, payload) {
 const ctl = typeof AbortController === "function" ? new AbortController() : null;
 const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
 try {
  let q = sb.rpc(fn, { p: payload && typeof payload === "object" ? payload : {} });
  if (ctl && typeof q.abortSignal === "function") q = q.abortSignal(ctl.signal);
  return await q;
 } catch (e) {
  return { data: null, error: { name: e && e.name, message: String((e && e.message) || e) }, status: 0 };
 } finally { if (timer) clearTimeout(timer); }
}
async function rpc(scope, fn, payload, mutating) {
 const sb = getClient(scope);
 if (!(await sessionOf(sb))) return AUTH();
 let res = await invoke(sb, fn, payload);
 if (res.error && isAuthErr(res.error, res.status) && !isNetwork(res.error, res.status)) {
  let ref = null;
  try { ref = await sb.auth.refreshSession(); } catch { /* تجاهل */ }
  if (ref && ref.data && ref.data.session) res = await invoke(sb, fn, payload);
 }
 if (res.error) {
  const f = failureFrom(res.error, res.status, mutating);
  if (f.code === "auth_required") await localSignOut(sb);
  return f;
 }
 const d = res.data;
 if (!d || typeof d !== "object" || Array.isArray(d) || typeof d.success !== "boolean") return fail("unexpected_response", mutating ? MSG.unexpectedMut : MSG.unexpected);
 if (d.success === false && d.code === "auth_required") await localSignOut(sb);
 return d;
}

/* يحوّل الاستثناءات الداخلية إلى نتائج عربية بدل رسالة عامة. */
const guard = fn => async payload => {
 try { return await fn(payload || {}); }
 catch (e) { return e instanceof Fault ? fail(e.code, e.message) : fail("service_unreachable", MSG.unreachable); }
};

/* ---------- المصادقة: العميل ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const authFailure = (err, fallbackMsg) => {
 const code = String(err.code || ""), s = Number(err.status) || 0;
 if (isNetwork(err, s)) return fail("service_unreachable", MSG.unreachable);
 if (isRate(err, s)) return fail("rate_limited", MSG.rate);
 if (code === "email_not_confirmed") return fail("email_not_confirmed", "لم يتم تأكيد البريد الإلكتروني بعد. افتح رابط التأكيد المرسل إليك.");
 return fail("invalid_credentials", fallbackMsg);
};
async function customerFromSession(sb) {
 const r = await rpc("client", "client_get_session", {});
 return r;
}

const client = {
 getSession: guard(async () => {
  const sb = getClient("client");
  if (!(await sessionOf(sb))) return { success: true, user: null };
  const r = await customerFromSession(sb);
  if (r.success && !r.user) await localSignOut(sb);
  return r;
 }),
 signIn: guard(async p => {
  const sb = getClient("client");
  const email = String(p.email || "").trim(), password = String(p.password || "");
  if (!email || !password) return fail("invalid_credentials", MSG.login);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return authFailure(error, MSG.login);
  const r = await customerFromSession(sb);
  if (!r.success) { await localSignOut(sb); return r; }
  if (!r.user) { await localSignOut(sb); return fail("invalid_credentials", MSG.login); }
  return { success: true, user: r.user };
 }),
 signUp: guard(async p => {
  const sb = getClient("client");
  const email = String(p.email || "").trim(), password = String(p.password || "");
  if (!EMAIL_RE.test(email)) return fail("invalid_email", "البريد الإلكتروني غير صالح.");
  if (!password) return fail("weak_password", "أدخل كلمة مرور.");
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) {
   const code = String(error.code || ""), s = Number(error.status) || 0;
   if (isNetwork(error, s)) return fail("service_unreachable", MSG.unreachable);
   if (isRate(error, s)) return fail("rate_limited", MSG.rate);
   if (code === "user_already_exists" || code === "email_exists") return fail("email_taken", "تعذر إنشاء الحساب بهذا البريد.");
   if (code === "weak_password") return fail("weak_password", "كلمة المرور ضعيفة. استخدم كلمة مرور أطول وأصعب تخمينًا.");
   if (code === "email_address_invalid") return fail("invalid_email", "البريد الإلكتروني غير صالح.");
   if (code === "signup_disabled") return fail("signup_disabled", "إنشاء الحسابات غير متاح حاليًا.");
   return fail("request_failed", "تعذر إنشاء الحساب. حاول لاحقًا.");
  }
  if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return fail("email_taken", "تعذر إنشاء الحساب بهذا البريد.");
  if (!data || !data.session) return fail("email_confirmation_required", "تم إنشاء الحساب. افتح رابط التأكيد المرسل إلى بريدك ثم سجّل الدخول.");
  const r = await customerFromSession(sb);
  if (!r.success) return r;
  if (!r.user) { await localSignOut(sb); return fail("request_failed", "تعذر إنشاء الحساب. حاول لاحقًا."); }
  return { success: true, user: r.user };
 }),
 signOut: guard(async () => {
  const sb = getClient("client");
  if (!(await sessionOf(sb))) return AUTH();
  await localSignOut(sb);
  return { success: true };
 }),
 changePassword: guard(async p => {
  const sb = getClient("client");
  const s = await sessionOf(sb);
  if (!s) return AUTH();
  const cur = String(p.current_password || ""), nw = String(p.new_password || "");
  if (!cur) return fail("wrong_password", "كلمة المرور الحالية غير صحيحة.");
  const check = await sb.auth.signInWithPassword({ email: s.user.email, password: cur });
  if (check.error) return isNetwork(check.error, check.error.status) ? fail("service_unreachable", MSG.unreachable) : fail("wrong_password", "كلمة المرور الحالية غير صحيحة.");
  const { error } = await sb.auth.updateUser({ password: nw });
  if (error) {
   const code = String(error.code || "");
   if (isNetwork(error, error.status)) return fail("service_unreachable", MSG.unconfirmed);
   if (code === "weak_password") return fail("weak_password", "كلمة المرور الجديدة ضعيفة. استخدم كلمة مرور أطول.");
   if (code === "same_password") return fail("weak_password", "كلمة المرور الجديدة يجب أن تختلف عن الحالية.");
   return fail("request_failed", MSG.failed);
  }
  return { success: true };
 })
};

const CLIENT_RPC = {
 lookupNumber: ["client_lookup_number", false], listMyNumbers: ["client_list_my_numbers", false],
 listMyOperations: ["client_list_my_operations", false], getProtectionCatalog: ["client_get_catalog", false],
 submitProtectionRequest: ["client_submit_request", true], updateProfile: ["client_update_profile", true],
 getNotifications: ["client_get_notifications", false], markNotificationRead: ["client_mark_notification_read", true],
 listNumberAlerts: ["client_list_number_alerts", false], submitReport: ["client_submit_report", true]
};
Object.entries(CLIENT_RPC).forEach(([name, [fn, mut]]) => { client[name] = guard(p => rpc("client", fn, p, mut)); });

/* ---------- المصادقة: الإدارة ---------- */
const admin = {
 getCurrentAdmin: guard(async () => {
  const sb = getClient("admin");
  if (!(await sessionOf(sb))) return AUTH();
  return rpc("admin", "admin_get_current", {});
 }),
 signInAdmin: guard(async p => {
  const sb = getClient("admin");
  const email = String(p.email || "").trim(), password = String(p.password || "");
  if (!email || !password) return fail("invalid_credentials", MSG.adminLogin);
  /* «تذكرني»: يُحدَّد موضع حفظ الجلسة قبل الدخول (localStorage عند التفعيل وإلا sessionStorage) */
  setAdminRemember(p.remember === true);
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return authFailure(error, MSG.adminLogin);
  const r = await rpc("admin", "admin_get_current", {});
  if (!r.success || !r.admin || r.admin.is_admin !== true) {
   await localSignOut(sb);
   setAdminRemember(false);
   return r.code === "service_unreachable" ? r : fail("invalid_credentials", MSG.adminLogin);
  }
  return r;
 }),
 signOutAdmin: guard(async () => {
  const sb = getClient("admin");
  const had = await sessionOf(sb);
  await localSignOut(sb);
  setAdminRemember(false);
  return had ? { success: true } : AUTH();
 })
};

const ADMIN_RPC = {
 getDashboardSummary: ["admin_dashboard", false], listRequests: ["admin_list_requests", false], getRequestDetails: ["admin_get_request", false],
 getApprovalPreview: ["admin_approval_preview", false], getRejectReasons: ["admin_get_reject_reasons", false],
 approveRequest: ["admin_approve_request", true], rejectRequest: ["admin_reject_request", true],
 listNumbers: ["admin_list_numbers", false], getNumberDetails: ["admin_get_number", false],
 listCustomers: ["admin_list_customers", false], getCustomerDetails: ["admin_get_customer", false], updateCustomerStatus: ["admin_update_customer_status", true],
 listTasks: ["admin_list_tasks", false], getTaskDetails: ["admin_get_task", false], executeTask: ["admin_execute_task", true],
 previewTaskReschedule: ["admin_preview_reschedule", false], rescheduleTask: ["admin_reschedule_task", true],
 getRevenueReport: ["admin_revenue", false], listComplaints: ["admin_list_complaints", false], decideComplaint: ["admin_decide_complaint", true],
 listAdminNotifications: ["admin_list_notifications", false], createAdminNotification: ["admin_create_notification", true],
 listAdminAlerts: ["admin_list_alerts", false], createAdminAlert: ["admin_create_alert", true],
 listCompanies: ["admin_list_companies", false], previewCompanySettings: ["admin_preview_company", false], saveCompanySettings: ["admin_save_company", true],
 listPackages: ["admin_list_packages", false], savePackage: ["admin_save_package", true],
 listPaymentMethods: ["admin_list_payment_methods", false], savePaymentMethod: ["admin_save_payment_method", true],
 getAppContent: ["admin_get_content", false], saveAppContent: ["admin_save_content", true], listAuditLog: ["admin_list_audit", false]
};
Object.entries(ADMIN_RPC).forEach(([name, [fn, mut]]) => { admin[name] = guard(p => rpc("admin", fn, p, mut)); });

/* قائمة نوع العملية في الإدارة تُرسل «subscription» بينما تستخدم القاعدة «activation». */
const listRequestsBase = admin.listRequests;
admin.listRequests = guard(p => listRequestsBase(p && p.operation_type === "subscription" ? { ...p, operation_type: "activation" } : p));
/* النص الثابت: القاعدة تُرجع null إن لم توجد صفوف. */
const getContentBase = admin.getAppContent;
admin.getAppContent = guard(async p => { const r = await getContentBase(p); return r.success && !r.items ? { ...r, items: {} } : r; });

window.AMANServices.register({ name: "supabase", client, admin });
})();
