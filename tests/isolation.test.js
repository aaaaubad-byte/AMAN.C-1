import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { startServer } from "../scripts/local-preview.mjs";

const read = f => readFileSync(f, "utf8");
const pages = ["index.html", "client/index.html", "admin/index.html"];

test("صفحات الإنتاج لا تشير إلى المحاكاة ولا إلى ?demo=1", () => {
  for (const f of pages) assert.doesNotMatch(read(f), /simulation|demo-services|__AMAN_SIMULATION__|\?demo=1/i, f);
});

test("صفحتا العميل والإدارة تحمّلان طبقة الخدمات قبل سكربتات الواجهة", () => {
  for (const f of ["client/index.html", "admin/index.html"]) {
    const html = read(f);
    const runtime = html.indexOf("services/runtime.js");
    assert.ok(runtime > 0, f);
    assert.ok(runtime < html.indexOf("app.js"), f);
  }
});

test("سكربتات الواجهة لا تصل إلى localStorage مباشرة", () => {
  for (const f of ["client/app.js", "admin/app.js", "admin/phase3-a5-a8.js", "admin/phase3-a9-a12.js", "admin/phase3-a13-a17.js", "admin/phase4-a18-a25.js", "admin/phase5-a26-a31.js"]) {
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB/, f);
  }
});

test("لا يوجد مجلد demo ولا مفاتيح أو عناوين اتصال في ملفات الواجهة", () => {
  assert.ok(!existsSync("demo"));
  for (const f of ["services/runtime.js", "simulation/simulation-adapter.js", "client/app.js", "admin/app.js"]) {
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
    for (const p of ["/client/", "/admin/"]) {
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
    for (const p of ["/client/", "/admin/"]) assert.match(await (await fetch(base + p)).text(), /__AMAN_SIMULATION__/);
    assert.doesNotMatch(await (await fetch(base + "/")).text(), /__AMAN_SIMULATION__/);
  } finally { await s.close(); }
});

test("خادم المعاينة يرفض الاستماع على عنوان غير محلي", async () => {
  await assert.rejects(startServer({ port: 0, host: "0.0.0.0" }));
});
