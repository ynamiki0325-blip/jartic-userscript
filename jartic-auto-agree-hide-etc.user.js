// ==UserScript==
// @name         JARTIC 自動同意 + ETC専用入口バナー非表示
// @namespace    https://www.jartic.or.jp/
// @version      2.0.0
// @description  JARTICの利用規約を自動同意し、首都高地図上のETC専用入口の紫バナーを非表示にします。
// @match        https://www.jartic.or.jp/*
// @match        https://*.jartic.or.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const HIDE_MARK = 'data-jartic-etc-banner-hidden';

  function autoAgree() {
    const candidates = [
      ...document.querySelectorAll('button, a, input[type="button"], input[type="submit"]')
    ];

    for (const el of candidates) {
      const label = (
        el.innerText ||
        el.textContent ||
        el.value ||
        el.getAttribute('aria-label') ||
        ''
      ).replace(/\s+/g, '');

      if (label === '同意する' || label.includes('利用規約に同意する')) {
        const context = (
          el.closest('[role="dialog"], .modal, .dialog, .popup, body')?.innerText || ''
        );
        if (/利用規約|規約/.test(context)) {
          el.click();
          return true;
        }
      }
    }
    return false;
  }

  function looksLikeEtcBanner(el) {
    if (!(el instanceof Element)) return false;

    const attrs = [
      el.getAttribute('alt'),
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.getAttribute('href'),
      el.getAttribute('src'),
      el.getAttribute('data-src'),
      el.id,
      el.className
    ].filter(Boolean).join(' ');

    if (/ETC.{0,12}専用.{0,12}入口/i.test(attrs)) return true;
    if (/etc[^"' )]{0,40}(banner|bnr|entrance|entry)/i.test(attrs)) return true;
    if (/(banner|bnr)[^"' )]{0,40}etc/i.test(attrs)) return true;

    const text = (el.textContent || '').replace(/\s+/g, '');
    if (
      text.length < 250 &&
      /ETC専用入口/.test(text) &&
      (/現金/.test(text) || /クレジットカード/.test(text))
    ) {
      return true;
    }

    try {
      const bg = getComputedStyle(el).backgroundImage || '';
      if (/etc/i.test(bg) && /(banner|bnr|entrance|entry)/i.test(bg)) return true;
    } catch (_) {}

    return false;
  }

  function hideBannerElement(el) {
    if (!el || el.hasAttribute(HIDE_MARK)) return;

    let target = el;

    if (el.tagName === 'IMG') {
      const link = el.closest('a');
      if (link && link.querySelectorAll('img').length <= 2) target = link;
    }

    const rect = target.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0 && rect.height < 260) {
      const parent = target.parentElement;
      if (parent) {
        const pr = parent.getBoundingClientRect?.();
        if (
          pr &&
          pr.height > 0 &&
          pr.height < 280 &&
          pr.width <= Math.max(window.innerWidth * 1.2, 1200)
        ) {
          const siblings = [...parent.children].filter(
            c => c !== target && getComputedStyle(c).display !== 'none'
          );
          if (siblings.length <= 1) target = parent;
        }
      }
    }

    target.setAttribute(HIDE_MARK, '1');
    target.style.setProperty('display', 'none', 'important');
    target.style.setProperty('visibility', 'hidden', 'important');
    target.style.setProperty('height', '0', 'important');
    target.style.setProperty('min-height', '0', 'important');
    target.style.setProperty('margin', '0', 'important');
    target.style.setProperty('padding', '0', 'important');
  }

  function hideEtcBanner() {
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

    const nodes = document.querySelectorAll(selectors.join(','));
    for (const el of nodes) {
      if (looksLikeEtcBanner(el)) hideBannerElement(el);
    }
  }

  let scheduled = false;
  function run() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      autoAgree();
      hideEtcBanner();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }

  const startObserver = () => {
    if (!document.documentElement) {
      setTimeout(startObserver, 10);
      return;
    }
    const observer = new MutationObserver(run);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'style', 'class', 'alt', 'title', 'aria-label']
    });
  };
  startObserver();

  setInterval(run, 1500);
})();