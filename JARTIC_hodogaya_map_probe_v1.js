// JARTIC 保土ヶ谷バイパス 同一地図表示の可否を調べる診断版 v1.0
// 読み取り専用：地図やGoogle APIキー、普段のアプリは変更しません。
const URL = "https://www.jartic.or.jp/map/?p=C01&z=8";
const web = new WebView();
await web.loadURL(URL);
const report = await web.evaluateJavaScript(`
(async () => {
  const found = {version:"Hodogaya map diagnostic 1.0",url:location.pathname+location.search};
  const map = document.getElementById("map");
  const selectors = ["canvas","svg","img",".ol-layer",".ol-viewport"];
  found.mapDOM = {present:!!map};
  if (map) {
    for(const sel of selectors) found.mapDOM[sel] = map.querySelectorAll(sel).length;
    found.mapDOM.firstChildren = [...map.children].slice(0,10).map(el=>({tag:el.tagName,id:el.id||"",className:String(el.className||"").slice(0,90)}));
  }
  const labels = [...document.querySelectorAll("text,tspan,[title],[aria-label]")].filter(el=>/保土ヶ谷|保土ケ谷|保士ケ谷|Hodogaya/i.test([el.textContent,el.getAttribute("title"),el.getAttribute("aria-label")].join(" ")));
  found.labels = labels.slice(0,10).map(el=>({tag:el.tagName,text:(el.textContent||"").trim().slice(0,75)}));
  const resourceNames = performance.getEntriesByType("resource").map(e=>e.name).filter(x=>x.startsWith(location.origin));
  const pathOnly = name => {try {return new URL(name).pathname;}catch(e){return "";}}
  found.trafficResourcePaths = [...new Set(resourceNames.map(pathOnly).filter(x=>/traffic_info|\\/s\\/(301|801)\\/|\\/map\\//i.test(x)).map(x=>x.replace(/\\/\\d{12}\\//g,"/<timestamp>/")))].slice(0,35);
  found.otherResourceTypes = {image:resourceNames.filter(x=>/\\.(png|jpg|jpeg|gif|webp)(\\?|$)/i.test(x)).length,svg:resourceNames.filter(x=>/\\.svg(\\?|$)/i.test(x)).length};
  const maps = [];
  const seen = new Set();
  for(const k of Object.getOwnPropertyNames(window)) {
    if (maps.length>=5) break;
    let obj;try{obj=window[k]}catch(e){continue;}
    if(!obj||typeof obj!=="object"||seen.has(obj)||typeof obj.getLayers!=="function"||typeof obj.getView!=="function")continue;
    seen.add(obj);
    const summary={globalName:k,layers:[]};
    function walk(layers,depth){
      if(!layers||depth>3)return;
      for(const layer of (layers.getArray?.()||[]).slice(0,30)){
        const source=layer.getSource?.();
        const entry={type:layer.constructor?.name||"",sourceType:source?.constructor?.name||""};
        if(source?.getFeatures) {
          const feats=source.getFeatures();
          entry.features=feats.length;
          let matches=0;
          for(const feat of feats.slice(0,1800)){
            const p=feat.getProperties?.()||{};
            const data=Object.entries(p).filter(([k,v])=>typeof v==="string").map(([k,v])=>k+":"+v).join(" ");
            if(/保土ヶ谷|保土ケ谷|Hodogaya/i.test(data))matches++;
          }
          if(matches)entry.hodogayaNamedFeatures=matches;
        }
        summary.layers.push(entry);
        if(typeof layer.getLayers==="function")walk(layer.getLayers(),depth+1);
      }
    }
    walk(obj.getLayers(),0);maps.push(summary);
  }
  found.openLayers = maps;
  found.note="表示中の地図構造と通信一覧だけの診断です。保土ヶ谷バイパスの渋滞が取得可能とは限りません。";
  return JSON.stringify(found);
})()
`,true);
let data;
try { data = JSON.parse(report); } catch(e) { data={error:String(e),response:String(report).slice(0,1000)}; }
Pasteboard.copy(JSON.stringify(data,null,2));
const a=new Alert();a.title="保土ヶ谷バイパス 地図診断";
a.message="結果をコピーしました。\n\n地図："+(data.mapDOM?.present?"確認":"未確認")+"\nCanvas："+(data.mapDOM?.canvas??"-")+"枚\nSVG："+(data.mapDOM?.svg??"-")+"個\n交通通信パス："+(data.trafficResourcePaths?.length??0)+"件\n\nChatGPTにペーストしてください。APIキーは含みません。";
a.addAction("OK");await a.present();
Script.complete();