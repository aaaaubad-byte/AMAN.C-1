/*
 * AMAN.C — طبقة الخدمات الموحدة (Service Runtime)
 *
 * الواجهات (client/ و admin/) لا تتعامل مع localStorage ولا مع بيانات ثابتة ولا مع قاعدة بيانات.
 * تتعامل فقط مع:
 *    window.AMANClientServices   (عقود العميل)
 *    window.AMANAdminServices    (عقود الإدارة)
 * وكلاهما واجهة موحدة تُفوّض إلى «محوّل» (adapter) واحد مسجّل عبر AMANServices.register().
 *
 * - إذا لم يُسجَّل أي محوّل: كل عملية تُرجع { success:false, code:"service_not_configured" }
 *   وتظهر شارة «الخدمة غير مهيأة». لا تُصطنع نتيجة ناجحة ولا بيانات.
 * - محوّل المحاكاة المحلية (simulation/simulation-adapter.js) لا يسجّل نفسه إلا إذا حقن خادم
 *   المعاينة المحلية العلم window.__AMAN_SIMULATION__ والصفحة تعمل على localhost/127.0.0.1.
 * - محوّل قاعدة البيانات المستقبلي يسجّل نفسه بالطريقة نفسها وينفذ العقود نفسها (انظر services/CONTRACTS.md).
 */
(() => {
"use strict";
if (window.AMANServices) return;

const CONTRACTS = Object.freeze({
 client: Object.freeze([
  "getSession", "signIn", "signUp", "signOut",
  "lookupNumber", "listMyNumbers", "listMyOperations",
  "getProtectionCatalog", "submitProtectionRequest",
  "updateProfile", "changePassword",
  "getNotifications", "markNotificationRead",
  "listNumberAlerts", "submitReport"
 ]),
 admin: Object.freeze([
  "getCurrentAdmin", "signInAdmin", "signOutAdmin", "getDashboardSummary",
  "listRequests", "getRequestDetails", "getApprovalPreview", "getRejectReasons", "approveRequest", "rejectRequest",
  "listNumbers", "getNumberDetails",
  "listCustomers", "getCustomerDetails", "updateCustomerStatus",
  "listTasks", "getTaskDetails", "executeTask", "previewTaskReschedule", "rescheduleTask",
  "getRevenueReport",
  "listComplaints", "decideComplaint",
  "listAdminNotifications", "createAdminNotification",
  "listAdminAlerts", "createAdminAlert",
  "listCompanies", "previewCompanySettings", "saveCompanySettings",
  "listPackages", "savePackage",
  "listPaymentMethods", "savePaymentMethod",
  "getAppContent", "saveAppContent",
  "listAuditLog"
 ])
});

const NOT_CONFIGURED_MESSAGE = "الخدمة غير مهيأة: لم يُربط خادم البيانات بعد. لم تُنفَّذ أي عملية ولم تُحفظ أي بيانات.";
const FAILED_MESSAGE = "لم تُنفَّذ العملية.";
const UNREACHABLE_MESSAGE = "تعذر الاتصال بالخدمة. لم يتم تأكيد نتيجة العملية.";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];
const isLocalHost = () => { try { return LOCAL_HOSTS.includes(location.hostname); } catch { return false; } };
const simulationAllowed = () => {
 const flag = window.__AMAN_SIMULATION__;
 return !!flag && flag.enabled === true && isLocalHost();
};

let adapter = null;

function register(candidate) {
 if (adapter) throw new Error("تم تسجيل محوّل خدمات بالفعل.");
 if (!candidate || typeof candidate.name !== "string" || !candidate.name) throw new Error("المحوّل يحتاج اسمًا.");
 if (candidate.simulation === true && !simulationAllowed()) {
  throw new Error("المحاكاة غير مسموحة في هذه البيئة: تعمل فقط عبر خادم المعاينة المحلية على localhost.");
 }
 adapter = Object.freeze({
  name: candidate.name,
  simulation: candidate.simulation === true,
  client: candidate.client || {},
  admin: candidate.admin || {}
 });
}

function normalize(result) {
 if (result && typeof result === "object" && result.success === true) return result;
 const base = result && typeof result === "object" ? result : {};
 return {
  ...base,
  success: false,
  code: typeof base.code === "string" && base.code ? base.code : "request_failed",
  message: typeof base.message === "string" && base.message ? base.message : FAILED_MESSAGE
 };
}

function notConfigured(code) {
 return { success: false, code: code || "service_not_configured", message: NOT_CONFIGURED_MESSAGE };
}

function facade(scope) {
 const out = {};
 CONTRACTS[scope].forEach(name => {
  out[name] = async payload => {
   const impl = adapter && adapter[scope];
   if (!impl) return notConfigured();
   if (typeof impl[name] !== "function") return notConfigured("method_not_implemented");
   try { return normalize(await impl[name](payload)); }
   catch { return { success: false, code: "service_unreachable", message: UNREACHABLE_MESSAGE }; }
  };
 });
 return Object.freeze(out);
}

function status() {
 const missing = scope => adapter ? CONTRACTS[scope].filter(n => typeof adapter[scope][n] !== "function") : CONTRACTS[scope].slice();
 return {
  configured: !!adapter,
  adapter: adapter ? adapter.name : null,
  simulation: !!adapter && adapter.simulation,
  missing: { client: missing("client"), admin: missing("admin") }
 };
}

/* خطأ يحمل رسالة الخدمة ليعرضها المستدعي بدل نص عام. */
function error(result) {
 const e = new Error(result && result.message ? result.message : FAILED_MESSAGE);
 e.serviceMessage = result && result.message ? result.message : "";
 e.code = result && result.code ? result.code : "request_failed";
 return e;
}
const text = (err, fallback) => (err && err.serviceMessage) || fallback;

/* التواريخ التشغيلية: التقويم الميلادي وتوقيت صنعاء Asia/Aden لا توقيت الجهاز (قرار D-21). */
function parseDate(value) {
 if (value === null || value === undefined || value === "") return null;
 const d = new Date(value);
 return Number.isNaN(d.getTime()) ? null : d;
}
function formatDateTime(value, fallback = "—") {
 const d = parseDate(value);
 return d ? d.toLocaleString("ar", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Aden" }) : (value ? String(value) : fallback);
}
function formatDate(value, fallback = "—") {
 const d = parseDate(value);
 return d ? d.toLocaleDateString("ar", { dateStyle: "medium", timeZone: "Asia/Aden" }) : (value ? String(value) : fallback);
}

window.AMANServices = Object.freeze({
 contracts: CONTRACTS, register, status, error, text, formatDate, formatDateTime,
 notConfiguredMessage: NOT_CONFIGURED_MESSAGE,
 isConfigured: () => !!adapter
});
window.AMANClientServices = facade("client");
window.AMANAdminServices = facade("admin");

/* شارة «الخدمة غير مهيأة» تظهر فقط حين لا يوجد أي محوّل (بعد تحميل كل السكربتات). */
if (typeof document !== "undefined") {
 document.addEventListener("DOMContentLoaded", () => {
  if (adapter || document.getElementById("aman-service-banner")) return;
  const bar = document.createElement("div");
  bar.id = "aman-service-banner";
  bar.className = "service-banner";
  bar.setAttribute("role", "status");
  const strong = document.createElement("strong");
  strong.textContent = "الخدمة غير مهيأة";
  const span = document.createElement("span");
  span.textContent = "لم يُربط خادم البيانات بعد؛ لن تُنفَّذ أي عملية ولن تُعرض أي بيانات.";
  bar.append(strong, span);
  document.body.prepend(bar);
 });
}
})();
