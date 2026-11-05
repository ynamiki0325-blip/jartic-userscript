// JARTIC IC100: NAVITIME vs Google route agreement pilot v1.1
// Read-only. No changes to v37.0. Keys are stored only in iPhone Keychain.
// Run repeatedly: each run checks at most 10 pairs; 10 runs = 100 comparisons.
// This is a conservative screening tool, NOT proof of route accuracy.
await (async function(){
const ROOT="https://navitime-route-car.p.rapidapi.com";
const FILE="JARTIC_IC100_probe_progress_v1.json";
const GOOG_KEY="JARTIC_ROUTES_API_KEY_V13";
const NAV_KEY="JARTIC_NAVITIME_RAPIDAPI_KEY_IC100";
const NAMES=[
 "横浜駅西口","汐留","外苑","霞が関","戸田南","玉川","天現寺","目黒",
 "高樹町","三軒茶屋","渋谷","芝公園","銀座","神田橋","西池袋",
 "護国寺","池尻","空港中央","大井","浦安","みなとみらい",
 "横浜公園","新山下","初台南","新宿","永福"
];
const fm=FileManager.local(),path=fm.joinPath(fm.documentsDirectory(),FILE);
function save(data){fm.writeString(path,JSON.stringify(data));}
function load(){if(!fm.fileExists(path))return null;try{return JSON.parse(fm.readString(path));}catch(_){return null;}}
function getKey(name){try{return Keychain.contains(name)?Keychain.get(name):"";}catch(_){return "";}}
async function askKey(label,name){
 let key=getKey(name);if(key)return key;
 const a=new Alert();a.title=label;
 a.message="APIキーを端末内のKeychainに保存します。チャットには貼り付けないでください。";
 if(typeof a.addSecureTextField==="function")a.addSecureTextField("APIキー","");
 else a.addTextField("APIキー","");
 a.addAction("保存");a.addCancelAction("中止");
 if(await a.present()===-1)return "";
 key=(a.textFieldValue(0)||"").trim();
 if(key){try{Keychain.set(name,key);}catch(_){}}
 return key;
}
let gKey=await askKey("Google Routes API",GOOG_KEY);if(!gKey){Script.complete();return;}
let nKey=await askKey("RapidAPIのX-RapidAPI-Key",NAV_KEY);if(!nKey){Script.complete();return;}
let data=load()||{version:"ic100-probe-v1",createdAt:new Date().toISOString(),ic:[],icFailures:[],pairs:[],results:[],setupCompleted:false};
const doneIds=new Set(data.results.map(x=>x.pairId));
const current=data.results.length;
const a=new Alert();a.title="首都高IC100・段階検証";
a.message=(data.setupCompleted?"IC一覧は取得済み。":"最初に約26件のNAVITIME IC検索を行います。")+"今回GoogleとNAVITIMEのルート検索を各最大10回実行します。\nGoogleのTRAFFIC_AWARE_OPTIMALは課金対象の場合があります。\n進捗："+current+"/100件。事前にGoogleとRapidAPIの残り利用枠を確認してください。";
a.addAction("最大10件テスト");a.addCancelAction("中止");
if(await a.present()===-1){Script.complete();return;}
async function api(req){
 const text=await req.loadString();let json={};
 try{json=JSON.parse(text);}catch(e){throw Error("JSON解析失敗");}
 const status=req.response?.statusCode||0;
 if(status<200||status>=300)throw Error("HTTP "+status+": "+String(json.message||json.error?.message||"").slice(0,120));
 return json;
}
async function nav(endpoint,params){
 const url=ROOT+"/"+endpoint+"?"+Object.entries(params).map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(v)).join("&");
 const q=new Request(url);q.method="GET";q.timeoutInterval=30;
 q.headers={"X-RapidAPI-Key":nKey,"X-RapidAPI-Host":"navitime-route-car.p.rapidapi.com"};
 return await api(q);
}
function rng(seed){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
if(!data.setupCompleted){
 for(const name of NAMES){
  if(data.ic.some(x=>x.name===name)||data.icFailures.some(x=>x.name===name))continue;
  try{
   const j=await nav("ic",{word:name,limit:10});
   const exact=(j.items||[]).find(x=>x.name===name);
   if(exact&&exact.id&&(exact.entrance||exact.exit)){
    data.ic.push({name,id:String(exact.id),entrance:!!exact.entrance,exit:!!exact.exit});
   }else data.icFailures.push({name,reason:"完全一致するICなし"});
  }catch(e){data.icFailures.push({name,reason:String(e).slice(0,130)});}
  save(data);
 }
 // If most lookup requests fail (e.g. invalid key) don't waste Google calls.
 if(data.ic.length<10){
  Pasteboard.copy(JSON.stringify({error:"ICが10件未満のため中止",ic:data.ic,failures:data.icFailures},null,2));
  const x=new Alert();x.title="IC検索を確認";x.message="有効なICが10件未満です。結果をコピーしました。RapidAPIキーとプランをご確認ください。";x.addAction("OK");await x.present();Script.complete();return;
 }
 const unique=[];
 for(let i=0;i<data.ic.length;i++)for(let j=0;j<data.ic.length;j++){
  if(i!==j&&data.ic[i].entrance&&data.ic[j].exit)unique.push([data.ic[i],data.ic[j]]);
 }
 const random=rng(20261105);
 for(let i=unique.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[unique[i],unique[j]]=[unique[j],unique[i]];}
 data.pairs=unique.slice(0,100).map((x,i)=>({id:i+1,start:x[0],goal:x[1]}));
 data.setupCompleted=true;save(data);
}
function norm(x){return String(x||"").normalize("NFKC").replace(/\s/g,"");}
function roadWords(s){
 const roads=[];
 if(/三ツ沢/.test(s))roads.push("三ツ沢");
 if(/横羽/.test(s))roads.push("横羽");
 if(/大黒線/.test(s))roads.push("大黒線");
 if(/湾岸線|湾岸ルート/.test(s))roads.push("湾岸線");
 if(/羽田線/.test(s))roads.push("羽田線");
 if(/都心環状/.test(s))roads.push("都心環状");
 if(/新宿線/.test(s))roads.push("新宿線");
 if(/渋谷線/.test(s))roads.push("渋谷線");
 if(/池袋線/.test(s))roads.push("池袋線");
 if(/目黒線/.test(s))roads.push("目黒線");
 if(/台場線/.test(s))roads.push("台場線");
 if(/狩場線/.test(s))roads.push("狩場線");
 if(/中央環状/.test(s))roads.push("中央環状");
 return [...new Set(roads)];
}
async function google(start,goal){
 const req=new Request("https://routes.googleapis.com/directions/v2:computeRoutes");
 req.method="POST";req.timeoutInterval=35;
 req.headers={"Content-Type":"application/json","X-Goog-Api-Key":gKey,
 "X-Goog-FieldMask":"routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.steps.navigationInstruction.instructions"};
 req.body=JSON.stringify({
  origin:{location:{latLng:{latitude:start.lat,longitude:start.lon}}},
  destination:{location:{latLng:{latitude:goal.lat,longitude:goal.lon}}},
  travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE_OPTIMAL",trafficModel:"BEST_GUESS",
  routeModifiers:{avoidTolls:false,avoidHighways:false,avoidFerries:true},
  languageCode:"ja",units:"METRIC"
 });
 const j=await api(req),r=j.routes?.[0];
 if(!r)throw Error("Googleルートなし");
 return {distance:Number(r.distanceMeters),timeSec:Number(String(r.duration||"").replace("s","")),
  staticSec:Number(String(r.staticDuration||"").replace("s","")),
  steps:(r.legs||[]).flatMap(x=>x.steps||[]).map(x=>x.navigationInstruction?.instructions||"").filter(Boolean)};
}
for(const pair of data.pairs){
 if(data.results.length>=100)break;
 if(doneIds.has(pair.id))continue;
 if(data.results.length-current>=10)break;
 const res={pairId:pair.id,from:pair.start.name,to:pair.goal.name,startedAt:new Date().toISOString(),status:"inconclusive"};
 try{
  const n=await nav("route_car",{start:JSON.stringify({ic:pair.start.id}),goal:JSON.stringify({ic:pair.goal.id}),condition:"toll_time",options:"turn_by_turn"});
  const route=n.items?.[0];if(!route)throw Error("NAVITIMEルートなし");
  const from=route.summary?.start?.coord,to=route.summary?.goal?.coord;
  if(!from||!to)throw Error("NAVITIME座標なし");
  const nSections=route.sections||[];
  const nRoads=[...new Set(nSections.filter(x=>x.type==="move").map(x=>norm(x.line_name)).filter(Boolean))];
  const nJcts=nSections.filter(x=>x.type==="point"&&/JCT|JＣＴ|ジャンクション/i.test(x.name||"")).map(x=>norm(x.name));
  const nKm=Number(route.summary?.move?.distance||0)/1000;
  const tollKm=Number(route.summary?.move?.toll_road_distance||0)/1000;
  res.nav={km:+nKm.toFixed(2),tollKm:+tollKm.toFixed(2),roads:nRoads,jcts:nJcts};
  // Traffic data from Google is useful ONLY for an independently verified equivalent route.
  const g=await google(from,to);
  res.google={km:+(g.distance/1000).toFixed(2),trafficMin:Math.ceil(g.timeSec/60),
   staticMin:Math.ceil(g.staticSec/60),steps:g.steps.slice(0,35)};
  const text=g.steps.join(" ");
  const navNames=roadWords(nRoads.join(" "));
  const ggNames=roadWords(text);
  const unexpected=ggNames.filter(x=>!navNames.includes(x));
  const distanceDiffKm=Math.abs(g.distance/1000-nKm);
  const exits=g.steps.filter(x=>/出口/.test(x)&&!/標識/.test(x));
  const general=g.steps.filter(x=>/海岸通り|一般道|都道\d|国道\d|県道\d/.test(x)&&!/有料区間/.test(x));
  res.check={distanceDiffKm:+distanceDiffKm.toFixed(2),navRoadTokens:navNames,
    googleTextRoadTokens:ggNames,unexpectedRoadTokens:unexpected,
    exitInstructions:exits.slice(0,5),surfaceRoadInstructions:general.slice(0,5)};
  if(nKm<=0||tollKm/nKm<.97)res.status="reference_not_highway_only";
  else if(distanceDiffKm>1.5||general.length||unexpected.length)res.status="obvious_mismatch";
  else res.status="candidate_manual_review";
  res.note="自動分類は仮判定。候補はJCT・出口・道路形状を手動検証しない限り成功扱いしない。";
 }catch(e){res.status="api_or_reference_error";res.error=String(e).slice(0,200);}
 data.results.push(res);doneIds.add(pair.id);save(data);
}
const counts={};
for(const x of data.results)counts[x.status]=(counts[x.status]||0)+1;
const batch=data.results.slice(Math.max(0,data.results.length-10));
const exportData={version:data.version,totalPlanned:data.pairs.length,totalFinished:data.results.length,
  counts,icFound:data.ic.length,icFailures:data.icFailures,latestBatch:batch,
  message:"一致候補は成功率ではありません。通過JCT・出口の確認が必要です。"};
Pasteboard.copy(JSON.stringify(exportData,null,2));
const finish=new Alert();finish.title="IC100 経過 "+data.results.length+"/"+data.pairs.length;
finish.message="明確な不一致："+(counts.obvious_mismatch||0)+"件\n一致候補（未確認）："+(counts.candidate_manual_review||0)+"件\nエラーほか："+((counts.api_or_reference_error||0)+(counts.reference_not_highway_only||0))+"件\n\n10件分の詳細をコピーしました。ここに貼り付けてください。次回実行時は続きから再開します。";
finish.addAction("OK");await finish.present();
Script.complete();
})();