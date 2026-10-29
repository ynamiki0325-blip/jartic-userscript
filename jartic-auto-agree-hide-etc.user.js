// ==UserScript==
// @name         JARTIC 自動同意 + 地図UI整理
// @namespace    https://www.jartic.or.jp/
// @version      3.1.0
// @description  JARTICの利用規約を強力に自動同意し、ETC専用入口バナーと規制情報操作パネルを非表示にして地図を広く表示します。
// @match        https://www.jartic.or.jp/*
// @match        https://*.jartic.or.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const HIDE_MARK = 'data-jartic-ui-hidden';
  const hookedDocs = new WeakSet();
  const burstTimers = new WeakMap();

  function normalize(s) {
    return (s || '').replace(/\s+/g, '');
  }

  function hideElement(el) {
    if (!el || el.hasAttribute?.(HIDE_MARK)) return;
    try { el.setAttribute(HIDE_MARK, '1'); } catch (_) {}

    for (const [prop, value] of [
      ['display', 'none'],
      ['visibility', 'hidden'],
      ['height', '0'],
      ['min-height', '0'],
      ['max-height', '0'],
      ['margin', '0'],
      ['padding', '0'],
      ['border', '0'],
      ['overflow', 'hidden']
    ]) {
      try { el.style.setProperty(prop, value, 'important'); } catch (_) {}
    }
  }

  // 利用規約の「同意する」を、表示タイミングが遅くても拾う
  function autoAgree(doc) {
    let candidates = [];
    try {
      candidates = [
        ...doc.querySelectorAll(
          'button, a, input[type="button"], input[type="submit"], [role="button"]'
        )
      ];
    } catch (_) {
      return false;
    }

    for (const el of candidates) {
      const label = normalize(
        el.innerText ||
        el.textContent ||
        el.value ||
        el.getAttribute?.('aria-label') ||
        ''
      );

      if (
        label === '同意する' ||
        label.includes('利用規約に同意する') ||
        label.includes('規約に同意する')
      ) {
        const contextNode =
          el.closest?.(
            '[role="dialog"], .modal, .dialog, .popup, [class*="modal"], [class*="dialog"], [class*="popup"]'
          ) || doc.body;

        const context = normalize(
          contextNode?.innerText ||
          contextNode?.textContent ||
          doc.body?.innerText ||
          ''
        );

        if (/利用規約|規約/.test(context)) {
          try { el.click(); } catch (_) {}
          try {
            el.dispatchEvent(
              new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: doc.defaultView
              })
            );
          } catch (_) {}
          return true;
        }
      }
    }
    return false;
  }

  // 初期数秒は高頻度で同意ボタンを探す
  function startConsentBurst(doc) {
    if (burstTimers.has(doc)) return;

    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      autoAgree(doc);
      if (count >= 80) { // 約12秒
        clearInterval(timer);
        burstTimers.delete(doc);
      }
    }, 150);

    burstTimers.set(doc, timer);
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

    return false;
  }

  function hideEtcBanner(doc, win) {
    let nodes = [];
    try {
      nodes = doc.querySelectorAll([
        'img',
        'a',
        '[aria-label]',
        '[title]',
        '[style*="background"]',
        '[class*="banner" i]',
        '[class*="bnr" i]',
        '[id*="banner" i]',
        '[id*="bnr" i]'
      ].join(','));
    } catch (_) {
      return;
    }

    for (const el of nodes) {
      if (!looksLikeEtcBanner(el, win)) continue;

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

      hideElement(target);
    }
  }

  // 「規制情報」のチェックは触らず、操作パネルだけ非表示
  function hideRegulationPanel(doc, win) {
    let textNodes = [];
    try {
      textNodes = [
        ...doc.querySelectorAll(
          'label, span, div, p, li, button, [role="checkbox"], [class*="control"], [class*="filter"]'
        )
      ];
    } catch (_) {
      return;
    }

    for (const el of textNodes) {
      const text = normalize(
        el.innerText ||
        el.textContent ||
        el.getAttribute?.('aria-label') ||
        ''
      );

      if (text !== '規制情報' && !text.startsWith('規制情報')) continue;
      if (text.length > 80) continue;

      let target = el;

      // ラベル自身ではなく、チェックボックスを含む小さな操作行まで広げる
      for (let i = 0; i < 4 && target?.parentElement; i++) {
        const parent = target.parentElement;
        let rect;
        try { rect = parent.getBoundingClientRect(); } catch (_) { break; }

        const hasCheckbox =
          !!parent.querySelector?.('input[type="checkbox"], [role="checkbox"]');

        const parentText = normalize(parent.textContent || '');

        if (
          rect &&
          rect.height > 0 &&
          rect.height <= 220 &&
          rect.width > 0 &&
          (
            hasCheckbox ||
            (parentText.includes('規制情報') && parentText.length < 180)
          )
        ) {
          target = parent;
        } else {
          break;
        }
      }

      // 地図全体など大きすぎる領域は絶対に消さない
      try {
        const r = target.getBoundingClientRect();
        if (
          r.height > 0 &&
          r.height <= 220 &&
          r.width > 0 &&
          r.width <= Math.max(win.innerWidth * 1.2, 1200)
        ) {
          hideElement(target);
        }
      } catch (_) {}
    }
  }

  function processDocument(doc, win) {
    if (!doc || !win) return;

    autoAgree(doc);
    hideEtcBanner(doc, win);
    hideRegulationPanel(doc, win);

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
        // cross-origin iframeはUserscripts側の@match実行に任せる
      }
    }
  }

  function hookDocument(doc, win) {
    if (!doc || !win || hookedDocs.has(doc)) return;
    hookedDocs.add(doc);

    const run = () => processDocument(doc, win);

    startConsentBurst(doc);

    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', () => {
        startConsentBurst(doc);
        run();
      }, { once: true });
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
        // 規約モーダルが後から出た場合は再び高頻度監視
        startConsentBurst(doc);
        win.requestAnimationFrame(run);
      });

      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'src', 'href', 'style', 'class', 'alt',
          'title', 'aria-label', 'aria-hidden'
        ]
      });
    };

    startObserver();

    try {
      for (const frame of doc.querySelectorAll('iframe, frame')) {
        frame.addEventListener('load', () => {
          startConsentBurst(doc);
          run();
        });
      }
    } catch (_) {}
  }

  hookDocument(document, window);

  // ページ遷移・遅延描画対策
  [100, 300, 600, 1000, 1500, 2500, 4000, 7000].forEach(ms => {
    setTimeout(() => {
      startConsentBurst(document);
      processDocument(document, window);
    }, ms);
  });

  // 長時間開いたままでも、規約の再表示・UIの再生成に対応
  setInterval(() => processDocument(document, window), 1200);
})();