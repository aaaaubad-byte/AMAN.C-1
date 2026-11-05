// اختبار محوّل Supabase بعميل Supabase وهمي داخل vm (لا اتصال بالشبكة).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const RUNTIME = read("../services/runtime.js"), CONFIG = read("../services/supabase-config.js"), ADAPTER = read("../services/supabase-adapter.js");

function build({ sim = false, session = { user: { email: "u@x.com" } }, handler = () => ({ data: { success: true }, error: null, status: 200 }), auth = {} } = {}) {
  const calls = { rpc: [], signedOut: 0, refreshed: 0, signIn: 0 };
  const sb = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      refreshSession: async () => { calls.refreshed++; return { data: { session: auth.refreshTo === undefined ? session : auth.refreshTo }, error: null }; },
      signOut: async () => { calls.signedOut++; session = null; return { error: null }; },
      signInWithPassword: async a => { calls.signIn++; return auth.signIn ? auth.signIn(a) : { data: {}, error: null }; },
      signUp: async a => (auth.signUp ? auth.signUp(a) : { data: {}, error: null }),
      updateUser: async a => (auth.updateUser ? auth.updateUser(a) : { error: null })
    },
    rpc(fn, args) { calls.rpc.push([fn, args]); const r = handler(fn, args, calls); const t = Promise.resolve(r); t.abortSignal = () => t; return t; }
  };
  const window = { supabase: { createClient: () => sb }, __AMAN_SIMULATION__: sim ? { enabled: true } : undefined };
  const ctx = vm.createContext({ window, console, JSON, Promise, Error, Array, Object, Number, String, RegExp, setTimeout, clearTimeout, AbortController });
  vm.runInContext(RUNTIME, ctx); vm.runInContext(CONFIG, ctx); vm.runInContext(ADAPTER, ctx);
  return { window, calls, C: window.AMANClientServices, A: window.AMANAdminServices, S: window.AMANServices };
}
const ok = (extra = {}) => ({ data: { success: true, ...extra }, error: null, status: 200 });

test("يسجّل نفسه وتكتمل كل عمليات العميل والإدارة", () => {
  const { S } = build();
  const st = S.status();
  assert.equal(st.adapter, "supabase");
  assert.equal(st.simulation, false);
  assert.deepEqual(JSON.parse(JSON.stringify(st.missing)), { client: [], admin: [] });
});

test("لا يسجّل نفسه مع علم المحاكاة", () => {
  assert.equal(build({ sim: true }).S.status().configured, false);
});

test("يمرّر المعامل {p} باسم الدالة الصحيح", async () => {
  const { C, A, calls } = build();
  await C.lookupNumber({ phone: "771234567" });
  await A.getRequestDetails({ request_id: "r1" });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc)), [["client_lookup_number", { p: { phone: "771234567" } }], ["admin_get_request", { p: { request_id: "r1" } }]]);
});

test("نوع العملية subscription يُحوَّل إلى activation", async () => {
  const { A, calls } = build();
  await A.listRequests({ operation_type: "subscription", status: "all" });
  assert.equal(calls.rpc[0][1].p.operation_type, "activation");
});

test("بلا جلسة: auth_required دون أي استدعاء", async () => {
  const { C, A, calls } = build({ session: null });
  assert.equal((await C.listMyNumbers()).code, "auth_required");
  assert.equal((await A.getDashboardSummary()).code, "auth_required");
  assert.equal(calls.rpc.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(await C.getSession())), { success: true, user: null });
});

test("انقطاع الشبكة: رسالة عربية، وللعمليات المغيِّرة «لم يتم تأكيد»", async () => {
  const net = { data: null, error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
  const { C } = build({ handler: () => net });
  const r = await C.listMyNumbers();
  assert.equal(r.code, "service_unreachable");
  assert.match(r.message, /تعذر الاتصال/);
  assert.match((await C.submitProtectionRequest({})).message, /لم يتم تأكيد/);
});

test("JWT منتهٍ: محاولة واحدة بعد التجديد، ثم نجاح", async () => {
  let n = 0;
  const { C, calls } = build({ handler: () => (n++ === 0 ? { data: null, error: { message: "JWT expired", code: "PGRST301" }, status: 401 } : ok({ items: [] })) });
  const r = await C.listMyNumbers();
  assert.equal(r.success, true);
  assert.equal(calls.refreshed, 1);
  assert.equal(calls.rpc.length, 2);
});

test("JWT منتهٍ ولا تجديد: auth_required وتسجيل خروج محلي", async () => {
  const { C, calls } = build({ auth: { refreshTo: null }, handler: () => ({ data: null, error: { message: "JWT expired", code: "PGRST301" }, status: 401 }) });
  assert.equal((await C.listMyNumbers()).code, "auth_required");
  assert.equal(calls.signedOut, 1);
});

test("استجابة غير متوقعة تُرفض ولا تُعدّ نجاحًا", async () => {
  const { C } = build({ handler: () => ({ data: "x", error: null, status: 200 }) });
  const r = await C.getNotifications();
  assert.equal(r.success, false);
  assert.equal(r.code, "unexpected_response");
});

test("أخطاء الخادم المنطقية تمر كما هي، والقوائم الفارغة تمر", async () => {
  const { C } = build({ handler: fn => (fn === "client_lookup_number" ? { data: { success: false, code: "no_companies", message: "لا توجد شركات" }, error: null } : ok({ items: [] })) });
  assert.equal((await C.lookupNumber({ phone: "771234567" })).code, "no_companies");
  assert.deepEqual(JSON.parse(JSON.stringify((await C.listMyOperations()).items)), []);
});

test("دخول العميل: مدير أو معطّل (user:null) يُرفض ويُنهى الدخول", async () => {
  const { C, calls } = build({ handler: () => ok({ user: null }) });
  const r = await C.signIn({ email: "a@x.com", password: "secret1" });
  assert.equal(r.code, "invalid_credentials");
  assert.equal(calls.signedOut, 1);
});

test("دخول العميل الناجح يُرجع user", async () => {
  const { C } = build({ handler: () => ok({ user: { id: "1", email: "a@x.com" } }) });
  assert.equal((await C.signIn({ email: "a@x.com", password: "secret1" })).user.id, "1");
});

test("دخول الإدارة: حساب غير مدير يُرفض ويُنهى الدخول", async () => {
  const { A, calls } = build({ handler: () => ({ data: { success: false, code: "auth_required", message: "x" }, error: null }) });
  const r = await A.signInAdmin({ email: "c@x.com", password: "secret1" });
  assert.equal(r.success, false);
  assert.equal(r.code, "invalid_credentials");
  assert.ok(calls.signedOut >= 1);
});

test("دخول الإدارة: مدير فعلي ينجح", async () => {
  const { A } = build({ handler: () => ok({ admin: { id: "a", is_admin: true } }) });
  const r = await A.signInAdmin({ email: "a@x.com", password: "secret1" });
  assert.equal(r.success, true);
  assert.equal(r.admin.is_admin, true);
});

test("بيانات اعتماد خاطئة: رسالة موحدة", async () => {
  const { C } = build({ auth: { signIn: () => ({ data: {}, error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } }) } });
  const r = await C.signIn({ email: "a@x.com", password: "bad" });
  assert.equal(r.code, "invalid_credentials");
  assert.doesNotMatch(r.message, /Invalid/);
});

test("إنشاء الحساب: بريد مكرر، تأكيد بريد مطلوب، ونجاح", async () => {
  let b = build({ auth: { signUp: () => ({ data: { user: { identities: [] }, session: null }, error: null }) } });
  assert.equal((await b.C.signUp({ email: "a@x.com", password: "secret1" })).code, "email_taken");
  b = build({ auth: { signUp: () => ({ data: { user: { identities: [{}] }, session: null }, error: null }) } });
  assert.equal((await b.C.signUp({ email: "a@x.com", password: "secret1" })).code, "email_confirmation_required");
  b = build({ auth: { signUp: () => ({ data: { user: { identities: [{}] }, session: {} }, error: null }) }, handler: () => ok({ user: { id: "n" } }) });
  assert.equal((await b.C.signUp({ email: "a@x.com", password: "secret1" })).user.id, "n");
  assert.equal((await b.C.signUp({ email: "bad", password: "x" })).code, "invalid_email");
});

test("لا أسرار ولا service_role في ملفات الاتصال أو الصفحات", () => {
  for (const f of ["../services/supabase-config.js", "../services/supabase-adapter.js", "../client/index.html", "../admin/index.html"]) {
    const t = read(f);
    assert.doesNotMatch(t, /service_role|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/, f);
  }
});

test("ترتيب تحميل الصفحات: runtime ثم المكتبة ثم الإعدادات ثم المحوّل ثم الواجهة", () => {
  for (const f of ["../client/index.html", "../admin/index.html"]) {
    const h = read(f);
    const order = ["services/runtime.js", "supabase-js@2.104.0", "services/supabase-config.js", "services/supabase-adapter.js", "app.js"].map(x => h.indexOf(x));
    assert.ok(order.every(i => i > 0), f);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), f);
  }
});
