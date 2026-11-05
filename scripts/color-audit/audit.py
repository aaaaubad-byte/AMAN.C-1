#!/usr/bin/env python3
"""Colour audit for AMAN.C: opens client/admin screens (simulation mode, local preview),
records computed colours per layer in light/dark, and saves screenshots.
Usage: audit.py <outdir> [port]"""
import json, subprocess, sys, time, os, re
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8099
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.makedirs(OUT, exist_ok=True)

srv = subprocess.Popen(["node", f"{REPO}/scripts/local-preview.mjs", "--port", str(PORT)],
                       cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.5)
BASE = f"http://127.0.0.1:{PORT}"

PROBE = """() => {
  const out = {};
  const sel = {
    html:'html', body:'body', app:'.app', topbar:'.topbar', bottomNav:'.bottom-nav',
    screenHead:'.screen-head:not([hidden])', sheet:'.sheet',
    surface:'.surface', softSurface:'.soft-surface', authCard:'.auth-card', loginCard:'.login-card',
    phoneCard:'.phone-card', quickLink:'.quick-link', detailBlock:'.detail-block',
    operationCard:'.operation-card', adminRequestCard:'.admin-request-card', statCard:'.stat-card',
    adminShortcut:'.admin-shortcut', listTools:'.list-tools',
    field:'.field', compactSearch:'.compact-search .field', filterIcon:'.compact-filter-icon',
    btn:'.btn:not(.btn-outline):not(.btn-soft)', btnOutline:'.btn-outline', btnSoft:'.btn-soft',
    alertNote:'.alert-note', tabStrip:'.tab-strip', tabSel:'.tab-strip button[aria-selected="true"]',
    state:'.state-active', iconBtn:'.icon-btn', tileBtn:'.tile-btn', quickIcon:'.quick-icon',
    navItem:'.nav-item', navActive:'.nav-item.active', quietLink:'.quiet-link'
  };
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  for (const [k, q] of Object.entries(sel)) {
    const el = [...document.querySelectorAll(q)].find(vis);
    if (!el) continue;
    const s = getComputedStyle(el);
    out[k] = { bg: s.backgroundColor, bgImg: s.backgroundImage === 'none' ? '' : 'IMG', border: s.borderTopColor, bw: s.borderTopWidth, color: s.color };
  }
  // large turquoise-ish backgrounds
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width * r.height < 6000) continue;
    const s = getComputedStyle(el);
    const m = s.backgroundColor.match(/\\d+(\\.\\d+)?/g); if (!m) continue;
    const [R,G,B,A] = [+m[0],+m[1],+m[2], m[3] === undefined ? 1 : +m[3]]; if (A === 0) continue;
    if (G > R + 25 && B > R + 15 && Math.abs(G - B) < 40) bad.push((el.className || el.tagName) + ' ' + s.backgroundColor);
    if (s.backgroundImage !== 'none' && /gradient/.test(s.backgroundImage)) bad.push('GRADIENT ' + (el.className || el.tagName));
  }
  out._largeTealOrGradient = [...new Set(bad)];
  return out;
}"""

def setup_page(ctx, path, theme):
    page = ctx.new_page()
    page.set_default_timeout(8000)
    page.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://127.0.0.1") else r.abort())
    page.goto(BASE + path, wait_until="domcontentloaded")
    page.evaluate("t => localStorage.setItem('aman-display-theme-v1', t)", theme)
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(600)
    return page

def seed(page):
    return page.evaluate("""async () => {
      const A = window.AMANAdminServices, C = window.AMANClientServices;
      const must = (r, w) => { if (!r || r.success !== true) throw new Error(w + ': ' + JSON.stringify(r)); return r; };
      try{ await A.signIn({email:'admin@simulation.local',password:'simulation-1234'}); }catch(e){}
      const company = must(await A.saveCompanySettings({ name:'شركة اختبار', prefixes:['71'], number_lengths:[9], task_interval_days:90,
        task_due_window_days:10, is_active:true, create_first_task:true, reactivation_enabled:true, reactivation_days:5 }), 'co').company;
      for (const [name, op, days] of [['اشتراك سنوي','activation',365],['تمديد شهر','extension',30]])
        must(await A.savePackage({ company_id: company.id, operation_type: op, name, days, price_yer: 1000, active: true }), 'pkg');
      must(await A.savePaymentMethod({ name:'وسيلة اختبار', account_number:'555-000', instructions:'تعليمات الدفع', reference_required:true, active:true }), 'pay');
      must(await C.signUp({ email:'c@test.local', password:'1234' }), 'client');
      const pk = (await A.listPackages()).items[0], pm = (await A.listPaymentMethods()).items[0];
      must(await C.submitProtectionRequest({ phone:'711234567', operation_type:'activation', company_id:pk.company_id, package_id:pk.id, payment_method_id:pm.id, payment_reference:'REF-1' }), 'req');
      return true; }""")

results = {}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for theme in ("light", "dark"):
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = setup_page(ctx, "/apps/admin/", theme)
        def snap(name):
            page.wait_for_timeout(250)
            page.screenshot(path=f"{OUT}/{theme}-{name}.png")
            results[f"{theme}:{name}"] = page.evaluate(PROBE)
        snap("admin-login")
        try:
            page.fill("#admin-username", "admin@simulation.local"); page.fill("#admin-password", "simulation-1234")
            page.click("#admin-login-form button[type=submit]"); page.wait_for_selector("#dashboard-screen:not([hidden])")
            try: seed(page)
            except Exception as e: results[f"{theme}:admin-seed"] = str(e)
            page.evaluate("window.AMANAdminNavigation.navigate('dashboard')"); snap("admin-dashboard")
            secs = page.evaluate("[...document.querySelectorAll('[data-section]')].map(b=>b.dataset.section)")
            for s_ in dict.fromkeys(secs):
                page.evaluate(f"window.AMANAdminNavigation.navigate('{s_}')"); page.wait_for_timeout(300); snap(f"admin-{s_}")
                if s_ == "requests":
                    c = page.locator(".admin-request-card").first
                    if c.count(): c.click(); page.wait_for_timeout(400); snap("admin-request-detail")
        except Exception as e:
            results[f"{theme}:admin-error"] = str(e)
        page.close()
        # ---- client (same origin => simulation state persists in localStorage)
        page = ctx.new_page(); page.set_default_timeout(8000)
        page.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://127.0.0.1") else r.abort())
        page.goto(BASE + "/apps/customer/", wait_until="domcontentloaded"); page.wait_for_timeout(700)
        try:
            snap("client-login")
            page.evaluate("window.AMANClientNavigation.navigate('signup')"); snap("client-signup")
            page.evaluate("window.AMANClientNavigation.navigate('login')")
            page.evaluate("async () => { await window.AMANClientServices.signIn({email:'c@test.local', password:'1234'}); }")
            page.evaluate("window.AMANClientNavigation.navigate('home')")
            for s_ in ["home", "numbers", "operations", "protection", "account", "notifications", "report"]:
                page.evaluate(f"window.AMANClientNavigation.navigate('{s_}')"); snap(f"client-{s_}")
            page.evaluate("window.AMANClientNavigation.navigate('operations')"); page.wait_for_timeout(300)
            card = page.locator(".operation-card").first
            if card.count():
                card.click(); page.wait_for_timeout(400); snap("client-operation-detail")
        except Exception as e:
            results[f"{theme}:client-error"] = str(e)
        ctx.close()
    browser.close()
srv.terminate()
json.dump(results, open(f"{OUT}/results.json", "w"), ensure_ascii=False, indent=1)
print("screens:", sorted({k.split(':')[1] for k in results}))
print({k: v for k, v in results.items() if 'error' in k or 'seed' in k})
