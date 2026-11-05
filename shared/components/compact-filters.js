/* Unified animated search/filter controls for AMAN.C.
   Native inputs/selects remain the source of truth; only their presentation changes. */
(() => {
  "use strict";
  const icons = {
    company: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18M5 21V5l7-2v18M19 21V9l-7-2M8 8h1m-1 4h1m-1 4h1m7-4h1m-1 4h1"/></svg>',
    status: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    type: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v4H4zM4 11h10v4H4zM4 17h16v3H4z"/></svg>',
    generic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10m-7 6h4"/></svg>'
  };
  const iconFor = label => {
    const value = label.toLowerCase();
    if (/الشركة|شركات/.test(value)) return icons.company;
    if (/الحالة|حاله/.test(value)) return icons.status;
    if (/النوع|العملية/.test(value)) return icons.type;
    return icons.generic;
  };
  function closeFilter(item) {
    const select = item.querySelector('select.field');
    const toggle = item.querySelector('.compact-filter-icon');
    if (!select || !toggle) return;
    item.classList.remove('is-expanded');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'فتح فلتر ' + item.dataset.filterTitle);
    select.disabled = true;
    select.setAttribute('aria-hidden', 'true');
  }
  function openFilter(item) {
    const row = item.closest('.compact-filter-row');
    row.querySelectorAll('.compact-filter.is-expanded').forEach(other => {
      if (other !== item) closeFilter(other);
    });
    const select = item.querySelector('select.field');
    const toggle = item.querySelector('.compact-filter-icon');
    item.classList.add('is-expanded');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'إغلاق فلتر ' + item.dataset.filterTitle);
    select.disabled = false;
    select.removeAttribute('aria-hidden');
    requestAnimationFrame(() => select.focus({ preventScroll: true }));
  }
  function prepare(row) {
    if (!row || row.dataset.compactFiltersReady === 'true') return;
    const search = row.querySelector('.toolbar-search') ||
      [...row.children].find(el => el.querySelector('input[type="search"],input:not([type]),input[type="text"]'));
    if (search) search.classList.add('compact-search');
    const candidates = row.classList.contains('admin-filter-grid')
      ? [...row.children]
      : [...row.querySelectorAll('.toolbar-filter')];
    candidates.forEach(item => {
      const select = item.querySelector('select.field');
      const label = item.querySelector('.field-label');
      if (!select || !label || item.dataset.compactFilterReady === 'true') return;
      const title = label.textContent.trim();
      item.classList.add('compact-filter');
      item.dataset.filterTitle = title;
      const control = document.createElement('div');
      control.className = 'compact-filter-control';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'compact-filter-icon';
      toggle.setAttribute('aria-label', 'فتح فلتر ' + title);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.title = title;
      const glyph = document.createElement('span');
      glyph.className = 'compact-filter-glyph';
      glyph.innerHTML = iconFor(title);
      const caption = document.createElement('span');
      caption.className = 'compact-filter-caption';
      caption.textContent = title;
      const close = document.createElement('span');
      close.className = 'compact-filter-close';
      close.setAttribute('aria-hidden', 'true');
      close.textContent = '×';
      toggle.append(glyph, caption, close);
      control.append(toggle);
      item.append(control);
      label.hidden = true;
      select.classList.add('compact-filter-select');
      select.setAttribute('aria-label', title);
      select.disabled = true;
      select.setAttribute('aria-hidden', 'true');
      toggle.addEventListener('click', () => {
        if (item.classList.contains('is-expanded')) closeFilter(item);
        else openFilter(item);
      });
      select.addEventListener('change', () => {
        /* Keep the selected filter visible; the user closes it with × or its icon. */
      });
      item.dataset.compactFilterReady = 'true';
    });
    row.classList.add('compact-filter-row');
    row.dataset.compactFiltersReady = 'true';
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.matches('.customer-toolbar,.admin-filter-grid')) prepare(root);
    if (typeof root.querySelectorAll === 'function') root.querySelectorAll('.customer-toolbar,.admin-filter-grid').forEach(prepare);
  }
  function init() {
    scan(document);
    if (document.documentElement && !window.__amanCompactFiltersObserver) {
      const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(scan)));
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.__amanCompactFiltersObserver = observer;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
  document.addEventListener('aman:admin-screenchange', () => scan(document));
})();