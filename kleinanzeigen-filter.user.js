// ==UserScript==
// @name         Kleinanzeigen Ausschlussfilter
// @namespace    https://github.com/DEIN-USER/kleinanzeigen-filter
// @version      1.0.0
// @description  Blendet Anzeigen in der Kleinanzeigen-Suchergebnisliste aus, die bestimmte Begriffe enthalten.
// @match        https://www.kleinanzeigen.de/s-*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/DEIN-USER/kleinanzeigen-filter/main/kleinanzeigen-filter.user.js
// @downloadURL  https://raw.githubusercontent.com/DEIN-USER/kleinanzeigen-filter/main/kleinanzeigen-filter.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- Einstellungen (persistent) ---------- */
  const KEY = 'ka_filter_v1';
  const DEFAULTS = { terms: [], inDescription: true, enabled: true, collapsed: false };

  const store = {
    load() {
      try {
        const raw = typeof GM_getValue === 'function' ? GM_getValue(KEY, null) : localStorage.getItem(KEY);
        return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
      } catch (e) {
        return Object.assign({}, DEFAULTS);
      }
    },
    save(s) {
      const raw = JSON.stringify(s);
      try {
        if (typeof GM_setValue === 'function') GM_setValue(KEY, raw);
        else localStorage.setItem(KEY, raw);
      } catch (e) { /* ignorieren */ }
    },
  };

  let settings = store.load();

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

  // Findet jede Anzeige über ihren Link; unabhängig von CSS-Klassen.
  // Liefert { box: Element mit dem Anzeigentext, hideEl: Element, das ausgeblendet wird }
  function findAds() {
    const seen = new Set();
    const ads = [];
    document.querySelectorAll(LINK_SELECTOR).forEach((a) => {
      let box = a.closest('article') || a.closest('li');
      if (!box || seen.has(box)) return;
      if (distinctLinks(box) !== 1) return; // Container zu groß (enthält mehrere Anzeigen)
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

  let hiddenCount = 0;
  let counterEl = null;

  function apply() {
    const matchers = settings.enabled ? settings.terms.map(toMatcher).filter(Boolean) : [];
    hiddenCount = 0;
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
    #kaf-panel{position:fixed;right:16px;bottom:16px;z-index:99999;width:280px;max-width:calc(100vw - 32px);
      font:14px/1.4 system-ui,sans-serif;background:#fff;color:#222;border:1px solid #ccc;border-radius:10px;
      box-shadow:0 4px 16px rgba(0,0,0,.2)}
    #kaf-panel *{box-sizing:border-box}
    #kaf-head{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;
      background:#86b817;color:#fff;border-radius:10px 10px 0 0;font-weight:600}
    #kaf-panel.kaf-collapsed #kaf-head{border-radius:10px}
    #kaf-panel.kaf-collapsed #kaf-body{display:none}
    #kaf-body{padding:10px 12px}
    #kaf-input{width:100%;padding:6px 8px;border:1px solid #bbb;border-radius:6px;font:inherit}
    #kaf-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;max-height:150px;overflow:auto}
    .kaf-chip{background:#eee;border-radius:12px;padding:2px 8px;display:inline-flex;gap:6px;align-items:center}
    .kaf-chip button{border:0;background:none;cursor:pointer;font-size:14px;line-height:1;padding:0;color:#a00}
    .kaf-row{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:13px}
    .kaf-row label{display:flex;gap:6px;align-items:center;cursor:pointer}
    .kaf-hint{font-size:12px;color:#666;margin-top:6px}
    @media (prefers-color-scheme: dark){
      #kaf-panel{background:#2a2a2a;color:#eee;border-color:#555}
      #kaf-input{background:#1e1e1e;color:#eee;border-color:#555}
      .kaf-chip{background:#3a3a3a}
      .kaf-hint{color:#aaa}
    }`;

  function el(tag, props, ...children) {
    const e = document.createElement(tag);
    Object.assign(e, props || {});
    children.forEach((c) => e.append(c));
    return e;
  }

  let panel, chips;

  function persist() {
    store.save(settings);
    apply();
  }

  function renderChips() {
    chips.replaceChildren();
    settings.terms.forEach((term, i) => {
      const rm = el('button', { type: 'button', title: 'Entfernen', textContent: '×' });
      rm.addEventListener('click', () => {
        settings.terms.splice(i, 1);
        renderChips();
        persist();
      });
      chips.append(el('span', { className: 'kaf-chip' }, el('span', { textContent: term }), rm));
    });
  }

  function addTerms(text) {
    text.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => {
      if (!settings.terms.some((x) => x.toLowerCase() === t.toLowerCase())) settings.terms.push(t);
    });
    renderChips();
    persist();
  }

  function buildPanel() {
    document.head.append(el('style', { textContent: css }));

    const input = el('input', { id: 'kaf-input', type: 'text', placeholder: 'Begriff ausschließen + Enter' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        addTerms(input.value);
        input.value = '';
      }
    });

    chips = el('div', { id: 'kaf-chips' });

    const cbDesc = el('input', { type: 'checkbox', checked: settings.inDescription });
    cbDesc.addEventListener('change', () => { settings.inDescription = cbDesc.checked; persist(); });

    const cbOn = el('input', { type: 'checkbox', checked: settings.enabled });
    cbOn.addEventListener('change', () => { settings.enabled = cbOn.checked; persist(); });

    counterEl = el('span', { textContent: '0 ausgeblendet' });

    const body = el('div', { id: 'kaf-body' },
      input,
      chips,
      el('div', { className: 'kaf-row' }, el('label', {}, cbOn, 'Filter aktiv'), counterEl),
      el('div', { className: 'kaf-row' }, el('label', {}, cbDesc, 'Auch Beschreibung prüfen')),
      el('div', { className: 'kaf-hint', textContent: 'Mehrere mit Komma trennen. * = Platzhalter, /regex/ möglich.' })
    );

    const head = el('div', { id: 'kaf-head' }, el('span', { textContent: 'Ausschlussfilter' }), el('span', { textContent: '▾' }));
    head.addEventListener('click', () => {
      settings.collapsed = !settings.collapsed;
      panel.classList.toggle('kaf-collapsed', settings.collapsed);
      store.save(settings);
    });

    panel = el('div', { id: 'kaf-panel', className: settings.collapsed ? 'kaf-collapsed' : '' }, head, body);
    document.body.append(panel);
    renderChips();
  }

  /* ---------- Start ---------- */
  buildPanel();
  apply();

  // Nachladende / ersetzte Ergebnisse (Pagination, Filterwechsel) automatisch mitfiltern
  let timer = null;
  new MutationObserver((mutations) => {
    if (mutations.every((m) => panel.contains(m.target))) return;
    clearTimeout(timer);
    timer = setTimeout(apply, 150);
  }).observe(document.body, { childList: true, subtree: true });
})();
