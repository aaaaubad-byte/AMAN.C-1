/*
 * AMAN.C — محوّل المحاكاة المحلية (Simulation Adapter)
 *
 * يطبّق عقود الخدمات نفسها (shared/services/CONTRACTS.md) فوق localStorage المعزول عن الإنتاج.
 * ليس نظام مصادقة آمنًا وليس قاعدة بيانات؛ لا تستخدم بيانات حقيقية.
 *
 * ضوابط العزل:
 *  1) لا يعمل إلا إذا حقن خادم المعاينة المحلية (scripts/local-preview.mjs) العلم window.__AMAN_SIMULATION__.
 *  2) لا يعمل إلا على localhost / 127.0.0.1. كما أن shared/services/runtime.js يرفض تسجيله خارجهما.
 *  3) لا يتصل بأي خادم ولا يحتوي عناوين اتصال أو مفاتيح.
 *  4) يبدأ فارغًا: لا شركات ولا باقات ولا وسائل دفع ولا طلبات. الاستثناء الوحيد حساب مدير المحاكاة
 *     (يلزم لتسجيل الدخول) وهو معلن في شريط المحاكاة. بيانات العيّنة اختيارية بزر صريح.
 *  5) مفتاح التخزين مستقل (aman_c_simulation_v2) ولا تلمسه صفحات الإنتاج.
 *
 * قاعدة المصادرة والمهام (docs/DECISIONS.md: D2/D4/D5/D6 + توضيحات صاحب المشروع 2026-11-01):
 *  - الفاصل الدوري للشركة هو مهلة المصادرة نفسها.
 *  - لكل رقم مهمة قادمة واحدة مخزنة؛ موعدها هو تاريخ المصادرة (آخر يوم في الفاصل). لا تبقى مهام متأخرة معلّقة.
 *  - يجوز تنفيذ المهمة في أي وقت داخل الفاصل (مبكرًا أيضًا) والرقم محمي؛ التنفيذ يسجّلها مكتملة ويعيد حساب
 *    موعد المهمة التالية = يوم التنفيذ + الفاصل. المهام القادمة الأبعد محسوبة ديناميكيًا ولا تُخزَّن.
 *  - لا يجوز تجاوز الموعد دون تنفيذ إلا بإعادة جدولة يدوية من المدير (بالزيادة أو النقصان) للمهمة القادمة وحدها.
 *  - نافذة الظهور (task_due_window_days) إعداد للشركة: تظهر المهمة «مستحقة» قبل موعدها بهذا العدد من الأيام ليتسع وقت المدير.
 *  - التنشيط يستكمل المخطط. آخر يوم مسموح للتنشيط = تاريخ المصادرة − مهلة التنشيط (reactivation_days؛ 0 = حتى يوم المصادرة نفسه)؛
 *    وبعده يُرفض التنشيط برمز reactivation_window_closed، وبعد تجاوز تاريخ المصادرة يصبح الرقم مصادرًا. مفتاح reactivation_enabled يمنع التنشيط كليًا.
 *  - لا تُنشأ مهمة خارج نطاق الاشتراك (قرار 2026-11-01): تُخطَّط المهمة التالية (يوم مرجع المخطط + الفاصل) فقط إن كان موعدها ≤ نهاية الاشتراك.
 *    مرجع المخطط (plan_anchor_at) = يوم بداية الاشتراك الأول ثم يوم آخر مهمة منفذة؛ ولا يغيّره التمديد ولا التنشيط.
 *    تاريخ المصادرة دون مهمة مخزنة = مرجع المخطط + الفاصل (هو نفسه موعد المهمة التالية لو كانت ضمن الاشتراك).
 *    التمديد والتنشيط يستكملان المخطط من المرجع نفسه: تُنشأ المهمة الناقصة إن صار موعدها ضمن الاشتراك الجديد.
 *    الشركة بإعداد «إنشاء أول مهمة = لا» لا مخطط مهام لها: يبقى لها السلوك السابق (نهاية الاشتراك + مهلة التنشيط) وهو قرار مفتوح موثق.
 *  - نافذة الظهور تُدخَل لكل شركة جديدة دون قيمة افتراضية (مطلوبة، عدد صحيح غير سالب).
 *  - التقويم ميلادي وتوقيت Asia/Aden (UTC+3 ثابت، بلا توقيت صيفي).
 */
(() => {
"use strict";
const flag = window.__AMAN_SIMULATION__;
if (!flag || flag.enabled !== true) return;
if (!window.AMANServices) { console.error("AMAN simulation: shared/services/runtime.js must load first."); return; }
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(location.hostname)) { console.error("AMAN simulation: refused outside localhost."); return; }

const STORAGE_KEY = "aman_c_simulation_v2";
const DAY = 86400000;
const ADEN_OFFSET = 3 * 3600000; /* Asia/Aden = UTC+3 */
const SIM_ADMIN = Object.freeze({ id: "sim-admin", email: "admin@simulation.local", password: "simulation-1234", full_name: "مدير المحاكاة" });

/* قوائم معتمدة من مرجع الإدارة (14.1 و14.2) ومرجع العميل (13). لا تُضاف قيم من عندنا. */
const REJECT_REASONS = Object.freeze([
 { code: "bad_reference", label: "مرجع غير صحيح" },
 { code: "amount_short", label: "مبلغ ناقص" },
 { code: "not_received", label: "تحويل لم يصل" }
]);
const REPORT_REASONS = Object.freeze({
 mine: "الرقم يخصني",
 lost_access: "الرقم مرتبط بحساب سابق فقدت الوصول إليه",
 unauthorized: "تم تفعيل حماية رقمي دون علمي",
 other: "سبب آخر"
});
const OPERATIONS = ["activation", "extension", "reactivation"];
const OPERATION_LABELS = { activation: "اشتراك", extension: "تمديد الاشتراك", reactivation: "تنشيط" };
const STATUS_LABELS = { protected: "محمي", inactive: "غير نشط", confiscated: "منتهي-مصادر" };

/* ---------- التخزين ---------- */
const emptyDb = () => ({
 version: 2, seq: 0, sample_loaded: false,
 users: [{ id: SIM_ADMIN.id, email: SIM_ADMIN.email, password: SIM_ADMIN.password, full_name: SIM_ADMIN.full_name, is_admin: true, status: "active", created_at: new Date().toISOString() }],
 customer_session: null, admin_session: null,
 companies: [], packages: [], payments: [], requests: [], numbers: [], tasks: [],
 notifications: [], admin_notifications: [], admin_alerts: [], reports: [], audit_log: [],
 app_content: { terms: "", privacy: "", contact: "", help: "" }
});
let db = emptyDb();
function load() {
 try { const x = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (x && x.version === 2 && Array.isArray(x.users)) return x; } catch { /* حالة فارغة */ }
 return emptyDb();
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

/* ---------- أدوات ---------- */
const now = () => new Date().toISOString();
const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY).toISOString();
/* بداية اليوم الميلادي بتوقيت عدن، ونهايته (آخر ميلي ثانية فيه). */
const dayStart = date => new Date(Math.floor((new Date(date).getTime() + ADEN_OFFSET) / DAY) * DAY - ADEN_OFFSET).toISOString();
const endOfDay = date => new Date(Date.parse(dayStart(date)) + DAY - 1).toISOString();
const uid = prefix => prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
const ok = (extra = {}) => ({ success: true, ...extra });
const fail = (message, code = "request_failed") => ({ success: false, code, message });
const AUTH = () => fail("انتهت الجلسة أو لا توجد جلسة. سجّل الدخول.", "auth_required");
const NOT_ADMIN = () => fail("هذه العملية تتطلب صلاحية الإدارة.", "admin_required");
const isInt = v => Number.isInteger(v);
const normalizePhone = v => String(v ?? "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/\D/g, "");
const customerUser = () => db.users.find(u => u.id === db.customer_session && !u.is_admin && u.status === "active") || null;
const adminUser = () => db.users.find(u => u.id === db.admin_session && u.is_admin === true) || null;
const userById = id => db.users.find(u => u.id === id) || null;
const companyById = id => db.companies.find(c => c.id === id) || null;
const customers = () => db.users.filter(u => !u.is_admin);
const customerType = userId => db.requests.some(r => r.customer_id === userId && r.status === "approved") ? "customer" : "user";
const myNumbers = userId => db.numbers.filter(n => n.owner_id === userId);

function audit(action, entityType, entityId, summary, extra = {}) {
 const actor = adminUser();
 db.audit_log.unshift({ id: uid("AUD"), action, entity_type: entityType, entity_id: entityId, summary, actor_id: actor?.id || null, actor_name: actor?.full_name || "غير مسجل", created_at: now(), ...extra });
}
function notify(customerId, title, body, extra = {}) {
 db.notifications.unshift({ id: uid("NTF"), customer_id: customerId, title, body, created_at: now(), read_at: null, source: "auto", ...extra });
}

/* ---------- المهام وتاريخ المصادرة (D2/D4/D5/D6) ---------- */
/* المهمة القادمة الوحيدة للرقم: موعدها هو تاريخ المصادرة. */
function pendingTask(n) { return db.tasks.find(t => t.number_id === n.id && t.status !== "executed") || null; }
/* مرجع حساب المخطط: يوم بداية الاشتراك الأول ثم يوم آخر مهمة منفذة (لا يغيّره التمديد ولا التنشيط). */
function planAnchor(n) { return n.plan_anchor_at || n.starts_at || n.created_at || null; }
/* موعد المهمة التالية المحسوب (مرجع المخطط + الفاصل) سواء أُنشئت المهمة أم لا. null إن لم يكن للشركة مخطط مهام. */
function nextPlannedDue(n) {
 const c = companyById(n.company_id), interval = Number(c && c.task_interval_days), anchor = planAnchor(n);
 if (!c || !c.create_first_task || !anchor || !isInt(interval) || interval < 1) return null;
 return addDays(dayStart(anchor), interval);
}
/* تخطيط المهمة القادمة: لا تُنشأ مهمة موعدها بعد نهاية الاشتراك (قرار 2026-11-01). تُستدعى بعد ضبط نهاية الاشتراك. */
function planNextTask(n) {
 if (pendingTask(n)) return;
 const due = nextPlannedDue(n);
 if (!due || Date.parse(due) > Date.parse(n.ends_at)) return;
 db.tasks.push({ id: uid("TSK"), number_id: n.id, phone: n.phone, company_id: n.company_id, customer_id: n.owner_id, status: "planned", due_at: due, created_at: now() });
}
/* آخر لحظة يجوز فيها التنفيذ/التنشيط قبل المصادرة: نهاية يوم موعد المهمة القادمة، المخزنة أو المحسوبة من مرجع المخطط. دون مخطط مهام (create_first_task=false) نعود إلى نهاية الاشتراك + مهلة التنشيط (مفتوح: راجع PROGRESS_LOG). */
function confiscationDeadline(n) {
 const t = pendingTask(n);
 if (t) return endOfDay(t.due_at);
 const due = nextPlannedDue(n);
 if (due) return endOfDay(due);
 const c = companyById(n.company_id);
 const grace = c && c.reactivation_enabled ? Number(c.reactivation_days || 0) : 0;
 return addDays(n.ends_at, grace);
}
/* حالة الرقم المشتقة زمنيًا: محمي ← غير نشط بعد انتهاء الاشتراك ← مصادَر بعد تجاوز تاريخ المصادرة (حتى أثناء الحماية إن لم تُنفَّذ المهمة ولم تُعد جدولتها). */
function liveStatus(n) {
 let s = n.status;
 if (s === "protected" && Date.parse(n.ends_at) <= Date.now()) s = "inactive";
 if (s === "protected" || s === "inactive") {
  if (Date.now() > Date.parse(confiscationDeadline(n))) s = "confiscated";
 }
 return s;
}
/* آخر لحظة يجوز فيها التنشيط = نهاية اليوم (تاريخ المصادرة − مهلة التنشيط) بتوقيت عدن. null إن كان التنشيط غير مسموح للشركة.
 * تاريخ المصادرة هنا هو موعد المهمة المخزنة أو المحسوبة من مرجع المخطط (آخر مهمة منفذة ضمن الاشتراك + الفاصل). دون مخطط مهام نُبقي السلوك السابق (نهاية الاشتراك + المهلة) — قرار مفتوح موثق في PROGRESS_LOG. */
function reactivationDeadline(n) {
 const c = companyById(n.company_id);
 if (!c || !c.reactivation_enabled) return null;
 const grace = Number(c.reactivation_days || 0), t = pendingTask(n), due = t ? t.due_at : nextPlannedDue(n);
 if (due) return endOfDay(addDays(dayStart(due), -grace));
 return addDays(n.ends_at, grace);
}
function remainingLabel(n) {
 const ms = Date.parse(n.ends_at) - Date.now();
 return ms > 0 ? Math.ceil(ms / DAY) + " يوم" : null;
}
function numberView(n, status) {
 const c = companyById(n.company_id);
 const v = { id: n.id, phone: n.phone, company: c ? c.name : "", company_id: n.company_id, status };
 if (["protected", "inactive", "confiscated"].includes(status)) {
  Object.assign(v, { package_name: n.package_name, duration_days: n.duration_days, starts_at: n.starts_at, ends_at: n.ends_at });
 }
 if (status === "protected") v.remaining_label = remainingLabel(n);
 if (status === "inactive") v.last_activation_date = reactivationDeadline(n);
 return v;
}
function matchCompany(phone) {
 const hits = [];
 db.companies.filter(c => c.is_active !== false).forEach(c => (c.prefixes || []).forEach(p => { if (phone.startsWith(p)) hits.push({ c, p }); }));
 hits.sort((a, b) => b.p.length - a.p.length);
 return hits[0] ? hits[0].c : null;
}
function numberFor(phone) { return db.numbers.find(n => n.phone === phone) || null; }

/* أهلية العملية (D-03): تُفحص عند الإرسال وعند الاعتماد. */
function eligibilityIssue(op, phone, customerId) {
 const n = numberFor(phone);
 const status = n ? liveStatus(n) : null;
 const issue = message => ({ message, code: "operation_not_allowed" });
 if (op === "activation") return (!n || (n.owner_id !== customerId && status !== "protected")) ? null : issue("الاشتراك غير متاح لحالة الرقم الحالية.");
 if (op === "extension") return (n && n.owner_id === customerId && status === "protected") ? null : issue("تمديد الاشتراك متاح للرقم المحمي لدى حسابك فقط.");
 if (op === "reactivation") {
  if (!(n && n.owner_id === customerId && status === "inactive")) return issue("التنشيط متاح للرقم غير النشط لدى حسابك قبل تجاوز تاريخ المصادرة فقط.");
  const last = reactivationDeadline(n);
  if (last === null) return { message: "التنشيط غير مسموح لهذه الشركة.", code: "reactivation_disabled" };
  if (Date.now() > Date.parse(last)) return { message: "انتهت مهلة التنشيط لهذا الرقم قبل تاريخ المصادرة.", code: "reactivation_window_closed" };
  return null;
 }
 return issue("نوع العملية غير معروف.");
}
const eligibility = (op, phone, customerId) => { const i = eligibilityIssue(op, phone, customerId); return i ? i.message : null; };

/* ---------- عقود العميل ---------- */
const client = {
 getSession: () => {
  const u = customerUser();
  return ok({ user: u ? { id: u.id, email: u.email, full_name: u.full_name || "", account_type: customerType(u.id), status: u.status } : null });
 },
 signIn: p => {
  const email = String(p.email || "").trim().toLowerCase();
  const u = db.users.find(x => !x.is_admin && x.email.toLowerCase() === email && x.password === String(p.password || ""));
  if (!u || u.status !== "active") return fail("تعذر تسجيل الدخول. تحقق من البيانات.", "invalid_credentials");
  db.customer_session = u.id; save();
  return ok({ user: { id: u.id, email: u.email, full_name: u.full_name || "" } });
 },
 signUp: p => {
  const email = String(p.email || "").trim().toLowerCase(), password = String(p.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("البريد الإلكتروني غير صالح.", "invalid_email");
  if (password.length < 4) return fail("كلمة المرور قصيرة.", "weak_password");
  if (db.users.some(x => x.email.toLowerCase() === email)) return fail("تعذر إنشاء الحساب بهذا البريد.", "email_taken");
  const u = { id: uid("CUS"), email, password, full_name: "", status: "active", created_at: now() };
  db.users.push(u); db.customer_session = u.id; save();
  return ok({ user: { id: u.id, email: u.email, full_name: "" } });
 },
 signOut: () => { if (!customerUser()) return AUTH(); db.customer_session = null; save(); return ok(); },
 lookupNumber: p => {
  const u = customerUser(); if (!u) return AUTH();
  const phone = normalizePhone(p.phone);
  if (!/^\d{7,15}$/.test(phone)) return fail("تحقق من رقم الهاتف المدخل.", "invalid_number");
  if (!db.companies.length) return fail("لا توجد شركات مُهيأة في المحاكاة. أضف شركة من الإدارة أو حمّل بيانات العيّنة.", "no_companies");
  const c = matchCompany(phone);
  if (!c) return fail("بادئة الرقم غير معروفة. تحقق من الرقم.", "unknown_prefix");
  if (!(c.number_lengths || []).includes(phone.length)) return fail("طول الرقم لا يطابق أرقام هذه الشركة.", "invalid_length");
  const base = { phone, company: c.name, company_id: c.id };
  const n = numberFor(phone);
  if (!n) return ok({ number: { ...base, status: "not_subscribed" } });
  const s = liveStatus(n);
  if (n.owner_id === u.id) return ok({ number: numberView(n, s) });
  return ok({ number: { ...base, status: s === "protected" ? "other_protected" : "not_subscribed" } });
 },
 listMyNumbers: () => {
  const u = customerUser(); if (!u) return AUTH();
  return ok({ items: myNumbers(u.id).map(n => numberView(n, liveStatus(n))) });
 },
 listMyOperations: () => {
  const u = customerUser(); if (!u) return AUTH();
  return ok({ items: db.requests.filter(r => r.customer_id === u.id).map(r => ({
   id: r.id, request_number: r.request_number, type: r.operation_type, status: r.status, phone: r.phone, company: r.company_name,
   package_name: r.package_name, duration_days: r.duration_days, price_yer: r.price_yer, payment_method: r.payment_method_name,
   payment_reference: r.payment_reference, created_at: r.created_at,
   rejection_reason: r.reject_reason_label || null, rejection_note: r.reject_explanation || null
  })) });
 },
 getProtectionCatalog: p => {
  const u = customerUser(); if (!u) return AUTH();
  return ok({
   packages: db.packages.filter(x => x.active !== false && (!p.company_id || x.company_id === p.company_id) && (!p.operation_type || x.operation_type === p.operation_type))
    .map(x => ({ id: x.id, name: x.name, company_id: x.company_id, operation_type: x.operation_type, duration_days: x.days, price_yer: x.price_yer })),
   payment_methods: db.payments.filter(x => x.active !== false).map(x => ({ id: x.id, name: x.name, account_number: x.account_number || "", instructions: x.instructions, reference_required: x.reference_required !== false, reference_pattern: x.reference_pattern || null }))
  });
 },
 submitProtectionRequest: p => {
  const u = customerUser(); if (!u) return AUTH();
  const phone = normalizePhone(p.phone), op = p.operation_type;
  if (!/^\d{7,15}$/.test(phone) || !OPERATIONS.includes(op)) return fail("بيانات الطلب غير مكتملة.", "invalid_request");
  const company = companyById(p.company_id), pack = db.packages.find(x => x.id === p.package_id), pay = db.payments.find(x => x.id === p.payment_method_id);
  if (!company || !pack || !pay || pack.active === false || pay.active === false || pack.company_id !== company.id || pack.operation_type !== op) {
   return fail("الباقة أو وسيلة الدفع غير متاحة لهذه العملية.", "unavailable_package");
  }
  const ref = String(p.payment_reference || "").trim();
  if ((pay.reference_required !== false) && !ref) return fail("أدخل مرجع الدفع.", "reference_required");
  if (ref && pay.reference_pattern) { try { if (!new RegExp(pay.reference_pattern).test(ref)) return fail("صيغة مرجع الدفع غير مطابقة.", "reference_format"); } catch { return fail("صيغة مرجع الدفع غير صالحة في إعدادات الوسيلة.", "reference_pattern_invalid"); } }
  const blocked = eligibilityIssue(op, phone, u.id);
  if (blocked) return fail(blocked.message, blocked.code);
  const n = numberFor(phone);
  const r = {
   id: uid("REQ"), request_number: "SIM-" + String(++db.seq).padStart(4, "0"),
   customer_id: u.id, customer_name: u.full_name || u.email, phone, company_id: company.id, company_name: company.name,
   operation_type: op, package_id: pack.id, package_name: pack.name, duration_days: pack.days, price_yer: pack.price_yer,
   payment_method_id: pay.id, payment_method_name: pay.name, payment_reference: ref, status: "pending", created_at: now(),
   number_status_at_submit: n ? liveStatus(n) : "not_subscribed"
  };
  db.requests.unshift(r); save();
  return ok({ request_id: r.id, request_number: r.request_number });
 },
 updateProfile: p => {
  const u = customerUser(); if (!u) return AUTH();
  const name = String(p.full_name || "").trim();
  if (name.length > 120) return fail("الاسم أطول من المسموح.", "invalid_name");
  u.full_name = name; save(); return ok();
 },
 changePassword: p => {
  const u = customerUser(); if (!u) return AUTH();
  if (u.password !== String(p.current_password || "")) return fail("كلمة المرور الحالية غير صحيحة.", "wrong_password");
  if (String(p.new_password || "").length < 4) return fail("كلمة المرور الجديدة قصيرة.", "weak_password");
  u.password = String(p.new_password); save(); return ok();
 },
 getNotifications: () => {
  const u = customerUser(); if (!u) return AUTH();
  return ok({ items: db.notifications.filter(n => n.customer_id === u.id).map(({ id, title, body, created_at, read_at }) => ({ id, title, body, created_at, read_at })) });
 },
 markNotificationRead: p => {
  const u = customerUser(); if (!u) return AUTH();
  const n = db.notifications.find(x => x.id === p.notification_id && x.customer_id === u.id);
  if (!n) return fail("الإشعار غير موجود.", "not_found");
  n.read_at = n.read_at || now(); save(); return ok();
 },
 listNumberAlerts: p => {
  const u = customerUser(); if (!u) return AUTH();
  const phone = normalizePhone(p.phone), n = numberFor(phone);
  if (!n || n.owner_id !== u.id) return fail("الرقم غير مرتبط بحسابك.", "not_found");
  return ok({ items: db.admin_alerts.filter(a => a.customer_id === u.id && a.phone === phone).map(({ id, title, body, created_at, read_at }) => ({ id, title, body, created_at, read_at: read_at || null })) });
 },
 submitReport: p => {
  const u = customerUser(); if (!u) return AUTH();
  const phone = normalizePhone(p.phone), n = numberFor(phone);
  if (!Object.keys(REPORT_REASONS).includes(p.reason_code)) return fail("اختر سبب البلاغ.", "invalid_reason");
  const text = String(p.reason_text || "").trim();
  if (p.reason_code === "other" && !text) return fail("أدخل توضيح البلاغ.", "reason_text_required");
  if (text.length > 2000) return fail("التوضيح أطول من المسموح.", "reason_text_too_long");
  if (!n || n.owner_id === u.id || liveStatus(n) !== "protected") return fail("لا يمكن تقديم بلاغ لهذا الرقم.", "report_not_allowed");
  if (db.reports.some(r => r.customer_id === u.id && r.phone === phone && !r.decision)) return fail("لديك بلاغ مفتوح لهذا الرقم بالفعل.", "duplicate_report");
  const r = { id: uid("RPT"), customer_id: u.id, number_id: n.id, phone, company_id: n.company_id, reason_code: p.reason_code, reason_text: text || null, status: "open", created_at: now() };
  db.reports.unshift(r); save();
  return ok({ report_id: r.id });
 }
};

/* ---------- عقود الإدارة ---------- */
function requestView(r) {
 return { id: r.id, request_number: r.request_number, phone: r.phone, operation_type: r.operation_type, company_id: r.company_id, company_name: r.company_name, customer_name: r.customer_name, status: r.status, created_at: r.created_at };
}
function protectionStatusOf(n) { const s = liveStatus(n); return s === "confiscated" ? "expired_confiscated" : s; }
/* نافذة الظهور: عدد الأيام التي تظهر فيها المهمة «مستحقة» قبل موعدها (إعداد الشركة، الافتراضي 0). */
function dueWindowDays(companyId) { const c = companyById(companyId), w = Number(c && c.task_due_window_days); return isInt(w) && w > 0 ? w : 0; }
/* حالة المهمة: منفذة، أو مستحقة ابتداءً من (يوم موعدها − نافذة الظهور) بتوقيت عدن، أو مخططة. */
function taskStatus(t) {
 if (t.status === "executed") return "executed";
 return Date.now() >= Date.parse(dayStart(t.due_at)) - dueWindowDays(t.company_id) * DAY ? "due" : "planned";
}
function taskNumberStatus(t) { const n = numberFor(t.phone); return n ? liveStatus(n) : null; }
function taskView(t) {
 const n = numberFor(t.phone), c = companyById(t.company_id);
 const v = { ...t, status: taskStatus(t), company_name: c ? c.name : null, protection_id: n ? n.id : null, due_window_days: dueWindowDays(t.company_id) };
 if (t.status !== "executed") v.confiscation_date = endOfDay(t.due_at);
 return v;
}
function approvalEffect(r) {
 const n = numberFor(r.phone), start = now();
 if (r.operation_type === "extension" && n) return { starts_at: n.ends_at, ends_at: addDays(n.ends_at, r.duration_days), effect_description: "تمديد نهاية الحماية الحالية بمدة الباقة؛ تبقى بداية الحماية كما هي." };
 const first = r.operation_type === "activation";
 return { starts_at: start, ends_at: addDays(start, r.duration_days), effect_description: first ? "تبدأ الحماية لحظة الاعتماد، ويدخل الرقم قائمة العميل، وتنشأ مهام السداد وفق إعدادات الشركة." : "تبدأ فترة حماية جديدة لحظة الاعتماد، ويستكمل مخطط المهام القائم." };
}
function blockReason(r) {
 const u = userById(r.customer_id);
 if (r.operation_type === "activation" && u && u.status !== "active") return "الحساب معطّل — أعد تفعيله أولًا.";
 return eligibility(r.operation_type, r.phone, r.customer_id);
}
function groupBy(list, key) {
 const m = new Map();
 list.forEach(x => { const name = x[key] || "غير محدد", v = m.get(name) || { name, count: 0, total_yer: 0 }; v.count++; v.total_yer += Number(x.price_yer || 0); m.set(name, v); });
 return [...m.values()];
}
function validCompany(p) {
 if (!String(p.name || "").trim()) return "اسم الشركة مطلوب.";
 if (!Array.isArray(p.prefixes) || !p.prefixes.length || p.prefixes.some(x => !/^\d+$/.test(x))) return "البادئات مطلوبة ويجب أن تكون أرقامًا فقط.";
 if (new Set(p.prefixes).size !== p.prefixes.length) return "البادئات مكررة.";
 if (!Array.isArray(p.number_lengths) || !p.number_lengths.length || p.number_lengths.some(x => !isInt(x) || x < 1)) return "أطوال الأرقام مطلوبة ويجب أن تكون أعدادًا صحيحة موجبة.";
 if (!isInt(p.task_interval_days) || p.task_interval_days < 1) return "الفاصل الدوري يجب أن يكون عددًا صحيحًا موجبًا.";
 if ((p.task_due_window_days !== undefined || !p.id) && (!isInt(p.task_due_window_days) || p.task_due_window_days < 0)) return "نافذة ظهور المهام المستحقة مطلوبة ويجب أن تكون عددًا صحيحًا غير سالب.";
 if (!isInt(p.reactivation_days) || p.reactivation_days < 0) return "مهلة التنشيط قبل المصادرة يجب أن تكون عددًا صحيحًا غير سالب.";
 if (["is_active", "create_first_task", "reactivation_enabled"].some(k => typeof p[k] !== "boolean")) return "إعدادات الشركة غير مكتملة.";
 return null;
}
/* تحقق إعادة الجدولة: مهمة قادمة لرقم محمي، وتاريخ جديد صالح غير سابق لليوم (بالزيادة أو النقصان). يعيد { t, n, nextDue } أو { error }. */
function rescheduleTarget(p) {
 const t = db.tasks.find(x => x.id === p.task_id), next = new Date(p.new_due_at);
 if (!t || t.status === "executed" || Number.isNaN(next.getTime())) return { error: fail("تعذرت إعادة الجدولة.", "invalid_request") };
 const n = numberFor(t.phone);
 if (!n || liveStatus(n) !== "protected") return { error: fail("إعادة الجدولة متاحة لمهام الأرقام المحمية فقط.", "task_not_reschedulable") };
 const nextDue = dayStart(next);
 if (Date.parse(nextDue) < Date.parse(dayStart(now()))) return { error: fail("لا يمكن جدولة المهمة في تاريخ سابق لليوم.", "invalid_date") };
 return { t, n, nextDue };
}

const admin = {
 getCurrentAdmin: () => { const a = adminUser(); return a ? ok({ admin: { id: a.id, full_name: a.full_name, email: a.email, is_admin: true } }) : AUTH(); },
 signInAdmin: p => {
  const u = db.users.find(x => x.is_admin === true && x.email === String(p.email || "").trim() && x.password === String(p.password || ""));
  if (!u) return fail("تعذر تسجيل الدخول أو أن الحساب غير مخوّل للإدارة.", "invalid_credentials");
  db.admin_session = u.id; save();
  return ok({ admin: { id: u.id, full_name: u.full_name, email: u.email, is_admin: true } });
 },
 signOutAdmin: () => { const a = adminUser(); if (!a) return AUTH(); audit("admin_signed_out", "admin_session", a.id, "تسجيل خروج المدير"); db.admin_session = null; save(); return ok(); },
 getDashboardSummary: () => {
  if (!adminUser()) return AUTH();
  return ok({ summary: {
   pending_requests: db.requests.filter(x => x.status === "pending").length,
   protected_numbers: db.numbers.filter(n => liveStatus(n) === "protected").length,
   open_reports: db.reports.filter(x => !x.decision).length,
   due_tasks: db.tasks.filter(t => taskStatus(t) === "due" && taskNumberStatus(t) === "protected").length,
   customers: customers().filter(u => customerType(u.id) === "customer").length,
   approved_revenue_yer: db.requests.filter(x => x.status === "approved").reduce((a, x) => a + Number(x.price_yer || 0), 0)
  } });
 },
 listRequests: f => {
  if (!adminUser()) return AUTH();
  let a = [...db.requests];
  if (f.status && f.status !== "all") a = a.filter(x => x.status === f.status);
  if (f.operation_type && f.operation_type !== "all") a = a.filter(x => x.operation_type === f.operation_type);
  if (f.company_id && f.company_id !== "all") a = a.filter(x => x.company_id === f.company_id);
  if (f.search) a = a.filter(x => [x.phone, x.request_number, x.customer_name].some(v => String(v || "").includes(f.search)));
  a.sort((x, y) => f.status === "pending" ? Date.parse(x.created_at) - Date.parse(y.created_at) : Date.parse(y.created_at) - Date.parse(x.created_at));
  return ok({ requests: a.map(requestView), companies: db.companies.map(c => ({ id: c.id, name: c.name })) });
 },
 getRequestDetails: p => {
  if (!adminUser()) return AUTH();
  const r = db.requests.find(x => x.id === p.request_id); if (!r) return fail("الطلب غير موجود.", "not_found");
  const n = numberFor(r.phone), u = userById(r.customer_id), warnings = [];
  const current = n ? liveStatus(n) : "not_subscribed";
  if (r.status === "pending" && current !== r.number_status_at_submit) warnings.push("تغيّرت حالة الرقم منذ إرسال الطلب.");
  if (db.requests.some(x => x.id !== r.id && x.phone === r.phone && x.status === "pending")) warnings.push("يوجد طلب آخر قيد المراجعة على هذا الرقم.");
  if (r.payment_reference && db.requests.some(x => x.id !== r.id && x.payment_reference === r.payment_reference)) warnings.push("مرجع الدفع مكرر في طلب آخر.");
  return ok({ request: {
   ...r, customer_type: customerType(r.customer_id), customer_status: u ? u.status : null,
   number_id: n ? n.id : null, number_status: STATUS_LABELS[current] || "غير مشترك",
   current_protection_starts_at: n && current === "protected" ? n.starts_at : null,
   current_protection_ends_at: n && current === "protected" ? n.ends_at : null,
   reactivation_deadline: r.operation_type === "reactivation" && n ? reactivationDeadline(n) : null,
   warnings, approval_blocked_reason: r.status === "pending" ? blockReason(r) : null
  } });
 },
 getApprovalPreview: p => {
  if (!adminUser()) return AUTH();
  const r = db.requests.find(x => x.id === p.request_id && x.status === "pending"); if (!r) return fail("الطلب لم يعد قيد المراجعة.", "not_pending");
  const blocked = blockReason(r); if (blocked) return fail(blocked, "approval_blocked");
  return ok({ preview: approvalEffect(r) });
 },
 getRejectReasons: () => adminUser() ? ok({ items: REJECT_REASONS.map(x => ({ ...x })) }) : AUTH(),
 approveRequest: p => {
  const a = adminUser(); if (!a) return AUTH();
  const r = db.requests.find(x => x.id === p.request_id); if (!r || r.status !== "pending") return fail("الطلب غير متاح للاعتماد.", "not_pending");
  const blocked = blockReason(r); if (blocked) return fail(blocked, "approval_blocked");
  const effect = approvalEffect(r);
  let n = numberFor(r.phone);
  if (r.operation_type === "activation") {
   if (!n) { n = { id: uid("NUM"), phone: r.phone, company_id: r.company_id, created_at: now(), events: [] }; db.numbers.push(n); }
   /* اشتراك جديد = مخطط جديد: تُسقط أي مهمة قادمة قديمة للرقم ويبدأ مرجع المخطط من يوم الاعتماد. المنفذة تبقى سجلًا. */
   db.tasks = db.tasks.filter(t => t.number_id !== n.id || t.status === "executed");
   n.owner_id = r.customer_id;
   n.plan_anchor_at = effect.starts_at;
  }
  if (r.operation_type !== "extension") n.starts_at = effect.starts_at;
  n.status = "protected"; n.ends_at = effect.ends_at; n.package_name = r.package_name; n.duration_days = r.duration_days;
  /* المهمة القادمة تُنشأ فقط إن كان موعدها ضمن الاشتراك؛ التمديد والتنشيط يستكملان المخطط من مرجعه فتُنشأ المهمة الناقصة إن صار موعدها ضمن الاشتراك الجديد. */
  planNextTask(n);
  n.events = n.events || []; n.events.unshift({ type: r.operation_type, at: now(), request_id: r.id });
  r.status = "approved"; r.approved_at = now();
  notify(r.customer_id, "تم اعتماد طلبك", "اعتُمد طلب " + OPERATION_LABELS[r.operation_type] + " للرقم " + r.phone + ".");
  audit("request_approved", "request", r.id, "اعتماد طلب " + r.request_number);
  save(); return ok();
 },
 rejectRequest: p => {
  const a = adminUser(); if (!a) return AUTH();
  const r = db.requests.find(x => x.id === p.request_id); if (!r || r.status !== "pending") return fail("الطلب غير متاح للرفض.", "not_pending");
  const reason = REJECT_REASONS.find(x => x.code === p.reason_code); if (!reason) return fail("اختر سبب الرفض من القائمة.", "invalid_reason");
  const note = String(p.explanation || "").trim(); if (note.length > 300) return fail("التوضيح أطول من 300 حرف.", "explanation_too_long");
  Object.assign(r, { status: "rejected", reject_reason: reason.code, reject_reason_label: reason.label, reject_explanation: note, rejected_at: now() });
  notify(r.customer_id, "تم رفض طلبك", "رُفض طلب " + OPERATION_LABELS[r.operation_type] + " للرقم " + r.phone + ". السبب: " + reason.label + (note ? " — " + note : ""));
  audit("request_rejected", "request", r.id, "رفض طلب " + r.request_number, { reason: reason.label });
  save(); return ok();
 },
 listNumbers: p => {
  if (!adminUser()) return AUTH();
  let a = db.numbers.map(n => ({ n, status: protectionStatusOf(n) }));
  if (p.status && p.status !== "all") a = a.filter(x => x.status === p.status);
  if (p.search) a = a.filter(x => x.n.phone.includes(p.search) || String(companyById(x.n.company_id)?.name || "").includes(p.search));
  return ok({ numbers: a.map(({ n, status }) => ({ id: n.id, phone: n.phone, company_name: companyById(n.company_id)?.name || null, protection_status: status, protection_status_label: STATUS_LABELS[liveStatus(n)], customer_id: n.owner_id, customer_count: 1 })) });
 },
 getNumberDetails: p => {
  if (!adminUser()) return AUTH();
  const n = db.numbers.find(x => x.id === p.number_id); if (!n) return fail("الرقم غير موجود.", "not_found");
  const s = liveStatus(n), owner = userById(n.owner_id);
  return ok({ number: {
   id: n.id, phone: n.phone, company_name: companyById(n.company_id)?.name || null, protection_status: protectionStatusOf(n), protection_status_label: STATUS_LABELS[s],
   created_at: n.created_at, reactivation_deadline: s === "inactive" ? reactivationDeadline(n) : null,
   current_protection: s === "protected" ? { starts_at: n.starts_at, ends_at: n.ends_at, package_name: n.package_name, total_days: n.duration_days } : null,
   events: (n.events || []).map(e => ({ label: OPERATION_LABELS[e.type] || e.type, summary: e.at })),
   customers: owner ? [{ customer_name: owner.full_name || owner.email, customer_id: owner.id, summary: "مالك الحماية الحالي" }] : [],
   requests: db.requests.filter(r => r.phone === n.phone).map(r => ({ request_number: r.request_number, status_label: { pending: "قيد المراجعة", approved: "معتمد", rejected: "مرفوض" }[r.status] })),
   reports: db.reports.filter(r => r.phone === n.phone).map(r => ({ label: REPORT_REASONS[r.reason_code], summary: r.decision ? "تمت المعالجة" : "قيد المعالجة" })),
   alerts: db.admin_alerts.filter(x => x.phone === n.phone).map(x => ({ title: x.title, summary: x.created_at })),
   tasks: db.tasks.filter(t => t.phone === n.phone).map(t => ({ label: "مهمة سداد", summary: { planned: "مخططة", due: "مستحقة", executed: "منفذة" }[taskStatus(t)] + " — " + t.due_at }))
  } });
 },
 listCustomers: f => {
  if (!adminUser()) return AUTH();
  let a = customers();
  if (f.type && f.type !== "all") a = a.filter(x => customerType(x.id) === f.type);
  if (f.status && f.status !== "all") a = a.filter(x => x.status === f.status);
  if (f.search) { const q = String(f.search).toLowerCase(); a = a.filter(x => [x.full_name, x.email, ...myNumbers(x.id).map(n => n.phone)].some(v => String(v || "").toLowerCase().includes(q))); }
  return ok({ customers: a.map(x => ({ id: x.id, full_name: x.full_name, email: x.email, customer_type: customerType(x.id), status: x.status, phone: myNumbers(x.id)[0]?.phone || null, created_at: x.created_at || null })) });
 },
 getCustomerDetails: p => {
  if (!adminUser()) return AUTH();
  const u = customers().find(x => x.id === p.customer_id); if (!u) return fail("العميل غير موجود.", "not_found");
  const { password, ...safe } = u;
  return ok({ customer: { ...safe, customer_type: customerType(u.id), numbers: myNumbers(u.id).map(n => ({ id: n.id, phone: n.phone, protection_status: protectionStatusOf(n), protection_status_label: STATUS_LABELS[liveStatus(n)] })), requests: db.requests.filter(x => x.customer_id === u.id).map(x => ({ id: x.id, request_number: x.request_number, operation_type: x.operation_type, status: x.status, created_at: x.created_at })), status_history: u.status_history || [], disabled_reason: u.disabled_reason || null } });
 },
 updateCustomerStatus: p => {
  if (!adminUser()) return AUTH();
  const u = customers().find(x => x.id === p.customer_id);
  if (!u || !["active", "disabled"].includes(p.status) || u.status === p.status) return fail("تعذر تغيير حالة الحساب.", "invalid_status_change");
  u.status = p.status; u.disabled_reason = p.status === "disabled" ? (String(p.reason || "").trim() || null) : null;
  if (p.status === "disabled" && db.customer_session === u.id) db.customer_session = null;
  u.status_history = u.status_history || []; u.status_history.unshift({ status: p.status, reason: u.disabled_reason, changed_at: now() });
  audit(p.status === "disabled" ? "customer_disabled" : "customer_enabled", "customer", u.id, (p.status === "disabled" ? "تعطيل" : "إعادة تفعيل") + " حساب " + (u.full_name || u.email), { reason: u.disabled_reason });
  save(); return ok();
 },
 /* المهام المصادَر أرقامها لا تُعرض كمهام قابلة للتنفيذ؛ المنفذة تبقى سجلًا. */
 listTasks: () => adminUser() ? ok({ tasks: db.tasks.filter(t => t.status === "executed" || taskNumberStatus(t) !== "confiscated").map(taskView), companies: db.companies.map(c => ({ id: c.id, name: c.name })) }) : AUTH(),
 getTaskDetails: p => {
  if (!adminUser()) return AUTH();
  const t = db.tasks.find(x => x.id === p.task_id); if (!t) return fail("المهمة غير موجودة.", "not_found");
  const n = numberFor(t.phone);
  return ok({ task: { ...taskView(t), protection_context: n && n.package_name ? n.package_name : null } });
 },
 executeTask: p => {
  if (!adminUser()) return AUTH();
  const t = db.tasks.find(x => x.id === p.task_id);
  if (!t || t.status === "executed") return fail("المهمة غير متاحة للتنفيذ أو سبق تنفيذها.", "task_not_available");
  /* D5: تُنفَّذ المهام طوال فترة الاشتراك فقط؛ بعد انتهائه لا تنفيذ، ويبقى موعدها تاريخ المصادرة. التنفيذ المبكر (قبل الموعد وقبل نافذة الظهور) جائز. */
  const n = numberFor(t.phone);
  if (!n || liveStatus(n) !== "protected") return fail("لا تُنفَّذ المهمة إلا والرقم محمي (ضمن فترة الاشتراك).", "task_not_executable");
  t.status = "executed"; t.executed_at = now();
  /* تنفيذ المهمة يجعل يوم التنفيذ مرجع المخطط، فتكون التالية = يوم التنفيذ + الفاصل الدوري (وهو تاريخ المصادرة الجديد) سواء كان التنفيذ مبكرًا أو في موعده.
   * لا تُنشأ المهمة التالية إن كان موعدها بعد نهاية الاشتراك؛ يبقى تاريخ المصادرة محسوبًا من المرجع نفسه وتُنشأ المهمة عند التمديد أو التنشيط. */
  n.plan_anchor_at = t.executed_at;
  planNextTask(n);
  audit("task_executed", "task", t.id, "تسجيل تنفيذ مهمة سداد للرقم " + t.phone);
  save(); return ok();
 },
 previewTaskReschedule: p => {
  if (!adminUser()) return AUTH();
  const r = rescheduleTarget(p); if (r.error) return r.error;
  /* المتأثر: المهمة القادمة نفسها + المهام اللاحقة المحسوبة (موعد جديد + k × الفاصل) داخل فترة الاشتراك. */
  const c = companyById(r.t.company_id), interval = Number(c && c.task_interval_days), endsAt = Date.parse(r.n.ends_at);
  let count = 1;
  if (isInt(interval) && interval >= 1) { for (let d = Date.parse(r.nextDue) + interval * DAY; d <= endsAt && count < 1000; d += interval * DAY) count++; }
  return ok({ affected_count: count, new_due_at: r.nextDue, confiscation_date: endOfDay(r.nextDue) });
 },
 rescheduleTask: p => {
  if (!adminUser()) return AUTH();
  const r = rescheduleTarget(p); if (r.error) return r.error;
  /* تُعاد جدولة المهمة القادمة وحدها (زيادة أو نقصانًا)؛ اللاحقة محسوبة منها فتُزاح بالمقدار نفسه. */
  r.t.due_at = r.nextDue;
  audit("task_rescheduled", "task", r.t.id, "إعادة جدولة مهمة الرقم " + r.t.phone);
  save(); return ok({ due_at: r.t.due_at, confiscation_date: endOfDay(r.t.due_at) });
 },
 getRevenueReport: p => {
  if (!adminUser()) return AUTH();
  const days = p.days === "all" ? null : Number(p.days || 30), cutoff = days ? Date.now() - days * DAY : 0;
  const operations = db.requests.filter(x => x.status === "approved" && new Date(x.approved_at || x.created_at).getTime() >= cutoff).map(x => ({ ...x, operation_type_label: OPERATION_LABELS[x.operation_type] }));
  return ok({ count: operations.length, total_yer: operations.reduce((n, x) => n + Number(x.price_yer || 0), 0), period_label: days ? "آخر " + days + " يومًا" : "كل الفترات",
   by_operation: groupBy(operations.map(x => ({ ...x, op: OPERATION_LABELS[x.operation_type] })), "op"), by_company: groupBy(operations, "company_name"), by_package: groupBy(operations, "package_name"), by_payment: groupBy(operations, "payment_method_name"), operations });
 },
 listComplaints: () => {
  if (!adminUser()) return AUTH();
  return ok({ reports: db.reports.map(r => {
   const n = numberFor(r.phone), owner = n ? userById(n.owner_id) : null;
   return { id: r.id, phone: r.phone, reason: REPORT_REASONS[r.reason_code], reason_code: r.reason_code, description: r.reason_text, created_at: r.created_at,
    status: r.decision ? "resolved" : "open", customer_name: userById(r.customer_id)?.full_name || userById(r.customer_id)?.email || "غير معروف",
    company_name: companyById(r.company_id)?.name || "غير محددة", number_id: n ? n.id : null,
    protection_owner: owner ? (owner.full_name || owner.email) : null, protection_active: !!n && liveStatus(n) === "protected",
    decision: r.decision || null, decision_reason: r.decision_reason || null, decided_at: r.decided_at || null };
  }) });
 },
 decideComplaint: p => {
  if (!adminUser()) return AUTH();
  const r = db.reports.find(x => x.id === p.report_id && !x.decision);
  if (!r || !["no_action", "terminate_protection"].includes(p.decision) || !String(p.reason || "").trim()) return fail("البلاغ أو القرار غير متاح، وسبب القرار إلزامي.", "invalid_request");
  const n = numberFor(r.phone);
  if (p.decision === "terminate_protection") {
   if (!n || liveStatus(n) !== "protected") return fail("لا توجد حماية سارية لإنهائها.", "no_active_protection");
   n.status = "inactive"; n.ends_at = now(); n.events = n.events || []; n.events.unshift({ type: "admin_terminated", at: now() });
   notify(n.owner_id, "إنهاء الحماية", "أُنهيت الحماية على الرقم " + n.phone + " بقرار إداري.");
  }
  r.decision = p.decision; r.decision_reason = String(p.reason).trim(); r.decided_at = now();
  audit("complaint_" + p.decision, "complaint", r.id, "قرار في بلاغ على الرقم " + r.phone, { reason: r.decision_reason });
  save(); return ok();
 },
 listAdminNotifications: () => {
  if (!adminUser()) return AUTH();
  const manual = db.admin_notifications.map(n => {
   const delivered = db.notifications.filter(x => x.origin_id === n.id);
   return { ...n, source: "manual", source_label: "يدوي", customer_name: n.customer_id ? (userById(n.customer_id)?.full_name || userById(n.customer_id)?.email) : "جميع العملاء", read_summary: delivered.length ? delivered.filter(x => x.read_at).length + " / " + delivered.length : "—" };
  });
  const automatic = db.notifications.filter(n => !n.origin_id).map(n => ({ ...n, source: "automatic", source_label: "آلي", customer_name: userById(n.customer_id)?.full_name || userById(n.customer_id)?.email || "غير معروف", read_summary: n.read_at ? "مقروء" : "غير مقروء" }));
  return ok({ items: [...manual, ...automatic].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)), customers: customers().map(u => ({ id: u.id, name: u.full_name || u.email })) });
 },
 createAdminNotification: p => {
  if (!adminUser()) return AUTH();
  const title = String(p.title || "").trim(), body = String(p.body || "").trim();
  if (!title || !body) return fail("العنوان والنص مطلوبان.", "invalid_request");
  if (p.customer_id && !customers().some(u => u.id === p.customer_id)) return fail("العميل غير موجود.", "not_found");
  const recipients = p.customer_id ? customers().filter(u => u.id === p.customer_id) : customers();
  const groupId = uid("ANF"), created = now();
  db.admin_notifications.unshift({ id: groupId, customer_id: p.customer_id || null, title, body, created_at: created, status: "created" });
  recipients.forEach(u => notify(u.id, title, body, { origin_id: groupId, source: "manual", created_at: created }));
  audit("admin_notification_created", "notification", groupId, "إنشاء إشعار يدوي");
  save(); return ok({ recipient_count: recipients.length });
 },
 listAdminAlerts: () => adminUser() ? ok({ items: db.admin_alerts.map(a => ({ ...a, customer_name: userById(a.customer_id)?.full_name || userById(a.customer_id)?.email || "غير معروف" })) }) : AUTH(),
 createAdminAlert: p => {
  if (!adminUser()) return AUTH();
  const n = db.numbers.find(x => x.id === p.number_id);
  if (!n || !n.owner_id || !customers().some(u => u.id === n.owner_id)) return fail("الرقم غير مرتبط بعميل صالح.", "invalid_relation");
  const title = String(p.title || "").trim(), body = String(p.body || "").trim();
  if (!title || !body) return fail("العنوان والنص مطلوبان.", "invalid_request");
  const a = { id: uid("ALT"), number_id: n.id, phone: n.phone, customer_id: n.owner_id, title, body, created_at: now(), read_at: null, source: "manual" };
  db.admin_alerts.unshift(a);
  audit("admin_alert_created", "number_alert", n.id, "إنشاء تنبيه يدوي للرقم " + n.phone);
  save(); return ok();
 },
 listCompanies: () => adminUser() ? ok({ companies: db.companies.map(c => ({ ...c, task_due_window_days: dueWindowDays(c.id) })) }) : AUTH(),
 previewCompanySettings: p => {
  if (!adminUser()) return AUTH();
  const c = companyById(p.company_id);
  if (!c || !isInt(p.task_interval_days) || p.task_interval_days < 1) return fail("إعدادات الشركة غير صحيحة.", "invalid_request");
  const delta = p.task_interval_days - Number(c.task_interval_days);
  return ok({ affected_tasks: delta === 0 ? 0 : db.tasks.filter(t => t.company_id === c.id && t.status !== "executed").length, delta_days: delta });
 },
 saveCompanySettings: p => {
  if (!adminUser()) return AUTH();
  const problem = validCompany(p); if (problem) return fail(problem, "validation_failed");
  const c = p.id ? companyById(p.id) : null;
  if (p.id && !c) return fail("الشركة غير موجودة.", "not_found");
  const name = p.name.trim();
  if (db.companies.some(x => x.id !== p.id && x.name === name)) return fail("اسم الشركة مستخدم بالفعل.", "duplicate_name");
  const conflict = db.companies.find(x => x.id !== p.id && (x.prefixes || []).some(prefix => p.prefixes.includes(prefix)));
  if (conflict) return fail("توجد بادئة مستخدمة بالفعل لدى شركة أخرى: " + conflict.name, "prefix_conflict");
  const target = c || { id: uid("CMP"), created_at: now() };
  if (c) {
   const delta = p.task_interval_days - Number(c.task_interval_days);
   if (delta !== 0) db.tasks.filter(t => t.company_id === c.id && t.status !== "executed").forEach(t => { t.due_at = addDays(t.due_at, delta); });
  }
  /* الشركة الجديدة تُرسل النافذة وجوبًا (تحقّق أعلاه)؛ في التعديل إن غابت نُبقي القيمة الحالية. */
  const windowDays = p.task_due_window_days !== undefined ? p.task_due_window_days : (c && isInt(c.task_due_window_days) ? c.task_due_window_days : 0);
  Object.assign(target, { name, prefixes: p.prefixes, number_lengths: p.number_lengths, task_interval_days: p.task_interval_days, task_due_window_days: windowDays, is_active: p.is_active, create_first_task: p.create_first_task, reactivation_enabled: p.reactivation_enabled, reactivation_days: p.reactivation_days });
  if (!c) db.companies.push(target);
  audit(c ? "company_settings_updated" : "company_created", "company", target.id, c ? "تحديث إعدادات شركة" : "إضافة شركة اتصالات");
  save(); return ok({ company: { ...target } });
 },
 listPackages: () => adminUser() ? ok({ items: db.packages.map(p => ({ ...p, operation_label: OPERATION_LABELS[p.operation_type], company_name: companyById(p.company_id)?.name || "غير محددة" })) }) : AUTH(),
 savePackage: p => {
  if (!adminUser()) return AUTH();
  if (!companyById(p.company_id) || !String(p.name || "").trim() || !isInt(p.days) || p.days < 1 || !isInt(p.price_yer) || p.price_yer < 1 || !OPERATIONS.includes(p.operation_type) || typeof p.active !== "boolean") return fail("بيانات الباقة غير صحيحة: الشركة والاسم ونوع العملية، والمدة والسعر أعداد صحيحة موجبة.", "validation_failed");
  const x = p.id ? db.packages.find(v => v.id === p.id) : null;
  if (p.id && !x) return fail("الباقة غير موجودة.", "not_found");
  const target = x || { id: uid("PKG") };
  Object.assign(target, { company_id: p.company_id, operation_type: p.operation_type, name: p.name.trim(), days: p.days, price_yer: p.price_yer, active: p.active });
  if (!x) db.packages.push(target);
  audit(x ? "package_updated" : "package_created", "package", target.id, x ? "تعديل بيانات باقة حماية" : "إضافة باقة حماية");
  save(); return ok();
 },
 listPaymentMethods: () => adminUser() ? ok({ items: db.payments.map(p => ({ ...p, summary: p.summary || "", account_number: p.account_number || "", reference_required: p.reference_required !== false, active: p.active !== false })) }) : AUTH(),
 savePaymentMethod: p => {
  if (!adminUser()) return AUTH();
  if (!String(p.name || "").trim() || !String(p.instructions || "").trim()) return fail("الاسم والتعليمات مطلوبان.", "validation_failed");
  if (p.account_number !== undefined && p.account_number !== null && typeof p.account_number !== "string") return fail("رقم الحساب يجب أن يكون نصًا.", "validation_failed");
  if (String(p.account_number || "").length > 100) return fail("رقم الحساب أطول من 100 حرف.", "validation_failed");
  if (p.reference_pattern) { try { new RegExp(p.reference_pattern); } catch { return fail("صيغة مرجع الدفع غير صالحة.", "reference_pattern_invalid"); } }
  const x = p.id ? db.payments.find(v => v.id === p.id) : null;
  if (p.id && !x) return fail("وسيلة الدفع غير موجودة.", "not_found");
  const target = x || { id: uid("PAY") };
  Object.assign(target, { name: p.name.trim(), summary: String(p.summary || "").trim(), account_number: String(p.account_number || "").trim(), instructions: p.instructions.trim(), reference_required: p.reference_required !== false, reference_pattern: p.reference_pattern || null, active: p.active !== false });
  if (!x) db.payments.push(target);
  audit(x ? "payment_method_updated" : "payment_method_created", "payment_method", target.id, x ? "تعديل وسيلة دفع" : "إضافة وسيلة دفع");
  save(); return ok();
 },
 getAppContent: () => adminUser() ? ok({ items: { ...db.app_content } }) : AUTH(),
 saveAppContent: p => {
  if (!adminUser()) return AUTH();
  if (!["terms", "privacy", "contact", "help"].includes(p.key) || typeof p.body !== "string") return fail("بيانات النص غير صحيحة.", "validation_failed");
  db.app_content[p.key] = p.body;
  audit("content_updated", "app_content", p.key, "تحديث النص الثابت: " + p.key);
  save(); return ok();
 },
 listAuditLog: p => {
  if (!adminUser()) return AUTH();
  const items = p && p.limit ? db.audit_log.slice(0, p.limit) : db.audit_log;
  return ok({ items, actions: [...new Set(db.audit_log.map(x => x.action))], entities: [...new Set(db.audit_log.map(x => x.entity_type || "غير محدد"))] });
 }
};

/* كل عملية تقرأ أحدث حالة من التخزين أولًا لتتزامن تبويبات العميل والإدارة. */
const wrap = table => Object.fromEntries(Object.entries(table).map(([name, fn]) => [name, payload => { db = load(); return fn(payload || {}); }]));

/* ---------- بيانات العيّنة (اختيارية بزر صريح) ---------- */
function loadSample() {
 db = load();
 if (db.sample_loaded) return false;
 const c1 = { id: uid("CMP"), created_at: now(), name: "شركة عيّنة 1 (محاكاة)", prefixes: ["71"], number_lengths: [9], task_interval_days: 90, task_due_window_days: 10, is_active: true, create_first_task: true, reactivation_enabled: true, reactivation_days: 5 };
 const c2 = { id: uid("CMP"), created_at: now(), name: "شركة عيّنة 2 (محاكاة)", prefixes: ["73"], number_lengths: [9], task_interval_days: 90, task_due_window_days: 10, is_active: true, create_first_task: true, reactivation_enabled: true, reactivation_days: 5 };
 db.companies.push(c1, c2);
 [["activation", "اشتراك عيّنة", 1000], ["extension", "تمديد عيّنة", 800], ["reactivation", "تنشيط عيّنة", 900]].forEach(([op, name, price]) => db.packages.push({ id: uid("PKG"), company_id: c1.id, operation_type: op, name, days: 365, price_yer: price, active: true }));
 db.payments.push({ id: uid("PAY"), name: "وسيلة دفع عيّنة (محاكاة)", summary: "عيّنة", instructions: "تعليمات عيّنة للمحاكاة فقط؛ لا يوجد دفع حقيقي.", reference_required: true, reference_pattern: null, active: true });
 db.sample_loaded = true;
 audit("sample_data_loaded", "simulation", "sample", "تحميل بيانات العيّنة (محاكاة)");
 save(); return true;
}

/* ---------- الشريط المعلن ---------- */
function banner() {
 if (typeof document === "undefined" || document.getElementById("aman-simulation-banner")) return;
 const bar = document.createElement("div");
 bar.id = "aman-simulation-banner"; bar.className = "simulation-banner"; bar.dir = "rtl"; bar.setAttribute("role", "status");
 const title = document.createElement("strong"); title.textContent = "وضع المحاكاة المحلية";
 const note = document.createElement("span"); note.textContent = "بيانات غير حقيقية في متصفحك فقط، ولا اتصال بأي خادم أو قاعدة بيانات.";
 const sample = document.createElement("button"); sample.type = "button"; sample.id = "aman-simulation-sample"; sample.textContent = "تحميل بيانات عيّنة";
 const reset = document.createElement("button"); reset.type = "button"; reset.id = "aman-simulation-reset"; reset.textContent = "إعادة الضبط إلى حالة فارغة";
 const info = document.createElement("small");
 info.textContent = location.pathname.includes("/apps/admin/") ? "حساب مدير المحاكاة: " + SIM_ADMIN.email + " / " + SIM_ADMIN.password : "أنشئ حساب عميل جديدًا من شاشة الدخول.";
 sample.addEventListener("click", () => { if (loadSample()) location.reload(); else sample.textContent = "العيّنة محمّلة"; });
 reset.addEventListener("click", () => { if (confirm("سيتم مسح كل بيانات المحاكاة المحلية وإعادتها إلى حالة فارغة. هل تريد المتابعة؟")) { localStorage.removeItem(STORAGE_KEY); location.reload(); } });
 bar.append(title, note, sample, reset, info);
 document.body.prepend(bar);
}

db = load();
window.AMANServices.register({ name: "simulation-localstorage", simulation: true, client: wrap(client), admin: wrap(admin) });
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", banner);
})();
