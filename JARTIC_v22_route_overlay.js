// v22: v21 based, schematic route overlay prototype

 // JARTIC 首都高 v21 シンプル経路比較版
// 動作確認済みv18を土台に、確認できた経路を最大2件だけ表示します
// Scriptable用：このコードを丸ごと貼り付けてください。

const URL = "https://www.jartic.or.jp/map/?p=C01&z=8";
const START_PAN_X = 0.80;
const START_PAN_Y = -0.19;

// Google Routes APIキーはコードに直接保存せず、
// ScriptableのKeychainへ保存します。
const GOOGLE_KEYCHAIN_NAME = "JARTIC_ROUTES_API_KEY_V13";
let googleApiKey = "";

try {
  if (Keychain.contains(GOOGLE_KEYCHAIN_NAME)) {
    googleApiKey = Keychain.get(GOOGLE_KEYCHAIN_NAME) || "";
  }
} catch (_) {}

if (!googleApiKey) {
  const keyAlert = new Alert();
  keyAlert.title = "Google Routes API";
  keyAlert.message =
    "初回のみ、新しくローテーションしたAPIキーを入力してください。\n" +
    "キーはScriptableのKeychainに保存され、コード本文には残りません。";

  if (typeof keyAlert.addSecureTextField === "function") {
    keyAlert.addSecureTextField("APIキー", "");
  } else {
    keyAlert.addTextField("APIキー", "");
  }

  keyAlert.addAction("保存して続ける");
  keyAlert.addCancelAction("あとで設定");

  const choice = await keyAlert.present();

  if (choice !== -1) {
    const entered = (keyAlert.textFieldValue(0) || "").trim();
    if (entered) {
      googleApiKey = entered;
      try {
        Keychain.set(GOOGLE_KEYCHAIN_NAME, entered);
      } catch (_) {}
    }
  }
}

const web = new WebView();
await web.loadURL(URL);

// ============================================
// 1. 全画面表示・不要なUIの非表示
// ============================================

await web.evaluateJavaScript(`(${function () {
  if (window.__shLayoutInstalled) return;
  window.__shLayoutInstalled = true;

  const css = document.createElement("style");
  css.textContent = `
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
    }

    #sideContent, .spHeadBtn, .smp_rotate,
    .top-area, .banner, .map_right_btn_area,
    .map_btm_btn_area, .switch_area,
    .ol-zoom, .ol-zoomslider, .ol-zoom-extent,
    .ol-full-screen {
      display: none !important;
    }

    #mainContent, #mainContentInner {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      left: 0 !important;
      transform: none !important;
      transition: none !important;
    }

    #mainContent .map_area {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      max-height: none !important;
    }

    #map {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      max-height: none !important;
    }
  `;
  document.head.appendChild(css);

  function agreeTerms() {
    const modal = document.getElementById("termsModal");
    if (!modal) return;

    const button = [...modal.querySelectorAll(
      ".terms-btn-area .btn"
    )].find(el => el.textContent.trim() === "同意する");

    if (button) button.click();
  }

  agreeTerms();

  const termsObserver = new MutationObserver(() => {
    const modal = document.getElementById("termsModal");
    if (modal && modal.offsetParent !== null) {
      agreeTerms();
    }
  });

  termsObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  let resizing = false;

  function resizeMap() {
    if (resizing) return;
    resizing = true;

    requestAnimationFrame(() => {
      resizing = false;
      window.dispatchEvent(new Event("resize"));
    });
  }

  window.addEventListener("pageshow", resizeMap);
  window.visualViewport?.addEventListener(
    "resize", resizeMap
  );

  return true;
}.toString()})()`);

// ============================================
// 2. 地図の初期位置調整
// ============================================

await web.evaluateJavaScript(`(${function (dxRatio, dyRatio) {
  const map = document.getElementById("map");
  if (!map) return;

  let done = false;
  let timer, retry, expiry;

  function cleanup() {
    clearTimeout(timer);
    clearInterval(retry);
    clearTimeout(expiry);
    window.removeEventListener("resize", schedule);
    map.removeEventListener("pointerdown", cancel, true);
  }

  function cancel(event) {
    if (!event.isTrusted) return;
    done = true;
    cleanup();
  }

  map.addEventListener("pointerdown", cancel, true);

  async function pan() {
    if (done) return;

    const viewport = map.querySelector(".ol-viewport");
    if (!viewport || !viewport.querySelector("canvas")) return;

    const box = viewport.getBoundingClientRect();
    if (box.width < 10 || box.height < 10) return;

    done = true;
    cleanup();

    const x = box.left + box.width * 0.5;
    const y = box.top + box.height * 0.55;
    const dx = box.width * dxRatio;
    const dy = box.height * dyRatio;

    function send(type, px, py, buttons) {
      viewport.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 901,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons,
        clientX: px,
        clientY: py
      }));
    }

    send("pointerdown", x, y, 1);

    for (let i = 1; i <= 8; i++) {
      await new Promise(r => setTimeout(r, 16));
      send(
        "pointermove",
        x + dx * i / 8,
        y + dy * i / 8,
        1
      );
    }

    await new Promise(r => setTimeout(r, 120));
    send("pointerup", x + dx, y + dy, 0);
  }

  function schedule() {
    if (!done) {
      clearTimeout(timer);
      timer = setTimeout(pan, 100);
    }
  }

  window.addEventListener("resize", schedule);
  schedule();

  retry = setInterval(schedule, 1000);
  expiry = setTimeout(() => {
    done = true;
    cleanup();
  }, 8000);

}.toString()})(${START_PAN_X}, ${START_PAN_Y})`);

// ============================================
// 3. 過去12時間の履歴スライダー
// ============================================

await web.evaluateJavaScript(`(${function () {
  if (window.__shHistoryInstalled) return;
  window.__shHistoryInstalled = true;

  const base = "/d/traffic_info/r1/";

  const state = {
    stamp: null,
    token: 0,
    pending: 0,
    seen: new Set(),
    busy: false,
    label: ""
  };

  const style = document.createElement("style");

  style.textContent = `
    #sh-history, #sh-history * {
      box-sizing: border-box !important;
    }

    #sh-history {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      z-index: 100000 !important;
      background: white !important;
      color: #172536 !important;
      padding: 4px 12px 5px !important;
      border-radius: 9px 9px 0 0 !important;
      box-shadow: 0 -1px 6px #0002 !important;
      font: 12px -apple-system, sans-serif !important;
    }

    #sh-history .sh-row {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
    }

    #sh-history output {
      font-weight: 600 !important;
      flex-shrink: 0 !important;
    }

    #sh-history-status {
      flex: 1 !important;
      min-width: 0 !important;
      text-align: right !important;
      font-size: 10px !important;
      color: #526273 !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      text-overflow: ellipsis !important;
    }

    #sh-history button {
      width: auto !important;
      height: 26px !important;
      min-height: 0 !important;
      padding: 0 8px !important;
      background: #eef6ff !important;
      color: #0671cf !important;
      border: 0 !important;
      border-radius: 6px !important;
      font-size: 12px !important;
    }

    #sh-history input[type="range"] {
      -webkit-appearance: none !important;
      appearance: none !important;
      display: block !important;
      width: 100% !important;
      height: 26px !important;
      margin: 0 !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
    }

    #sh-history input[type="range"]::-webkit-slider-runnable-track {
      height: 4px !important;
      background: #cbd9e8 !important;
      border-radius: 2px !important;
    }

    #sh-history input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none !important;
      appearance: none !important;
      width: 20px !important;
      height: 20px !important;
      margin-top: -8px !important;
      background: #087cf0 !important;
      border: 2px solid white !important;
      border-radius: 50% !important;
      box-shadow: 0 1px 4px #0060b955 !important;
    }

    #sh-history .sh-ticks {
      display: flex !important;
      justify-content: space-between !important;
      color: #526273 !important;
      font-size: 10px !important;
    }

    #sh-history-mask {
      position: fixed !important;
      inset: 0 !important;
      z-index: 99999 !important;
      display: none;
      align-items: center;
      justify-content: center;
      background: #f5f6f8 !important;
      color: #172536 !important;
      text-align: center !important;
      padding: 25px !important;
      font: 17px -apple-system, sans-serif !important;
    }

    html[data-sh-history="past"] #reloadEvent,
    html[data-sh-history="past"] #offerDate {
      visibility: hidden !important;
    }
  `;

  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "sh-history";

  panel.innerHTML = `
    <div class="sh-row">
      <output id="sh-history-choice">現在</output>
      <span id="sh-history-status">最新情報</span>
      <button type="button" id="sh-history-now">現在へ</button>
    </div>
    <input
      id="sh-history-range"
      type="range"
      min="-12"
      max="0"
      step="1"
      value="0"
      aria-label="表示する時刻"
    >
    <div class="sh-ticks">
      <span>12時間前</span>
      <span>6時間前</span>
      <span>現在</span>
    </div>
  `;

  document.body.appendChild(panel);

  const slider = panel.querySelector("#sh-history-range");
  const choice = panel.querySelector("#sh-history-choice");
  const status = panel.querySelector("#sh-history-status");

  const mask = document.createElement("div");
  mask.id = "sh-history-mask";
  document.body.appendChild(mask);

  let deadline;
  let settle;

  function updateChoice() {
    const hours = -Number(slider.value);
    const label = hours ? hours + "時間前" : "現在";
    choice.textContent = label;
    slider.setAttribute("aria-valuetext", label);
  }

  function showMask(message) {
    mask.textContent = message;
    mask.style.display = "flex";
  }

  function fail(message) {
    clearTimeout(deadline);
    clearTimeout(settle);
    state.busy = false;
    slider.disabled = false;
    status.textContent = message;
    showMask(message + "。「現在へ」で戻れます。");
  }

  function stampMinusHours(stamp, hours) {
    if (!/^\d{12}$/.test(stamp)) {
      throw new Error("更新時刻が不正です");
    }

    const f = [
      stamp.slice(0, 4),
      stamp.slice(4, 6),
      stamp.slice(6, 8),
      stamp.slice(8, 10),
      stamp.slice(10, 12)
    ].map(Number);

    const date = new Date(Date.UTC(
      f[0], f[1] - 1, f[2], f[3] - hours, f[4]
    ));

    const pad = n => String(n).padStart(2, "0");

    return String(date.getUTCFullYear()) +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes());
  }

  async function getJSON(path) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(), 12000
    );

    try {
      const response = await fetch(path, {
        signal: controller.signal,
        cache: "no-cache"
      });

      if (!response.ok) {
        throw new Error("取得失敗 " + response.status);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  const originalOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function (
    method, url, ...rest
  ) {
    const parsed = new URL(String(url), location.href);

    const route = /^\/d\/traffic_info\/r1\/\d{12}\/(.*)$/
      .exec(parsed.pathname);

    let key = "";

    if (parsed.origin === location.origin && route) {
      if (state.stamp) {
        parsed.pathname =
          base + state.stamp + "/" + route[1];
        url = parsed.href;
      }

      if (route[1] === "s/offer.json") key = "offer";
      if (route[1] === "s/301/C01.json") key = "301";
      if (route[1] === "s/801/C01.json") key = "801";
    }

    const token = state.token;
    const track = Boolean(key && state.busy);

    const result = originalOpen.call(
      this, method, url, ...rest
    );

    if (track) {
      state.pending++;
      let finished = false;

      const finish = () => {
        if (finished || token !== state.token) return;
        finished = true;
        state.pending--;

        if (this.status !== 200) {
          fail("地図データを取得できません");
          return;
        }

        try {
          const data = JSON.parse(this.responseText);

          if (key === "offer") {
            const offered = data.S_C01;

            if (!Array.isArray(offered) ||
                offered.length < 5) {
              throw new Error("形式不正");
            }

            state.label =
              offered[1] + "/" + offered[2] + " " +
              String(offered[3]).padStart(2, "0") + ":" +
              String(offered[4]).padStart(2, "0");

          } else if (!Array.isArray(data.features)) {
            throw new Error("形式不正");
          }

          state.seen.add(key);

        } catch (_) {
          fail("地図データを確認できません");
          return;
        }

        clearTimeout(settle);

        settle = setTimeout(() => {
          if (
            token !== state.token ||
            !state.busy ||
            state.pending ||
            !["offer", "301", "801"].every(
              k => state.seen.has(k)
            )
          ) return;

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (
                token !== state.token ||
                !state.busy ||
                state.pending
              ) return;

              clearTimeout(deadline);
              state.busy = false;
              slider.disabled = false;
              mask.style.display = "none";

              status.textContent =
                state.label +
                (state.stamp ? " の履歴" : " 現在");
            });
          });
        }, 300);
      };

      this.addEventListener("load", finish, { once: true });
      this.addEventListener("error", finish, { once: true });
      this.addEventListener("abort", finish, { once: true });
      this.addEventListener("timeout", finish, { once: true });
    }

    return result;
  };

  async function change(hours) {
    const token = ++state.token;

    clearTimeout(deadline);
    clearTimeout(settle);

    state.busy = false;
    state.pending = 0;
    state.seen.clear();

    slider.value = String(-hours);
    updateChoice();
    slider.disabled = true;

    showMask(
      hours
        ? hours + "時間前の情報を確認しています…"
        : "現在の情報に戻しています…"
    );

    status.textContent = "読み込み中…";

    try {
      let stamp = null;

      if (hours) {
        const target = await getJSON(
          base + "target.json?_=" + Date.now()
        );

        stamp = stampMinusHours(
          target.target, hours
        );

        const [offer, lines, closures] =
          await Promise.all([
            getJSON(base + stamp + "/s/offer.json"),
            getJSON(base + stamp + "/s/301/C01.json"),
            getJSON(base + stamp + "/s/801/C01.json")
          ]);

        if (
          !Array.isArray(offer.S_C01) ||
          !Array.isArray(lines.features) ||
          !Array.isArray(closures.features)
        ) {
          throw new Error("データ形式が違います");
        }
      }

      if (token !== state.token) return;

      state.stamp = stamp;

      document.documentElement.dataset.shHistory =
        stamp ? "past" : "live";

      const reload =
        document.getElementById("reloadEvent");

      if (!reload) {
        throw new Error("更新ボタンが見つかりません");
      }

      state.busy = true;

      deadline = setTimeout(() => {
        if (token === state.token) {
          fail("地図の更新を確認できません");
        }
      }, 20000);

      reload.click();

    } catch (_) {
      if (token === state.token) {
        fail("その時刻は表示できません");
      }
    }
  }

  slider.addEventListener("input", updateChoice);

  slider.addEventListener("change", () => {
    change(-Number(slider.value));
  });

  panel.querySelector("#sh-history-now")
    .addEventListener("click", () => change(0));

}.toString()})()`);

// ============================================
// 4. 事故・故障車などの時刻欄
// ============================================

await web.evaluateJavaScript(`(${function () {
  if (window.__shPopupInstalled) return;
  window.__shPopupInstalled = true;

  const marker = "sh-event-time-row";

  function normalize(s) {
    return (s || "").replace(/\s+/g, "");
  }

  function getLabel(cause) {
    if (cause.includes("事故")) return "事故発生時刻";
    if (cause.includes("故障")) return "故障発生時刻";
    if (cause.includes("落下物")) return "落下物の初確認時刻";
    if (cause.includes("工事")) return "規制開始時刻";
    return "規制開始時刻";
  }

  function updatePopup() {
    const scopes = [
      ...document.querySelectorAll(
        ".ol-overlaycontainer-stopevent, " +
        ".ol-overlaycontainer, " +
        '[class*="popup"], [id*="popup"], ' +
        '[class*="Popup"], [id*="Popup"]'
      )
    ];

    for (const scope of new Set(scopes)) {
      if (!scope.isConnected) continue;

      const rows = [...scope.querySelectorAll("tr")];

      for (const row of rows) {
        if (!normalize(row.textContent)
          .includes("規制原因")) continue;

        const cells = [...row.querySelectorAll("th,td")];

        const cause = cells.length > 1
          ? normalize(cells.slice(1).map(
              el => el.textContent
            ).join(""))
          : normalize(row.textContent);

        const next = row.nextElementSibling;

        if (next?.classList.contains(marker)) {
          const label = next.querySelector("th,td");
          if (label) label.textContent = getLabel(cause);
          continue;
        }

        const tr = document.createElement("tr");
        tr.className = marker;

        const label = document.createElement(
          cells[0]?.tagName.toLowerCase() === "th"
            ? "th" : "td"
        );

        label.textContent = getLabel(cause);

        const value = document.createElement("td");
        value.textContent = "未確認";
        value.style.color = "#c06a00";
        value.style.fontWeight = "600";

        tr.append(label, value);
        row.insertAdjacentElement("afterend", tr);
      }
    }
  }

  let scheduled = false;

  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      updatePopup();
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  updatePopup();

  return true;
}.toString()})()`);

// ============================================
// 5. v22 予想所要時間・選択ルート模式表示（v21ベース）（Google Routes API）
//    地図・履歴・事故表示はv13から変更しない
// ============================================
await web.evaluateJavaScript(`(${function (apiKey) {
  document.getElementById('sh-route-btn')?.remove();
  document.getElementById('sh-route-panel')?.remove();
  document.getElementById('sh-route-style-v13')?.remove();
  document.getElementById('sh-route-style-v14')?.remove();
  document.getElementById('sh-route-style-v15')?.remove();
  document.getElementById('sh-route-style-v16')?.remove();
  document.getElementById('sh-route-style-v17')?.remove();
  document.getElementById('sh-route-style-v18')?.remove();
  document.getElementById('sh-route-style-v19')?.remove();
  document.getElementById('sh-route-style-v21')?.remove();
  document.getElementById('sh-route-style-v22')?.remove();
  document.getElementById('sh-route-preview')?.remove();

  const style = document.createElement('style');
  style.id = 'sh-route-style-v22';
  style.textContent = `
    #sh-route-btn,#sh-route-panel,#sh-route-panel * {box-sizing:border-box!important;font-family:-apple-system,BlinkMacSystemFont,sans-serif!important}
    #sh-route-btn {position:fixed!important;right:12px!important;bottom:95px!important;z-index:2147483646!important;width:auto!important;height:auto!important;min-height:0!important;margin:0!important;padding:9px 15px!important;background:#087cf0!important;color:white!important;border:0!important;border-radius:24px!important;font-size:13px!important;font-weight:600!important;box-shadow:0 2px 8px #0003!important}
    #sh-route-panel {position:fixed!important;left:12px!important;right:12px!important;bottom:95px!important;z-index:2147483647!important;display:none!important;max-height:72vh!important;overflow-y:auto!important;padding:14px!important;background:white!important;color:#172536!important;border:0!important;border-radius:16px!important;box-shadow:0 4px 24px #0004!important;font-size:13px!important;-webkit-overflow-scrolling:touch!important}
    #sh-route-panel.sh-open{display:block!important}
    #sh-route-panel .sh-title{font-size:17px!important;font-weight:700!important;margin:0 0 10px!important;text-align:center!important}
    #sh-route-panel label{display:block!important;margin:8px 0 4px!important;color:#526273!important;font-size:11px!important}
    #sh-route-panel .sh-fixed,#sh-route-panel select{display:block!important;width:100%!important;min-height:38px!important;margin:0!important;background:#f1f5f9!important;color:#172536!important;border:1px solid #d5dfeb!important;border-radius:8px!important;font-size:13px!important}
    #sh-route-panel .sh-fixed{padding:9px!important}
    #sh-route-panel select{height:38px!important;padding:0 10px!important;-webkit-appearance:auto!important;appearance:auto!important}
    #sh-route-panel .sh-actions{display:flex!important;gap:8px!important;margin-top:12px!important}
    #sh-route-panel button{flex:1!important;width:auto!important;height:38px!important;min-height:0!important;padding:0 8px!important;border:0!important;border-radius:9px!important;font-size:13px!important;font-weight:600!important}
    #sh-route-search{background:#087cf0!important;color:white!important}
    #sh-route-search:disabled{opacity:.6!important}
    #sh-route-close{background:#edf2f7!important;color:#344054!important}
    #sh-route-result{display:none;margin-top:10px!important;padding:10px!important;border-radius:10px!important;background:#eef6ff!important;line-height:1.5!important;color:#172536!important;font-size:12px!important}
    #sh-route-result .sh-head{font-weight:700!important;font-size:13px!important;margin-bottom:6px!important}
    #sh-route-result .sh-card{border:1px solid #d6e5f5!important;border-radius:10px!important;background:white!important;margin:8px 0!important;padding:12px!important}
    #sh-route-result .sh-top{display:flex!important;justify-content:space-between!important;gap:8px!important;align-items:center!important}
    #sh-route-result .sh-route-label{font-weight:700!important;font-size:13px!important}
    #sh-route-result .sh-eta{font-weight:800!important;color:#0b66c3!important;font-size:23px!important;white-space:nowrap!important}
    #sh-route-result .sh-meta{font-size:11px!important;color:#526273!important;margin-top:5px!important}
    #sh-route-result .sh-note{font-size:11px!important;color:#68788c!important;margin-top:6px!important;line-height:1.45!important}
    #sh-route-result .sh-warn{background:#fff4dc!important;color:#835900!important;border-radius:7px!important;padding:7px!important;font-size:11px!important;margin-top:8px!important}
    #sh-route-result .sh-source{border-top:1px solid #d6e5f5!important;margin-top:9px!important;padding-top:7px!important;display:flex!important;justify-content:space-between!important;color:#555!important;font-size:11px!important}
    #sh-route-result .sh-error{color:#a21d1d!important;font-weight:600!important}
    #sh-route-result .sh-card[role=button]{cursor:pointer!important;-webkit-tap-highlight-color:transparent!important}
    #sh-route-result .sh-card[role=button]:active{background:#e8f3ff!important}
    #sh-route-result .sh-card.sh-selected{border:2px solid #087cf0!important;background:#f2f8ff!important}
    #sh-route-preview{position:fixed!important;top:160px!important;left:12px!important;right:12px!important;z-index:2147483644!important;display:none!important;padding:10px 12px!important;border-radius:14px!important;border:1px solid #cbd9e8!important;background:rgba(255,255,255,.97)!important;box-shadow:0 3px 16px #0003!important;color:#172536!important;font:12px -apple-system,BlinkMacSystemFont,sans-serif!important;pointer-events:auto!important}
    #sh-route-preview.sh-show{display:block!important}
    #sh-route-preview .sh-preview-top{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;font-weight:700!important;font-size:13px!important}
    #sh-route-preview .sh-preview-close{width:30px!important;height:30px!important;border:0!important;border-radius:50%!important;background:#edf2f7!important;color:#344054!important;font-size:18px!important}
    #sh-route-preview .sh-preview-note{font-size:10px!important;color:#7b5660!important;margin-top:4px!important;line-height:1.4!important}
    #sh-route-preview svg{display:block!important;width:100%!important;height:90px!important;margin-top:4px!important;overflow:visible!important}



  `;
  document.head.appendChild(style);

  // 画面上部に置く独立した経路模式図。地図上の道路位置とは一致しない。
  const preview=document.createElement('div');
  preview.id='sh-route-preview';
  preview.innerHTML='<div class="sh-preview-top"><span id="sh-preview-title">選択ルート</span><button type="button" class="sh-preview-close" aria-label="模式図を閉じる">×</button></div><div id="sh-preview-art"></div><div class="sh-preview-note">概略模式図です。JARTIC地図の道路位置とは一致しません。</div>';
  document.body.appendChild(preview);
  const previewTitle=preview.querySelector('#sh-preview-title');
  const previewArt=preview.querySelector('#sh-preview-art');
  let activeKey='';
  function hidePreview(){
    activeKey='';preview.classList.remove('sh-show');
    document.querySelectorAll('#sh-route-result .sh-card').forEach(el=>el.classList.remove('sh-selected'));
  }
  preview.querySelector('.sh-preview-close').addEventListener('click',hidePreview);
  function previewRoute(r,card){
    const key=r.roadKey+'-'+r.label;
    if(activeKey===key){hidePreview();return;}
    activeKey=key;
    document.querySelectorAll('#sh-route-result .sh-card').forEach(el=>el.classList.toggle('sh-selected',el===card));
    const color=r.roadKey==='B'?'#078b79':'#087cf0';
    // 線の形は固定の説明図。Googleのgeometry/polylineは利用しない。
    const path=r.roadKey==='B'?'M22 68 L85 68 L125 24 L200 24 L250 52 L298 52':'M22 68 L75 68 L110 48 L185 48 L235 32 L298 32';
    const label=r.roadKey==='B'?'湾岸線':r.label.replace('経由','');
    previewTitle.textContent=r.label+' ・ '+mins(seconds(r.duration))+'分';
    previewArt.innerHTML='<svg viewBox="0 0 320 92" role="img" aria-label="'+esc(r.label)+'の概略模式図">'+
      '<path d="'+path+'" stroke="#cbd5e1" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+
      '<path d="'+path+'" stroke="'+color+'" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+
      '<circle cx="22" cy="68" r="7" fill="white" stroke="'+color+'" stroke-width="3"/>'+
      '<circle cx="298" cy="'+(r.roadKey==='B'?'52':'32')+'" r="7" fill="white" stroke="'+color+'" stroke-width="3"/>'+
      '<text x="10" y="87" fill="#344054" font-size="11">霞が関</text>'+
      '<text x="230" y="82" fill="#344054" font-size="11">'+esc(label)+' 経由</text></svg>';
    preview.classList.add('sh-show');
    panel.classList.remove('sh-open'); // 地図を見やすくする
  }

  const ORIGIN = {latitude:35.673946463237,longitude:139.74799156073};
  const DESTS = {
    tengenji:{name:'天現寺出口',location:{latLng:{latitude:35.646624946671,longitude:139.72583216375}}},
    meguro:{name:'目黒出口',location:{latLng:{latitude:35.636062937085,longitude:139.71840321779}}},
    yokohama:{name:'横浜駅西口出口',address:'神奈川県横浜市西区北幸2丁目 横浜駅西口出口 首都高速'}
  };
  const USAGE_KEY='sh-google-routes-usage-v13';
  const CACHE_PREFIX='sh-google-routes-cache-v21-'; // v21と同じキャッシュ
  const CACHE_MS=60000, COOLDOWN_MS=8000, DAILY_LIMIT=50;
  const pad=n=>String(n).padStart(2,'0');
  const dayKey=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
  function loadUsage(){try{const x=JSON.parse(localStorage.getItem(USAGE_KEY)||'{}');if(x.date===dayKey())return {date:x.date,count:Number(x.count)||0,lastRequestAt:Number(x.lastRequestAt)||0};}catch(_){}return {date:dayKey(),count:0,lastRequestAt:0};}
  function saveUsage(x){try{localStorage.setItem(USAGE_KEY,JSON.stringify(x));}catch(_){}}
  function getCache(key){try{const x=JSON.parse(localStorage.getItem(CACHE_PREFIX+key)||'null');return x && Date.now()-x.savedAt<CACHE_MS?x:null;}catch(_){return null}}
  function putCache(key,data){try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({savedAt:Date.now(),routes:data}));}catch(_){}}
  function seconds(x){return typeof x==='string'?Number.parseFloat(x):NaN;}
  function mins(x){return Math.round(x/60);}
  function timeNow(){return new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());}
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  // 経由道路をテキストだけで比較する。ステップの案内は不完全なため、
  // 「方面」「標識に従う」だけで道路を特定しない。
  // 判定不能なルートは従来の方針どおり表示しない。
  const ROADS=[
    {key:'K1',name:'横羽線',re:/(?:神奈川1号)?横羽線|Yokohane(?: Route| Line)?/i},
    {key:'B',name:'湾岸線',re:/(?:首都高速)?湾岸線|Bayshore(?: Route| Line)?/i},
    {key:'C2',name:'中央環状線',re:/中央環状(?:線)?|Central Circular(?: Route)?/i},
    {key:'C1',name:'都心環状線',re:/都心環状(?:線)?|Inner Circular(?: Route)?/i},
    {key:'5',name:'5号池袋線',re:/(?:首都高速)?5号池袋線|池袋線|Ikebukuro Route/i},
    {key:'1',name:'1号羽田線',re:/(?:首都高速)?1号羽田線|羽田線|Haneda Route/i},
    {key:'K2',name:'三ツ沢線',re:/(?:神奈川2号)?三ツ沢線|Mitsuzawa Route/i},
    {key:'K3',name:'狩場線',re:/(?:神奈川3号)?狩場線|Kariba Route/i}
  ];
  // 診断情報は地図やAPIキーには触れず、Googleから取得したルートの
  // 案内ステップ（道路名、ステップ距離）だけで作ります。
  // 道路名は「通過する」ことが案内文から確認できる場合だけ採用。
  // 案内文が不十分なステップも診断用にすべて保存する。
  // 「○○方面」「○○出口」だけではその路線を走った証拠としない。
  function analyzeRoute(route,destKey,index){
    const scores=Object.fromEntries(ROADS.map(r=>[r.key,0]));
    const ordered=[], evidences=[], allSteps=[];
    let nSteps=0,skippedShort=0,skippedDirection=0,skippedAmbiguous=0;
    for(const leg of route.legs||[])for(const step of leg.steps||[]){
      nSteps++;
      const raw=String(step.navigationInstruction?.instructions||'');
      const text=raw.replace(/\s+/g,'');
      const dist=Number(step.distanceMeters)||0;
      const hits=ROADS.filter(r=>r.re.test(text));
      const inferred=hits.map(x=>x.name).join(' / ');
      let decision='',adopt=null;
      if(!raw.trim())decision='道路案内なし';
      else if(dist<450){decision='短距離（450m未満）';skippedShort++;}
      else if(hits.length>1){decision='複数道路名が一致・帰属不明';skippedAmbiguous++;}
      else if(hits.length===0)decision='対象路線名なし';
      else if(/(?:方面|行き)/.test(text)){
        decision='方向案内のため未採用';skippedDirection++;
      }else if(/(?:出口|分岐)/.test(text)&&!/(?:に入る|へ進む|を進む|沿い|を走行|そのまま|直進)/.test(text)){
        decision='出口・分岐案内のため未採用';skippedDirection++;
      }else{
        adopt=hits[0];
        decision=adopt.name+'として採用';
        scores[adopt.key]+=Math.min(dist,20000);
        if(!ordered.includes(adopt.key))ordered.push(adopt.key);
        if(evidences.length<10)evidences.push(adopt.name+' '+Math.round(dist)+'m：'+raw.slice(0,85));
      }
      // APIキーや座標等は診断情報に含めない。案内テキストだけ保存。
      allSteps.push({number:nSteps,meters:Math.round(dist),raw:raw.slice(0,260),hint:inferred,decision});
    }
    const present=ordered.filter(k=>scores[k]>=750);
    let key='',reason='';
    if(destKey==='yokohama'){
      const bay=scores.B,yok=scores.K1;
      if(Math.max(bay,yok)<1500)reason='湾岸線・横羽線とも判定に使える走行距離が不足';
      else if(bay>=1500&&bay>=yok*2)key='B';
      else if(yok>=1500&&yok>=bay*2)key='K1';
      else reason='湾岸線と横羽線の優勢差が不十分';
    }else{
      const ranked=present.slice().sort((a,b)=>scores[b]-scores[a]);
      if(!ranked.length||scores[ranked[0]]<1500)reason='主要道路の判定に使える走行距離が不足';
      else if(ranked.length>1&&scores[ranked[0]]<scores[ranked[1]]*1.6)reason='主要道路の優勢差が不十分';
      else key=ranked[0];
    }
    const major=ROADS.find(r=>r.key===key);
    const found=major?{label:major.name+'経由',roadKey:key,roads:present.map(k=>ROADS.find(r=>r.key===k).name).join(' → ')}:null;
    const scoreText=ROADS.filter(r=>scores[r.key]>0).sort((a,b)=>scores[b.key]-scores[a.key]).map(r=>r.name+': '+Math.round(scores[r.key]/1000*10)/10+'km').join(' / ');
    return {
      index:index+1,duration:route.duration,staticDuration:route.staticDuration||null,
      distanceMeters:route.distanceMeters,found,reason:reason||'',
      scoreText:scoreText||'判定可能な道路名なし',evidences,allSteps,
      nSteps,skippedShort,skippedDirection,skippedAmbiguous,status:''
    };
  }
  function chooseRoutes(routes,destKey){
    const all=routes.map((r,i)=>analyzeRoute(r,destKey,i));
    const sorted=all.slice().sort((a,b)=>seconds(a.duration)-seconds(b.duration));
    const used=new Set(),out=[];
    for(const item of sorted){
      if(!Number.isFinite(seconds(item.duration))){item.status='除外：有効な所要時間なし';continue;}
      if(!item.found){item.status='除外：'+(item.reason||'道路名不明');continue;}
      if(used.has(item.found.roadKey)){
        item.status='除外：'+item.found.label+'が既に採用済み（重複）';continue;
      }
      if(out.length>=2){item.status='除外：最大2件の表示枠に到達';continue;}
      used.add(item.found.roadKey);
      item.status='表示：'+item.found.label;
      out.push({duration:item.duration,staticDuration:item.staticDuration,distanceMeters:item.distanceMeters,...item.found});
    }
    return {selected:out,diagnostics:all};
  }
  function resultView(dest,data,cached){
    hidePreview();
    const entries=data.slice(0,2);
    const cards=entries.map((r,i)=>{
      const sec=seconds(r.duration);
      const base=seconds(r.staticDuration);
      const difference=Number.isFinite(base)?mins(sec-base):null;
      const detail=difference===null
        ? '基準時間 未取得'
        : '基準 '+mins(base)+'分 / 交通差 '+(difference>0?'+':'')+difference+'分';
      return '<div class="sh-card" role="button" tabindex="0" data-route-index="'+i+'" aria-label="'+esc(r.label)+'の模式図を表示"><div class="sh-top">'+
        '<span class="sh-route-label">'+esc(r.label)+'</span>'+
        '<span class="sh-eta">'+mins(sec)+'分</span></div>'+
        '<div class="sh-meta">'+esc(detail)+'</div></div>';
    }).join('');
    const isPast=document.documentElement.dataset.shHistory==='past';
    result.style.display='block';
    result.innerHTML='<div class="sh-head">霞が関入口 → '+esc(dest.name)+'</div>'+cards+
      '<div class="sh-note">ルートをタップすると、地図上部に概略模式図を表示します。</div>'+
      (dest.address?'<div class="sh-warn">予想値：横浜駅西口出口は住所指定です。出口付近の一般道が含まれる可能性があります。</div>':'')+
      (isPast?'<div class="sh-warn">JARTICは過去時点表示中です。Googleの所要時間は現在の交通状況です。</div>':'')+
      '<div class="sh-source"><span translate="no">Powered by Google, ©'+new Date().getFullYear()+' Google</span><span>'+(cached?'1分以内の結果':timeNow()+' 取得')+'</span></div>';
    result.querySelectorAll('[data-route-index]').forEach(card=>{
      const r=entries[Number(card.dataset.routeIndex)];
      const activate=()=>previewRoute(r,card);
      card.addEventListener('click',activate);
      card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});
    });
  }
  function errorView(s){result.style.display='block';result.innerHTML='<span class="sh-error">'+esc(s)+'</span>';}
  const button=document.createElement('button');button.id='sh-route-btn';button.type='button';button.textContent='🚗 所要時間';
  const panel=document.createElement('div');panel.id='sh-route-panel';
  panel.innerHTML='<div class="sh-title">🚗 予想所要時間</div><label>出発IC</label><div class="sh-fixed">霞が関入口（C1 内回り）</div><label for="sh-route-to">到着IC</label><select id="sh-route-to"><option value="tengenji">天現寺出口</option><option value="meguro">目黒出口</option><option value="yokohama">横浜駅西口出口（試験）</option></select><div class="sh-actions"><button id="sh-route-search" type="button">予想時間を比較</button><button id="sh-route-close" type="button">閉じる</button></div><div id="sh-route-result"></div>';
  document.body.append(button,panel);
  const to=panel.querySelector('#sh-route-to'),search=panel.querySelector('#sh-route-search'),close=panel.querySelector('#sh-route-close'),result=panel.querySelector('#sh-route-result');
  button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();panel.classList.toggle('sh-open');});
  close.addEventListener('click',e=>{e.preventDefault();panel.classList.remove('sh-open');});
  to.addEventListener('change',()=>{hidePreview();result.style.display='none';});
  search.addEventListener('click',async e=>{
    e.preventDefault();e.stopPropagation();
    hidePreview();
    if(search.disabled)return;
    if(!apiKey){errorView('APIキーが見つかりません。v13で設定したScriptableのKeychainを確認してください。');return;}
    const key=to.value,dest=DESTS[key],cached=getCache(key);
    if(cached){const items=cached.routes.selected||[];if(items.length)resultView(dest,items,true);else errorView('路線名を確認できる候補がありませんでした。');return;}
    const usage=loadUsage(),now=Date.now();
    if(usage.count>=DAILY_LIMIT){errorView('本日の検索は50回に達しました。');return;}
    if(usage.lastRequestAt && now-usage.lastRequestAt<COOLDOWN_MS){errorView('連打防止のため、あと'+Math.ceil((COOLDOWN_MS-now+usage.lastRequestAt)/1000)+'秒お待ちください。');return;}
    search.disabled=true;search.textContent='検索中…';result.style.display='block';result.textContent='Google Mapsの予想所要時間を取得中…';
    usage.count++;usage.lastRequestAt=now;saveUsage(usage);
    const destination=dest.address?{address:dest.address}:{location:dest.location};
    const payload={origin:{location:{latLng:ORIGIN}},destination,travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE_OPTIMAL',trafficModel:'BEST_GUESS',computeAlternativeRoutes:true,routeModifiers:{avoidTolls:false,avoidHighways:false,avoidFerries:true},languageCode:'ja',units:'METRIC'};
    try{
      const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters'},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>null);
      if(!response.ok)throw Error(body?.error?.message||'HTTP '+response.status);
      const analyzed=chooseRoutes(body?.routes||[],key);
      putCache(key,analyzed);
      if(!analyzed.selected.length){
        result.style.display='block';
        result.innerHTML='<div class="sh-error">路線名を確認できる候補がありませんでした。</div>';
        return;
      }
      resultView(dest,analyzed.selected,false);
    }catch(err){errorView('取得に失敗しました：'+String(err?.message||err));}
    finally{search.disabled=false;search.textContent='予想時間を比較';}
  });
  return true;
}.toString()})(${JSON.stringify(googleApiKey)})`);

// ============================================
// 6. 地図を表示
// ============================================
await web.present(true);
Script.complete();