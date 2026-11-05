// أدوات مشتركة لاختبارات المتصفح (Playwright). ليست اختبارًا بذاتها (لا تطابق *.test.js ولا *.test.mjs).
import { createRequire } from "node:module";
import { startServer } from "../scripts/local-preview.mjs";

let chromium = null;
try { chromium = createRequire(import.meta.url)("playwright").chromium; } catch { /* غير متوفر */ }
export { chromium };
export const skip = !chromium && process.env.AMAN_REQUIRE_BROWSER !== "1" ? "Playwright غير مثبت" : false;
export const ADMIN = { email: "admin@simulation.local", password: "simulation-1234" };

export async function launch() { return chromium ? chromium.launch() : null; }

export async function open(browser, path, { simulation = true, viewport } = {}) {
  const server = await startServer({ port: 0, simulation });
  const context = await browser.newContext(viewport ? { viewport } : {});
  await context.route(url => !/^http:\/\/127\.0\.0\.1[:/]/.test(url.href), route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", d => d.accept()); // confirm() الأصلية في الإدارة
  await page.goto(`http://127.0.0.1:${server.port}${path}`, { waitUntil: "domcontentloaded" });
  return { page, server, errors, done: async () => { await context.close(); await server.close(); } };
}

export async function adminLogin(page) {
  await page.fill("#admin-username", ADMIN.email);
  await page.fill("#admin-password", ADMIN.password);
  await page.click("#admin-login-form button[type=submit]");
  await page.waitForSelector("#dashboard-screen:not([hidden])");
}
export const go = (page, name) => page.evaluate(n => window.AMANAdminNavigation.navigate(n), name);

/* يهيّئ شركة وباقات ووسيلة دفع وعميلًا عبر الخدمات (لا عبر localStorage مباشرة). */
export async function seed(page, o = {}) {
  return page.evaluate(async o => {
    const A = window.AMANAdminServices, C = window.AMANClientServices;
    const must = (r, w) => { if (!r || r.success !== true) throw new Error(w + ": " + JSON.stringify(r)); return r; };
    const company = must(await A.saveCompanySettings({
      name: "شركة اختبار", prefixes: ["71"], number_lengths: [9], task_interval_days: 90,
      task_due_window_days: o.windowDays ?? 10, is_active: true, create_first_task: true, reactivation_enabled: true, reactivation_days: 5
    }), "شركة").company;
    for (const [name, op, days] of [["اشتراك سنوي", "activation", 365], ["اشتراك شهر", "activation", 30], ["تمديد شهر", "extension", 30], ["تنشيط شهر", "reactivation", 30]]) {
      must(await A.savePackage({ company_id: company.id, operation_type: op, name, days, price_yer: 1000, active: true }), "باقة");
    }
    must(await A.savePaymentMethod({ name: "وسيلة اختبار", account_number: "555-000", instructions: "تعليمات الدفع", reference_required: true, active: true }), "وسيلة دفع");
    must(await C.signUp({ email: "c@test.local", password: "1234" }), "عميل");
    return { companyId: company.id };
  }, o);
}

/* يرسل طلب عميل عبر خدمات العميل؛ يُرجع request_id. */
export async function submitRequest(page, { op = "activation", pkg = "اشتراك سنوي", phone = "711234567" } = {}) {
  return page.evaluate(async ({ op, pkg, phone }) => {
    const A = window.AMANAdminServices, C = window.AMANClientServices;
    const pk = (await A.listPackages()).items.find(p => p.name === pkg);
    const pay = (await A.listPaymentMethods()).items[0];
    const r = await C.submitProtectionRequest({ phone, operation_type: op, company_id: pk.company_id, package_id: pk.id, payment_method_id: pay.id, payment_reference: "REF-" + Math.random().toString(36).slice(2, 8) });
    if (!r.success) throw new Error("طلب: " + JSON.stringify(r));
    return r.request_id;
  }, { op, pkg, phone });
}
export async function approve(page, requestId) {
  return page.evaluate(async id => { const r = await window.AMANAdminServices.approveRequest({ request_id: id }); if (!r.success) throw new Error(JSON.stringify(r)); }, requestId);
}
/* يفرض فشل عملية إدارية واحدة (الواجهة الموحدة مجمّدة فنستبدل المرجع عبر Proxy). */
export async function breakService(page, method) {
  await page.evaluate(m => {
    Object.defineProperty(window, "AMANAdminServices", { configurable: true, value: new Proxy(window.AMANAdminServices, { get: (o, k) => k === m ? async () => ({ success: false, code: "service_unreachable", message: "تعذر الوصول إلى الخدمة." }) : o[k] }) });
  }, method);
}
export const adenToday = page => page.evaluate(() => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10));
export const adenPlusDays = (page, n) => page.evaluate(n => new Date(Date.now() + 3 * 3600000 + n * 86400000).toISOString().slice(0, 10), n);
