// JARTIC 首都高 - Scriptable 軽量版
// ホーム画面からScriptable経由で起動し、地図を全画面表示します。

const URL = "https://www.jartic.or.jp/?p=C01&z=8";

const web = new WebView();

// まずJARTICを通常どおり読み込む。
// 通信を無理に遮断しないことで、地図や交通情報の欠落を防ぐ。
await web.loadURL(URL);

// 読み込み後に1回だけ軽量なUI整理スクリプトを注入。
// 以後は MutationObserver が「変化があった時だけ」動く。
await web.evaluateJavaScript(`
(() => {
  "use strict";

  const seen = new WeakSet();

  const norm = s => (s || "").replace(/\\s+/g, "");

  const hide = el => {
    if (!el || el.dataset?.jarticHidden === "1") return;
    try { el.dataset.jarticHidden = "1"; } catch (_) {}
    try {
      el.style.setProperty("display", "none", "important");
    } catch (_) {}
  };

  // 小さなUI要素だけを安全に親要素まで広げて消す。
  const hideCompactBlock = (el, doc, maxH = 220) => {
    if (!el) return;
    let target = el;

    for (let i = 0; i < 3 && target.parentElement; i++) {
      const p = target.parentElement;
      let r;
      try { r = p.getBoundingClientRect(); } catch (_) { break; }

      if (
        r.height > 0 &&
        r.height <= maxH &&
        r.width > 0 &&
        r.width <= Math.max((doc.defaultView?.innerWidth || 390) * 1.15, 700)
      ) {
        target = p;
      } else {
        break;
      }
    }

    hide(target);
  };

  const autoAgree = doc => {
    let nodes;
    try {
      nodes = doc.querySelectorAll(
        'button,a,input[type="button"],input[type="submit"],[role="button"]'
      );
    } catch (_) { return; }

    for (const el of nodes) {
      const t = norm(
        el.innerText ||
        el.textContent ||
        el.value ||
        el.getAttribute?.("aria-label")
      );

      if (
        t === "同意する" ||
        t.includes("利用規約に同意する") ||
        t.includes("規約に同意する")
      ) {
        const bodyText = norm(doc.body?.innerText);
        if (bodyText.includes("利用規約") || bodyText.includes("規約")) {
          try { el.click(); } catch (_) {}
          return;
        }
      }
    }
  };

  const hideNotice = doc => {
    let nodes;
    try { nodes = doc.querySelectorAll("div,p,span,li"); }
    catch (_) { return; }

    for (const el of nodes) {
      const t = norm(el.textContent);

      // 上部「本サイトは、全ての道路交通情報が…」
      if (
        t.length < 220 &&
        t.includes("本サイトは") &&
        t.includes("全ての道路交通情報")
      ) {
        hideCompactBlock(el, doc, 150);
      }

      // ETC専用入口の紫バナー
      if (
        t.length < 220 &&
        t.includes("ETC専用入口") &&
        (t.includes("現金") || t.includes("クレジットカード"))
      ) {
        hideCompactBlock(el, doc, 180);
      }
    }

    // ETCが画像になっている場合
    let imgs;
    try { imgs = doc.querySelectorAll("img"); } catch (_) { return; }

    for (const img of imgs) {
      const s = [
        img.alt,
        img.title,
        img.src,
        img.getAttribute?.("aria-label")
      ].filter(Boolean).join(" ");

      if (/ETC.{0,20}専用.{0,20}入口/i.test(s)) {
        hideCompactBlock(img.closest("a") || img, doc, 180);
      }
    }
  };

  const hideMapControls = doc => {
    // よく使われる地図ライブラリのズーム/全画面コントロール。
    const selectors = [
      ".leaflet-control-zoom",
      ".leaflet-control-fullscreen",
      ".leaflet-control-zoom-fullscreen",
      ".ol-zoom",
      ".ol-full-screen",
      "[class*='fullscreen' i]",
      "[class*='full-screen' i]"
    ];

    for (const s of selectors) {
      try {
        doc.querySelectorAll(s).forEach(hide);
      } catch (_) {}
    }

    // クラス名が変わっても、+ / - / 全画面ラベルから拾う。
    let controls;
    try {
      controls = doc.querySelectorAll(
        'button,a,[role="button"],[title],[aria-label]'
      );
    } catch (_) { return; }

    for (const el of controls) {
      const t = norm(
        el.innerText ||
        el.textContent ||
        el.getAttribute?.("title") ||
        el.getAttribute?.("aria-label")
      );

      let r;
      try { r = el.getBoundingClientRect(); } catch (_) { continue; }

      // 地図左側の小さな操作ボタンだけを対象にする。
      const compact =
        r.width > 0 && r.width <= 100 &&
        r.height > 0 && r.height <= 100;

      if (!compact) continue;

      if (
        t === "+" ||
        t === "−" ||
        t === "-" ||
        /全画面|fullscreen|full-screen/i.test(t)
      ) {
        hide(el.closest(".leaflet-control, .ol-control") || el);
      }
    }
  };

  const hideRegulationPanel = doc => {
    let nodes;
    try { nodes = doc.querySelectorAll("label,div,span,p,li"); }
    catch (_) { return; }

    for (const el of nodes) {
      const t = norm(el.textContent);

      if (
        t.length < 100 &&
        (
          t === "規制情報" ||
          t.includes("規制情報(通行止除く)") ||
          t.includes("規制情報（通行止除く）")
        )
      ) {
        hideCompactBlock(el, doc, 180);
      }
    }
  };

  const clean = (doc, win) => {
    if (!doc || !win) return;

    autoAgree(doc);
    hideNotice(doc);
    hideMapControls(doc);
    hideRegulationPanel(doc);

    let frames;
    try { frames = doc.querySelectorAll("iframe,frame"); }
    catch (_) { return; }

    for (const frame of frames) {
      try {
        const childDoc = frame.contentDocument || frame.contentWindow?.document;
        const childWin = frame.contentWindow;
        if (childDoc && childWin) attach(childDoc, childWin);
      } catch (_) {}
    }
  };

  const attach = (doc, win) => {
    if (!doc || !win || seen.has(doc)) return;
    seen.add(doc);

    let queued = false;
    const run = () => {
      if (queued) return;
      queued = true;
      win.requestAnimationFrame(() => {
        queued = false;
        clean(doc, win);
      });
    };

    // 今あるUIを即処理。
    run();

    // 後から表示される利用規約・バナー等だけを拾う。
    const startObserver = () => {
      if (!doc.documentElement) {
        win.setTimeout(startObserver, 30);
        return;
      }

      new win.MutationObserver(run).observe(doc.documentElement, {
        childList: true,
        subtree: true
      });

      // iframeの再読み込みにも対応。
      try {
        doc.querySelectorAll("iframe,frame").forEach(f => {
          f.addEventListener("load", run, { passive: true });
        });
      } catch (_) {}
    };

    startObserver();
  };

  attach(document, window);

  // JARTICの遅延描画を拾うための短い初期補助。
  // 常時タイマーではないので、起動後の負荷はほぼ残らない。
  [150, 400, 900, 1800, 3500].forEach(ms => {
    setTimeout(() => clean(document, window), ms);
  });

  true;
})();
`);

// Scriptable内で全画面表示。
await web.present(true);

Script.complete();
