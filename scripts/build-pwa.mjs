#!/usr/bin/env node
/*
 * ختم معرّف الإصدار في عاملي PWA الإنتاجيين فقط.
 * الاستخدام: node scripts/build-pwa.mjs <مجلد-النشر> [معرّف-الإصدار]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLACEHOLDER = "__BUILD_ID__";
const APPS = ["client", "admin"];

export function normalizeBuildId(raw) {
  const id = String(raw || "").trim().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40);
  return id || "t" + Date.now().toString(36);
}

export function stampServiceWorkers(dir, buildId) {
  const root = resolve(dir);
  const files = APPS.map(app => join(root, app, "sw.js"));
  for (const file of files) {
    if (!existsSync(file)) throw new Error("ملف Service Worker إنتاجي مفقود: " + file);
    const source = readFileSync(file, "utf8");
    if (!source.includes(PLACEHOLDER)) throw new Error("العلامة " + PLACEHOLDER + " غير موجودة في " + file);
    const stamped = source.split(PLACEHOLDER).join(buildId);
    if (stamped.includes(PLACEHOLDER)) throw new Error("بقيت العلامة في " + file);
    writeFileSync(file, stamped);
  }
  return files;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [dir, explicit] = process.argv.slice(2);
  if (!dir) {
    console.error("الاستخدام: node scripts/build-pwa.mjs <مجلد-النشر> [معرّف-الإصدار]");
    process.exit(1);
  }
  try {
    const buildId = normalizeBuildId(explicit || process.env.BUILD_ID || process.env.GITHUB_SHA);
    const files = stampServiceWorkers(dir, buildId);
    console.log("تم ختم الإصدار " + buildId + " في عاملي PWA الإنتاجيين:");
    for (const file of files) console.log(" - " + file);
  } catch (error) {
    console.error("فشل ختم الإصدار: " + error.message);
    process.exit(1);
  }
}
