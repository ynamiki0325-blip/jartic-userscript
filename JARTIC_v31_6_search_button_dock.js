// v31.6: style and position route launcher cleanly above the timeline, preserve map and dark mode.
const URL = "https://www.jartic.or.jp/map/?p=C01&z=8";
const START_PAN_X = 0.80;
const START_PAN_Y = -0.19;
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
await web.evaluateJavaScript(`(${function () {
  if (window.__shLayoutInstalled) return;
  window.__shLayoutInstalled = true;
  // iOS WebView: allow viewport content to use the bottom safe-area where supported.
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (viewportMeta && !/viewport-fit\s*=/.test(viewportMeta.content)) {
    viewportMeta.content = viewportMeta.content.replace(/,?\s*$/, '') + ', viewport-fit=cover';
  }
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
    /* Keep the page's empty safe-area consistent with the timeline without
       filtering or changing the JARTIC map imagery. */
    html { background: #fff !important; }
    @media (prefers-color-scheme: dark) {
      html { background: #172437 !important; }
    }
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
      padding: 4px 12px max(5px, env(safe-area-inset-bottom, 0px)) !important;
      border-radius: 0 !important;
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
    /* iPhone appearance setting: timeline only. JARTIC map stays untouched. */
    @media (prefers-color-scheme: dark) {
      #sh-history { color-scheme: dark !important; background: #172437 !important; color: #f1f6ff !important; box-shadow: 0 -2px 14px #0007 !important; }
      #sh-history-status, #sh-history .sh-ticks { color: #b2c1d5 !important; }
      #sh-history button { background: #293e59 !important; color: #8fc4ff !important; }
      #sh-history input[type="range"]::-webkit-slider-runnable-track { background: #44566e !important; }
      #sh-history input[type="range"]::-webkit-slider-thumb { background: #3c9cff !important; border-color: #172437 !important; box-shadow: 0 1px 5px #0008 !important; }
      #sh-history-mask { color-scheme: dark !important; background: #101a2a !important; color: #f1f6ff !important; }
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
await web.evaluateJavaScript(`(${function (apiKey) {
  document.getElementById('sh-route-btn')?.remove();
  document.getElementById('sh-route-panel')?.remove();
  document.getElementById('sh-route-style-v13')?.remove();
  document.getElementById('sh-route-style-v14')?.remove();
  document.getElementById('sh-route-style-v15')?.remove();
  document.getElementById('sh-route-style-v23')?.remove();
  const style = document.createElement('style');
  style.id = 'sh-route-style-v23';
  style.textContent = `
    #sh-route-btn,#sh-route-panel,#sh-route-panel * {box-sizing:border-box!important;font-family:-apple-system,BlinkMacSystemFont,sans-serif!important}
    #sh-route-btn {position:fixed!important;right:12px!important;bottom:calc(var(--sh-timeline-height, 96px) + 12px)!important;z-index:2147483646!important;width:auto!important;height:auto!important;min-height:0!important;margin:0!important;padding:9px 15px!important;background:#fff!important;color:#1263ac!important;border:1px solid #bcd2e9!important;border-radius:12px!important;font-size:13px!important;font-weight:600!important;box-shadow:0 2px 8px #0002!important}
    #sh-route-panel {position:fixed!important;left:12px!important;right:12px!important;bottom:calc(var(--sh-timeline-height, 96px) + 12px)!important;z-index:2147483647!important;display:none!important;max-height:72vh!important;overflow-y:auto!important;padding:14px!important;background:white!important;color:#172536!important;border:0!important;border-radius:16px!important;box-shadow:0 4px 24px #0004!important;font-size:13px!important;-webkit-overflow-scrolling:touch!important}
    #sh-route-panel.sh-open{display:block!important}
    #sh-route-panel .sh-title{font-size:17px!important;font-weight:700!important;margin:0 0 10px!important;text-align:center!important}
    #sh-route-panel label{display:block!important;margin:8px 0 4px!important;color:#526273!important;font-size:11px!important}
    #sh-route-panel .sh-fixed,#sh-route-panel select{display:block!important;width:100%!important;min-height:38px!important;margin:0!important;background:#f1f5f9!important;color:#172536!important;border:1px solid #d5dfeb!important;border-radius:8px!important;font-size:13px!important}
    #sh-route-panel .sh-fixed{padding:9px!important}
    #sh-route-panel .sh-filter{width:100%!important;display:block!important;height:32px!important;min-height:0!important;background:#fff!important;color:#172536!important;border:1px solid #d5dfeb!important;border-radius:7px!important;padding:5px 9px!important;margin-bottom:5px!important;font-size:12px!important}
    #sh-route-panel .sh-helper{font-size:10px!important;color:#66778a!important;line-height:1.4!important;margin-top:5px!important}
    #sh-route-panel select{height:38px!important;padding:0 10px!important;-webkit-appearance:auto!important;appearance:auto!important}
    #sh-route-panel .sh-actions{display:flex!important;gap:8px!important;margin-top:12px!important}
    #sh-route-panel button{flex:1!important;width:auto!important;height:38px!important;min-height:0!important;padding:0 8px!important;border:0!important;border-radius:9px!important;font-size:13px!important;font-weight:600!important}
    #sh-route-search{background:#087cf0!important;color:white!important}
    #sh-route-search:disabled{opacity:.6!important}
    #sh-route-close{background:#edf2f7!important;color:#344054!important}
    #sh-route-result{display:none;margin-top:10px!important;padding:10px!important;border-radius:10px!important;background:#eef6ff!important;line-height:1.5!important;color:#172536!important;font-size:12px!important}
    #sh-route-result .sh-head{font-weight:700!important;font-size:13px!important;margin-bottom:6px!important}
    #sh-route-result .sh-card{border:1px solid #d6e5f5!important;border-radius:10px!important;background:white!important;margin:8px 0!important;padding:10px!important}
    #sh-route-result .sh-top{display:flex!important;justify-content:space-between!important;gap:8px!important;align-items:center!important}
    #sh-route-result .sh-route-label{font-weight:700!important;font-size:13px!important}
    #sh-route-result .sh-eta{font-weight:800!important;color:#0b66c3!important;font-size:23px!important;white-space:nowrap!important}
    #sh-route-result .sh-eta.sh-eta-yellow{color:#b77905!important}
    #sh-route-result .sh-eta.sh-eta-red{color:#d12626!important}
    #sh-route-result .sh-meta{font-size:11px!important;color:#526273!important;margin-top:5px!important}
    #sh-route-result .sh-note{font-size:11px!important;color:#68788c!important;margin-top:6px!important;line-height:1.45!important}
    #sh-route-result .sh-warn{background:#fff4dc!important;color:#835900!important;border-radius:7px!important;padding:7px!important;font-size:11px!important;margin-top:8px!important}
    #sh-route-result .sh-source{border-top:1px solid #d6e5f5!important;margin-top:9px!important;padding-top:7px!important;display:flex!important;justify-content:space-between!important;color:#555!important;font-size:11px!important}
    #sh-route-result .sh-error{color:#a21d1d!important;font-weight:600!important}
    #sh-route-result .sh-road{font-size:11px!important;color:#526273!important;margin-top:5px!important}
    #sh-route-result .sh-detail{font-size:11px!important;color:#526273!important;margin-top:5px!important}
    #sh-route-panel.sh-open + #sh-route-btn { visibility:hidden!important; }
    /* iPhone appearance setting: route-search UI only. JARTIC map stays untouched. */
    @media (prefers-color-scheme: dark) {
      #sh-route-btn { background: #253a55 !important; color: #dbeeff !important; border-color: #4b6381 !important; box-shadow: 0 2px 8px #0005 !important; }
      #sh-route-panel { color-scheme: dark !important; background: #172437 !important; color: #f1f6ff !important; border: 1px solid #33475f !important; box-shadow: 0 5px 28px #0009 !important; }
      #sh-route-panel label { color: #b7c7dc !important; }
      #sh-route-panel .sh-fixed, #sh-route-panel select { background: #273a53 !important; color: #f1f6ff !important; border-color: #465b76 !important; }
      #sh-route-panel .sh-filter { background: #223249 !important; color: #f1f6ff !important; border-color: #465b76 !important; }
      #sh-route-panel .sh-filter::placeholder { color: #9cafc7 !important; opacity: 1 !important; }
      #sh-route-panel .sh-helper { color: #a6bad2 !important; }
      #sh-route-close, #sh-route-swap { background: #2c415d !important; color: #cbe2ff !important; }
      #sh-route-result { background: #21334a !important; color: #f1f6ff !important; }
      #sh-route-result .sh-card { background: #172437 !important; border-color: #47607d !important; color: #f1f6ff !important; }
      #sh-route-result .sh-eta { color: #7ab9ff !important; }
      #sh-route-result .sh-eta.sh-eta-yellow { color: #ffd15c !important; }
      #sh-route-result .sh-eta.sh-eta-red { color: #ff777d !important; }
      #sh-route-result .sh-meta, #sh-route-result .sh-note, #sh-route-result .sh-road, #sh-route-result .sh-detail { color: #b9c9dd !important; }
      #sh-route-result .sh-warn { background: #42351d !important; color: #ffe1a3 !important; }
      #sh-route-result .sh-source { border-color: #40546b !important; color: #b9c9dd !important; }
      #sh-route-result .sh-error { color: #ff8585 !important; }
    }
  `;
  document.head.appendChild(style);
  const ORIGIN = {latitude:35.673946463237,longitude:139.74799156073};
  const IC_LIST = [["都心環状線","霞が関"],["都心環状線","飯倉"],["都心環状線","芝公園"],["都心環状線","銀座"],["都心環状線","宝町"],["都心環状線","江戸橋"],["都心環状線","神田橋"],["都心環状線","北の丸"],["都心環状線","代官町"],["都心環状線","汐留"],["都心環状線","新富町"],["都心環状線","京橋"],["都心環状線","八丁堀"],["都心環状線","浜崎橋"],["都心環状線","呉服橋"],["1号羽田線","芝浦"],["1号羽田線","勝島"],["1号羽田線","鈴ヶ森"],["1号羽田線","平和島"],["1号羽田線","空港西"],["1号羽田線","羽田"],["1号羽田線","東品川"],["1号上野線","上野"],["1号上野線","入谷"],["1号上野線","本町"],["1号上野線","上野公園"],["2号目黒線","天現寺"],["2号目黒線","目黒"],["2号目黒線","戸越"],["2号目黒線","荏原"],["3号渋谷線","高樹町"],["3号渋谷線","渋谷"],["3号渋谷線","池尻"],["3号渋谷線","三軒茶屋"],["3号渋谷線","用賀"],["4号新宿線","外苑"],["4号新宿線","代々木"],["4号新宿線","新宿"],["4号新宿線","初台"],["4号新宿線","幡ヶ谷"],["4号新宿線","永福"],["4号新宿線","高井戸"],["4号新宿線","西新宿"],["5号池袋線","飯田橋"],["5号池袋線","護国寺"],["5号池袋線","東池袋"],["5号池袋線","北池袋"],["5号池袋線","板橋本町"],["5号池袋線","中台"],["5号池袋線","高島平"],["5号池袋線","戸田南"],["5号池袋線","戸田"],["5号池袋線","早稲田"],["5号池袋線","一ツ橋"],["5号池袋線","西神田"],["6号向島線","箱崎"],["6号向島線","浜町"],["6号向島線","清洲橋"],["6号向島線","向島"],["6号向島線","駒形"],["6号向島線","堤通"],["6号向島線","墨田"],["6号向島線","両国"],["6号三郷線","加平"],["6号三郷線","八潮"],["6号三郷線","三郷"],["6号三郷線","八潮南"],["7号小松川線","錦糸町"],["7号小松川線","小松川"],["7号小松川線","一之江"],["9号深川線","福住"],["9号深川線","木場"],["9号深川線","塩浜"],["9号深川線","枝川"],["10号晴海線","豊洲"],["10号晴海線","晴海"],["11号台場線","台場"],["11号台場線","芝浦"],["中央環状線","富ヶ谷"],["中央環状線","初台南"],["中央環状線","中野長者橋"],["中央環状線","西池袋"],["中央環状線","高松"],["中央環状線","滝野川"],["中央環状線","新板橋"],["中央環状線","王子南"],["中央環状線","王子北"],["中央環状線","千住新橋"],["中央環状線","小菅"],["中央環状線","四つ木"],["中央環状線","平井大橋"],["中央環状線","清新町"],["中央環状線","中環小松川"],["中央環状線","中環大井南"],["中央環状線","五反田"],["川口線","新井宿"],["川口線","安行"],["川口線","加賀"],["川口線","新郷"],["川口線","川口中央"],["川口線","鹿浜橋"],["川口線","東領家"],["川口線","足立入谷"],["埼玉新都心線","新都心"],["埼玉新都心線","新都心西"],["埼玉新都心線","さいたま見沼"],["埼玉大宮線","浦和北"],["埼玉大宮線","与野"],["埼玉大宮線","浦和南"],["湾岸線","浦安"],["湾岸線","舞浜"],["湾岸線","葛西"],["湾岸線","新木場"],["湾岸線","有明"],["湾岸線","臨海副都心"],["湾岸線","大井"],["湾岸線","大井南"],["湾岸線","空港中央"],["湾岸線","湾岸環八"],["湾岸線","浮島"],["湾岸線","東扇島"],["湾岸線","大黒ふ頭"],["湾岸線","本牧ふ頭"],["湾岸線","南本牧ふ頭"],["湾岸線","三溪園"],["湾岸線","磯子"],["湾岸線","杉田"],["湾岸線","幸浦"],["湾岸線","福浦"],["湾岸線","並木"],["横羽線","汐入"],["横羽線","浅田"],["横羽線","浜川崎"],["横羽線","大師"],["横羽線","生麦"],["横羽線","子安"],["横羽線","東神奈川"],["横羽線","横浜駅東口"],["横羽線","みなとみらい"],["横羽線","横浜公園"],["横羽線","石川町"],["横羽線","新山下"],["横羽線","羽田"],["横羽線","守屋町"],["横羽線","花之木"],["三ツ沢線","横浜駅西口"],["三ツ沢線","三ツ沢"],["狩場線","石川町"],["狩場線","阪東橋"],["狩場線","花之木"],["狩場線","永田"],["狩場線","狩場"],["狩場線","新山下"],["大黒線","大黒ふ頭"],["川崎線","殿町"],["川崎線","大師"],["川崎線","浮島"],["横浜北線","岸谷生麦"],["横浜北線","馬場"],["横浜北線","新横浜"],["横浜北線","横浜港北"],["横浜北西線","横浜港北"],["横浜北西線","横浜青葉"],["八重洲線","丸の内"],["八重洲線","常盤橋"]];
  const PLACE_FIXES = {
    '都心環状線|霞が関|in':{location:{latLng:ORIGIN}},
    '2号目黒線|天現寺|out':{location:{latLng:{latitude:35.646624946671,longitude:139.72583216375}}},
    '2号目黒線|目黒|out':{location:{latLng:{latitude:35.636062937085,longitude:139.71840321779}}},
    '三ツ沢線|横浜駅西口|out':{address:'神奈川県横浜市西区北幸2丁目 横浜駅西口出口 首都高速'}
  };
  const placeId=(route,name)=>route+'|'+name;
  const placeText=(route,name,kind)=>'首都高速 '+route+' '+name+(kind==='in'?'入口':'出口')+' 日本';
  function placeFor(entry,kind){
    const [route,name]=entry;
    const fixed=PLACE_FIXES[placeId(route,name)+'|'+kind];
    return fixed || {address:placeText(route,name,kind)};
  }
  const USAGE_KEY='sh-google-routes-usage-v13';
  const CACHE_PREFIX='sh-google-routes-cache-v31-';
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
  const ROADS=[
    {key:"K1",name:"横羽線",re:/横羽線|神奈川1号|Yokohane/i},
    {key:"B",name:"湾岸線",re:/湾岸線|Bayshore/i},
    {key:"C2",name:"中央環状線",re:/中央環状(?:線)?|Central Circular/i},
    {key:"C1",name:"都心環状線",re:/都心環状(?:線)?|Inner Circular/i},
    {key:"1H",name:"1号羽田線",re:/1号羽田線|羽田線|Haneda Route/i},
    {key:"1U",name:"1号上野線",re:/1号上野線|上野線|Ueno Route/i},
    {key:"2",name:"2号目黒線",re:/2号目黒線|目黒線|Meguro Route/i},
    {key:"3",name:"3号渋谷線",re:/3号渋谷線|渋谷線|Shibuya Route/i},
    {key:"4",name:"4号新宿線",re:/4号新宿線|新宿線|Shinjuku Route/i},
    {key:"5",name:"5号池袋線",re:/5号池袋線|池袋線|Ikebukuro Route/i},
    {key:"6M",name:"6号向島線",re:/6号向島線|向島線|Mukojima Route/i},
    {key:"6S",name:"6号三郷線",re:/6号三郷線|三郷線|Misato Route/i},
    {key:"7",name:"7号小松川線",re:/7号小松川線|小松川線|Komatsugawa Route/i},
    {key:"9",name:"9号深川線",re:/9号深川線|深川線|Fukagawa Route/i},
    {key:"10",name:"10号晴海線",re:/10号晴海線|晴海線|Harumi Route/i},
    {key:"11",name:"11号台場線",re:/11号台場線|台場線|Daiba Route/i},
    {key:"S1",name:"川口線",re:/川口線|Kawaguchi Route/i},
    {key:"S2",name:"埼玉新都心線",re:/埼玉新都心線|Saitama Shintoshin Route/i},
    {key:"S5",name:"埼玉大宮線",re:/埼玉大宮線|Saitama Omiya Route/i},
    {key:"K2",name:"三ツ沢線",re:/三ツ沢線|神奈川2号|Mitsuzawa Route/i},
    {key:"K3",name:"狩場線",re:/狩場線|神奈川3号|Kariba Route/i},
    {key:"K5",name:"大黒線",re:/大黒線|Daikoku Route/i},
    {key:"K6",name:"川崎線",re:/川崎線|Kawasaki Route/i},
    {key:"K7",name:"横浜北線",re:/横浜北線|Yokohama North Route/i},
    {key:"K7NW",name:"横浜北西線",re:/横浜北西線|Yokohama Northwest Route/i},
    {key:"Y",name:"八重洲線",re:/八重洲線|Yaesu Route/i}
  ];
  function roadDetails(route){
    const roadSequence=[], directions=[];
    for(const leg of route.legs||[])for(const step of leg.steps||[]){
      const raw=String(step.navigationInstruction?.instructions||'').trim();
      const txt=raw.replace(/\s+/g,'');
      const meters=Number(step.distanceMeters)||0;
      if(!txt||meters<100)continue;
      const signsOnly=/(?:方面|行き)/.test(txt)&&!/(?:に入る|へ入る|を進む|に沿って|を走行|を直進|をそのまま)/.test(txt);
      const junctionOnly=/(?:出口|分岐)/.test(txt)&&!/(?:に入る|へ入る|を進む|に沿って|を走行|を直進|をそのまま)/.test(txt);
      const hits=ROADS.filter(r=>r.re.test(txt));
      if(!signsOnly&&!junctionOnly&&hits.length===1&&meters>=250){
        const name=hits[0].name;
        if(roadSequence[roadSequence.length-1]!==name)roadSequence.push(name);
      }
      if(/(?:JCT|ジャンクション|分岐|入口|出口|方面|合流|首都高|高速|国道)/i.test(raw)){
        const short=raw.replace(/\s+/g,' ').slice(0,85);
        if(!directions.includes(short)&&directions.length<5)directions.push(short);
      }
    }
    const jcts=[];
    for(const leg of route.legs||[])for(const step of leg.steps||[]){
      const raw=String(step.navigationInstruction?.instructions||'');
      for(const m of raw.matchAll(/([一-龥ぁ-んァ-ヶーA-Za-z0-9]{1,12})(?:JCT|ジャンクション)/gi)){
        const j=m[1].replace(/^(?:で|の|を|へ|から|首都高速)/,'')+'JCT';
        if(j.length>3&&!jcts.includes(j))jcts.push(j);
      }
    }
    return {trail:roadSequence.join(' → '),tips:directions.slice(0,3).join(' ／ '),
      roadCount:roadSequence.length,jcts:jcts.slice(0,6).join(' → ')};
  }
  function classifyHighway(route){
    const steps=(route.legs||[]).flatMap(leg=>leg.steps||[]);
    const total=Number(route.distanceMeters)||steps.reduce((n,st)=>n+(Number(st.distanceMeters)||0),0);
    let progress=0,blocked=false,reason='';
    for(const step of steps){
      const d=Number(step.distanceMeters)||0;
      const txt=String(step.navigationInstruction?.instructions||'').replace(/\s+/g,'');
      const middle=progress>2000 && total-(progress+d)>1500;
      const surface=/(?:国道[0-9０-９]+号|都道[0-9０-９]+号|県道[0-9０-９]+号|一般道|市道)/.test(txt) && !/(?:国道(?:466|４６６)号|第三京浜)/.test(txt);
      const active=/(?:を進む|を走る|を直進|に入る|へ入る|に沿って|を通る|へ進む)/.test(txt);
      if(middle && d>=1000 && surface && active && !/(?:標識に従|の表示|方面の標識)/.test(txt)){
        blocked=true;reason='高速道路の途中に一般道の走行案内があります';
        break;
      }
      progress+=d;
    }
    return {blocked,reason,validated:false};
  }
  function chooseRoutes(routes){
    const first=routes.find(r=>Number.isFinite(seconds(r.duration)));
    if(!first)return [];
    return [{duration:first.duration,staticDuration:first.staticDuration||null,
      distanceMeters:first.distanceMeters,label:'Google推奨ルート',
      roadKey:'unknown',roads:'',...roadDetails(first),
      warning:classifyHighway(first).blocked?'一般道が含まれる可能性があります':''}];
  }
  function resultView(origin,dest,data,cached){
    const cards=data.map(r=>{
      const sec=seconds(r.duration),base=seconds(r.staticDuration);
      const delta=Number.isFinite(base)?mins(sec-base):null;
      const km=Number(r.distanceMeters)/1000;
      const delaySec=sec-base;
      const ratio=Number.isFinite(base)&&base>0?delaySec/base:NaN;
      const etaColor=Number.isFinite(ratio)&&delaySec>=600&&ratio>=0.5?' sh-eta-red':
        Number.isFinite(ratio)&&delaySec>=300&&ratio>=0.2?' sh-eta-yellow':'';
      const extra=delta===null?'基準時間 未取得':('基準 '+mins(base)+'分 / 交通による差 '+(delta>0?'+':'')+delta+'分');
      const routeText=r.trail||r.roads||'未確認';
      const jctText=r.jcts||'未確認';
      const roadText='<div class="sh-road"><b>路線</b>　'+esc(routeText)+(r.roadCount===1?'（以降未確認）':'')+'</div>'+
        '<div class="sh-road"><b>JCT</b>　'+esc(jctText)+'</div>'+
        (r.warning==='一般道を含む可能性あり'?'<div class="sh-road">※一般道が含まれる可能性があります</div>':'')+(r.tips?'<details class="sh-road"><summary>詳しい案内</summary>'+esc(r.tips)+'</details>':'');
      return '<div class="sh-card" data-sh-route-card="1"><div class="sh-top"><span class="sh-route-label">'+esc(r.label)+'</span><span class="sh-eta'+etaColor+'">'+mins(sec)+'分</span></div><div class="sh-meta">'+esc(extra)+'　'+(Number.isFinite(km)?km.toFixed(1)+'km':'')+'</div>'+roadText+'</div>';
    }).join('');
    const isPast=document.documentElement.dataset.shHistory==='past';
    result.style.display='block';
    result.innerHTML='<div class="sh-head">'+esc(origin.name)+' → '+esc(dest.name)+'</div>'+cards+
      '<div class="sh-detail">表示はGoogle案内で確認できた区間のみ。</div>'+
      '<div class="sh-warn">参考値：入口・出口ランプの位置と高速区間の連続走行は未検証です。</div>'+ 
      (isPast?'<div class="sh-warn">JARTICは過去時点表示中です。Googleは現在の交通状況です。</div>':'')+
      '<div class="sh-source"><span translate="no">Powered by Google, ©'+new Date().getFullYear()+' Google</span><span>'+(cached?'1分以内の結果':timeNow()+' 取得')+'</span></div>';
  }
  function errorView(s){result.style.display='block';result.innerHTML='<span class="sh-error">'+esc(s)+'</span>';}
  const button=document.createElement('button');button.id='sh-route-btn';button.type='button';button.textContent='所要時間';
  const panel=document.createElement('div');panel.id='sh-route-panel';
  panel.innerHTML='<div class="sh-title">🚗 推奨ルート検索</div>'+
    '<label for="sh-route-from">出発IC（入口）</label><input type="search" class="sh-filter" id="sh-route-from-filter" placeholder="IC名や路線名で絞り込み">'+
    '<select id="sh-route-from"></select>'+ 
    '<button id="sh-route-swap" type="button" style="display:block;width:100%;margin:6px 0;padding:7px;background:#e9f2ff;color:#0757a3;border-radius:8px;font-size:13px">⇅ 入口・出口を入れ替え</button>'+
    '<label for="sh-route-to">到着IC（出口）</label><input type="search" class="sh-filter" id="sh-route-to-filter" placeholder="IC名や路線名で絞り込み">'+
    '<select id="sh-route-to"></select>'+ 
    '<label for="sh-route-via">経由地（任意）</label><input type="search" id="sh-route-via" placeholder="例：大黒JCT（空欄なら指定なし）" style="width:100%;height:37px;border-radius:8px;padding:6px;background:#fff;color:#142332">'+
    '<div class="sh-helper">首都高の出入口候補を収録。方向・ETC専用・閉鎖情報は未検証のため試験版です。</div>'+
    '<div class="sh-actions"><button id="sh-route-search" type="button">所要時間を比較</button><button id="sh-route-close" type="button">閉じる</button></div><div id="sh-route-result"></div>';
  document.body.append(button,panel);
  // Position the launcher and search sheet above the actual timeline height,
  // regardless of viewport size or iPhone text scaling.
  const timeline=document.getElementById('sh-history');
  function syncTimelineHeight(){
    const h=timeline?.getBoundingClientRect().height;
    if(h>0)document.documentElement.style.setProperty('--sh-timeline-height',Math.ceil(h)+'px');
  }
  syncTimelineHeight();
  if(timeline && window.ResizeObserver){
    const ro=new ResizeObserver(syncTimelineHeight);
    ro.observe(timeline);
  }
  window.addEventListener('resize',syncTimelineHeight);

  const from=panel.querySelector('#sh-route-from'),to=panel.querySelector('#sh-route-to');
  const fromFilter=panel.querySelector('#sh-route-from-filter'),toFilter=panel.querySelector('#sh-route-to-filter');
  const search=panel.querySelector('#sh-route-search'),close=panel.querySelector('#sh-route-close'),result=panel.querySelector('#sh-route-result');
  const via=panel.querySelector('#sh-route-via'),swap=panel.querySelector('#sh-route-swap');
  const allChoices=IC_LIST.map((entry,i)=>({id:String(i),entry,title:entry[0]+'｜'+entry[1]}));
  function populate(select,filter,keep){
    const q=filter.value.trim().replace(/[\s　]/g,'').toLowerCase();
    const matches=allChoices.filter(x=>x.title.replace(/[\s　]/g,'').toLowerCase().includes(q));
    select.innerHTML=matches.map(x=>'<option value="'+x.id+'">'+esc(x.title)+'</option>').join('');
    if(keep && matches.some(x=>x.id===keep))select.value=keep;
    else if(!matches.length)select.innerHTML='<option value="">候補がありません</option>';
    result.style.display='none';
  }
  populate(from,fromFilter);populate(to,toFilter);
  const defaultOrigin=allChoices.find(x=>x.entry[0]==='都心環状線'&&x.entry[1]==='霞が関');
  const defaultDest=allChoices.find(x=>x.entry[0]==='三ツ沢線'&&x.entry[1]==='横浜駅西口');
  if(defaultOrigin)from.value=defaultOrigin.id;
  if(defaultDest)to.value=defaultDest.id;
  for(const [select,filter] of [[from,fromFilter],[to,toFilter]]){
    filter.addEventListener('input',()=>populate(select,filter,select.value));
    select.addEventListener('change',()=>{result.style.display='none';});
  }
  swap.addEventListener('click',e=>{
    e.preventDefault();if(search.disabled)return;
    const fromId=from.value,toId=to.value;
    const fromText=fromFilter.value,toText=toFilter.value;
    fromFilter.value=toText;
    toFilter.value=fromText;
    populate(from,fromFilter,toId);
    populate(to,toFilter,fromId);
    via.value='';
    result.style.display='none';
  });
  button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();panel.classList.toggle('sh-open');button.style.visibility=panel.classList.contains('sh-open')?'hidden':'';});
  close.addEventListener('click',e=>{e.preventDefault();panel.classList.remove('sh-open');button.style.visibility='';});
  const FIELD_MASK='routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters';
  function selectedPlaces(){
    const a=allChoices[Number(from.value)],b=allChoices[Number(to.value)];
    if(!from.value||!to.value||!a||!b||a.id===b.id)return null;
    return {a,b,origin:{name:a.entry[1]+'入口',...placeFor(a.entry,'in')},
      dest:{name:b.entry[1]+'出口',exitRoad:b.entry[0],...placeFor(b.entry,'out')},
      key:a.id+'-'+b.id+'-via-'+via.value.trim().toLowerCase()};
  }
  function mayCall(){
    const usage=loadUsage(),now=Date.now();
    if(usage.count>=DAILY_LIMIT){errorView('本日の検索は50回に達しました。');return false;}
    if(usage.lastRequestAt&&now-usage.lastRequestAt<COOLDOWN_MS){
      errorView('連打防止のため、あと'+Math.ceil((COOLDOWN_MS-now+usage.lastRequestAt)/1000)+'秒お待ちください。');return false;
    }
    usage.count++;usage.lastRequestAt=now;saveUsage(usage);return true;
  }
  search.addEventListener('click',async e=>{
    e.preventDefault();e.stopPropagation();
    if(search.disabled)return;
    if(!apiKey){errorView('APIキーが見つかりません。');return;}
    const x=selectedPlaces();
    if(!x){errorView('異なる出発IC・到着ICを選択してください。');return;}
    const cached=getCache(x.key);
    if(cached){resultView(x.origin,x.dest,cached.routes,true);return;}
    if(!mayCall())return;
    search.disabled=true;search.textContent='検索中…';
    result.style.display='block';result.textContent='Google Mapsの交通情報を取得中…';
    const origin=x.origin.address?{address:x.origin.address}:{location:x.origin.location};
    const destination=x.dest.address?{address:x.dest.address}:{location:x.dest.location};
    const payload={origin,destination,travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE_OPTIMAL',
      trafficModel:'BEST_GUESS',computeAlternativeRoutes:false,
      routeModifiers:{avoidTolls:false,avoidHighways:false,avoidFerries:true},
      languageCode:'ja',units:'METRIC'};
    const viaName=via.value.trim();
    if(viaName)payload.intermediates=[{address:viaName+' 日本',via:true}];
    try{
      const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',
        {method:'POST',mode:'cors',headers:{'Content-Type':'application/json',
          'X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':FIELD_MASK},body:JSON.stringify(payload)});
      const body=await response.json().catch(()=>null);
      if(!response.ok)throw Error(body?.error?.message||'HTTP '+response.status);
      const routes=chooseRoutes(body?.routes||[]);
      if(!routes.length){errorView('経路を取得できませんでした。入口・出口の位置と方向をご確認ください。');return;}
      putCache(x.key,routes);resultView(x.origin,x.dest,routes,false);
    }catch(err){errorView('取得に失敗しました：'+String(err?.message||err));}
    finally{search.disabled=false;search.textContent='所要時間を比較';}
  });
  return true;
}.toString()})(${JSON.stringify(googleApiKey)})`);
await web.present(true);
Script.complete();
