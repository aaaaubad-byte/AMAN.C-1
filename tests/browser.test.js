import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { startServer } from "../scripts/local-preview.mjs";

/* اختبارات سلوكية في متصفح حقيقي (Playwright). إن لم يتوفر Playwright تُتخطى صراحةً،
   ويفشل الاختبار إن كان AMAN_REQUIRE_BROWSER=1 (كما في CI). */
let chromium = null;
try { chromium = createRequire(import.meta.url)("playwright").chromium; } catch { /* غير متوفر */ }
const skip = !chromium && process.env.AMAN_REQUIRE_BROWSER !== "1" ? "Playwright غير مثبت" : false;
if (!chromium && process.env.AMAN_REQUIRE_BROWSER === "1") test("Playwright مطلوب", () => assert.fail("Playwright غير مثبت"));

const ADMIN = { email: "admin@simulation.local", password: "simulation-1234" };
let browser;
test.before(async () => { if (chromium) browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); });

async function open(path, { simulation = true, viewport } = {}) {
  const server = await startServer({ port: 0, simulation });
  const context = await browser.newContext(viewport ? { viewport } : {});
  await context.route(url => !/^http:\/\/127\.0\.0\.1[:/]/.test(url.href), route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.port}${path}`, { waitUntil: "domcontentloaded" });
  return { page, server, errors, base: `http://127.0.0.1:${server.port}`, done: async () => { await context.close(); await server.close(); } };
}
async function adminLogin(page) {
  await page.fill("#admin-username", ADMIN.email);
  await page.fill("#admin-password", ADMIN.password);
  await page.click("#admin-login-form button[type=submit]");
  await page.waitForSelector("#dashboard-screen:not([hidden])");
}
async function goSettings(page) {
  await page.evaluate(() => window.AMANAdminNavigation.navigate("settings"));
  await page.waitForSelector("#admin-generic-view");
}

test("بلا محاكاة: يُسجَّل محوّل Supabase ولا ينجح الدخول عند انقطاع الاتصال", { skip }, async () => {
  for (const path of ["/client/", "/admin/"]) {
    const t = await open(path, { simulation: false });
    await t.page.waitForFunction(() => window.AMANServices && window.AMANServices.status().configured);
    assert.equal(await t.page.evaluate(() => window.AMANServices.status().adapter), "supabase");
    assert.equal(await t.page.evaluate(() => typeof window.__AMAN_SIMULATION__), "undefined");
    assert.equal(await t.page.evaluate(() => window.AMANServices.status().simulation), false);
    assert.equal(await t.page.locator("#aman-service-banner").count(), 0);
    await t.done();
  }
  const t = await open("/admin/", { simulation: false });
  await t.page.fill("#admin-username", ADMIN.email);
  await t.page.fill("#admin-password", ADMIN.password);
  await t.page.click("#admin-login-form button[type=submit]");
  await t.page.waitForTimeout(400);
  assert.equal(await t.page.locator("#dashboard-screen").isHidden(), true);
  assert.match(await t.page.locator("#admin-login-message").innerText(), /\S/);
  await t.done();
});

test("المحاكاة ترفض التسجيل على مضيف غير محلي (الواجهة بلا محاكاة)", { skip }, async () => {
  const t = await open("/admin/", { simulation: false });
  const refused = await t.page.evaluate(() => {
    try { window.AMANServices.register({ name: "x", simulation: true, client: {}, admin: {} }); return false; }
    catch { return true; }
  });
  assert.equal(refused, true);
  await t.done();
});

test("المحاكاة تبدأ فارغة: لا شركات ولا طلبات ولا بيانات تُنشأ تلقائيًا", { skip }, async () => {
  const t = await open("/admin/");
  await adminLogin(t.page);
  const r = await t.page.evaluate(async () => ({
    companies: (await window.AMANAdminServices.listCompanies()).companies,
    packages: (await window.AMANAdminServices.listPackages()).items,
    requests: (await window.AMANAdminServices.listRequests({})).requests
  }));
  assert.deepEqual(r.companies, []);
  assert.deepEqual(r.packages, []);
  assert.deepEqual(r.requests ?? [], []);
  await goSettings(t.page);
  assert.match(await t.page.locator("#admin-generic-view").innerText(), /لا توجد شركات/);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("إضافة شركة: تحقق ← حفظ عبر الخدمة ← ظهور في القائمة ← رسالة نجاح بعد النجاح فقط", { skip }, async () => {
  const t = await open("/admin/");
  await adminLogin(t.page);
  await goSettings(t.page);
  await t.page.click("text=إضافة شركة");
  await t.page.waitForSelector("text=إضافة شركة >> nth=0");

  const fill = async (label, value) => t.page.getByLabel(label, { exact: false }).first().fill(value);
  // مدخلات غير صالحة: لا حفظ ولا شركة في المصدر
  await fill("اسم الشركة", "");
  await t.page.click("button:has-text('حفظ')");
  await t.page.waitForTimeout(300);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listCompanies())).companies.length, 0);

  await fill("اسم الشركة", "شركة اختبار");
  await fill("البادئات", "77");
  await fill("أطوال الأرقام", "9");
  // نافذة الظهور فارغة ومطلوبة بلا افتراضي (قرار 2026-11-01): الحفظ دونها مرفوض
  assert.equal(await t.page.getByLabel("نافذة ظهور المهام المستحقة").first().inputValue(), "");
  await t.page.click("button:has-text('حفظ')");
  await t.page.waitForTimeout(300);
  assert.equal((await t.page.evaluate(() => window.AMANAdminServices.listCompanies())).companies.length, 0);
  await fill("نافذة ظهور المهام المستحقة", "10");
  await t.page.click("button:has-text('حفظ')");
  await t.page.waitForSelector("text=شركة اختبار");
  const saved = await t.page.evaluate(() => window.AMANAdminServices.listCompanies());
  assert.equal(saved.companies.length, 1);
  assert.equal(saved.companies[0].name, "شركة اختبار");
  assert.deepEqual(saved.companies[0].prefixes, ["77"]);
  assert.match(await t.page.locator("#admin-generic-view").innerText(), /تم|حُفظ|نجح/);
  assert.deepEqual(t.errors, []);
  await t.done();
});

test("فشل الحفظ: لا نجاح زائف وتبقى المدخلات", { skip }, async () => {
  const t = await open("/admin/");
  await adminLogin(t.page);
  await goSettings(t.page);
  await t.page.click("text=إضافة شركة");
  await t.page.waitForSelector("text=حفظ");
  // نحاكي فشل الخدمة بإبطال الدالة داخل المحوّل: الواجهة تمر عبر الواجهة الموحدة التي تُرجع service_unreachable
  await t.page.evaluate(() => {
    const original = window.AMANAdminServices.saveCompanySettings;
    // الواجهة الموحدة مجمّدة؛ نستبدل ما تستدعيه الصفحة عبر fetch-less patch على الكائن المرجعي
    Object.defineProperty(window, "AMANAdminServices", { value: new Proxy(window.AMANAdminServices, { get: (o, k) => k === "saveCompanySettings" ? async () => ({ success: false, code: "service_unreachable", message: "تعذر الاتصال بالخدمة." }) : o[k] }), configurable: true });
  });
  await t.page.getByLabel("اسم الشركة").first().fill("شركة فاشلة");
  await t.page.getByLabel("البادئات").first().fill("71");
  await t.page.getByLabel("أطوال الأرقام").first().fill("9");
  await t.page.getByLabel("نافذة ظهور المهام المستحقة").first().fill("10");
  await t.page.click("button:has-text('حفظ')");
  await t.page.waitForTimeout(400);
  const body = await t.page.locator("#admin-generic-view").innerText();
  assert.doesNotMatch(body, /تم حفظ|تمت الإضافة|نجاح/);
  assert.equal(await t.page.getByLabel("اسم الشركة").first().inputValue(), "شركة فاشلة");
  await t.done();
});

test("RTL وعدم وجود تمرير أفقي على شاشة هاتف لصفحتي العميل والإدارة", { skip }, async () => {
  for (const path of ["/client/", "/admin/"]) {
    const t = await open(path, { viewport: { width: 360, height: 740 } });
    await t.page.waitForTimeout(300);
    assert.equal(await t.page.evaluate(() => document.documentElement.dir), "rtl");
    assert.equal(await t.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, path);
    assert.deepEqual(t.errors, []);
    await t.done();
  }
});
