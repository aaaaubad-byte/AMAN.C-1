// اختبارات سلوكية لقاعدة المصادرة والمهام (docs/DECISIONS.md: D2/D4/D5/D6 + توضيحات 2026-11-01).
// تحمّل محوّل المحاكاة في بيئة vm معزولة بساعة قابلة للتحكم، وتستدعي عقود الخدمات كما تفعل الواجهات.
// التقويم ميلادي وتوقيت Asia/Aden (UTC+3).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const CODE = fs.readFileSync(new URL("../simulation/simulation-adapter.js", import.meta.url), "utf8");
const ADMIN = { email: "admin@simulation.local", password: "simulation-1234" };

// نافذة الظهور مطلوبة صراحةً لكل شركة جديدة (قرار 2026-11-01: بلا قيمة افتراضية)، لذا يمرّر الاختبار 0 صراحةً ما لم يُحدَّد غيره.
function setup(startIso = "2026-01-01T09:00:00+03:00", { windowDays = 0, reactivationDays = 5, reactivationEnabled = true } = {}) {
  let current = Date.parse(startIso);
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(current); }
    static now() { return current; }
  }
  const store = new Map();
  let services = null;
  const ctx = vm.createContext({
    Date: FakeDate, console, JSON, Math, Number, String, Array, Object, Set, Map, RegExp, Promise,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    location: { hostname: "localhost", pathname: "/" },
    window: { __AMAN_SIMULATION__: { enabled: true }, AMANServices: { register: s => { services = s; } } }
  });
  vm.runInContext(CODE, ctx);
  assert.ok(services, "لم يُسجَّل محوّل المحاكاة");
  const { admin, client } = services;
  const setNow = iso => { current = Date.parse(iso); };
  const must = (res, what) => { assert.equal(res.success, true, what + ": " + JSON.stringify(res)); return res; };

  must(admin.signInAdmin(ADMIN), "دخول المدير");
  const companyInput = {
    name: "شركة اختبار", prefixes: ["71"], number_lengths: [9], task_interval_days: 90,
    is_active: true, create_first_task: true, reactivation_enabled: reactivationEnabled, reactivation_days: reactivationDays,
    task_due_window_days: windowDays
  };
  const company = must(admin.saveCompanySettings(companyInput), "إضافة شركة").company;
  const pkgs = {};
  [["act365", "activation", 365], ["act120", "activation", 120], ["act90", "activation", 90], ["act30", "activation", 30], ["ext365", "extension", 365], ["react30", "reactivation", 30]].forEach(([k, op, days]) => {
    admin.savePackage({ company_id: company.id, operation_type: op, name: k, days, price_yer: 1000, active: true });
  });
  admin.listPackages().items.forEach(p => { pkgs[p.name] = p.id; });
  must(admin.savePaymentMethod({ name: "وسيلة اختبار", instructions: "تعليمات", reference_required: true }), "وسيلة دفع");
  const pay = admin.listPaymentMethods().items[0];
  must(client.signUp({ email: "c@test.local", password: "1234" }), "إنشاء حساب عميل");

  const request = (op, pkg, phone) => client.submitProtectionRequest({
    phone, operation_type: op, company_id: company.id, package_id: pkgs[pkg], payment_method_id: pay.id, payment_reference: "REF-" + Math.random()
  });
  const runOp = (op, pkg, phone = "711234567") => {
    const r = must(request(op, pkg, phone), "طلب " + op);
    must(admin.approveRequest({ request_id: r.request_id }), "اعتماد " + op);
  };
  const tasks = () => admin.listTasks().tasks;
  const pending = () => tasks().find(t => t.status !== "executed");
  const numStatus = () => client.listMyNumbers().items[0].status;
  return { admin, client, company, setNow, must, request, runOp, tasks, pending, numStatus };
}

// 04-01 00:00 بتوقيت عدن = 03-31T21:00Z
test("اشتراك جديد: المهمة الأولى = يوم الاعتماد + الفاصل (90 يومًا)", () => {
  const s = setup();
  s.runOp("activation", "act365");
  const t = s.tasks();
  assert.equal(t.length, 1);
  assert.equal(t[0].due_at, "2026-03-31T21:00:00.000Z");
  assert.equal(t[0].status, "planned");
});

test("التنفيذ داخل الفاصل جائز مبكرًا: تُسجَّل مكتملة والتالية = يوم التنفيذ + الفاصل", () => {
  const s = setup();
  s.runOp("activation", "act365");
  s.setNow("2026-02-10T10:00:00+03:00");
  const first = s.pending();
  assert.equal(first.status, "planned"); // قبل الموعد وخارج نافذة الظهور (الافتراضي 0)
  s.must(s.admin.executeTask({ task_id: first.id }), "تنفيذ مبكر");
  const open = s.tasks().filter(t => t.status !== "executed");
  assert.equal(open.length, 1);
  assert.equal(open[0].due_at, "2026-05-10T21:00:00.000Z"); // 05-11 بتوقيت عدن = 02-10 + 90
  assert.equal(s.tasks().filter(t => t.status === "executed").length, 1);
  assert.notEqual(open[0].id, first.id);
});

test("التنفيذ في يوم الموعد يعيد الحساب من يوم التنفيذ، ولا تبقى مهمة غير منفذة قديمة", () => {
  const s = setup();
  s.runOp("activation", "act365");
  s.setNow("2026-04-01T10:00:00+03:00");
  const first = s.pending();
  assert.equal(first.status, "due");
  s.must(s.admin.executeTask({ task_id: first.id }), "تنفيذ");
  const open = s.tasks().filter(t => t.status !== "executed");
  assert.equal(open.length, 1);
  assert.equal(open[0].due_at, "2026-06-29T21:00:00.000Z"); // 06-30 بتوقيت عدن
});

test("نافذة الظهور: تظهر المهمة «مستحقة» قبل موعدها بعدد الأيام المحدد فقط", () => {
  const s = setup("2026-01-01T09:00:00+03:00", { windowDays: 10 });
  s.runOp("activation", "act365"); // الموعد 04-01
  s.setNow("2026-03-21T10:00:00+03:00"); // قبل الموعد بـ 11 يومًا
  assert.equal(s.pending().status, "planned");
  assert.equal(s.admin.getDashboardSummary().summary.due_tasks, 0);
  s.setNow("2026-03-22T00:00:01+03:00"); // قبل الموعد بـ 10 أيام
  assert.equal(s.pending().status, "due");
  assert.equal(s.admin.getDashboardSummary().summary.due_tasks, 1);
  assert.equal(s.pending().due_window_days, 10);
});

test("نافذة الظهور لا تغيّر تاريخ المصادرة (يبقى آخر يوم في الفاصل)", () => {
  const s = setup("2026-01-01T09:00:00+03:00", { windowDays: 10 });
  s.runOp("activation", "act365");
  s.setNow("2026-04-01T23:59:59+03:00");
  assert.equal(s.numStatus(), "protected");
  s.setNow("2026-04-02T00:00:00+03:00");
  assert.equal(s.numStatus(), "confiscated");
});

test("التحقق من نافذة الظهور: سالبة مرفوضة، وغيابها في التعديل يُبقي القيمة الحالية", () => {
  const s = setup("2026-01-01T09:00:00+03:00", { windowDays: 7 });
  const base = { id: s.company.id, name: "شركة اختبار", prefixes: ["71"], number_lengths: [9], task_interval_days: 90, is_active: true, create_first_task: true, reactivation_enabled: true, reactivation_days: 5 };
  const bad = s.admin.saveCompanySettings({ ...base, task_due_window_days: -1 });
  assert.equal(bad.success, false);
  assert.equal(bad.code, "validation_failed");
  s.must(s.admin.saveCompanySettings(base), "حفظ دون نافذة");
  assert.equal(s.admin.listCompanies().companies[0].task_due_window_days, 7);
});

test("تجاوز تاريخ المصادرة دون تنفيذ ← الرقم مصادَر؛ وقبل انتهاء اليوم لا يزال محميًا", () => {
  const s = setup();
  s.runOp("activation", "act365");
  s.setNow("2026-04-01T23:59:59+03:00");
  assert.equal(s.numStatus(), "protected");
  s.setNow("2026-04-02T00:00:00+03:00");
  assert.equal(s.numStatus(), "confiscated");
});

test("إعادة الجدولة بالزيادة تؤجل المصادرة وتزيح القادمة بالمقدار نفسه", () => {
  const s = setup();
  s.runOp("activation", "act365");
  s.setNow("2026-03-20T10:00:00+03:00");
  const t = s.pending();
  const prev = s.must(s.admin.previewTaskReschedule({ task_id: t.id, new_due_at: "2026-04-11" }), "معاينة");
  assert.ok(prev.affected_count >= 2);
  s.must(s.admin.rescheduleTask({ task_id: t.id, new_due_at: "2026-04-11" }), "إعادة جدولة");
  assert.equal(s.pending().due_at, "2026-04-10T21:00:00.000Z"); // 04-11 بتوقيت عدن
  s.setNow("2026-04-05T10:00:00+03:00");
  assert.equal(s.numStatus(), "protected"); // كان سيُصادَر لولا إعادة الجدولة؟ لا: 04-05 بعد الموعد الأصلي
  s.setNow("2026-04-11T10:00:00+03:00");
  s.must(s.admin.executeTask({ task_id: s.pending().id }), "تنفيذ");
  assert.equal(s.pending().due_at, "2026-07-09T21:00:00.000Z"); // 07-10 بتوقيت عدن
});

test("إعادة الجدولة بالنقصان جائزة ما لم تسبق اليوم", () => {
  const s = setup();
  s.runOp("activation", "act365");
  s.setNow("2026-03-01T10:00:00+03:00");
  const t = s.pending();
  s.must(s.admin.rescheduleTask({ task_id: t.id, new_due_at: "2026-03-10" }), "تقديم الموعد");
  assert.equal(s.pending().due_at, "2026-03-09T21:00:00.000Z"); // 03-10 بتوقيت عدن
  s.setNow("2026-03-11T00:00:00+03:00");
  assert.equal(s.numStatus(), "confiscated"); // الموعد الجديد فاته
});

test("لا إعادة جدولة إلى تاريخ سابق لليوم", () => {
  const s = setup();
  s.runOp("activation", "act365");
  s.setNow("2026-03-20T10:00:00+03:00");
  const res = s.admin.rescheduleTask({ task_id: s.pending().id, new_due_at: "2026-03-01" });
  assert.equal(res.success, false);
  assert.equal(res.code, "invalid_date");
});

// ---- قرار 2026-11-01: لا تُنشأ مهمة خارج نطاق الاشتراك؛ والتنشيط/التمديد يستكملان المخطط من آخر مهمة منفذة + الفاصل ----

test("لا مهمة خارج الاشتراك: فاصل (90) أكبر من مدة الاشتراك (30) ← لا مهام، وتاريخ المصادرة = بداية المخطط + الفاصل", () => {
  const s = setup();
  s.runOp("activation", "act30"); // الحماية حتى 01-31 والموعد المحسوب 04-01 خارج الاشتراك
  assert.equal(s.tasks().length, 0);
  s.setNow("2026-02-15T10:00:00+03:00");
  assert.equal(s.numStatus(), "inactive");
  s.setNow("2026-04-01T23:59:59+03:00");
  assert.equal(s.numStatus(), "inactive"); // لم يُصادَر بعد: آخر يوم 04-01
  s.setNow("2026-04-02T00:00:00+03:00");
  assert.equal(s.numStatus(), "confiscated");
});

test("D6 (محدَّث): التنشيط بعد انتهاء الاشتراك يستكمل المخطط من المرجع نفسه ولا يُنشئ مهمة تتجاوز الاشتراك الجديد", () => {
  const s = setup();
  s.runOp("activation", "act30"); // الحماية حتى 01-31، لا مهام
  s.setNow("2026-02-15T10:00:00+03:00");
  assert.equal(s.numStatus(), "inactive");
  s.runOp("reactivation", "react30"); // الحماية الجديدة حتى 03-17، والموعد المحسوب 04-01 بعدها
  assert.equal(s.numStatus(), "protected");
  assert.equal(s.tasks().length, 0);
  s.setNow("2026-03-18T10:00:00+03:00");
  assert.equal(s.numStatus(), "inactive"); // لا يزال تاريخ المصادرة 04-01
  s.setNow("2026-04-02T00:00:00+03:00");
  assert.equal(s.numStatus(), "confiscated");
});

test("التنفيذ داخل الاشتراك ثم نهاية الاشتراك قبل موعد التالية: لا مهمة جديدة، وتاريخ المصادرة = يوم آخر مهمة منفذة + الفاصل", () => {
  const s = setup();
  s.runOp("activation", "act120"); // الحماية حتى 05-01
  s.setNow("2026-02-10T10:00:00+03:00");
  s.must(s.admin.executeTask({ task_id: s.pending().id }), "تنفيذ مبكر"); // التالية المحسوبة 05-11 بعد نهاية الاشتراك
  assert.equal(s.tasks().filter(t => t.status !== "executed").length, 0);
  assert.equal(s.tasks().filter(t => t.status === "executed").length, 1);
  s.setNow("2026-05-02T10:00:00+03:00");
  assert.equal(s.numStatus(), "inactive");
  s.setNow("2026-05-11T23:59:59+03:00");
  assert.equal(s.numStatus(), "inactive");
  s.setNow("2026-05-12T00:00:00+03:00");
  assert.equal(s.numStatus(), "confiscated");
});

test("التنشيط بعد انتهاء الاشتراك يستكمل المخطط: تُنشأ المهمة من آخر مهمة منفذة + الفاصل إن صارت ضمن الاشتراك الجديد", () => {
  const s = setup();
  s.runOp("activation", "act120");
  s.setNow("2026-02-10T10:00:00+03:00");
  s.must(s.admin.executeTask({ task_id: s.pending().id }), "تنفيذ مبكر");
  s.setNow("2026-05-02T10:00:00+03:00"); // غير نشط؛ آخر يوم للتنشيط 05-06 (05-11 − 5)
  assert.equal(s.numStatus(), "inactive");
  s.runOp("reactivation", "react30"); // الحماية الجديدة حتى 06-01
  assert.equal(s.numStatus(), "protected");
  const open = s.tasks().filter(t => t.status !== "executed");
  assert.equal(open.length, 1);
  assert.equal(open[0].due_at, "2026-05-10T21:00:00.000Z"); // 05-11 بتوقيت عدن = 02-10 + 90
});

test("التمديد يستكمل المخطط: تُنشأ المهمة الناقصة حين يصير موعدها ضمن الاشتراك الممدَّد", () => {
  const s = setup();
  s.runOp("activation", "act30");
  assert.equal(s.tasks().length, 0);
  s.setNow("2026-01-15T10:00:00+03:00");
  s.runOp("extension", "ext365");
  const open = s.tasks().filter(t => t.status !== "executed");
  assert.equal(open.length, 1);
  assert.equal(open[0].due_at, "2026-03-31T21:00:00.000Z"); // 04-01 بتوقيت عدن = بداية الاشتراك + 90
});

test("D6: التنشيط بعد تجاوز تاريخ المصادرة مرفوض", () => {
  const s = setup();
  s.runOp("activation", "act30");
  s.setNow("2026-04-02T10:00:00+03:00");
  assert.equal(s.numStatus(), "confiscated");
  const res = s.request("reactivation", "react30", "711234567");
  assert.equal(res.success, false);
  assert.equal(res.code, "operation_not_allowed");
});

test("D5: لا تنفيذ للمهمة بعد انتهاء الاشتراك (الرقم غير نشط)", () => {
  const s = setup();
  s.runOp("activation", "act90"); // الحماية حتى 04-01 09:00 والموعد 04-01 (ضمن الاشتراك فتُنشأ المهمة)
  s.setNow("2026-04-01T10:00:00+03:00"); // يوم الموعد، والاشتراك منتهٍ، ولم يُصادَر بعد
  assert.equal(s.numStatus(), "inactive");
  const res = s.admin.executeTask({ task_id: s.pending().id });
  assert.equal(res.success, false);
  assert.equal(res.code, "task_not_executable");
});

// ---- قواعد معتمدة 2026-11-01 (التنشيط بمعنى «آخر موعد قبل المصادرة»، نافذة الظهور المطلوبة، قيود إعادة الجدولة) ----

test("نافذة الظهور مطلوبة لشركة جديدة: الغياب أو null أو السالب أو الكسر مرفوض", () => {
  const s = setup();
  const base = { name: "شركة ب", prefixes: ["73"], number_lengths: [9], task_interval_days: 90, is_active: true, create_first_task: true, reactivation_enabled: true, reactivation_days: 5 };
  for (const bad of [undefined, null, -1, 1.5, "10"]) {
    const input = { ...base };
    if (bad !== undefined) input.task_due_window_days = bad;
    const res = s.admin.saveCompanySettings(input);
    assert.equal(res.success, false, "القيمة " + String(bad));
    assert.equal(res.code, "validation_failed");
  }
  s.must(s.admin.saveCompanySettings({ ...base, task_due_window_days: 0 }), "الصفر صالح");
});

test("التنشيط: آخر يوم = تاريخ المصادرة − المهلة؛ يُقبل في اليوم الأخير ويُرفض بعده بالرمز الواضح", () => {
  const s = setup(); // المهلة 5، موعد المصادرة 04-01 ← آخر يوم للتنشيط 03-27
  s.runOp("activation", "act30"); // الحماية حتى 01-31
  s.setNow("2026-03-27T23:59:59+03:00");
  assert.equal(s.numStatus(), "inactive");
  s.must(s.request("reactivation", "react30", "711234567"), "طلب في اليوم الأخير");
  s.setNow("2026-03-28T00:00:00+03:00");
  assert.equal(s.numStatus(), "inactive"); // لم يُصادَر بعد
  const res = s.request("reactivation", "react30", "711234567");
  assert.equal(res.success, false);
  assert.equal(res.code, "reactivation_window_closed");
  s.setNow("2026-04-02T00:00:00+03:00");
  assert.equal(s.numStatus(), "confiscated");
});

test("التنشيط بمهلة 0: مسموح حتى يوم المصادرة نفسه ومرفوض بعده", () => {
  const s = setup("2026-01-01T09:00:00+03:00", { reactivationDays: 0 });
  s.runOp("activation", "act30");
  s.setNow("2026-04-01T23:30:00+03:00"); // يوم المصادرة نفسه
  assert.equal(s.numStatus(), "inactive");
  s.must(s.request("reactivation", "react30", "711234567"), "تنشيط في يوم المصادرة");
  s.setNow("2026-04-02T00:00:00+03:00");
  const res = s.request("reactivation", "react30", "711234567");
  assert.equal(res.success, false);
  assert.equal(res.code, "operation_not_allowed"); // مصادَر لا غير نشط
});

test("مفتاح السماح بالتنشيط: التنشيط مرفوض برمز reactivation_disabled عند إيقافه", () => {
  const s = setup("2026-01-01T09:00:00+03:00", { reactivationEnabled: false });
  s.runOp("activation", "act30");
  s.setNow("2026-02-15T10:00:00+03:00");
  const res = s.request("reactivation", "react30", "711234567");
  assert.equal(res.success, false);
  assert.equal(res.code, "reactivation_disabled");
});

test("التنشيط لا يغيّر تاريخ المصادرة: المهمة تُنشأ بموعدها الأصلي نفسه إن صارت ضمن الاشتراك الجديد", () => {
  const s = setup();
  s.runOp("activation", "act30"); // لا مهام (الموعد 04-01 خارج الاشتراك)
  s.setNow("2026-03-20T10:00:00+03:00"); // غير نشط وقبل آخر يوم للتنشيط 03-27
  assert.equal(s.numStatus(), "inactive");
  s.runOp("reactivation", "react30"); // الحماية الجديدة حتى 04-19 فتشمل الموعد 04-01
  const t = s.pending();
  assert.equal(t.due_at, "2026-03-31T21:00:00.000Z"); // الموعد الأصلي نفسه: 04-01 بتوقيت عدن
  assert.equal(t.confiscation_date, "2026-04-01T20:59:59.999Z");
});

test("إعادة الجدولة: اليوم نفسه مسموح (التقديم حتى اليوم)", () => {
  const s = setup();
  s.runOp("activation", "act365");
  s.setNow("2026-03-20T10:00:00+03:00");
  s.must(s.admin.rescheduleTask({ task_id: s.pending().id, new_due_at: "2026-03-20" }), "إعادة جدولة إلى اليوم");
  assert.equal(s.pending().due_at, "2026-03-19T21:00:00.000Z"); // 03-20 بتوقيت عدن
});

test("إعادة الجدولة: المثال المعتمد — موعد 20 نوفمبر واليوم 1 نوفمبر يجوز نقله إلى 10 نوفمبر", () => {
  const s = setup("2026-09-21T09:00:00+03:00");
  s.runOp("activation", "act365"); // الموعد = 09-21 + 90 = 12-20 ؛ نضبط الموعد بإعادة جدولة أولًا
  s.must(s.admin.rescheduleTask({ task_id: s.pending().id, new_due_at: "2026-11-20" }), "ضبط الموعد 20 نوفمبر");
  s.setNow("2026-11-01T10:00:00+03:00");
  s.must(s.admin.rescheduleTask({ task_id: s.pending().id, new_due_at: "2026-11-10" }), "تقديم إلى 10 نوفمبر");
  assert.equal(s.pending().due_at, "2026-11-09T21:00:00.000Z");
  const res = s.admin.rescheduleTask({ task_id: s.pending().id, new_due_at: "2026-10-31" });
  assert.equal(res.success, false);
  assert.equal(res.code, "invalid_date");
});

test("إعادة الجدولة للأرقام المحمية فقط: رقم غير نشط مرفوض بـ task_not_reschedulable", () => {
  const s = setup();
  s.runOp("activation", "act90"); // الموعد 04-01 ضمن الاشتراك فتُنشأ المهمة
  s.setNow("2026-04-01T10:00:00+03:00"); // الاشتراك منتهٍ ولم يُصادَر بعد
  assert.equal(s.numStatus(), "inactive");
  const res = s.admin.rescheduleTask({ task_id: s.pending().id, new_due_at: "2026-04-20" });
  assert.equal(res.success, false);
  assert.equal(res.code, "task_not_reschedulable");
  const prev = s.admin.previewTaskReschedule({ task_id: s.pending().id, new_due_at: "2026-04-20" });
  assert.equal(prev.code, "task_not_reschedulable");
});

test("إعادة الجدولة: تاريخ غير صالح مرفوض", () => {
  const s = setup();
  s.runOp("activation", "act365");
  const res = s.admin.rescheduleTask({ task_id: s.pending().id, new_due_at: "ليس تاريخًا" });
  assert.equal(res.success, false);
  assert.equal(res.code, "invalid_request");
});

// ---- وسائل الدفع (D9): الاسم، رقم الحساب، التعليمات، اشتراط المرجع ----
test("D9: رقم الحساب يُحفظ ويُعاد للإدارة والعميل، ويُقصّ، ويرفض الطويل جدًا", () => {
  const s = setup();
  s.must(s.admin.savePaymentMethod({ name: "تحويل بنكي", account_number: "  123-456-789  ", instructions: "حوّل ثم أدخل المرجع", reference_required: false, active: true }), "حفظ");
  const saved = s.admin.listPaymentMethods().items.find(i => i.name === "تحويل بنكي");
  assert.equal(saved.account_number, "123-456-789");
  assert.equal(saved.reference_required, false);
  const catalog = s.client.getProtectionCatalog({ company_id: s.company.id, operation_type: "activation" });
  const m = catalog.payment_methods.find(i => i.name === "تحويل بنكي");
  assert.equal(m.account_number, "123-456-789");
  assert.equal(m.reference_required, false);
  s.must(s.admin.savePaymentMethod({ id: saved.id, name: "تحويل بنكي", instructions: "حوّل ثم أدخل المرجع", reference_required: false, active: true }), "تعديل بلا رقم حساب يمسحه");
  assert.equal(s.admin.listPaymentMethods().items.find(i => i.id === saved.id).account_number, "");
  const bad = s.admin.savePaymentMethod({ name: "س", account_number: "x".repeat(101), instructions: "ت", reference_required: true, active: true });
  assert.equal(bad.success, false);
  assert.equal(bad.code, "validation_failed");
});

test("D9: وسيلة بلا اشتراط مرجع تقبل طلبًا بلا مرجع، وبالاشتراط يُرفض", () => {
  const s = setup();
  s.must(s.admin.savePaymentMethod({ name: "بلا مرجع", instructions: "ت", reference_required: false, active: true }), "حفظ");
  const free = s.admin.listPaymentMethods().items.find(i => i.name === "بلا مرجع");
  const mk = (pay, ref) => s.client.submitProtectionRequest({ phone: "711234567", operation_type: "activation", company_id: s.company.id, package_id: s.admin.listPackages().items.find(p => p.name === "act365").id, payment_method_id: pay, payment_reference: ref });
  assert.equal(mk(s.admin.listPaymentMethods().items.find(i => i.name === "وسيلة اختبار").id, "").code, "reference_required");
  s.must(mk(free.id, ""), "طلب بلا مرجع");
});
