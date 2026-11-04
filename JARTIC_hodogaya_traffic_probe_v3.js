// 保土ヶ谷バイパス交通情報の最終確認 v3.0
// Scriptable専用・読み取り診断。APIキー不要、既存アプリは変更しません。
const web = new WebView();
await web.loadURL("https://www.jartic.or.jp/map/?p=C01&z=8");
let raw;
try {
  raw = await web.evaluateJavaScript(`
void (async function () {
  const out = {version:"hodogaya-traffic-v3",files:[],note:"ファイルに道路名がなくても、区間IDのみで識別されている可能性は残ります"};
  try {
    await new Promise(resolve => setTimeout(resolve,2200));
    const paths = performance.getEntriesByType("resource").map(e => {
      try {return new URL(e.name).pathname;}catch(_){return "";}
    });
    let stamp = "";
    for(const p of paths) {
      const m = p.match(/\\/d\\/traffic_info\\/r1\\/(\\d{12})\\/s\\/offer\\.json/);
      if(m){stamp=m[1];break;}
    }
    if(!stamp){
      const r=await fetch("/d/traffic_info/r1/target.json",{cache:"no-store"});
      const j=await r.json();
      stamp=String(j.target||"");
    }
    out.timestamp=stamp;
    if(!/^\\d{12}$/.test(stamp))throw Error("時刻識別子が取得できませんでした");
    const targetNames=["301","801"];
    const terms=/保土ヶ谷|保土ケ谷|保士ケ谷|Hodogaya|Hodogaya Bypass/i;
    for (const id of targetNames) {
      const entry={file:id+"/C01.json"};
      out.files.push(entry);
      try {
        const ctrl=new AbortController();
        const t=setTimeout(()=>ctrl.abort(),12000);
        let resp;
        try {resp=await fetch("/d/traffic_info/r1/"+stamp+"/s/"+id+"/C01.json",{cache:"no-store",signal:ctrl.signal});}
        finally{clearTimeout(t);}
        entry.http=resp.status;
        if(!resp.ok)continue;
        const data=await resp.json();
        entry.topLevel=Array.isArray(data)?["array"]:Object.keys(data).slice(0,20);
        const feats=Array.isArray(data.features)?data.features:[];
        entry.featureCount=feats.length;
        const keys=new Set(), matches=[], samples=[];
        let withGeometry=0,withProperties=0;
        for(let i=0;i<feats.length;i++){
          const f=feats[i]||{},p=(f.properties&&typeof f.properties==="object")?f.properties:{};
          if(f.geometry)withGeometry++;
          if(Object.keys(p).length)withProperties++;
          for(const k of Object.keys(p)) if(keys.size<80)keys.add(k);
          if(i<3) samples.push({
            geometryType:f.geometry?.type||null,
            properties:Object.fromEntries(Object.entries(p).slice(0,16).map(([k,v])=>[k,typeof v==="string"?v.slice(0,90):typeof v==="number"||typeof v==="boolean"?v:Array.isArray(v)?"array("+v.length+")":v==null?null:typeof v]))
          });
          if(matches.length<10){
            const text=JSON.stringify(p);
            if(terms.test(text))matches.push({index:i,properties:Object.fromEntries(Object.entries(p).slice(0,20))});
          }
        }
        entry.propertyKeys=[...keys];
        entry.withGeometry=withGeometry;
        entry.withProperties=withProperties;
        entry.namedBypassMatches=matches;
        entry.samples=samples;
        entry.featureGeometryTypes=[...new Set(feats.slice(0,150).map(f=>f?.geometry?.type||"none"))];
      }catch(err){entry.error=String(err);}
    }
  }catch(err){out.error=String(err);}
  completion(JSON.stringify(out));
})()
`, true);
} catch(e) {raw=JSON.stringify({error:String(e)});}
let result;
try{result=JSON.parse(raw);}catch(e){result={error:"結果の解析失敗",raw:String(raw).slice(0,400)};}
Pasteboard.copy(JSON.stringify(result,null,2));
const alert=new Alert();
alert.title="保土ヶ谷バイパス 交通データ診断";
alert.message=(result.files||[]).map(f=>f.file+"：HTTP "+(f.http??"-")+"／"+(f.featureCount??"-")+"件／道路名一致 "+(f.namedBypassMatches?.length??"-")+"件").join("\n")+(result.error?"\n"+result.error:"")+"\n\n結果をコピーしました。ChatGPTに貼り付けてください。";
alert.addAction("OK");await alert.present();
Script.complete();