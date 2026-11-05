import test from "node:test";
import assert from "node:assert/strict";
import { skip, launch, open, adminLogin, go, seed, submitRequest, approve, breakService, adenToday, adenPlusDays } from "./browser-helpers.mjs";

/* اختبارات مسارات الإدارة من بداية التدفق إلى نهايته في Chromium حقيقي مع محوّل المحاكاة المحلي.
   كل اختبار يتحقق من الواجهة ومن حالة الخدمة، ويتأكد من غياب أخطاء JavaScript. */
let browser;
test.before(async () => { browser = await launch(); });
test.after(async () => { if (browser) await browser.close(); });

const view = page => page.locator("#admin-generic-view");
const T = { timeout: 5000 };
async function start(path = "/admin/", opts) {
  const t = await open(browser, path, opts);
  await adminLogin(t.page);
  return t;
}

const SECTIONS = ["requests", "numbers", "customers", "tasks", "followup", "complaints", "reports", "settings", "notifications", "alerts", "packages", "payments", "content", "audit", "account"];

test("D1: الشريط السفلي خمسة تبويبات والمزيد يفتح بقية الأقسام ويعود إليها", { skip }, async () => {
  const t = await start();
  const tabs = await t.page.$$eval("#admin-bottom-nav [data-admin-tab]", n => n.map(x => x.dataset.adminTab));
  assert.deepEqual(tabs, ["dashboard", "requests", "numbers", "customers", "more"]);
  await t.page.click("[data-admin-tab=more]");
  await t.page.waitForSelector("[data-more-section]");
  assert.equal(await t.page.locator("#section-title").innerText(), "المزيد");
  assert.ok((await t.page.locator("[data-more-section]").count()) >= 12);
  assert.equal(await t.page.locator("[data-admin-tab=more]").getAttribute("class").then(c => c.includes("active")), true);
  await t.page.click("[data-more-section=followup]");
  await t.page.waitForFunction(() => document.getElementById("section-title").textContent === "نافذة الظهور والمتابعة");
  assert.equal(await t.page.locator("[data-admin-tab=more]").getAttribute("class").then(c => c.includes("active")), true);
  await t.page.click("#admin-back");
  await t.page.waitForFunction(() => document.getElementById("section-title").textContent === "المزيد");
  await t.page.click("[data-admin-tab=requests]");
  await t.page.waitForFunction(() => document.getElementById("section-title").textContent === "الطلبات");
  assert.equal(await t.page.locator("[data-admin-tab=requests]").getAttribute("class").then(c => c.includes("active")), true);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("كل أقسام الإدارة على شاشة هاتف وبحالة فارغة: بلا أخطاء، بلا تمرير أفقي، وبلا تحميل معلّق", { skip }, async () => {
  const t = await start("/admin/", { viewport: { width: 360, height: 740 } });
  for (const name of SECTIONS) {
    await go(t.page, name);
    await t.page.waitForTimeout(350);
    const visible = name === "requests" ? "#requests-list-view" : "#admin-generic-view";
    const text = (await t.page.locator(visible).innerText()).trim();
    assert.ok(text.length > 0, "القسم " + name + " فارغ تمامًا بلا حالة فراغ");
    assert.doesNotMatch(text, /جارٍ تحميل/, "القسم " + name + " بقي في التحميل");
    assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "تمرير أفقي في " + name);
  }
  assert.equal(await t.page.evaluate(() => document.documentElement.dir), "rtl");
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("الباقات: حالة فراغ ← إضافة بتحقق ← ظهور ← تعديل التعطيل", { skip }, async () => {
  const t = await start();
  await seed(t.page);
  await t.page.evaluate(async () => { for (const p of (await window.AMANAdminServices.listPackages()).items) await window.AMANAdminServices.savePackage({ ...p, active: false }); });
  await go(t.page, "packages");
  await t.page.waitForSelector("text=إضافة باقة");
  await t.page.click("text=إضافة باقة");
  await t.page.getByLabel("اسم الباقة").fill("");
  await t.page.click("button:has-text('حفظ الباقة')");
  await t.page.waitForSelector("text=أدخل شركة واسمًا ومدة وسعرًا صحيحًا");
  const before = (await t.page.evaluate(() => window.AMANAdminServices.listPackages())).items.length;
  await t.page.getByLabel("اسم الباقة").fill("باقة جديدة");
  await t.page.getByLabel("المدة بالأيام").fill("90");
  await t.page.getByLabel("السعر بالريال اليمني").fill("2500");
  await t.page.click("button:has-text('حفظ الباقة')");
  await t.page.waitForSelector("text=باقة جديدة", T);
  const after = (await t.page.evaluate(() => window.AMANAdminServices.listPackages())).items;
  assert.equal(after.length, before + 1);
  const saved = after.find(p => p.name === "باقة جديدة");
  assert.equal(saved.days, 90);
  assert.equal(saved.price_yer, 2500);
  // تعديل: تعطيل
  await view(t.page).locator("section", { hasText: "باقة جديدة" }).getByRole("button", { name: "تعديل الباقة" }).click();
  await t.page.getByLabel("الحالة").selectOption("false");
  await t.page.click("button:has-text('حفظ الباقة')");
  await t.page.waitForSelector("text=معطلة");
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listPackages())).items.find(p => p.name === "باقة جديدة").active, false);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("وسائل الدفع (D9): حالة فراغ ← إضافة بالحقول الأربعة ← عرض رقم الحساب ← تعديل ← ظهور للعميل", { skip }, async () => {
  const t = await start();
  await go(t.page, "payments");
  await t.page.waitForSelector("text=لم تُضَف وسائل دفع بعد");
  await t.page.click("text=إضافة وسيلة دفع");
  await t.page.getByLabel("اسم الوسيلة").fill("حوالة");
  await t.page.getByLabel("رقم الحساب").fill("123-456");
  await t.page.getByLabel("تعليمات الدفع").fill("حوّل ثم أدخل المرجع");
  await t.page.getByLabel("اشتراط مرجع الدفع").selectOption("false");
  await t.page.click("button:has-text('حفظ وسيلة الدفع')");
  await t.page.waitForSelector("text=رقم الحساب: 123-456", T);
  assert.match(await view(t.page).innerText(), /مرجع الدفع غير مطلوب/);
  const saved = (await t.page.evaluate(() => window.AMANAdminServices.listPaymentMethods())).items[0];
  assert.equal(saved.account_number, "123-456");
  assert.equal(saved.reference_required, false);
  // فشل: اسم فارغ
  await t.page.click("button:has-text('تعديل')");
  await t.page.getByLabel("اسم الوسيلة").fill("");
  await t.page.click("button:has-text('حفظ وسيلة الدفع')");
  await t.page.waitForSelector("text=الاسم والتعليمات مطلوبان");
  await t.page.getByLabel("اسم الوسيلة").fill("حوالة بنكية");
  await t.page.getByLabel("رقم الحساب").fill("999");
  await t.page.click("button:has-text('حفظ وسيلة الدفع')");
  await t.page.waitForSelector("text=رقم الحساب: 999", T);
  // العميل يرى رقم الحساب
  await t.page.evaluate(() => window.AMANClientServices.signUp({ email: "x@test.local", password: "1234" }));
  const catalog = await t.page.evaluate(() => window.AMANClientServices.getProtectionCatalog({}));
  assert.equal(catalog.payment_methods[0].account_number, "999");
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("الطلبات: اعتماد من القائمة إلى التفاصيل إلى المعاينة والتأكيد ثم تحديث الواجهة والنجاح بعد النجاح", { skip }, async () => {
  const t = await start();
  await go(t.page, "requests");
  await t.page.waitForSelector("text=لا توجد طلبات مطابقة");
  await seed(t.page);
  const id = await submitRequest(t.page);
  await t.page.click("#requests-refresh");
  await t.page.waitForSelector(".admin-request-card", T);
  await t.page.click(".admin-request-card");
  await t.page.waitForSelector("text=مراجعة أثر الاعتماد", T);
  await t.page.click("text=مراجعة أثر الاعتماد");
  await t.page.waitForSelector("dialog button:has-text('تأكيد الاعتماد')", T);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listRequests({ status: "pending" }))).requests.length, 1, "لا اعتماد قبل التأكيد");
  await t.page.click("dialog button:has-text('تأكيد الاعتماد')");
  await t.page.waitForSelector("dialog >> text=أكد الخادم اعتماد الطلب", T);
  await t.page.click("dialog button:has-text('إغلاق')");
  assert.equal(await t.page.locator("dialog[open]").count(), 0, "النافذة تُغلق بعد النجاح");
  await t.page.waitForFunction(() => /معتمد/.test(document.getElementById("request-detail-content").innerText), null, T);
  const after = await t.page.evaluate(id => window.AMANAdminServices.getRequestDetails({ request_id: id }), id);
  assert.equal(after.request.status, "approved");
  assert.match(await t.page.locator("#request-detail-content").innerText(), /معتمد/);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listNumbers({}))).numbers[0].protection_status, "protected");
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("الطلبات: فشل الاعتماد لا يُظهر نجاحًا ويبقى الطلب قيد المراجعة", { skip }, async () => {
  const t = await start();
  await seed(t.page);
  const id = await submitRequest(t.page);
  await go(t.page, "requests");
  await t.page.waitForSelector(".admin-request-card", T);
  await t.page.click(".admin-request-card");
  await breakService(t.page, "approveRequest"); // النافذة تلتقط الخدمة عند فتحها، فنكسر قبل الفتح
  await t.page.click("text=مراجعة أثر الاعتماد");
  await t.page.waitForSelector("dialog button:has-text('تأكيد الاعتماد')", T);
  await t.page.click("dialog button:has-text('تأكيد الاعتماد')");
  await t.page.waitForSelector("dialog >> text=لم يصل تأكيد موثوق", T);
  assert.doesNotMatch(await t.page.locator("dialog").innerText(), /أكد الخادم/);
  assert.equal((await t.page.evaluate(id => window.AMANAdminServices.getRequestDetails({ request_id: id }), id)).request.status, "pending");
  await t.done();
});

test("الطلبات: رفض بسبب معتمد ثم ظهور الحالة، ومنع الرفض دون سبب", { skip }, async () => {
  const t = await start();
  await seed(t.page);
  const id = await submitRequest(t.page);
  await go(t.page, "requests");
  await t.page.waitForSelector(".admin-request-card", T);
  await t.page.click(".admin-request-card");
  await t.page.click("text=رفض الطلب");
  await t.page.waitForSelector("dialog button:has-text('تأكيد الرفض')", T);
  await t.page.click("dialog button:has-text('تأكيد الرفض')"); // التحقق الأصلي للمتصفح يمنع الإرسال دون سبب
  assert.equal(await t.page.locator("dialog select").evaluate(s => s.validity.valueMissing), true);
  assert.equal((await t.page.evaluate(id => window.AMANAdminServices.getRequestDetails({ request_id: id }), id)).request.status, "pending");
  await t.page.locator("dialog select").selectOption("amount_short");
  await t.page.click("dialog button:has-text('تأكيد الرفض')");
  await t.page.waitForSelector("dialog >> text=أكد الخادم رفض الطلب", T);
  const d = (await t.page.evaluate(id => window.AMANAdminServices.getRequestDetails({ request_id: id }), id)).request;
  assert.equal(d.status, "rejected");
  assert.equal(d.reject_reason, "amount_short");
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("الأرقام والتقارير: رقم معتمد يظهر بحالته وتفاصيله ويدخل ملخص الإيرادات", { skip }, async () => {
  const t = await start();
  await seed(t.page);
  await approve(t.page, await submitRequest(t.page));
  await go(t.page, "numbers");
  await t.page.waitForSelector("text=711234567", T);
  await t.page.click("text=711234567");
  await t.page.getByText("محمي", { exact: true }).first().waitFor(T);
  await go(t.page, "reports");
  await t.page.waitForSelector("text=ملخص الإيرادات المعتمدة", T);
  assert.match(await view(t.page).innerText(), /1 عملية|عدد العمليات/);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("العملاء: تعطيل بسبب ثم إعادة تفعيل، وتحديث الحالة في الواجهة والخدمة", { skip }, async () => {
  const t = await start();
  await go(t.page, "customers");
  await t.page.waitForSelector("text=لا يوجد عملاء مطابقون");
  await seed(t.page);
  await t.page.click("text=تحديث العملاء");
  await t.page.waitForSelector("text=c@test.local", T);
  await t.page.click("text=c@test.local");
  await t.page.click("button:has-text('تعطيل الحساب')");
  await t.page.locator("dialog textarea").fill("اختبار");
  await t.page.click("dialog button:has-text('تأكيد تعطيل')");
  await t.page.waitForSelector("text=تم تحديث حالة الحساب", T);
  const status = () => t.page.evaluate(() => window.AMANAdminServices.listCustomers({}).then(r => r.customers[0].status));
  assert.equal(await status(), "disabled");
  await t.page.keyboard.press("Escape").catch(() => {});
  await go(t.page, "customers");
  await t.page.click("text=c@test.local");
  await t.page.waitForSelector("button:has-text('إعادة تفعيل الحساب')", T);
  await t.page.click("button:has-text('إعادة تفعيل الحساب')");
  await t.page.click("dialog button:has-text('تأكيد إعادة تفعيل')");
  await t.page.waitForFunction(() => window.AMANAdminServices.listCustomers({}).then(r => r.customers[0].status === "active"));
  assert.equal(await status(), "active");
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("المتابعة: مهمة ضمن النافذة تظهر وتُنفَّذ، وتخرج من النافذة بتغيير إعداد الشركة", { skip }, async () => {
  const t = await start();
  const { companyId } = await seed(t.page, { windowDays: 90 }); // الموعد بعد 90 يومًا والنافذة 90 ← مستحقة الآن
  await approve(t.page, await submitRequest(t.page));
  await go(t.page, "followup");
  await t.page.waitForSelector("text=711234567", T);
  assert.equal(await t.page.locator("#section-title").innerText(), "نافذة الظهور والمتابعة");
  await t.page.click("text=711234567");
  await t.page.waitForSelector("button:has-text('تنفيذ المهمة')", T);
  await t.page.click("button:has-text('تنفيذ المهمة')");
  await t.page.click("button:has-text('تأكيد التنفيذ')");
  await t.page.waitForSelector("text=تم تسجيل تنفيذ المهمة", T);
  const tasks = (await t.page.evaluate(() => window.AMANAdminServices.listTasks())).tasks;
  assert.equal(tasks.filter(x => x.status === "executed").length, 1);
  assert.equal(tasks.filter(x => x.status !== "executed").length, 1);
  // المهمة التالية بعد 90 يومًا والنافذة 90 ← ما زالت ضمن النافذة؛ نخفض النافذة إلى 0 فتخرج
  await t.page.evaluate(async id => {
    const c = (await window.AMANAdminServices.listCompanies()).companies.find(x => x.id === id);
    await window.AMANAdminServices.saveCompanySettings({ ...c, task_due_window_days: 0 });
  }, companyId);
  await go(t.page, "followup");
  await t.page.waitForTimeout(400);
  assert.doesNotMatch(await view(t.page).innerText(), /711234567/);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("المهام: تنفيذ مبكر قبل نافذة الظهور ثم إعادة جدولة بمعاينة وحفظ، ورفض التاريخ السابق لليوم", { skip }, async () => {
  const t = await start();
  await seed(t.page, { windowDays: 0 }); // خارج النافذة ← مخططة
  await approve(t.page, await submitRequest(t.page));
  await go(t.page, "tasks");
  await t.page.waitForSelector("text=711234567", T);
  await t.page.click("text=711234567");
  await t.page.waitForSelector("button:has-text('تنفيذ مبكر للمهمة')", T);
  // إعادة جدولة: تاريخ سابق
  await t.page.click("button:has-text('إعادة جدولة المهمة')");
  const past = await adenPlusDays(t.page, -3);
  await t.page.locator("dialog input[type=date]").fill(past);
  await t.page.click("dialog button:has-text('معاينة أثر الجدولة')");
  await t.page.waitForSelector("text=لا يمكن جدولة المهمة في تاريخ سابق لليوم", T);
  await t.page.click("dialog button:has-text('حفظ الموعد الجديد')");
  await t.page.waitForSelector("dialog >> text=اعرض أثر الجدولة قبل الحفظ");
  // إعادة جدولة: تاريخ صالح بالزيادة
  const later = await adenPlusDays(t.page, 100);
  await t.page.locator("dialog input[type=date]").fill(later);
  await t.page.click("dialog button:has-text('معاينة أثر الجدولة')");
  await t.page.waitForSelector("text=تاريخ المصادرة الجديد", T);
  await t.page.click("dialog button:has-text('حفظ الموعد الجديد')");
  await t.page.waitForSelector("text=تمت إعادة جدولة المهمة", T);
  const pending = (await t.page.evaluate(() => window.AMANAdminServices.listTasks())).tasks.find(x => x.status !== "executed");
  assert.equal(pending.due_at.slice(0, 10) >= later.slice(0, 8), true);
  // تنفيذ مبكر
  await t.page.click("text=711234567");
  await t.page.click("button:has-text('تنفيذ مبكر للمهمة')");
  await t.page.click("button:has-text('تأكيد التنفيذ')");
  await t.page.waitForSelector("text=تم تسجيل تنفيذ المهمة", T);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listTasks())).tasks.filter(x => x.status === "executed").length, 1);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("المهام: فشل التنفيذ لا يُظهر نجاحًا", { skip }, async () => {
  const t = await start();
  await seed(t.page, { windowDays: 90 });
  await approve(t.page, await submitRequest(t.page));
  await go(t.page, "tasks");
  await t.page.click("text=711234567");
  await t.page.click("button:has-text('تنفيذ المهمة')");
  await breakService(t.page, "executeTask");
  await t.page.click("button:has-text('تأكيد التنفيذ')");
  await t.page.waitForSelector("dialog >> text=لم يصل تأكيد موثوق", T);
  assert.doesNotMatch(await view(t.page).innerText(), /تم تسجيل تنفيذ المهمة/);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listTasks())).tasks.filter(x => x.status === "executed").length, 0);
  await t.done();
});

test("البلاغات: فراغ ← قرار بسبب إلزامي ← تحديث الحالة وتصفية", { skip }, async () => {
  const t = await start();
  await go(t.page, "complaints");
  await t.page.waitForSelector("text=لا توجد بيانات لعرضها");
  await seed(t.page);
  await approve(t.page, await submitRequest(t.page));
  await t.page.evaluate(async () => {
    await window.AMANClientServices.signUp({ email: "other@test.local", password: "1234" });
    const r = await window.AMANClientServices.submitReport({ phone: "711234567", reason_code: "unauthorized", reason_text: "بلاغ اختبار" });
    if (!r.success) throw new Error(JSON.stringify(r));
  });
  await go(t.page, "complaints");
  await t.page.waitForSelector("text=711234567", T);
  assert.equal(await t.page.locator("#complaints-filter").count(), 1);
  await t.page.click("text=711234567");
  await t.page.click("button:has-text('حفظ القرار')");
  await t.page.waitForSelector("text=سبب القرار إلزامي");
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listComplaints())).reports[0].status, "open");
  await t.page.locator("#admin-generic-view textarea").fill("لا مخالفة");
  await t.page.click("button:has-text('حفظ القرار')");
  await t.page.locator(".admin-request-card", { hasText: "تمت المعالجة" }).waitFor(T);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listComplaints())).reports[0].status, "resolved");
  await t.page.locator("#complaints-filter").selectOption("open");
  await t.page.waitForSelector("text=لا توجد بيانات لعرضها");
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("الإشعارات والتنبيهات: إنشاء يدوي بمعاينة وتأكيد ثم ظهوره", { skip }, async () => {
  const t = await start();
  await seed(t.page);
  await approve(t.page, await submitRequest(t.page));
  await go(t.page, "notifications");
  await t.page.getByRole("button", { name: "إنشاء إشعار يدوي" }).click();
  await t.page.getByLabel("عنوان الإشعار").fill("عنوان الاختبار");
  await t.page.getByLabel("نص الإشعار").fill("نص الاختبار");
  assert.equal(await t.page.locator("button:has-text('تأكيد وإرسال الإشعار')").isHidden(), true);
  await t.page.click("text=معاينة المستلمين");
  await t.page.waitForSelector("text=سيصل الإشعار إلى", T);
  await t.page.click("button:has-text('تأكيد وإرسال الإشعار')");
  await t.page.waitForSelector("text=عنوان الاختبار", T);
  assert.ok((await t.page.evaluate(() => window.AMANAdminServices.listAdminNotifications())).items.some(n => n.title === "عنوان الاختبار"));
  await go(t.page, "alerts");
  await t.page.getByRole("button", { name: "إنشاء تنبيه يدوي" }).click();
  await t.page.getByLabel("عنوان التنبيه").fill("تنبيه الاختبار");
  await t.page.getByLabel("نص التنبيه").fill("نص التنبيه");
  await t.page.click("button:has-text('إنشاء التنبيه')");
  await t.page.waitForSelector("text=تنبيه الاختبار", T);
  assert.ok((await t.page.evaluate(() => window.AMANAdminServices.listAdminAlerts())).items.some(n => n.title === "تنبيه الاختبار"));
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("المحتوى والتدقيق والحساب: حفظ نص، ظهور الإجراءات في التدقيق، وتسجيل الخروج", { skip }, async () => {
  const t = await start();
  await go(t.page, "content");
  await t.page.waitForSelector("text=الشروط والأحكام");
  await t.page.getByLabel("الشروط والأحكام").fill("نص الشروط");
  await t.page.getByRole("button", { name: "حفظ النص" }).first().click();
  await t.page.waitForSelector("text=تم حفظ الشروط والأحكام", T);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.getAppContent())).items.terms, "نص الشروط");
  await go(t.page, "audit");
  await t.page.waitForSelector("button:has-text('عرض التفاصيل')", T);
  await t.page.getByLabel("بحث في السجلات").fill("لا يوجد شيء كهذا");
  await t.page.waitForSelector("text=لا توجد سجلات مطابقة");
  await go(t.page, "account");
  await t.page.waitForSelector("text=مدير المحاكاة", T);
  await t.page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
  await t.page.waitForSelector("#admin-login:not([hidden])", T);
  assert.equal(await t.page.locator("#dashboard-screen").isHidden(), true);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("الشركة: نافذة الظهور فارغة ومطلوبة بلا افتراضي، ووسم مهلة التنشيط بالمعنى الجديد", { skip }, async () => {
  const t = await start();
  await go(t.page, "settings");
  await t.page.click("text=إضافة شركة");
  const windowInput = t.page.getByLabel("نافذة ظهور المهام المستحقة");
  assert.equal(await windowInput.inputValue(), "");
  assert.equal(await t.page.getByLabel("آخر موعد للتنشيط قبل المصادرة").count(), 1);
  await t.page.getByLabel("اسم الشركة").fill("شركة النافذة");
  await t.page.getByLabel("البادئات").fill("70");
  await t.page.getByLabel("أطوال الأرقام").fill("9");
  await t.page.click("button:has-text('حفظ')");
  await t.page.waitForSelector("text=راجع الحقول");
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listCompanies())).companies.length, 0);
  await windowInput.fill("7");
  await t.page.click("button:has-text('حفظ')");
  await t.page.waitForSelector("text=تم حفظ إعدادات الشركة", T);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listCompanies())).companies[0].task_due_window_days, 7);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("حالة الفشل لكل شاشة: تعذّر الخدمة يعرض رسالة خطأ لا بيانات ولا تحميلًا معلّقًا ولا أخطاء JavaScript", { skip }, async () => {
  const t = await start("/admin/", { viewport: { width: 360, height: 740 } });
  await seed(t.page);
  await approve(t.page, await submitRequest(t.page)); // بيانات موجودة فعلًا: يجب ألا تظهر عند فشل الخدمة
  const methods = { requests: "listRequests", numbers: "listNumbers", customers: "listCustomers", tasks: "listTasks", followup: "listTasks", complaints: "listComplaints", reports: "getRevenueReport", settings: "listCompanies", notifications: "listAdminNotifications", alerts: "listAdminAlerts", packages: "listPackages", payments: "listPaymentMethods", content: "getAppContent", audit: "listAuditLog" };
  for (const [screen, method] of Object.entries(methods)) {
    await breakService(t.page, method);
    await go(t.page, screen);
    await t.page.waitForTimeout(400);
    const box = screen === "requests" ? "#requests-list" : "#admin-generic-view";
    const text = await t.page.locator(box).innerText();
    assert.match(text, /تعذر|غير مربوط|لم يصل/, "لا رسالة خطأ في " + screen);
    assert.doesNotMatch(text, /جارٍ تحميل/, "تحميل معلّق في " + screen);
    assert.doesNotMatch(text, /711234567|شركة اختبار|اشتراك سنوي|وسيلة اختبار/, "بيانات ظهرت رغم فشل الخدمة في " + screen);
  }
  assert.deepEqual(t.errors, []);
  await t.done();
});
