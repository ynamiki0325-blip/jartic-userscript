// ==UserScript==
// @name         JARTIC 自動同意 + ETC専用入口バナー非表示
// @namespace    https://www.jartic.or.jp/
// @version      3.0.0
// @description  JARTICの利用規約を自動同意し、首都高地図上のETC専用入口の紫バナーを非表示にします。iframe内も再帰的に処理します。
// @match        https://www.jartic.or.jp/*
// @match        https://*.jartic.or.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const HIDE_MARK = 'data-jartic-etc-banner-hidden';
  const hookedDocs = new WeakSet();

  function normalize(s) {
    return (s || '').replace(/\s+/g, '');
  }

  function autoAgree(doc) {
    const candidates = [
      ...doc.querySelectorAll('button, a, input[type="button"], input[type="submit"]')
    ];

    for (const el of candidates) {
      const label = normalize(
        el.innerText ||
        el.textContent ||
        el.value ||
        el.getAttribute('aria-label') ||
        ''
      );

      if (
        label === '同意する' ||
        label.includes('利用規約に同意する') ||
        label.includes('規約に同意する')
      ) {
        const contextNode =
          el.closest('[role="dialog"], .modal, .dialog, .popup, [class*="modal"], [class*="dialog"]') ||
          doc.body;

        const context = normalize(contextNode?.innerText || contextNode?.textContent || '');

        if (/利用規約|規約/.test(context)) {
          try {
            el.click();
          } catch (_) {
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
          return true;
        }
      }
    }
    return false;
  }

  function looksLikeEtcBanner(el, win) {
    if (!(el instanceof win.Element)) return false;

    const attrs = [
      el.getAttribute('alt'),
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.getAttribute('href'),
      el.getAttribute('src'),
      el.getAttribute('data-src'),
      el.id,
      typeof el.className === 'string' ? el.className : ''
    ].filter(Boolean).join(' ');

    if (/ETC.{0,12}専用.{0,12}入口/i.test(attrs)) return true;
    if (/etc[^"' )]{0,50}(banner|bnr|entrance|entry|gate)/i.test(attrs)) return true;
    if (/(banner|bnr)[^"' )]{0,50}etc/i.test(attrs)) return true;

    const text = normalize(el.textContent || '');
    if (
      text.length < 300 &&
      /ETC専用入口/.test(text) &&
      (/現金/.test(text) || /クレジットカード/.test(text))
    ) return true;

    try {
      const bg = win.getComputedStyle(el).backgroundImage || '';
      if (/etc/i.test(bg) && /(banner|bnr|entrance|entry|gate)/i.test(bg)) return true;
    } catch (_) {}

    // 紫色の横長バナー画像の保険判定
    if (el.tagName === 'IMG') {
      const r = el.getBoundingClientRect();
      if (r.width >= 220 && r.width / Math.max(r.height, 1) >= 3.2 && r.height <= 180) {
        const src = (el.currentSrc || el.src || '').toLowerCase();
        if (/etc|banner|bnr|notice|info/.test(src)) return true;
      }
    }

    return false;
  }

  function hideBannerElement(el, win) {
    if (!el || el.hasAttribute(HIDE_MARK)) return;

    let target = el;

    if (el.tagName === 'IMG') {
      const link = el.closest('a');
      if (link && link.querySelectorAll('img').length <= 2) target = link;
    }

    try {
      const rect = target.getBoundingClientRect();
      if (rect.height > 0 && rect.height < 280) {
        const parent = target.parentElement;
        if (parent) {
          const pr = parent.getBoundingClientRect();
          if (
            pr.height > 0 &&
            pr.height < 300 &&
            pr.width <= Math.max(win.innerWidth * 1.25, 1300)
          ) {
            const visibleSiblings = [...parent.children].filter(c => {
              if (c === target) return false;
              try { return win.getComputedStyle(c).display !== 'none'; } catch (_) { return false; }
            });
            if (visibleSiblings.length <= 1) target = parent;
          }
        }
      }
    } catch (_) {}

    target.setAttribute(HIDE_MARK, '1');
    for (const [prop, value] of [
      ['display', 'none'],
      ['visibility', 'hidden'],
      ['height', '0'],
      ['min-height', '0'],
      ['max-height', '0'],
      ['margin', '0'],
      ['padding', '0'],
      ['overflow', 'hidden']
    ]) {
      try { target.style.setProperty(prop, value, 'important'); } catch (_) {}
    }
  }

  function hideEtcBanner(doc, win) {
    const selectors = [
      'img',
      'a',
      '[aria-label]',
      '[title]',
      '[style*="background"]',
      '[class*="banner" i]',
      '[class*="bnr" i]',
      '[id*="banner" i]',
      '[id*="bnr" i]'
    ];

    let nodes = [];
    try {
      nodes = doc.querySelectorAll(selectors.join(','));
    } catch (_) {
      return;
    }

    for (const el of nodes) {
      if (looksLikeEtcBanner(el, win)) hideBannerElement(el, win);
    }
  }

  function processDocument(doc, win) {
    if (!doc || !win) return;

    autoAgree(doc);
    hideEtcBanner(doc, win);

    let frames = [];
    try {
      frames = [...doc.querySelectorAll('iframe, frame')];
    } catch (_) {}

    for (const frame of frames) {
      try {
        const childWin = frame.contentWindow;
        const childDoc = frame.contentDocument || childWin?.document;
        if (childDoc && childWin) {
          hookDocument(childDoc, childWin);
          processDocument(childDoc, childWin);
        }
      } catch (_) {
        // Cross-origin iframeはUserscripts側の@match実行に任せる
      }
    }
  }

  function hookDocument(doc, win) {
    if (!doc || !win || hookedDocs.has(doc)) return;
    hookedDocs.add(doc);

    const run = () => processDocument(doc, win);

    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }

    const startObserver = () => {
      const root = doc.documentElement;
      if (!root) {
        setTimeout(startObserver, 25);
        return;
      }

      const observer = new win.MutationObserver(() => {
        win.requestAnimationFrame(run);
      });

      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'href', 'style', 'class', 'alt', 'title', 'aria-label']
      });
    };

    startObserver();

    try {
      for (const frame of doc.querySelectorAll('iframe, frame')) {
        frame.addEventListener('load', run);
      }
    } catch (_) {}
  }

  hookDocument(document, window);

  // 初期ロード直後・動的読み込み後の取りこぼし対策
  setTimeout(() => processDocument(document, window), 300);
  setTimeout(() => processDocument(document, window), 1000);
  setInterval(() => processDocument(document, window), 2000);
})();