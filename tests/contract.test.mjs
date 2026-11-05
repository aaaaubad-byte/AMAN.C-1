// اختبار مطابقة عقود الخدمات (services/CONTRACTS.md).
// افتراضيًا يحمّل services/runtime.js ثم محوّل المحاكاة في بيئة vm بساعة قابلة للتحكم، ويستدعي عقود
// window.AMANClientServices و window.AMANAdminServices كما تفعل الواجهات (الغلاف + المحوّل معًا).
// لتوجيهه إلى محوّل آخر: AMAN_CONTRACT_HARNESS=<مسار وحدة ES تصدّر createHarness()> تُرجع
//   { client, admin, setNow?, status?, adminCredentials? }
// حيث client/admin كائنان بعمليات async تُرجع { success, code?, message? } كما في العقود. إن لم يتوفر setNow تُتخطى اختبارات الزمن.
// ملاحظة صدق: كُتب هذا الملف دون تشغيله (بيئة بلا Node)؛ لا يُعدّ ناجحًا حتى يُشغَّل فعليًا.
// ملاحظة تقنية: الكائنات القادمة من vm تنتمي لنطاق آخر، فلا تُقارَن مصفوفاتها بـ deepEqual مباشرة (نستخدم JSON أو Array.from).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { pathToFileURL } from "node:url";

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const RUNTIME = read("../services/runtime.js");
const ADAPTER = read("../simulation/simulation-adapter.js");
const START = "2026-01-01T09:00:00+03:00";

function buildContext(withAdapter) {
  let current = Date.parse(START);
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(current); }
    static now() { return current; }
  }
  const store = new Map();
  const window = withAdapter ? { __AMAN_SIMULATION__: { enabled: true } } : {};
  const ctx = vm.createContext({
    Date: FakeDate, console, JSON, Math, Number, String, Array, Object, Set, Map, RegExp, Promise, Error,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    location: { hostname: "localhost", pathname: "/" },
    window
  });
  vm.runInContext(RUNTIME, ctx);
  if (withAdapter) vm.runInContext(ADAPTER, ctx);
  return { window, setNow: iso => { current = Date.parse(iso); } };
}

async function defaultHarness() {
  const { window, setNow } = buildContext(true);
  return { client: window.AMANClientServices, admin: window.AMANAdminServices, setNow, status: () => window.AMANServices.status(), contracts: window.AMANServices.contracts };
}

async function loadHarness() {
  if (process.env.AMAN_CONTRACT_HARNESS) {
    const mod = await import(pathToFileURL(path.resolve(process.env.AMAN_CONTRACT_HARNESS)).href);
    return mod.createHarness();
  }
  return defaultHarness();
}

const must = (r, what) => { assert.equal(r && r.success, true, what + ": " + JSON.stringify(r)); return r; };
const fails = (r, code, what = "") => {
  assert.equal(r.success, false, what + " يجب أن يفشل: " + JSON.stringify(r));
  assert.equal(r.code, code, what + " الرمز: " + JSON.stringify(r));
  assert.equal(typeof r.message, "string", what + " الرسالة");
  assert.ok(r.message.length > 0, what + " الرسالة فارغة");
};

async function world({ windowDays = 0, reactivationDays = 5, reactivationEnabled = true } = {}) {
  const h = await loadHarness();
  const { client, admin } = h;
  const creds = h.adminCredentials || { email: "admin@simulation.local", password: "simulation-1234" };
  must(await admin.signInAdmin(creds), "دخول المدير");
  const company = must(await admin.saveCompanySettings({
    name: "شركة اختبار", prefixes: ["71"], number_lengths: [9], task_interval_days: 90, task_due_window_days: windowDays,
    is_active: true, create_first_task: true, reactivation_enabled: reactivationEnabled, reactivation_days: reactivationDays
  }), "إضافة شركة").company;
  for (const [name, op, days] of [["act365", "activation", 365], ["act30", "activation", 30], ["ext365", "extension", 365], ["react30", "reactivation", 30]]) {
    must(await admin.savePackage({ company_id: company.id, operation_type: op, name, days, price_yer: 1000, active: true }), "باقة " + name);
  }
  const pkgs = {};
  (await admin.listPackages()).items.forEach(p => { pkgs[p.name] = p.id; });
  must(await admin.savePaymentMethod({ name: "وسيلة اختبار", instructions: "تعليمات", reference_required: true }), "وسيلة دفع");
  const pay = (await admin.listPaymentMethods()).items[0];
  let seq = 0;
  const as = async email => {
    await client.signOut();
    let r = await client.signIn({ email, password: "1234" });
    if (!r.success) r = await client.signUp({ email, password: "1234" });
    must(r, "جلسة " + email);
  };
  const submit = (op, pkg, phone = "711234567", ref = "REF-" + (++seq)) => client.submitProtectionRequest({
    phone, operation_type: op, company_id: company.id, package_id: pkgs[pkg], payment_method_id: pay.id, payment_reference: ref
  });
  const apply = async (op, pkg, phone = "711234567") => {
    const r = must(await submit(op, pkg, phone), "طلب " + op);
    must(await admin.approveRequest({ request_id: r.request_id }), "اعتماد " + op);
    return r;
  };
  const tasks = async () => (await admin.listTasks()).tasks;
  const openTask = async () => (await tasks()).find(t => t.status !== "executed");
  const myStatus = async phone => (await client.lookupNumber({ phone })).number.status;
  return { ...h, company, pkgs, pay, as, submit, apply, tasks, openTask, myStatus };
}

const timeTest = (name, opts, fn) => test(name, async t => {
  const w = await world(opts);
  if (!w.setNow) return t.skip("المحوّل لا يوفر ساعة قابلة للتحكم");
  await fn(w, t);
});

// ---------- الغلاف والصلاحيات ----------

test("بلا محوّل: كل عملية تُرجع service_not_configured ولا نجاح زائف", async () => {
  const { window } = buildContext(false);
  assert.equal(window.AMANServices.isConfigured(), false);
  for (const scope of ["client", "admin"]) {
    const facade = scope === "client" ? window.AMANClientServices : window.AMANAdminServices;
    for (const op of window.AMANServices.contracts[scope]) fails(await facade[op]({}), "service_not_configured", scope + "." + op);
  }
});

test("المحوّل ينفذ كل عمليات العقد (لا عمليات ناقصة)", async t => {
  const h = await loadHarness();
  if (!h.status) return t.skip("المحوّل لا يوفر status()");
  const s = h.status();
  assert.equal(s.configured, true);
  assert.equal(s.missing.client.length, 0, "ناقص في العميل: " + s.missing.client.join());
  assert.equal(s.missing.admin.length, 0, "ناقص في الإدارة: " + s.missing.admin.join());
});

test("بلا جلسة: عمليات العميل والإدارة ترفض برمز auth_required ورسالة", async () => {
  const h = await loadHarness();
  fails(await h.client.lookupNumber({ phone: "711234567" }), "auth_required", "lookupNumber");
  fails(await h.client.listMyNumbers({}), "auth_required", "listMyNumbers");
  fails(await h.client.getNotifications({}), "auth_required", "getNotifications");
  fails(await h.admin.listRequests({}), "auth_required", "listRequests");
  fails(await h.admin.getDashboardSummary({}), "auth_required", "getDashboardSummary");
  fails(await h.admin.saveAppContent({ key: "terms", body: "x" }), "auth_required", "saveAppContent");
});

test("فصل الصلاحيات: جلسة العميل لا تفتح الإدارة، وبيانات العميل لا تدخل الإدارة", async () => {
  const w = await world();
  await w.as("a@test.local");
  await w.admin.signOutAdmin();
  fails(await w.admin.listCustomers({}), "auth_required", "عميل على الإدارة");
  fails(await w.admin.signInAdmin({ email: "a@test.local", password: "1234" }), "invalid_credentials", "دخول مدير بحساب عميل");
  must(await w.admin.signInAdmin(w.adminCredentials || { email: "admin@simulation.local", password: "simulation-1234" }), "عودة المدير");
  await w.client.signOut();
  fails(await w.client.listMyOperations({}), "auth_required", "مدير على عمليات العميل");
});

// ---------- المصادقة ----------

test("إنشاء الحساب والدخول: التحقق ورسالة موحدة لا تكشف أي الحقلين خطأ", async () => {
  const h = await loadHarness();
  fails(await h.client.signUp({ email: "ليس-بريدًا", password: "1234" }), "invalid_email", "بريد غير صالح");
  fails(await h.client.signUp({ email: "a@test.local", password: "1" }), "weak_password", "كلمة مرور قصيرة");
  const u = must(await h.client.signUp({ email: "a@test.local", password: "1234" }), "إنشاء");
  assert.equal(u.user.email, "a@test.local");
  fails(await h.client.signUp({ email: "A@test.local", password: "1234" }), "email_taken", "بريد مكرر");
  must(await h.client.signOut(), "خروج");
  const wrongPass = await h.client.signIn({ email: "a@test.local", password: "9999" });
  const wrongMail = await h.client.signIn({ email: "nobody@test.local", password: "1234" });
  fails(wrongPass, "invalid_credentials", "كلمة مرور خطأ");
  fails(wrongMail, "invalid_credentials", "بريد خطأ");
  assert.equal(wrongPass.message, wrongMail.message);
  must(await h.client.signIn({ email: "a@test.local", password: "1234" }), "دخول");
  const s = must(await h.client.getSession({}), "جلسة");
  assert.equal(s.user.email, "a@test.local");
  must(await h.client.signOut(), "خروج");
  assert.equal((must(await h.client.getSession({}), "جلسة بعد الخروج")).user, null);
  fails(await h.client.listMyNumbers({}), "auth_required", "بعد الخروج");
});

test("الملف الشخصي وكلمة المرور", async () => {
  const w = await world();
  await w.as("a@test.local");
  must(await w.client.updateProfile({ full_name: "أحمد" }), "اسم");
  assert.equal((await w.client.getSession({})).user.full_name, "أحمد");
  fails(await w.client.updateProfile({ full_name: "x".repeat(121) }), "invalid_name", "اسم طويل");
  fails(await w.client.changePassword({ current_password: "خطأ", new_password: "5678" }), "wrong_password", "كلمة حالية خطأ");
  fails(await w.client.changePassword({ current_password: "1234", new_password: "1" }), "weak_password", "كلمة جديدة قصيرة");
  must(await w.client.changePassword({ current_password: "1234", new_password: "5678" }), "تغيير");
  must(await w.client.signOut(), "خروج");
  must(await w.client.signIn({ email: "a@test.local", password: "5678" }), "دخول بالجديدة");
});

test("تعطيل العميل: لا دخول ولا جلسة، وإعادة التفعيل تعيده؛ ولا كلمة مرور في تفاصيله", async () => {
  const w = await world();
  await w.as("a@test.local");
  const cid = (await w.admin.listCustomers({})).customers.find(c => c.email === "a@test.local").id;
  must(await w.admin.updateCustomerStatus({ customer_id: cid, status: "disabled", reason: "اختبار" }), "تعطيل");
  assert.equal((await w.client.getSession({})).user, null);
  fails(await w.client.signIn({ email: "a@test.local", password: "1234" }), "invalid_credentials", "دخول معطَّل");
  fails(await w.admin.updateCustomerStatus({ customer_id: cid, status: "disabled" }), "invalid_status_change", "تعطيل مكرر");
  const details = must(await w.admin.getCustomerDetails({ customer_id: cid }), "تفاصيل").customer;
  assert.equal(Object.prototype.hasOwnProperty.call(details, "password"), false);
  must(await w.admin.updateCustomerStatus({ customer_id: cid, status: "active" }), "تفعيل");
  must(await w.client.signIn({ email: "a@test.local", password: "1234" }), "دخول بعد التفعيل");
});

// ---------- البحث عن الرقم ----------

timeTest("lookupNumber: التحقق والحالات الخمس دون كشف مالك الرقم", {}, async w => {
  await w.as("a@test.local");
  fails(await w.client.lookupNumber({ phone: "12" }), "invalid_number", "رقم قصير");
  fails(await w.client.lookupNumber({ phone: "991234567" }), "unknown_prefix", "بادئة غير معروفة");
  fails(await w.client.lookupNumber({ phone: "7112345678" }), "invalid_length", "طول غير مطابق");
  assert.equal((must(await w.client.lookupNumber({ phone: "٧١١٢٣٤٥٦٧" }), "أرقام هندية")).number.phone, "711234567");
  assert.equal(await w.myStatus("711234567"), "not_subscribed");

  await w.apply("activation", "act30"); // الحماية حتى 01-31، والمصادرة 04-01
  const mine = (await w.client.lookupNumber({ phone: "711234567" })).number;
  assert.equal(mine.status, "protected");
  assert.equal(mine.package_name, "act30");
  assert.equal(mine.duration_days, 30);
  assert.equal(typeof mine.remaining_label, "string");

  await w.as("b@test.local");
  const other = (await w.client.lookupNumber({ phone: "711234567" })).number;
  assert.equal(other.status, "other_protected");
  assert.equal(JSON.stringify(Array.from(Object.keys(other)).sort()), JSON.stringify(["company", "company_id", "phone", "status"])); // لا مالك ولا باقة ولا تواريخ
  assert.equal(await w.myStatus("711000000"), "not_subscribed");

  w.setNow("2026-02-15T10:00:00+03:00");
  assert.equal(await w.myStatus("711234567"), "not_subscribed"); // لغير المالك: لم يعد محميًا
  await w.as("a@test.local");
  const inactive = (await w.client.lookupNumber({ phone: "711234567" })).number;
  assert.equal(inactive.status, "inactive");
  assert.equal(inactive.last_activation_date, "2026-03-27T20:59:59.999Z"); // 04-01 − مهلة 5 أيام، نهاية اليوم بتوقيت عدن

  w.setNow("2026-04-02T00:00:00+03:00");
  assert.equal(await w.myStatus("711234567"), "confiscated");
});

// ---------- الطلبات ----------

test("الطلب: التحقق، الاعتماد، الإشعار، وعدم اعتماد طلب معتمد مرتين", async () => {
  const w = await world();
  await w.as("a@test.local");
  fails(await w.submit("activation", "act365", "711234567", ""), "reference_required", "بلا مرجع");
  fails(await w.submit("activation", "ext365"), "unavailable_package", "باقة لعملية أخرى");
  fails(await w.submit("extension", "ext365"), "operation_not_allowed", "تمديد لرقم غير مشترك");
  fails(await w.submit("activation", "act365", "12"), "invalid_request", "رقم غير صالح");
  const r = must(await w.submit("activation", "act365"), "إرسال");
  assert.equal(typeof r.request_number, "string");

  const pending = (await w.admin.listRequests({ status: "pending" })).requests;
  assert.equal(pending.length, 1);
  const d = must(await w.admin.getRequestDetails({ request_id: r.request_id }), "تفاصيل").request;
  assert.equal(d.status, "pending");
  assert.ok(Array.isArray(d.warnings));
  const prev = must(await w.admin.getApprovalPreview({ request_id: r.request_id }), "معاينة").preview;
  assert.ok(prev.starts_at && prev.ends_at);

  assert.equal((await w.client.getSession({})).user.account_type, "user");
  must(await w.admin.approveRequest({ request_id: r.request_id }), "اعتماد");
  fails(await w.admin.approveRequest({ request_id: r.request_id }), "not_pending", "اعتماد ثانٍ");
  fails(await w.admin.getApprovalPreview({ request_id: r.request_id }), "not_pending", "معاينة بعد الاعتماد");
  assert.equal((await w.client.getSession({})).user.account_type, "customer");
  assert.equal((await w.client.listMyOperations({})).items[0].status, "approved");
  assert.equal((await w.client.listMyNumbers({})).items.length, 1);

  const notes = (await w.client.getNotifications({})).items;
  const n = notes.find(x => x.title === "تم اعتماد طلبك");
  assert.ok(n, "إشعار الاعتماد");
  assert.equal(n.read_at, null);
  fails(await w.client.markNotificationRead({ notification_id: "لا-يوجد" }), "not_found", "إشعار غير موجود");
  must(await w.client.markNotificationRead({ notification_id: n.id }), "قراءة");
  assert.ok((await w.client.getNotifications({})).items.find(x => x.id === n.id).read_at);
});

test("الرفض: السبب من القائمة، التوضيح حتى 300، ويظهر للعميل", async () => {
  const w = await world();
  await w.as("a@test.local");
  const r = must(await w.submit("activation", "act365"), "إرسال");
  const reasons = Array.from(must(await w.admin.getRejectReasons({}), "الأسباب").items, x => x.code).sort();
  assert.equal(JSON.stringify(reasons), JSON.stringify(["amount_short", "bad_reference", "not_received"]));
  fails(await w.admin.rejectRequest({ request_id: r.request_id, reason_code: "غير-معتمد" }), "invalid_reason", "سبب غير معتمد");
  fails(await w.admin.rejectRequest({ request_id: r.request_id, reason_code: "bad_reference", explanation: "x".repeat(301) }), "explanation_too_long", "توضيح طويل");
  must(await w.admin.rejectRequest({ request_id: r.request_id, reason_code: "bad_reference", explanation: "المرجع غير مطابق" }), "رفض");
  fails(await w.admin.approveRequest({ request_id: r.request_id }), "not_pending", "اعتماد بعد الرفض");
  const op = (await w.client.listMyOperations({})).items[0];
  assert.equal(op.status, "rejected");
  assert.equal(op.rejection_reason, "مرجع غير صحيح");
  assert.equal(op.rejection_note, "المرجع غير مطابق");
  assert.ok((await w.client.getNotifications({})).items.some(x => x.title === "تم رفض طلبك"));
});

// ---------- البلاغات ----------

test("البلاغ: التحقق، منع التكرار، قرار الإدارة بسبب إلزامي، وإنهاء الحماية", async () => {
  const w = await world();
  await w.as("a@test.local");
  await w.apply("activation", "act365");
  await w.as("b@test.local");
  fails(await w.client.submitReport({ phone: "711234567", reason_code: "غير-معتمد" }), "invalid_reason", "سبب غير معتمد");
  fails(await w.client.submitReport({ phone: "711234567", reason_code: "other" }), "reason_text_required", "سبب آخر بلا توضيح");
  fails(await w.client.submitReport({ phone: "711000000", reason_code: "mine" }), "report_not_allowed", "رقم غير محمي");
  must(await w.client.submitReport({ phone: "711234567", reason_code: "mine" }), "بلاغ");
  fails(await w.client.submitReport({ phone: "711234567", reason_code: "mine" }), "duplicate_report", "بلاغ مكرر");
  await w.as("a@test.local");
  fails(await w.client.submitReport({ phone: "711234567", reason_code: "mine" }), "report_not_allowed", "بلاغ على رقمي");

  const open = (await w.admin.listComplaints({})).reports;
  assert.equal(open.length, 1);
  assert.equal(open[0].status, "open");
  fails(await w.admin.decideComplaint({ report_id: open[0].id, decision: "no_action", reason: "  " }), "invalid_request", "قرار بلا سبب");
  must(await w.admin.decideComplaint({ report_id: open[0].id, decision: "terminate_protection", reason: "ثبت عدم الملكية" }), "إنهاء الحماية");
  assert.equal(await w.myStatus("711234567"), "inactive");
  assert.equal((await w.admin.listComplaints({})).reports[0].status, "resolved");
  fails(await w.admin.decideComplaint({ report_id: open[0].id, decision: "no_action", reason: "س" }), "invalid_request", "قرار ثانٍ");
  assert.ok((await w.client.getNotifications({})).items.some(x => x.title === "إنهاء الحماية"));
});

// ---------- الإشعارات والتنبيهات ----------

test("الإشعار اليدوي الجماعي والتنبيه اليدوي لرقم", async () => {
  const w = await world();
  await w.as("a@test.local");
  await w.apply("activation", "act365");
  await w.as("b@test.local");
  fails(await w.admin.createAdminNotification({ title: "", body: "x" }), "invalid_request", "إشعار بلا عنوان");
  assert.equal(must(await w.admin.createAdminNotification({ title: "إعلان", body: "نص" }), "جماعي").recipient_count, 2);
  assert.ok((await w.client.getNotifications({})).items.some(x => x.title === "إعلان"));

  const numberId = (await w.admin.listNumbers({})).numbers[0].id;
  fails(await w.admin.createAdminAlert({ number_id: "لا-يوجد", title: "ت", body: "ن" }), "invalid_relation", "رقم غير صالح");
  must(await w.admin.createAdminAlert({ number_id: numberId, title: "تنبيه", body: "نص" }), "تنبيه");
  fails(await w.client.listNumberAlerts({ phone: "711234567" }), "not_found", "تنبيهات رقم غيري");
  await w.as("a@test.local");
  assert.equal((await w.client.listNumberAlerts({ phone: "711234567" })).items.length, 1);
});

// ---------- التحقق في الإدارة ----------

test("الشركات والباقات ووسائل الدفع والمحتوى: التحقق من الإدخال", async () => {
  const w = await world();
  const base = { name: "شركة ب", prefixes: ["73"], number_lengths: [9], task_interval_days: 90, task_due_window_days: 10, is_active: true, create_first_task: true, reactivation_enabled: true, reactivation_days: 5 };
  fails(await w.admin.saveCompanySettings({ ...base, name: " " }), "validation_failed", "اسم فارغ");
  fails(await w.admin.saveCompanySettings({ ...base, prefixes: ["7a"] }), "validation_failed", "بادئة غير رقمية");
  fails(await w.admin.saveCompanySettings({ ...base, task_interval_days: 0 }), "validation_failed", "فاصل صفر");
  const noWindow = { ...base }; delete noWindow.task_due_window_days;
  fails(await w.admin.saveCompanySettings(noWindow), "validation_failed", "نافذة الظهور مطلوبة لشركة جديدة");
  fails(await w.admin.saveCompanySettings({ ...base, name: "شركة اختبار" }), "duplicate_name", "اسم مكرر");
  fails(await w.admin.saveCompanySettings({ ...base, prefixes: ["71"] }), "prefix_conflict", "بادئة مستخدمة");
  must(await w.admin.saveCompanySettings(base), "شركة صالحة");

  fails(await w.admin.savePackage({ company_id: w.company.id, operation_type: "activation", name: "ب", days: 0, price_yer: 10, active: true }), "validation_failed", "مدة صفر");
  fails(await w.admin.savePackage({ company_id: w.company.id, operation_type: "نوع", name: "ب", days: 5, price_yer: 10, active: true }), "validation_failed", "نوع عملية غير معروف");

  fails(await w.admin.savePaymentMethod({ name: "س", instructions: "" }), "validation_failed", "بلا تعليمات");
  fails(await w.admin.savePaymentMethod({ name: "س", instructions: "ت", reference_pattern: "(" }), "reference_pattern_invalid", "نمط غير صالح");
  fails(await w.admin.savePaymentMethod({ name: "س", instructions: "ت", account_number: "x".repeat(101) }), "validation_failed", "رقم حساب طويل");
  must(await w.admin.savePaymentMethod({ name: "تحويل", account_number: " 123 ", instructions: "ت", reference_required: false }), "وسيلة صالحة");
  const saved = (await w.admin.listPaymentMethods()).items.find(p => p.name === "تحويل");
  assert.equal(saved.account_number, "123");
  assert.equal(saved.reference_required, false);
  await w.as("a@test.local");
  const catalog = must(await w.client.getProtectionCatalog({ company_id: w.company.id, operation_type: "activation" }), "كتالوج");
  assert.equal(catalog.payment_methods.find(p => p.name === "تحويل").account_number, "123");

  fails(await w.admin.saveAppContent({ key: "غير-معتمد", body: "x" }), "validation_failed", "مفتاح غير معتمد");
  must(await w.admin.saveAppContent({ key: "terms", body: "الشروط" }), "حفظ نص");
  assert.equal((await w.admin.getAppContent({})).items.terms, "الشروط");
});

test("سجل التدقيق: الإجراء الإداري الناجح يُسجَّل والفاشل لا يُسجَّل", async () => {
  const w = await world();
  await w.as("a@test.local");
  const r = must(await w.submit("activation", "act365"), "إرسال");
  const before = (await w.admin.listAuditLog({})).items.length;
  fails(await w.admin.rejectRequest({ request_id: r.request_id, reason_code: "غير-معتمد" }), "invalid_reason", "رفض فاشل");
  assert.equal((await w.admin.listAuditLog({})).items.length, before);
  must(await w.admin.approveRequest({ request_id: r.request_id }), "اعتماد");
  const actions = Array.from((await w.admin.listAuditLog({})).items, x => x.action);
  assert.ok(actions.includes("request_approved"));
  assert.ok(actions.includes("company_created"));
  const summary = must(await w.admin.getDashboardSummary({}), "ملخص").summary;
  for (const k of ["pending_requests", "protected_numbers", "open_reports", "due_tasks", "customers", "approved_revenue_yer"]) assert.equal(typeof summary[k], "number", k);
  assert.equal(summary.approved_revenue_yer, 1000);
});

// ---------- قواعد العمل الملزمة (قسم 6 من CONTRACTS.md) ----------

timeTest("قاعدة 3/7: مهمة قادمة واحدة، والتنفيذ المبكر يجعل يوم التنفيذ مرجعًا، ولا تنفيذ مرتين", {}, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act365");
  let t = await w.tasks();
  assert.equal(t.length, 1);
  assert.equal(t[0].due_at, "2026-03-31T21:00:00.000Z"); // 04-01 بتوقيت عدن = يوم الاعتماد + 90
  w.setNow("2026-02-10T10:00:00+03:00");
  const first = await w.openTask();
  must(await w.admin.executeTask({ task_id: first.id }), "تنفيذ مبكر");
  fails(await w.admin.executeTask({ task_id: first.id }), "task_not_available", "تنفيذ ثانٍ");
  t = await w.tasks();
  assert.equal(t.filter(x => x.status !== "executed").length, 1);
  assert.equal((await w.openTask()).due_at, "2026-05-10T21:00:00.000Z"); // 05-11 بتوقيت عدن = 02-10 + 90
});

timeTest("قاعدة 5: لا مهمة خارج الاشتراك، والتمديد يستكملها بموعدها الأصلي", {}, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act30");
  assert.equal((await w.tasks()).length, 0);
  w.setNow("2026-01-15T10:00:00+03:00");
  await w.apply("extension", "ext365");
  const open = await w.openTask();
  assert.equal(open.due_at, "2026-03-31T21:00:00.000Z");
});

timeTest("قاعدة 8: المصادرة بعد نهاية يوم الموعد حتى أثناء الحماية، ولا تُعرض مهام الأرقام المصادَرة", {}, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act365");
  w.setNow("2026-04-01T23:59:59+03:00");
  assert.equal(await w.myStatus("711234567"), "protected");
  w.setNow("2026-04-02T00:00:00+03:00");
  assert.equal(await w.myStatus("711234567"), "confiscated");
  assert.equal((await w.tasks()).filter(x => x.status !== "executed").length, 0);
});

timeTest("الرقم المصادَر: لا تنفيذ لمهمته ولا إعادة جدولة لها", {}, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act365");
  const t = await w.openTask(); // تُجلب قبل المصادرة لأن قائمة المهام تخفي مهام المصادَر
  w.setNow("2027-01-02T10:00:00+03:00"); // بعد موعد المهمة (04-01) فالرقم مصادَر
  assert.equal(await w.myStatus("711234567"), "confiscated");
  fails(await w.admin.executeTask({ task_id: t.id }), "task_not_executable", "تنفيذ لرقم مصادَر");
  fails(await w.admin.rescheduleTask({ task_id: t.id, new_due_at: "2027-02-01" }), "task_not_reschedulable", "إعادة جدولة لرقم مصادَر");
});

timeTest("قاعدة 9: نافذة الظهور تحوّل المهمة إلى due قبل موعدها دون تغيير الموعد", { windowDays: 10 }, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act365"); // الموعد 04-01
  w.setNow("2026-03-21T10:00:00+03:00");
  assert.equal((await w.openTask()).status, "planned");
  assert.equal((await w.admin.getDashboardSummary({})).summary.due_tasks, 0);
  w.setNow("2026-03-22T00:00:01+03:00");
  const t = await w.openTask();
  assert.equal(t.status, "due");
  assert.equal(t.due_at, "2026-03-31T21:00:00.000Z");
  assert.equal((await w.admin.getDashboardSummary({})).summary.due_tasks, 1);
});

timeTest("قاعدة 10: التنشيط يُقبل في آخر يوم ويُرفض بعده برمز النافذة", {}, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act30");
  w.setNow("2026-03-27T23:59:59+03:00");
  must(await w.submit("reactivation", "react30"), "تنشيط في اليوم الأخير");
  w.setNow("2026-03-28T00:00:00+03:00");
  assert.equal(await w.myStatus("711234567"), "inactive");
  fails(await w.submit("reactivation", "react30"), "reactivation_window_closed", "بعد اليوم الأخير");
});

timeTest("قاعدة 10: التنشيط الموقوف للشركة يُرفض برمز reactivation_disabled", { reactivationEnabled: false }, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act30");
  w.setNow("2026-02-15T10:00:00+03:00");
  fails(await w.submit("reactivation", "react30"), "reactivation_disabled", "تنشيط موقوف");
});

timeTest("قاعدة 11: إعادة الجدولة — معاينة وتنفيذ، ورفض التاريخ السابق لليوم والتاريخ غير الصالح", {}, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act365");
  w.setNow("2026-03-20T10:00:00+03:00");
  const t = await w.openTask();
  fails(await w.admin.rescheduleTask({ task_id: t.id, new_due_at: "2026-03-01" }), "invalid_date", "تاريخ سابق لليوم");
  fails(await w.admin.rescheduleTask({ task_id: t.id, new_due_at: "ليس تاريخًا" }), "invalid_request", "تاريخ غير صالح");
  const prev = must(await w.admin.previewTaskReschedule({ task_id: t.id, new_due_at: "2026-04-11" }), "معاينة");
  assert.equal(prev.new_due_at, "2026-04-10T21:00:00.000Z");
  assert.equal(prev.confiscation_date, "2026-04-11T20:59:59.999Z");
  assert.ok(prev.affected_count >= 1);
  const done = must(await w.admin.rescheduleTask({ task_id: t.id, new_due_at: "2026-04-11" }), "إعادة جدولة");
  assert.equal(done.due_at, "2026-04-10T21:00:00.000Z");
  w.setNow("2026-04-05T10:00:00+03:00");
  assert.equal(await w.myStatus("711234567"), "protected"); // أُجِّلت المصادرة بإعادة الجدولة
});

timeTest("قاعدة 12: تغيير الفاصل للشركة يزيح المهمة القادمة بفرق الأيام", {}, async w => {
  await w.as("a@test.local");
  await w.apply("activation", "act365");
  const prev = must(await w.admin.previewCompanySettings({ company_id: w.company.id, task_interval_days: 100 }), "معاينة الفاصل");
  assert.equal(prev.delta_days, 10);
  assert.equal(prev.affected_tasks, 1);
  const c = (await w.admin.listCompanies({})).companies[0];
  must(await w.admin.saveCompanySettings({ ...c, task_interval_days: 100 }), "حفظ الفاصل");
  assert.equal((await w.openTask()).due_at, "2026-04-10T21:00:00.000Z"); // 04-01 + 10 أيام بتوقيت عدن = 04-11
});
