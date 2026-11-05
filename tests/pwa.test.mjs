import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stampServiceWorkers, normalizeBuildId, PLACEHOLDER } from "../scripts/build-pwa.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPS = ["client", "admin"];

function pngSize(file) {
  const buf = readFileSync(file);
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", file + " ليس PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

for (const app of APPS) {
  test(app + ": manifest صالح وأيقوناته موجودة بأحجامها الصحيحة", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, app, "manifest.webmanifest"), "utf8"));
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.dir, "rtl");
    assert.equal(manifest.lang, "ar");
    assert.equal(manifest.id, "/AMAN.C/" + app + "/");
    assert.equal(manifest.start_url, "./");
    assert.equal(manifest.scope, "./");
    for (const icon of manifest.icons) {
      const file = join(ROOT, app, icon.src);
      assert.ok(existsSync(file), "أيقونة مفقودة: " + icon.src);
      if (icon.type === "image/png") {
        const { width, height } = pngSize(file);
        assert.equal(icon.sizes, width + "x" + height, "حجم مُعلن لا يطابق الملف: " + icon.src);
      }
    }
    assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
    const { width, height } = pngSize(join(ROOT, app, "icons", "apple-touch-icon-v3.png"));
    assert.deepEqual([width, height], [180, 180]);
  });

  test(app + ": الصفحة تربط manifest وpwa.js وأيقونة iOS", () => {
    const html = readFileSync(join(ROOT, app, "index.html"), "utf8");
    assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
    assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon-v3\.png">/);
    assert.match(html, /<script defer src="\.\/pwa\.js"><\/script>/);
  });

  test(app + ": Service Worker يقصر التخزين على موارد ثابتة ويرفض الاستجابات الخاصة", () => {
    const sw = readFileSync(join(ROOT, app, "sw.js"), "utf8");
    assert.ok(sw.includes(PLACEHOLDER));
    assert.match(sw, /req\.headers\.has\("authorization"\)/);
    assert.match(sw, /PRIVATE_HEADERS/);
    assert.match(sw, /res\.headers\.has\("set-cookie"\)/);
    assert.match(sw, /res\.headers\.get\("vary"\) === "\*"/);
    assert.match(sw, /APP_STATIC\.has\(url\.href\)/);
    assert.match(sw, /SHARED_ALLOWED\.has\(url\.href\)/);
    assert.match(sw, /url\.search\) return false/);
    assert.doesNotMatch(sw, /skipWaiting\(\);\s*\n\s*\}\);\s*\n/, "لا skipWaiting تلقائي عند التثبيت");
  });

  test(app + ": شريط التحديث بهوية أمان بلا أخضر", () => {
    const js = readFileSync(join(ROOT, app, "pwa.js"), "utf8");
    assert.doesNotMatch(js, /#09a478/i);
    assert.match(js, /#102d45/);
  });
}

test("النشر الإنتاجي لا يحتوي محاكاة أو /test/", () => {
  const workflow = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8");
  assert.doesNotMatch(workflow, /dist\/test|simulation|preview/i);
  assert.match(workflow, /cp -R client admin styles services dist\//);
  assert.match(workflow, /cp -R assets dist\//);
  assert.match(workflow, /node scripts\/build-pwa\.mjs dist/);
});

test("build-pwa يختم عاملي العميل والإدارة فقط دون الحاجة إلى /test/", () => {
  const dir = mkdtempSync(join(tmpdir(), "aman-pwa-"));
  try {
    for (const app of APPS) {
      mkdirSync(join(dir, app), { recursive: true });
      cpSync(join(ROOT, app, "sw.js"), join(dir, app, "sw.js"));
    }
    const files = stampServiceWorkers(dir, "abc123");
    assert.equal(files.length, 2);
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      assert.ok(!content.includes(PLACEHOLDER));
      assert.ok(content.includes('const BUILD = "abc123";'));
    }
    assert.throws(() => stampServiceWorkers(dir, "again"), /غير موجودة/);
    const empty = join(dir, "empty");
    mkdirSync(empty);
    assert.throws(() => stampServiceWorkers(empty, "x"), /مفقود/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("normalizeBuildId ينظّف القيمة ويولّد بديلًا عند الفراغ", () => {
  assert.equal(normalizeBuildId(" a1b2/c3;`x "), "a1b2c3x");
  assert.equal(normalizeBuildId("x".repeat(80)).length, 40);
  assert.match(normalizeBuildId(""), /^t[a-z0-9]+$/);
});
