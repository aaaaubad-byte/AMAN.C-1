/* AMAN.C — visual layer v6 behavior (presentation only).
   - Replaces every app SVG icon with the unified filled two-tone set (dark blue + turquoise, solid colors).
   - Turns the admin stats grid into a horizontal carousel (existing nodes, ids and data are untouched).
   - Adds the empty three-card carousel to the client home screen (no content, data or actions).
   The AMAN logo is raster (<img>) and is never touched. */
(() => {
"use strict";
if (window.__amanUiV6) return;
window.__amanUiV6 = true;

/* ---------- Icon set: 24x24, classes a = dark blue, b = turquoise, c = detail color ---------- */
const I = {
  user: '<path class="a" d="M3.5 21.2c0-4.6 3.8-7.4 8.5-7.4s8.5 2.8 8.5 7.4z"/><circle class="b" cx="12" cy="8" r="4.6"/>',
  bell: '<path class="a" d="M12 2.8c-3.6 0-6.3 2.7-6.3 6.4 0 4.3-1.5 5.6-2.6 6.6-.3.3-.1.9.4.9h16.9c.5 0 .7-.6.4-.9-1.1-1-2.6-2.3-2.6-6.6 0-3.7-2.7-6.4-6.2-6.4z"/><path class="b" d="M9.2 19h5.6a2.8 2.8 0 0 1-5.6 0z"/>',
  clock: '<circle class="a" cx="12" cy="12" r="9.6"/><circle class="b" cx="12" cy="12" r="6.8"/><path class="c" d="M11.2 7.6h1.6v4.1l2.8 1.7-.8 1.3-3.6-2.2z"/>',
  list: '<rect class="a" x="4" y="3" width="16" height="18" rx="3"/><path class="b" d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v2.4H4z"/><rect class="c" x="7.2" y="11.2" width="9.6" height="2" rx="1"/><rect class="c" x="7.2" y="15.2" width="6" height="2" rx="1"/>',
  phone: '<rect class="a" x="6" y="2" width="12" height="20" rx="3"/><rect class="b" x="8.2" y="4.6" width="7.6" height="11" rx="1.4"/><rect class="c" x="9.8" y="18" width="4.4" height="1.7" rx=".85"/>',
  flag: '<rect class="a" x="4" y="3" width="2.2" height="19" rx="1.1"/><path class="b" d="M6.2 4h12.3c.6 0 .9.6.6 1.1L16.6 9l2.5 3.9c.3.5 0 1.1-.6 1.1H6.2z"/>',
  group: '<circle class="b" cx="17" cy="8.2" r="3"/><path class="b" d="M14.6 14.3c3.3-.4 6.4 1.3 6.4 5.2h-4.6c0-2-.7-3.7-1.8-5.2z"/><circle class="a" cx="9" cy="8" r="4"/><path class="a" d="M1.8 20.8c0-4.2 3.2-6.6 7.2-6.6s7.2 2.4 7.2 6.6z"/>',
  cash: '<rect class="a" x="2.5" y="5.5" width="19" height="13" rx="3"/><circle class="b" cx="12" cy="12" r="3.6"/><circle class="c" cx="5.8" cy="12" r="1"/><circle class="c" cx="18.2" cy="12" r="1"/>',
  timer: '<rect class="b" x="9" y="1.8" width="6" height="2.8" rx="1.4"/><circle class="a" cx="12" cy="13.4" r="8.6"/><path class="c" d="M11.2 8.8h1.6v4.5l2.6 1.6-.8 1.3-3.4-2.1z"/>',
  doc: '<path class="a" d="M6.5 2.5h8l5 5v12a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z"/><path class="b" d="M14.5 2.5l5 5h-4a1 1 0 0 1-1-1z"/><rect class="c" x="8" y="11" width="8" height="1.7" rx=".85"/><rect class="c" x="8" y="14.4" width="8" height="1.7" rx=".85"/><rect class="c" x="8" y="17.8" width="5" height="1.7" rx=".85"/>',
  sliders: '<rect class="a" x="3" y="5.2" width="18" height="2.4" rx="1.2"/><rect class="a" x="3" y="10.8" width="18" height="2.4" rx="1.2"/><rect class="a" x="3" y="16.4" width="18" height="2.4" rx="1.2"/><circle class="b" cx="16" cy="6.4" r="3"/><circle class="b" cx="8" cy="12" r="3"/><circle class="b" cx="15" cy="17.6" r="3"/>',
  home: '<path class="a" d="M12 2.6 2.6 10.4c-.5.4-.2 1.3.5 1.3H4.5v8.2c0 .8.6 1.4 1.4 1.4h12.2c.8 0 1.4-.6 1.4-1.4v-8.2h1.4c.7 0 1-.9.5-1.3z"/><rect class="b" x="9.5" y="13.8" width="5" height="7.5" rx="1.2"/>',
  more: '<circle class="a" cx="5" cy="12" r="2.3"/><circle class="b" cx="12" cy="12" r="2.3"/><circle class="a" cx="19" cy="12" r="2.3"/>',
  back: '<rect class="a" x="3.5" y="10.8" width="11" height="2.4" rx="1.2"/><path class="b" d="M12.6 5.9a1.3 1.3 0 0 1 1.8 0l5.4 5.3c.5.5.5 1.3 0 1.8l-5.4 5.3a1.3 1.3 0 0 1-1.8-1.8L17 12 12.6 7.7a1.3 1.3 0 0 1 0-1.8z"/>',
  close: '<rect class="a" x="10.8" y="3.5" width="2.4" height="17" rx="1.2" transform="rotate(45 12 12)"/><rect class="b" x="10.8" y="3.5" width="2.4" height="17" rx="1.2" transform="rotate(-45 12 12)"/>',
  company: '<rect class="a" x="3.5" y="3" width="11" height="18" rx="2"/><rect class="b" x="14.5" y="9" width="6" height="12" rx="1.6"/><rect class="c" x="6.2" y="6.5" width="2" height="2" rx=".5"/><rect class="c" x="10" y="6.5" width="2" height="2" rx=".5"/><rect class="c" x="6.2" y="10.5" width="2" height="2" rx=".5"/><rect class="c" x="10" y="10.5" width="2" height="2" rx=".5"/><rect class="c" x="6.2" y="14.5" width="2" height="2" rx=".5"/><rect class="c" x="10" y="14.5" width="2" height="2" rx=".5"/>',
  status: '<circle class="a" cx="12" cy="12" r="9.6"/><circle class="b" cx="12" cy="12" r="6.8"/><path class="c" d="M8.4 12.2l1.4-1.4 1.9 1.9 3.9-3.9 1.4 1.4-5.3 5.3z"/>',
  type: '<rect class="a" x="3" y="4" width="18" height="4.4" rx="1.4"/><rect class="b" x="3" y="10" width="11" height="4.4" rx="1.4"/><rect class="a" x="3" y="16" width="18" height="4" rx="1.4"/>',
  filter: '<rect class="a" x="3" y="5" width="18" height="2.6" rx="1.3"/><rect class="b" x="6.5" y="10.7" width="11" height="2.6" rx="1.3"/><rect class="a" x="9.5" y="16.4" width="5" height="2.6" rx="1.3"/>'
};

/* Signatures of the previous outline icons, matched against their markup. */
const SIGS = [
  ["M4 21a8 8 0 0 1 16 0", "user"],
  ["M18 8a6 6 0 0 0-12 0", "bell"],
  ["M12 7v5l3 2", "clock"],
  ["M8 6h13M8 12h13M8 18h13", "list"],
  ["M9 6h6M9 10h2", "phone"], ["M9 7h6M9 11h2", "phone"], ["M8 6h8M8 10h2", "phone"],
  ["M4 22V4M4 4h14", "flag"],
  ["M2 21a7 7 0 0 1 14 0", "group"],
  ['width="18" height="12" rx="2"', "cash"],
  ["M12 9v4l2 2M9 2h6", "timer"],
  ["M7 3h10l3 3v15H4V3z", "doc"],
  ["M4 6h10M18 6h2", "sliders"],
  ["m3 10 9-7 9 7", "home"],
  ['r="1.6"', "more"],
  ["M5 12h14M13 6l6 6-6 6", "back"],
  ["M6 6l12 12M18 6 6 18", "close"],
  ["M3 21h18M5 21V5l7-2v18", "company"],
  ["m8 12 2.5 2.5L16 9", "status"],
  ["M4 5h16v4H4z", "type"],
  ["M4 6h16M7 12h10m-7 6h4", "filter"]
];

function swapIcon(svg) {
  if (!svg || svg.closest(".password-toggle") || svg.querySelector("g[data-ami]")) return;
  const html = svg.innerHTML;
  const hit = SIGS.find(([sig]) => html.includes(sig));
  if (!hit) return;
  ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"].forEach(a => svg.removeAttribute(a));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ami");
  svg.innerHTML = '<g data-ami="' + hit[1] + '">' + I[hit[1]] + "</g>";
}

function scanIcons(node) {
  if (!node || node.nodeType !== 1) return;
  const tag = node.tagName.toLowerCase();
  if (tag === "svg") swapIcon(node);
  else {
    const parent = node.closest && node.closest("svg");
    if (parent) swapIcon(parent);
  }
  if (node.querySelectorAll) node.querySelectorAll("svg").forEach(swapIcon);
}

/* ---------- Carousel ---------- */
function initCarousel(track, label) {
  if (!track || track.dataset.amanCarousel === "1") return;
  track.dataset.amanCarousel = "1";
  track.classList.add("aman-carousel-track");
  track.setAttribute("role", "group");
  track.setAttribute("aria-roledescription", "carousel");
  track.setAttribute("aria-label", label || "البطاقات");
  const dots = document.createElement("div");
  dots.className = "aman-dots";
  track.insertAdjacentElement("afterend", dots);
  let active = -1, raf = 0;
  const cards = () => Array.from(track.children).filter(el => !el.hidden);
  const goTo = i => {
    const card = cards()[i];
    if (!card) return;
    const t = track.getBoundingClientRect(), c = card.getBoundingClientRect();
    track.scrollBy({ left: (c.left + c.width / 2) - (t.left + t.width / 2), behavior: "smooth" });
  };
  const renderDots = () => {
    const n = cards().length;
    if (dots.children.length === n) return;
    dots.textContent = "";
    for (let i = 0; i < n; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "aman-dot";
      b.setAttribute("aria-label", "البطاقة " + (i + 1) + " من " + n);
      b.addEventListener("click", () => goTo(i));
      dots.append(b);
    }
  };
  const update = () => {
    if (!track.clientWidth) return;
    renderDots();
    const t = track.getBoundingClientRect(), mid = t.left + t.width / 2;
    let best = 0, dist = Infinity;
    cards().forEach((card, i) => {
      const r = card.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - mid);
      if (d < dist) { dist = d; best = i; }
    });
    if (best === active) return;
    active = best;
    cards().forEach((card, i) => card.classList.toggle("is-active", i === best));
    Array.from(dots.children).forEach((b, i) => {
      b.classList.toggle("is-active", i === best);
      b.setAttribute("aria-current", i === best ? "true" : "false");
    });
  };
  track.addEventListener("scroll", () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; update(); });
  }, { passive: true });
  if (window.ResizeObserver) new ResizeObserver(update).observe(track);
  new MutationObserver(() => { active = -1; update(); }).observe(track, { childList: true });
  window.addEventListener("resize", update);
  requestAnimationFrame(update);
}

/* Client home: exactly three empty design slots. No data, links or actions. */
function injectClientSlots() {
  const home = document.getElementById("home-screen");
  if (!home || home.querySelector(".aman-home-cards")) return;
  const section = document.createElement("section");
  section.className = "aman-home-cards";
  section.setAttribute("aria-label", "بطاقات الرئيسية");
  const track = document.createElement("div");
  for (let i = 0; i < 3; i++) {
    const slot = document.createElement("div");
    slot.className = "aman-slot";
    track.append(slot);
  }
  section.append(track);
  const head = home.querySelector(".page-head");
  if (head) head.after(section); else home.prepend(section);
  initCarousel(track, "بطاقات الرئيسية");
}

function scanCarousels(root) {
  const scope = root && root.querySelectorAll ? root : document;
  if (scope.matches && scope.matches(".admin-stats")) initCarousel(scope, "الإحصائيات");
  scope.querySelectorAll(".admin-stats").forEach(el => initCarousel(el, "الإحصائيات"));
}

function init() {
  scanIcons(document.documentElement);
  scanCarousels(document);
  injectClientSlots();
  new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(n => {
    scanIcons(n);
    if (n.nodeType === 1) scanCarousels(n);
  }))).observe(document.documentElement, { childList: true, subtree: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
})();
