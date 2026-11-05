import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { startServer } from "../scripts/local-preview.mjs";

const read = f => readFileSync(f, "utf8");
const pages = ["index.html", "apps/customer/index.html", "apps/admin/index.html"];

test("صفحات الإنتاج لا تشير إلى المحاكاة ولا إلى ?demo=1", () => {
  for (const f of pages) assert.doesNotMatch(read(f), /simulation|demo-services|__AMAN_SIMULATION__|\?demo=1/i, f);
});

test("صفحتا العميل والإدارة تحمّلان طبقة الخدمات قبل سكربتات الواجهة", () => {
  for (const f of ["apps/customer/index.html", "apps/admin/index.html"]) {
    const html = read(f);
    const runtime = html.indexOf("shared/services/runtime.js");
    assert.ok(runtime > 0, f);
    assert.ok(runtime < html.indexOf("app.js"), f);
  }
});

test("سكربتات الواجهة لا تصل إلى localStorage مباشرة", () => {
  for (const f of ["apps/customer/app.js", "apps/admin/app.js", "apps/admin/modules/numbers.js", "apps/admin/modules/requests.js", "apps/admin/modules/customers.js", "apps/admin/modules/tasks-reports.js", "apps/admin/modules/operations.js", "apps/admin/modules/management.js"]) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB/, f);
  }
});

test("لا يوجد مجلد demo ولا مفاتيح أو عناوين اتصال في ملفات الواجهة", () => {
  assert.ok(!existsSync("demo"));
  for (const f of ["shared/services/runtime.js", "simulation/simulation-adapter.js", "apps/customer/app.js", "apps/admin/app.js"]) {
    assert.doesNotMatch(read(f), /service_role|supabase\.co|https?:\/\/(?!127\.0\.0\.1)[a-z]/i, f);
  }
});

test("لا يوجد إعداد نشر في مستودع التطوير قبل اعتماد الإصدار", () => {
  assert.equal(existsSync(".github/workflows/deploy.yml"), false);
});

test("خادم المعاينة: وضع بلا محاكاة لا يحقن العلم ولا يخدم مجلد simulation", async () => {
  const s = await startServer({ port: 0, simulation: false });
  try {
    const base = `http://127.0.0.1:${s.port}`;
    for (const p of ["/apps/customer/", "/apps/admin/"]) {
      const html = await (await fetch(base + p)).text();
      assert.doesNotMatch(html, /__AMAN_SIMULATION__|simulation-adapter/);
    }
    assert.equal((await fetch(base + "/simulation/simulation-adapter.js")).status, 404);
    assert.equal((await fetch(base + "/.git/config")).status, 404);
  } finally { await s.close(); }
});

test("خادم المعاينة: وضع المحاكاة يحقن العلم في العميل والإدارة فقط", async () => {
  const s = await startServer({ port: 0, simulation: true });
  try {
    const base = `http://127.0.0.1:${s.port}`;
    for (const p of ["/apps/customer/", "/apps/admin/"]) assert.match(await (await fetch(base + p)).text(), /__AMAN_SIMULATION__/);
    assert.doesNotMatch(await (await fetch(base + "/")).text(), /__AMAN_SIMULATION__/);
  } finally { await s.close(); }
});

test("خادم المعاينة يرفض الاستماع على عنوان غير محلي", async () => {
  await assert.rejects(startServer({ port: 0, host: "0.0.0.0" }));
});


test("وحدة قرارات الطلبات مستقلة وتوفر رسائل الحالة المطلوبة", () => {
  const requests = read("apps/admin/modules/requests.js");
  const app = read("apps/admin/app.js");
  assert.match(requests, /function setNotice\(/);
  assert.match(app, /dataset\.adminAction="approve"/);
  assert.match(app, /dataset\.adminAction="reject"/);
});
