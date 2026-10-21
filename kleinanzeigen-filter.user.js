// ==UserScript==
// @name         Kleinanzeigen Ausschlussfilter
// @namespace    https://github.com/DEIN-USER/kleinanzeigen-filter
// @version      1.1.0
// @description  Blendet Anzeigen in der Kleinanzeigen-Suchergebnisliste aus, die bestimmte Begriffe enthalten. Mehrere Ausschlusslisten, Standardsortierung nach niedrigstem Preis.
// @match        https://www.kleinanzeigen.de/s-*
// @exclude      https://www.kleinanzeigen.de/s-anzeige/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/DEIN-USER/kleinanzeigen-filter/main/kleinanzeigen-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/DEIN-USER/kleinanzeigen-filter/main/kleinanzeigen-filter.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- Konfiguration ---------- */
  const SORT_PARAM = 'sortingField';
  const SORT_VALUE = 'PRICE_AMOUNT'; // niedrigster Preis zuerst

  /* ---------- Einstellungen (persistent) ---------- */
  const KEY = 'ka_filter_v1';
  const DEFAULTS = { lists: [], activeId: null, inDescription: true, enabled: true, collapsed: false, sortLowest: true };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const store = {
    load() {
      let s = {};
      try {
        const raw = typeof GM_getValue === 'function' ? GM_getValue(KEY, null) : localStorage.getItem(KEY);
        if (raw) s = JSON.parse(raw);
      } catch (e) { /* ignorieren */ }
      s = Object.assign({}, DEFAULTS, s);
      // Migration: alte Version hatte nur eine Liste "terms"
      if (!Array.isArray(s.lists) || !s.lists.length) {
        s.lists = [{ id: uid(), name: 'Standard', terms: Array.isArray(s.terms) ? s.terms : [], keys: [] }];
      }
      delete s.terms;
      s.lists.forEach((l) => { l.terms = l.terms || []; l.keys = l.keys || []; });
      if (!s.lists.some((l) => l.id === s.activeId)) s.activeId = s.lists[0].id;
      return s;
    },
    save(s) {
      const raw = JSON.stringify(s);
      try {
        if (typeof GM_setValue === 'function') GM_setValue(KEY, raw);
        else localStorage.setItem(KEY, raw);
      } catch (e) { /* ignorieren */ }
    },
  };

  const settings = store.load();
  const active = () => settings.lists.find((l) => l.id === settings.activeId) || settings.lists[0];

  /* ---------- Standardsortierung: niedrigster Preis ----------
     Wird nur gesetzt, wenn die URL noch keine Sortierung enthält.
     Wählst du selbst eine andere Sortierung, bleibt sie erhalten. */
  function ensureSort() {
    if (!settings.sortLowest) return false;
    const url = new URL(location.href);
    if (url.searchParams.has(SORT_PARAM)) return false;
    let last = 0;
    try { last = Number(sessionStorage.getItem('kaf_sort_ts')) || 0; } catch (e) { /* ignorieren */ }
    if (Date.now() - last < 5000) return false; // Schutz vor Endlosschleife
    try { sessionStorage.setItem('kaf_sort_ts', String(Date.now())); } catch (e) { /* ignorieren */ }
    url.searchParams.set(SORT_PARAM, SORT_VALUE);
    location.replace(url.href);
    return true;
  }

  /* ---------- Schlüssel der aktuellen Suche (für automatische Listenwahl) ----------
     /s-fahrrad/k0 -> "fahrrad", /s-berlin/fahrrad/k0l3331 -> "fahrrad", /s-fahrraeder/c217 -> "fahrraeder" */
  function currentKey() {
    const segs = location.pathname.split('/').filter(Boolean)
      .filter((s) => !/^(s-seite:|preis:)/.test(s) && !/^[kc]\d/.test(s));
    let last = segs[segs.length - 1] || '';
    try { last = decodeURIComponent(last); } catch (e) { /* ignorieren */ }
    return last.replace(/^s-/, '');
  }

  /* ---------- Begriffe -> Matcher ----------
     "defekt"        -> Teilstring, Groß/Kleinschreibung egal
     "ersatz*teil"   -> * = beliebige Zeichen
     "/^suche\b/i"   -> regulärer Ausdruck
  */
  function toMatcher(term) {
    const rx = term.match(/^\/(.+)\/([a-z]*)$/i);
    try {
      if (rx) return new RegExp(rx[1], rx[2] || 'i');
      const escaped = term.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(escaped, 'i');
    } catch (e) {
      return null;
    }
  }

  /* ---------- Anzeigen auswerten ---------- */
  const LINK_SELECTOR = 'a[href*="/s-anzeige/"]';

  function distinctLinks(root) {
    return new Set(Array.from(root.querySelectorAll(LINK_SELECTOR), (a) => a.getAttribute('href'))).size;
  }

  // Findet jede Anzeige über ihren Link, unabhängig von CSS-Klassen.
  function findAds() {
    const seen = new Set();
    const ads = [];
    document.querySelectorAll(LINK_SELECTOR).forEach((a) => {
      const box = a.closest('article') || a.closest('li');
      if (!box || seen.has(box)) return;
      if (distinctLinks(box) !== 1) return; // Container zu groß
      seen.add(box);
      const li = box.closest('li');
      const hideEl = li && distinctLinks(li) === 1 ? li : box;
      ads.push({ box, hideEl });
    });
    return ads;
  }

  function adText(box) {
    if (settings.inDescription) return box.textContent;
    const h = box.querySelector('h2, h3');
    if (h) return h.textContent;
    return Array.from(box.querySelectorAll(LINK_SELECTOR), (a) => a.textContent).join(' ');
  }

  let counterEl = null;

  function apply() {
    const matchers = settings.enabled ? active().terms.map(toMatcher).filter(Boolean) : [];
    let hiddenCount = 0;
    const ads = findAds();
    ads.forEach(({ box, hideEl }) => {
      const hide = matchers.length > 0 && matchers.some((m) => m.test(adText(box)));
      if (hide) {
        hideEl.style.display = 'none';
        hideEl.dataset.kafHidden = '1';
        hiddenCount++;
      } else if (hideEl.dataset.kafHidden) {
        hideEl.style.display = '';
        delete hideEl.dataset.kafHidden;
      }
    });
    if (counterEl) counterEl.textContent = hiddenCount + ' ausgeblendet (' + ads.length + ' Anzeigen erkannt)';
  }

  /* ---------- Bedienfeld ---------- */
  const css = `
    #kaf-panel{position:fixed;right:16px;bottom:16px;z-index:99999;width:300px;max-width:calc(100vw - 32px);
      font:14px/1.4 system-ui,sans-serif;background:#fff;color:#222;border:1px solid #ccc;border-radius:10px;
      box-shadow:0 4px 16px rgba(0,0,0,.2)}
    #kaf-panel *{box-sizing:border-box}
    #kaf-head{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;
      background:#86b817;color:#fff;border-radius:10px 10px 0 0;font-weight:600}
    #kaf-panel.kaf-collapsed #kaf-head{border-radius:10px}
    #kaf-panel.kaf-collapsed #kaf-body{display:none}
    #kaf-body{padding:10px 12px}
    #kaf-listrow{display:flex;gap:4px;margin-bottom:8px}
    #kaf-select{flex:1;min-width:0;padding:5px 6px;border:1px solid #bbb;border-radius:6px;font:inherit}
    .kaf-ico{border:1px solid #bbb;background:#f4f4f4;border-radius:6px;cursor:pointer;padding:0 8px;font:inherit;color:inherit}
    #kaf-link{display:block;width:100%;text-align:left;margin-bottom:8px;padding:4px 8px;font-size:12px}
    #kaf-input{width:100%;padding:6px 8px;border:1px solid #bbb;border-radius:6px;font:inherit}
    #kaf-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;max-height:150px;overflow:auto}
    .kaf-chip{background:#eee;border-radius:12px;padding:2px 8px;display:inline-flex;gap:6px;align-items:center}
    .kaf-chip button{border:0;background:none;cursor:pointer;font-size:14px;line-height:1;padding:0;color:#a00}
    .kaf-row{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:13px}
    .kaf-row label{display:flex;gap:6px;align-items:center;cursor:pointer}
    .kaf-hint{font-size:12px;color:#666;margin-top:6px}
    @media (prefers-color-scheme: dark){
      #kaf-panel{background:#2a2a2a;color:#eee;border-color:#555}
      #kaf-input,#kaf-select{background:#1e1e1e;color:#eee;border-color:#555}
      .kaf-ico{background:#3a3a3a;border-color:#555}
      .kaf-chip{background:#3a3a3a}
      .kaf-hint{color:#aaa}
    }`;

  function el(tag, props, ...children) {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    children.forEach((c) => e.append(c));
    return e;
  }

  let panel, chips, select, linkBtn;

  function persist() {
    store.save(settings);
    apply();
  }

  function renderSelect() {
    select.replaceChildren();
    settings.lists.forEach((l) => {
      select.append(el('option', { value: l.id, textContent: l.name + ' (' + l.terms.length + ')' }));
    });
    select.value = active().id;
  }

  function renderLink() {
    const key = currentKey();
    if (!key) { linkBtn.style.display = 'none'; return; }
    linkBtn.style.display = '';
    const linked = active().keys.includes(key);
    linkBtn.textContent = linked
      ? '🔗 Verknüpft mit Suche „' + key + '“ (klicken zum Lösen)'
      : '🔗 Mit aktueller Suche „' + key + '“ verknüpfen';
  }

  function renderChips() {
    chips.replaceChildren();
    const list = active();
    list.terms.forEach((term, i) => {
      const rm = el('button', { type: 'button', title: 'Entfernen', textContent: '×' });
      rm.addEventListener('click', () => {
        list.terms.splice(i, 1);
        renderAll();
        persist();
      });
      chips.append(el('span', { className: 'kaf-chip' }, el('span', { textContent: term }), rm));
    });
  }

  function renderAll() {
    renderSelect();
    renderLink();
    renderChips();
  }

  function addTerms(text) {
    const list = active();
    text.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => {
      if (!list.terms.some((x) => x.toLowerCase() === t.toLowerCase())) list.terms.push(t);
    });
    renderAll();
    persist();
  }

  function newList() {
    const name = prompt('Name der neuen Ausschlussliste (z. B. „Fahrrad“):');
    if (!name || !name.trim()) return;
    const l = { id: uid(), name: name.trim(), terms: [], keys: [] };
    settings.lists.push(l);
    settings.activeId = l.id;
    renderAll();
    persist();
  }

  function renameList() {
    const l = active();
    const name = prompt('Neuer Name der Liste:', l.name);
    if (!name || !name.trim()) return;
    l.name = name.trim();
    renderAll();
    persist();
  }

  function deleteList() {
    const l = active();
    if (!confirm('Liste „' + l.name + '“ mit ' + l.terms.length + ' Begriffen wirklich löschen?')) return;
    settings.lists = settings.lists.filter((x) => x.id !== l.id);
    if (!settings.lists.length) settings.lists.push({ id: uid(), name: 'Standard', terms: [], keys: [] });
    settings.activeId = settings.lists[0].id;
    renderAll();
    persist();
  }

  function toggleLink() {
    const key = currentKey();
    if (!key) return;
    const l = active();
    if (l.keys.includes(key)) {
      l.keys = l.keys.filter((k) => k !== key);
    } else {
      settings.lists.forEach((x) => { x.keys = x.keys.filter((k) => k !== key); });
      l.keys.push(key);
    }
    renderLink();
    store.save(settings);
  }

  function checkbox(label, prop, onChange) {
    const cb = el('input', { type: 'checkbox', checked: settings[prop] });
    cb.addEventListener('change', () => { settings[prop] = cb.checked; if (onChange) onChange(); persist(); });
    return el('label', {}, cb, label);
  }

  function buildPanel() {
    document.head.append(el('style', { textContent: css }));

    select = el('select', { id: 'kaf-select', title: 'Aktive Ausschlussliste' });
    select.addEventListener('change', () => {
      settings.activeId = select.value;
      renderAll();
      persist();
    });

    const btn = (txt, title, fn) => {
      const b = el('button', { type: 'button', className: 'kaf-ico', textContent: txt, title });
      b.addEventListener('click', fn);
      return b;
    };

    linkBtn = el('button', { type: 'button', id: 'kaf-link', className: 'kaf-ico' });
    linkBtn.addEventListener('click', toggleLink);

    const input = el('input', { id: 'kaf-input', type: 'text', placeholder: 'Begriff ausschließen + Enter' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        addTerms(input.value);
        input.value = '';
      }
    });

    chips = el('div', { id: 'kaf-chips' });
    counterEl = el('span', { textContent: '' });

    const body = el('div', { id: 'kaf-body' },
      el('div', { id: 'kaf-listrow' },
        select,
        btn('+', 'Neue Liste', newList),
        btn('✎', 'Liste umbenennen', renameList),
        btn('🗑', 'Liste löschen', deleteList)),
      linkBtn,
      input,
      chips,
      el('div', { className: 'kaf-row' }, checkbox('Filter aktiv', 'enabled'), counterEl),
      el('div', { className: 'kaf-row' }, checkbox('Auch Beschreibung prüfen', 'inDescription')),
      el('div', { className: 'kaf-row' }, checkbox('Standard: niedrigster Preis zuerst', 'sortLowest')),
      el('div', { className: 'kaf-hint', textContent: 'Mehrere Begriffe mit Komma trennen. * = Platzhalter, /regex/ möglich.' })
    );

    const head = el('div', { id: 'kaf-head' }, el('span', { textContent: 'Ausschlussfilter' }), el('span', { textContent: '▾' }));
    head.addEventListener('click', () => {
      settings.collapsed = !settings.collapsed;
      panel.classList.toggle('kaf-collapsed', settings.collapsed);
      store.save(settings);
    });

    panel = el('div', { id: 'kaf-panel', className: settings.collapsed ? 'kaf-collapsed' : '' }, head, body);
    document.body.append(panel);
    renderAll();
  }

  /* ---------- Start ---------- */
  function init() {
    // Liste automatisch wählen, wenn sie mit dieser Suche verknüpft ist
    const key = currentKey();
    const linked = settings.lists.find((l) => l.keys.includes(key));
    if (linked) { settings.activeId = linked.id; store.save(settings); }

    buildPanel();
    apply();

    // Nachladende / ersetzte Ergebnisse automatisch mitfiltern
    let timer = null;
    new MutationObserver((mutations) => {
      if (mutations.every((m) => panel.contains(m.target))) return;
      clearTimeout(timer);
      timer = setTimeout(apply, 150);
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (ensureSort()) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
