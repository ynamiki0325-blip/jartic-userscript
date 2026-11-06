// v1.9 ordered road/JCT compact results; v37.0 untouched: stable v37.0 untouched. Do not share API keys.
// 首都高 NAVITIME×Google 試用版 v1.9: Google渋滞考慮・最短時間の1ルートのみ
// 安定版v37.0とは別。起動時は地図のみ。所要時間を押した後の再検索で結果を表示します。
// 1検索あたり NAVITIME /ic 最大2回, /route_car 1回, Google Routes 1回。
// Googleの候補から渋滞考慮時間が最短の1ルートだけ表示。NAVITIMEはIC特定・参考判定用。
await (async function(){
const NK="JARTIC_NAVITIME_RAPIDAPI_KEY_IC100",HK="JARTIC_NAVITIME_RAPIDAPI_HOST_IC100",GK="JARTIC_ROUTES_API_KEY_V13";
function get(k){try{return Keychain.contains(k)?Keychain.get(k):"";}catch(_){return "";}}
const navKey=get(NK),googKey=get(GK),host=get(HK)||"navitime-route-car.p.rapidapi.com";
const known={"横浜駅西口":"252010","外苑":"209010","汐留":"201050","空港中央":"217020"};
const params=args.queryParameters||{};
let fromName="",toName="";
const fromArg=String(params.from||"").trim(),toArg=String(params.to||"").trim();
// 初回起動は地図のみ。所要時間ボタンから入口・出口を入力して検索。
if(fromArg&&toArg&&fromArg!==toArg&&fromArg.length<50&&toArg.length<50){
 fromName=fromArg;toName=toArg;
}
let report={name:"首都高ルート試用版",from:fromName,to:toName,source:"なし",status:"検索しませんでした",time:null,normal:null,km:null,roads:[],jcts:[],delay:null,matched:false,options:[]};
const norm=s=>String(s||"").normalize("NFKC").replace(/[\s　]/g,"").replace(/ヶ/g,"ケ").replace(/IC$|インターチェンジ$/i,"");
async function getJSON(req){
 const txt=await req.loadString(),status=req.response?.statusCode||0;
 let obj={};try{obj=JSON.parse(txt);}catch(e){throw Error("レスポンスがJSONではありません");}
 if(status!==200)throw Error("HTTP "+status+" "+String(obj.message||obj.error?.message||"").slice(0,80));
 return obj;
}
async function nav(endpoint,args){
 const u="https://"+host+"/"+endpoint+"?"+Object.entries(args).map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(v)).join("&");
 const r=new Request(u);r.method="GET";r.timeoutInterval=30;
 r.headers={"X-RapidAPI-Key":navKey,"X-RapidAPI-Host":host};
 return await getJSON(r);
}
async function ic(name){
 if(known[name])return known[name];
 const j=await nav("ic",{word:name,limit:10});
 const x=(j.items||[]).find(x=>norm(x.name)===norm(name)&&x.id);
 if(!x)throw Error("ICが見つからないか、同名ICが複数あります："+name);
 // Do not infer the expressway from a non-Shuto name.
 if(!/首都|神奈川|第三京浜/.test(x.road_name||""))throw Error("首都高のICと確認できません："+name);
 return String(x.id);
}
const jctName=s=>norm(s).replace(/(JCT|ジャンクション).*$/i,"JCT");
const extractJcts=arr=>{const out=[];for(const s of arr){const m=norm(s).match(/([^、。「」\s]{1,12}?)JCT/);if(m){const name=m[1].replace(/^.*(?:で|は)/,"")+"JCT";if(out[out.length-1]!==name)out.push(name);}}return out;};
function googleMovedRoads(steps){
 const x=[];
 const rules=[
 ["三ツ沢線",/三ツ沢線|三ッ沢線|神奈川2号/i],["横羽線",/横羽線|神奈川1号/i],
 ["狩場線",/狩場線|神奈川3号/i],["大黒線",/大黒線|神奈川5号/i],
 ["湾岸線",/湾岸線|湾岸ルート/i],["中央環状線",/中央環状線|山手トンネル/i],
 ["都心環状線",/都心環状線/i],["渋谷線",/渋谷線|首都高速3号/i],
 ["新宿線",/新宿線|首都高速4号/i],["池袋線",/池袋線|首都高速5号/i],
 ["目黒線",/目黒線|首都高速2号/i],["台場線",/台場線|レインボーブリッジ/i],
 ["羽田線",/羽田線/i]
 ];
 for(const line of steps){
  if(/標識|方面の.*表示|方面に.*従う/.test(line)&&!/に入る|を進む|を走行/.test(line))continue;
  const clean=line.split("\n")[0];
  for(const [name,re] of rules){if(re.test(clean)&&!x.includes(name))x.push(name);}
 }
 return x;
}
// Google turn-by-turn descriptions in sequence; never add missing segments by inference.
function orderedRouteParts(instructions){
 const out=[];
 for(const raw of instructions){
  const line=String(raw||"").split("\n")[0];
  const events=[];
  const roads=googleMovedRoads([line]);
  for(const road of roads){
   const patterns={
    "三ツ沢線":/三ツ沢線|三ッ沢線|神奈川2号/i,"横羽線":/横羽線|神奈川1号/i,
    "狩場線":/狩場線|神奈川3号/i,"大黒線":/大黒線|神奈川5号/i,
    "湾岸線":/湾岸線|湾岸ルート/i,"中央環状線":/中央環状線|山手トンネル/i,
    "都心環状線":/都心環状線/i,"渋谷線":/渋谷線|首都高速3号/i,
    "新宿線":/新宿線|首都高速4号/i,"池袋線":/池袋線|首都高速5号/i,
    "目黒線":/目黒線|首都高速2号/i,"台場線":/台場線|レインボーブリッジ/i,"羽田線":/羽田線/i
   };
   const index=line.search(patterns[road]);
   if(index>=0)events.push({index,name:road});
  }
  const re=/([^\s、。()（）]{1,14}?JCT)(?=で|を|に|へ|、|。|$)/gi;
  for(const m of line.matchAll(re)){
   let name=m[1].replace(/^.*(?:で|は)/,"");
   if(name.length>=4&&/JCT$/i.test(name)&&!/方面|標識|案内/.test(line.slice(0,m.index||0))){events.push({index:m.index,name});}
  }
  events.sort((a,b)=>a.index-b.index);
  for(const e of events)if(out[out.length-1]!==e.name)out.push(e.name);
 }
 return out;
}
async function google(a,b){
 const r=new Request("https://routes.googleapis.com/directions/v2:computeRoutes");r.method="POST";r.timeoutInterval=35;
 r.headers={"Content-Type":"application/json","X-Goog-Api-Key":googKey,"X-Goog-FieldMask":"routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters,routes.legs.steps.startLocation,routes.legs.steps.endLocation"};
 r.body=JSON.stringify({
 origin:{location:{latLng:{latitude:a.lat,longitude:a.lon}}},
 destination:{location:{latLng:{latitude:b.lat,longitude:b.lon}}},
 travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE_OPTIMAL",trafficModel:"BEST_GUESS",
 routeModifiers:{avoidTolls:false,avoidHighways:false,avoidFerries:true},computeAlternativeRoutes:true,languageCode:"ja",units:"METRIC"
 });
 const x=await getJSON(r);
 if(!x.routes?.[0])throw Error("Googleの経路結果なし");
 return x.routes;
}
// Geometry checking is diagnostic-only; a handful of points cannot establish exact lane/road parity.
function decodeGooglePolyline(encoded){
 const out=[];let i=0,lat=0,lng=0;
 while(i<encoded.length&&out.length<50000){
  const values=[];
  for(let axis=0;axis<2;axis++){
   let shift=0,result=0,b;
   do{
    if(i>=encoded.length||shift>35)throw Error("Invalid encoded polyline");
    b=encoded.charCodeAt(i++)-63;
    result|=(b&31)<<shift;shift+=5;
   }while(b>=32);
   values.push((result&1)?~(result>>1):(result>>1));
  }
  lat+=values[0];lng+=values[1];out.push({lat:lat/1e5,lon:lng/1e5});
 }
 return out;
}
function geoSummary(nav,g){
 const raw=g.polyline?.encodedPolyline||"";
 let points=[];
 try{if(raw)points=decodeGooglePolyline(raw);}catch(e){}
 const sec=nav.sections||[];
 const coordOf=x=>{
  if(!x||typeof x!=="object")return null;
  const lat=Number(x.lat??x.latitude),lon=Number(x.lon??x.lng??x.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=35&&lat<=36.2&&lon>=138.8&&lon<=140.5?{lat,lon}:null;
 };
 const positions=[];
 const kinds={point:0,move:0,other:0};
 // Collect only explicit section coordinates; no guessed interpolation.
 // move sections may have a begin/end marker; include them only if present.
 const fields=["coord","start_coord","end_coord","startCoord","endCoord"];
 for(const section of sec){
  const type=section.type==="point"?"point":section.type==="move"?"move":"other";
  const name=String(section.name||section.line_name||type);
  for(const field of fields){
   const p=coordOf(section[field]);
   if(p){
    positions.push({name,type,field,...p});
    kinds[type]++;
   }
  }
  for(const [field,p] of [["location.coord",section.location?.coord],["point.coord",section.point?.coord]]){
   const c=coordOf(p);if(c){positions.push({name,type,field,...c});kinds[type]++;}
  }
 }
 const unique=[];
 for(const p of positions){
  if(!unique.some(q=>Math.abs(q.lat-p.lat)<0.000005&&Math.abs(q.lon-p.lon)<0.000005))
   unique.push(p);
 }
 const meters=(a,b)=>{
  const dy=(a.lat-b.lat)*111200;
  const dx=(a.lon-b.lon)*111200*Math.cos((a.lat+b.lat)*Math.PI/360);
  return Math.hypot(dx,dy);
 };
 // Use shortest distance to a LINE SEGMENT, not just the closest encoded vertex.
 function nearestPolylineMeters(p){
  if(points.length===0)return null;
  if(points.length===1)return Math.round(meters(p,points[0]));
  let best=Infinity;
  for(let k=1;k<points.length;k++){
   const a=points[k-1],b=points[k],scale=111200*Math.cos(p.lat*Math.PI/180);
   const ax=(a.lon-p.lon)*scale,ay=(a.lat-p.lat)*111200;
   const bx=(b.lon-p.lon)*scale,by=(b.lat-p.lat)*111200;
   const vx=bx-ax,vy=by-ay,t=Math.max(0,Math.min(1,-(ax*vx+ay*vy)/Math.max(1e-12,vx*vx+vy*vy)));
   best=Math.min(best,Math.hypot(ax+t*vx,ay+t*vy));
  }
  return Math.round(best);
 }
 // Endpoint points alone cannot certify a matching expressway path.
 const interior=unique.filter(p=>p.type!=="other"&&/JCT|ジャンクション|分岐|合流/i.test(norm(p.name)));
 const allInterior=unique.filter(p=>p.type==="point"&&/JCT|ジャンクション/i.test(norm(p.name)));
 const checked=interior.map(p=>({name:p.name,type:p.type,source:p.field,nearestMeters:nearestPolylineMeters(p)}));
 const far=checked.filter(x=>x.nearestMeters!==null&&x.nearestMeters>800);
 const direct=unique.filter(p=>p.type==="move");
 // Count reference geometry only if different, non-endpoint NAVITIME sections supply it.
 const enough=checked.length>=2;
 const metadataFields=[...new Set(sec.flatMap(x=>Object.keys(x||{})))].filter(k=>/coord|shape|polyline|geometry|path|point|link|node/i.test(k)).slice(0,16);
 return {
  googleShapePoints:points.length,
  navSections:sec.length,
  navCoordPoints:unique.length,
  navJctPoints:allInterior.length,
  navMoveCoordPoints:direct.length,
  navFieldCandidates:metadataFields,
  nearestReferenceDistances:checked.slice(0,18),
  // A far-away explicit NAVITIME JCT point is a warning, never a definitive proof of route difference.
  potentialGeometryIssue:enough&&far.length>0,
  evidenceLimited:!enough,
  interpretation:!points.length?"Googleの経路形状を取得できませんでした":
   !unique.length?"NAVITIMEの道路区間に座標がありません。道路形状の比較は不可":
   !enough?"NAVITIMEの中間参照座標が不足。経路形状一致は未確認":
   far.length?"NAVITIMEの中間参照地点と離れている箇所があります（要確認）":
   "中間参照地点は近接。ただし経路全体の形状一致は未確認"
 };
}
function matches(n,g,goal){
 const nsec=n.sections||[], move=nsec.filter(x=>x.type==="move");
 const roads=move.map(x=>norm(x.line_name)).filter(Boolean);
 const nJcts=extractJcts(nsec.filter(x=>x.type==="point"&&/JCT|ＪＣＴ/i.test(x.name||"")).map(x=>x.name));
 const gs=(g.legs||[]).flatMap(x=>x.steps||[]).map(x=>x.navigationInstruction?.instructions||"").filter(Boolean);
 const gJcts=[];
 for(const line of gs){
  const m=norm(line).match(/^([^、。\n]{1,15}?)JCTで/);
  if(m&&gJcts[gJcts.length-1]!==m[1]+"JCT")gJcts.push(m[1]+"JCT");
 }
 const gRoads=googleMovedRoads(gs);
 const km=Number(n.summary.move.distance)/1000, gkm=Number(g.distanceMeters)/1000;
 const ground=gs.some(x=>!/(有料区間)/.test(x)&&/環八通り|海岸通り|玉川通り|山手通り|産業道路|国道\d|都道\d|県道\d|交差点|U ターン/.test(x));
 const badDistance=!(Math.abs(km-gkm)<=Math.max(.5,km*.025));
 const nRoadNames=roads.map(x=>x.replace(/^首都|^神奈川|\d+号/g,"")).join(" ");
 const badOther=gRoads.some(x=>!nRoadNames.includes(x.replace(/線$/,""))&&
   !((x==="羽田線"||x==="台場線")&&/レインボーブリッジ|首都1号羽田線/.test(roads.join(" "))));
 const cleanJ=s=>s.replace(/JCT$/,"").replace(/ＪＣＴ$/,"");
 let idx=0;
 for(const x of gJcts){if(idx<nJcts.length&&cleanJ(x)===cleanJ(nJcts[idx]))idx++;}
 const jctCheck=nJcts.length>0&&idx===nJcts.length;
 // Exit name in directions is not mandatory: compare endpoint proximity too.
 const destCheck=gs.some(x=>norm(x).includes(norm(goal)+"IC")&&/出口|を出る/.test(x))||
                 gs.some(x=>norm(x).includes(norm(goal)+"出口"));
 const steps=(g.legs||[]).flatMap(x=>x.steps||[]);
 const end=steps[steps.length-1]?.endLocation?.latLng||g.legs?.[g.legs.length-1]?.endLocation?.latLng;
 const target=n.summary.goal.coord;
 const rad=x=>x*Math.PI/180;
 let endpointMeters=null;
 if(end&&target&&[end.latitude,end.longitude,target.lat,target.lon].every(x=>Number.isFinite(Number(x)))){
  const a=rad(Number(end.latitude)-Number(target.lat)),b=rad(Number(end.longitude)-Number(target.lon));
  const h=Math.sin(a/2)**2+Math.cos(rad(Number(target.lat)))*Math.cos(rad(Number(end.latitude)))*Math.sin(b/2)**2;
  endpointMeters=Math.round(2*6371000*Math.asin(Math.min(1,Math.sqrt(h))));
 }
 const endpointNear=endpointMeters!==null&&endpointMeters<=150;
 const endpointFar=endpointMeters!==null&&endpointMeters>300;
 const lastInstructions=gs.slice(-4).map(norm);
 const exits=lastInstructions.flatMap(x=>[...x.matchAll(/([^、。\s]{1,20}?)(?:IC|インターチェンジ)?出口/g)].map(m=>m[1]));
 const otherExit=exits.some(name=>name.length>=2&&!name.includes(norm(goal))&&!norm(goal).includes(name)&&!/(高速|有料|次の|この|右|左)/.test(name));
 const exitAssessment=destCheck?"指定出口名の案内あり":otherExit?"異なる出口名の案内の可能性":endpointFar?"終点が指定ICの参考座標から離れています":endpointNear?"指定IC付近で終点を確認（出口ランプの通過は未検証）":"出口ランプの通過は未検証";
 const geometry=geoSummary(n,g);
 const checks={一般道なし:!ground,距離:!badDistance,路線:!badOther,JCT:jctCheck,目的地出口:destCheck};
 if(geometry.potentialGeometryIssue)checks["形状上の疑義"]=false;
 return {ok:!ground&&!badDistance&&!badOther&&jctCheck&&destCheck&&!geometry.potentialGeometryIssue,checks,geometry,
  navKm:+km.toFixed(2),googleKm:+gkm.toFixed(2),distanceDiffKm:+Math.abs(km-gkm).toFixed(2),
  reason:
   ground?"一般道の走行が含まれます":badDistance?"距離が一致しません":badOther?"路線が一致しません":
   !jctCheck?"通過JCTの一致を確認できません":!destCheck?"出口を確認できません":geometry.potentialGeometryIssue?"経路形状の参照点に疑義があります":"照合条件を満たしました（形状完全一致は未確認）",
  nJcts,gJcts,gRoads,ground,distanceKm:+gkm.toFixed(2),endpointMeters,endpointNear,endpointFar,exitAssessment,otherExit};
}
if(fromName&&toName&&fromName!==toName){
 if(!navKey){report.status="NAVITIME APIキー未登録。先に接続診断で登録してください。";}
 else if(!googKey){report.status="Google APIキーが未登録です。";}
 else{
  try{
   const fromId=await ic(fromName),toId=await ic(toName);
   const n=await nav("route_car",{start:JSON.stringify({ic:fromId}),goal:JSON.stringify({ic:toId}),condition:"toll_time",options:"turn_by_turn"});
   const route=n.items?.[0];if(!route)throw Error("NAVITIME経路が見つかりません");
   const nn=route.summary.move, from=route.summary.start.coord,to=route.summary.goal.coord;
   if(!from||!to)throw Error("入口・出口の座標がありません");
   if([from,to].some(x=>x.lat<35||x.lat>36.2||x.lon<138.8||x.lon>140.5))throw Error("首都高以外のICが選択された可能性があります");
   const km=Number(nn.distance)/1000, toll=Number(nn.toll_road_distance)/1000;
   if(km>150||km<0.1||toll/km<.97)throw Error("首都高だけの経路として確認できません");
   report.normal=Number(nn.time);report.time=Number(nn.time);report.km=+km.toFixed(1);
   report.source="NAVITIME";report.status="渋滞未考慮（通常の所要時間）";
   report.roads=[...new Set((route.sections||[]).filter(x=>x.type==="move").map(x=>x.line_name))];
   report.jcts=extractJcts((route.sections||[]).filter(x=>x.type==="point").map(x=>x.name||""));
   try{
    const routes=await google(from,to),opts=[],seen=new Set();
    for(const g of routes){
     const t=parseFloat(g.duration),st=parseFloat(g.staticDuration);
     if(!Number.isFinite(t)||t<=0||!Number.isFinite(st))continue;
     const key=g.polyline?.encodedPolyline||String(g.distanceMeters)+"_"+String(g.duration);
     if(seen.has(key))continue;seen.add(key);
     const d=matches(route,g,toName);
     const instructions=(g.legs||[]).flatMap(z=>z.steps||[]).map(z=>z.navigationInstruction?.instructions||"").filter(Boolean);
     const roads=googleMovedRoads(instructions),sequence=orderedRouteParts(instructions),time=Math.ceil(t/60),normal=Math.ceil(st/60);
     opts.push({time,normal,delay:time-normal,km:+(Number(g.distanceMeters)/1000).toFixed(1),
      roads,sequence,jcts:d.gJcts||[],ground:d.ground,exitConfirmed:!!d.checks["目的地出口"],exitAssessment:d.exitAssessment,endpointMeters:d.endpointMeters,endpointFar:d.endpointFar,otherExit:d.otherExit,sameAsNavitime:d.ok,diagnostic:d,seconds:t});
    }
    if(opts.length){
     opts.sort((a,b)=>a.seconds-b.seconds);
     const o=opts[0];report.options=[o];report.time=o.time;report.normal=o.normal;report.delay=o.delay;
     report.km=o.km;report.roads=o.roads;report.jcts=o.jcts;report.diagnostic=o.diagnostic;
     report.source="Google（渋滞考慮）";report.status="Google候補中の最短所要時間ルート・NAVITIMEはIC位置確認用";report.matched=true;
    }else report.status="Googleの経路が取得できずNAVITIME通常時間を表示";
   }catch(e){report.status="Google検索不可。NAVITIME通常時間を表示："+String(e).slice(0,80);}
  }catch(e){report.status="検索できません："+String(e).slice(0,140);}
 }
}
globalThis.__shRouteReport=report;
})();
// JARTIC 首都高交通情報 — 試用版 v0.1（NAVITIME×Google・経路照合）
// 地図 + 12時間履歴のみ。APIキー・Google Routes検索・お気に入り機能なし。
// Scriptableに全文を貼り付けて実行してください。
const URL = 'https://www.jartic.or.jp/map/?p=C01&z=8';
const rerunURL=URLScheme.forRunningScript();
const web=new WebView();
await web.loadURL(URL);

// Map layout and initial position
await web.evaluateJavaScript(`(${function () {
  const meta=document.querySelector('meta[name="viewport"]');
  if(meta&&!/viewport-fit/.test(meta.content))meta.content+=', viewport-fit=cover';
  const s=document.createElement('style');s.textContent=`
  html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important}
  #sideContent,.spHeadBtn,.smp_rotate,.top-area,.banner,.map_right_btn_area,.map_btm_btn_area,.switch_area,.ol-zoom,.ol-zoomslider,.ol-zoom-extent,.ol-full-screen{display:none!important}
  #mainContent,#mainContentInner{margin:0!important;padding:0!important;width:100%!important;left:0!important;transform:none!important;transition:none!important}
  #mainContent .map_area{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;max-height:none!important;margin:0!important;padding:0!important}
  #map{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-height:none!important}`;
  document.head.appendChild(s);
  function terms(){const m=document.getElementById('termsModal');if(!m)return;const b=[...m.querySelectorAll('.terms-btn-area .btn')].find(x=>x.textContent.trim()==='同意する');if(b)b.click();}
  terms();new MutationObserver(()=>{const m=document.getElementById('termsModal');if(m&&m.offsetParent!==null)terms();}).observe(document.body,{childList:true,subtree:true});
  let resizeBusy=false;function resize(){if(resizeBusy)return;resizeBusy=true;requestAnimationFrame(()=>{resizeBusy=false;window.dispatchEvent(new Event('resize'));});}
  window.addEventListener('pageshow',resize);window.visualViewport?.addEventListener('resize',resize);
  return true;
}.toString()})()`);
await web.evaluateJavaScript(`(${function (dx,dy) {
  const map=document.getElementById('map');if(!map)return true;
  let done=false,timer,retry,expiry;
  function clean(){clearTimeout(timer);clearInterval(retry);clearTimeout(expiry);window.removeEventListener('resize',schedule);map.removeEventListener('pointerdown',cancel,true);}
  function cancel(e){if(e.isTrusted){done=true;clean();}}
  map.addEventListener('pointerdown',cancel,true);
  async function pan(){if(done)return;const vp=map.querySelector('.ol-viewport');if(!vp||!vp.querySelector('canvas'))return;
    const b=vp.getBoundingClientRect();if(b.width<10||b.height<10)return;done=true;clean();
    const x=b.left+b.width*.5,y=b.top+b.height*.55;
    function send(type,cx,cy,buttons){vp.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:901,pointerType:'mouse',isPrimary:true,button:0,buttons,clientX:cx,clientY:cy}));}
    send('pointerdown',x,y,1);for(let i=1;i<=8;i++){await new Promise(r=>setTimeout(r,16));send('pointermove',x+b.width*dx*i/8,y+b.height*dy*i/8,1);}
    await new Promise(r=>setTimeout(r,120));send('pointerup',x+b.width*dx,y+b.height*dy,0);
  }
  function schedule(){if(!done){clearTimeout(timer);timer=setTimeout(pan,100);}}
  window.addEventListener('resize',schedule);schedule();retry=setInterval(schedule,1000);expiry=setTimeout(()=>{done=true;clean();},8000);
  return true;
}.toString()})(0.80,-0.19)`);

// 12-hour history and native refresh
await web.evaluateJavaScript(`(${function () {
  const base='/d/traffic_info/r1/';
  const state={stamp:null,token:0,pending:0,seen:new Set(),busy:false,label:''};
  const s=document.createElement('style');s.textContent=`
  html{background:#fff!important}
  #sh-history,#sh-history *{box-sizing:border-box!important}
  #sh-history{position:fixed!important;bottom:calc(65px + env(safe-area-inset-bottom,0px))!important;left:12px!important;right:12px!important;z-index:100000!important;background:#fff!important;color:#172536!important;color-scheme:light!important;padding:10px 12px 9px!important;box-shadow:0 4px 24px #0003!important;border:1px solid #dce8f5!important;border-radius:15px!important;font:12px -apple-system,sans-serif!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translate3d(0,calc(100% + 24px),0)!important;transition:transform .32s cubic-bezier(.2,.85,.25,1),opacity .25s ease,visibility 0s linear .32s!important;will-change:transform!important}
  body.sh-lite-open #sh-history{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:translate3d(0,0,0)!important;transition:transform .32s cubic-bezier(.2,.85,.25,1),opacity .25s ease,visibility 0s!important}
  #sh-lite-toggle{position:fixed!important;right:12px!important;bottom:calc(10px + env(safe-area-inset-bottom,0px))!important;z-index:100002!important;display:flex!important;align-items:center!important;justify-content:center!important;width:122px!important;min-width:122px!important;height:40px!important;padding:0 10px!important;background:#087cf0!important;color:#fff!important;border:0!important;border-radius:12px!important;box-shadow:0 3px 12px #0004!important;font:600 14px -apple-system,sans-serif!important;letter-spacing:0!important;-webkit-appearance:none!important;appearance:none!important;cursor:pointer!important}
  /* Keep the route button clear of the timeline card while it is open. */
  body.sh-lite-open #sh-test-reopen{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
  #sh-test-reopen{transition:bottom .24s ease!important}
  @media (prefers-reduced-motion:reduce){#sh-history,body.sh-lite-open #sh-history,#sh-test-reopen{transition:none!important}}
  #sh-history .row{display:flex!important;align-items:center!important;gap:8px!important;min-height:30px!important}
  #sh-history output{font-weight:600!important;flex-shrink:0!important}
  #sh-status{flex:1!important;min-width:0!important;text-align:right!important;font-size:10px!important;color:#66788f!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important}
  #sh-history button{flex:none!important;width:auto!important;height:26px!important;min-height:0!important;padding:0 8px!important;background:#edf4fc!important;color:#087cf0!important;border:0!important;border-radius:6px!important;font-size:12px!important}
  #sh-range{-webkit-appearance:none!important;appearance:none!important;width:100%!important;height:26px!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important}
  #sh-range::-webkit-slider-runnable-track{height:4px!important;background:#bedcff!important;border-radius:2px!important}
  #sh-range::-webkit-slider-thumb{-webkit-appearance:none!important;appearance:none!important;width:20px!important;height:20px!important;margin-top:-8px!important;background:#168aff!important;border:2px solid white!important;border-radius:50%!important}
  #sh-history .ticks{display:flex!important;justify-content:space-between!important;color:#66788f!important;font-size:10px!important;line-height:18px!important;min-height:20px!important;margin:2px 0 0!important;padding:0 0 2px!important}
  #sh-mask{position:fixed!important;inset:0!important;z-index:99999!important;display:none;align-items:center;justify-content:center;background:#f8fafc!important;color:#172536!important;text-align:center!important;padding:25px!important;font:17px -apple-system,sans-serif!important}
  #reloadEvent,#offerDate{visibility:hidden!important}`;document.head.appendChild(s);
  const panel=document.createElement('div');panel.id='sh-history';panel.innerHTML=`<div class="row"><output id="sh-choice">現在</output><span id="sh-status">最新情報</span><button id="sh-now">現在へ</button><button id="sh-refresh">↻ 更新</button></div><input id="sh-range" type="range" min="-12" max="0" step="1" value="0"><div class="ticks"><span>12時間前</span><span>6時間前</span><span>現在</span></div>`;document.body.appendChild(panel);
  const toggle=document.createElement('button');toggle.id='sh-lite-toggle';toggle.type='button';toggle.textContent='タイムライン';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','sh-history');document.body.appendChild(toggle);
  function measureTimeline(){
    const height=Math.ceil(panel.getBoundingClientRect().height||130);
    document.documentElement.style.setProperty('--sh-timeline-panel-height',height+'px');
  }
  measureTimeline();
  window.addEventListener('resize',measureTimeline);
  if(window.ResizeObserver)new ResizeObserver(measureTimeline).observe(panel);
  toggle.addEventListener('click',()=>{
    measureTimeline();
    const open=document.body.classList.toggle('sh-lite-open');
    toggle.setAttribute('aria-expanded',String(open));
    if(open)window.dispatchEvent(new Event('sh:timeline-open'));
  });
  window.addEventListener('sh:route-open',()=>{
    document.body.classList.remove('sh-lite-open');
    toggle.setAttribute('aria-expanded','false');
  });
  const slider=panel.querySelector('#sh-range'),choice=panel.querySelector('#sh-choice'),status=panel.querySelector('#sh-status');
  const mask=document.createElement('div');mask.id='sh-mask';document.body.appendChild(mask);
  let deadline,settle;
  const pad=n=>String(n).padStart(2,'0');
  function shift(stamp,h){const x=String(stamp);if(!/^\d{12}$/.test(x))throw Error('時刻不正');const d=new Date(Date.UTC(+x.slice(0,4),+x.slice(4,6)-1,+x.slice(6,8),+x.slice(8,10)-h,+x.slice(10,12)));return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+pad(d.getUTCHours())+pad(d.getUTCMinutes());}
  function updateChoice(){const h=-Number(slider.value);if(!h){choice.textContent='現在';return;}const t=new Date(Date.now()-h*3600000);choice.textContent=pad(t.getMonth()+1)+'/'+pad(t.getDate())+' '+pad(t.getHours())+':'+pad(t.getMinutes());}
  function show(message){mask.textContent=message;mask.style.display='flex';}
  function fail(message){clearTimeout(deadline);clearTimeout(settle);state.busy=false;slider.disabled=false;status.textContent=message;show(message+'。「現在へ」で戻れます。');}
  async function json(path){const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);try{const r=await fetch(path,{signal:c.signal,cache:'no-cache'});if(!r.ok)throw Error(r.status);return await r.json();}finally{clearTimeout(t);}}
  const nativeOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url,...rest){
    const parsed=new URL(String(url),location.href),m=/^\/d\/traffic_info\/r1\/\d{12}\/(.*)$/.exec(parsed.pathname);let key='';
    if(parsed.origin===location.origin&&m){if(state.stamp){parsed.pathname=base+state.stamp+'/'+m[1];url=parsed.href;}if(m[1]==='s/offer.json')key='offer';if(m[1]==='s/301/C01.json')key='301';if(m[1]==='s/801/C01.json')key='801';}
    const token=state.token,track=!!(key&&state.busy),ret=nativeOpen.call(this,method,url,...rest);
    if(track){state.pending++;let finished=false;
      const finish=()=>{if(finished||token!==state.token)return;finished=true;state.pending--;if(this.status!==200){fail('地図データを取得できません');return;}
        try{const data=JSON.parse(this.responseText);if(key==='offer'){const x=data.S_C01;if(!Array.isArray(x)||x.length<5)throw Error('形式不正');state.label=x[1]+'/'+x[2]+' '+pad(x[3])+':'+pad(x[4]);}else if(!Array.isArray(data.features))throw Error('形式不正');state.seen.add(key);}catch(e){fail('データ形式を確認できません');return;}
        clearTimeout(settle);settle=setTimeout(()=>{if(token!==state.token||!state.busy||state.pending||!['offer','301','801'].every(k=>state.seen.has(k)))return;
          requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token!==state.token||!state.busy||state.pending)return;clearTimeout(deadline);state.busy=false;slider.disabled=false;mask.style.display='none';status.textContent=state.stamp?'履歴表示中':'最新情報';choice.textContent=state.stamp?state.label:'現在';}));},300);
      };
      for(const ev of ['load','error','abort','timeout'])this.addEventListener(ev,finish,{once:true});
    }
    return ret;
  };
  async function change(hours){const token=++state.token;clearTimeout(deadline);clearTimeout(settle);state.busy=false;state.pending=0;state.seen.clear();slider.value=String(-hours);updateChoice();slider.disabled=true;show(hours?hours+'時間前の情報を確認しています…':'現在の情報に戻しています…');status.textContent='読み込み中…';
    try{let stamp=null;if(hours){const target=await json(base+'target.json?_='+Date.now());stamp=shift(target.target,hours);const [offer,lines,closures]=await Promise.all([json(base+stamp+'/s/offer.json'),json(base+stamp+'/s/301/C01.json'),json(base+stamp+'/s/801/C01.json')]);if(!Array.isArray(offer.S_C01)||!Array.isArray(lines.features)||!Array.isArray(closures.features))throw Error('形式不正');}
      if(token!==state.token)return;state.stamp=stamp;document.documentElement.dataset.shHistory=stamp?'past':'live';const reload=document.getElementById('reloadEvent');if(!reload)throw Error('更新ボタンなし');state.busy=true;deadline=setTimeout(()=>{if(token===state.token)fail('地図の更新を確認できません');},20000);reload.click();
    }catch(e){if(token===state.token)fail('その時刻は表示できません');}
  }
  slider.addEventListener('input',updateChoice);slider.addEventListener('change',()=>change(-Number(slider.value)));
  panel.querySelector('#sh-now').addEventListener('click',()=>{if(!state.busy)change(0);});panel.querySelector('#sh-refresh').addEventListener('click',()=>{if(!state.busy)change(0);});
  return true;
}.toString()})()`);


await web.evaluateJavaScript("(" + function(data,runURL){
 const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 for(const id of ["sh-test-result","sh-test-reopen"])document.getElementById(id)?.remove();
 const style=document.createElement("style");style.textContent=[
 "#sh-test-result,#sh-test-result *{box-sizing:border-box!important}",
 "#sh-test-result{position:fixed!important;bottom:calc(65px + env(safe-area-inset-bottom,0px))!important;left:12px!important;right:12px!important;top:auto!important;z-index:2147483645!important;background:#fff!important;color:#1c2938!important;border:1px solid #dae2ea!important;box-shadow:0 4px 20px #0003!important;border-radius:17px!important;padding:16px!important;font:13px -apple-system,sans-serif!important;max-height:min(76vh,750px)!important;overflow:auto!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translateY(28px)!important;transition:transform .22s ease,opacity .22s ease,visibility .22s!important}",
 "#sh-test-result.sh-open{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:translateY(0)!important}",
 "#sh-test-result .sh-title{font-size:17px!important;font-weight:750!important;margin:0 40px 14px 0!important;text-align:left!important}",
 "#sh-test-result label{display:block!important;font-size:12px!important;color:#64748b!important;margin:0 0 4px!important}",
 "#sh-test-result input{display:block!important;width:100%!important;height:42px!important;border:1px solid #d2dce6!important;border-radius:10px!important;padding:8px 11px!important;background:#fff!important;color:#17283b!important;font-size:15px!important}",
 "#sh-test-result .sh-input-grid{display:flex!important;gap:7px!important;align-items:center!important}",
 "#sh-test-result .sh-fields{flex:1!important;min-width:0!important;display:flex!important;flex-direction:column!important;gap:9px!important}",
 "#sh-test-result .sh-swap{align-self:center!important;flex-shrink:0!important;margin-top:18px!important;width:43px!important;height:43px!important;background:#f6f8fb!important;border:1px solid #d9e0e8!important;border-radius:11px!important;font-size:22px!important;color:#273545!important}",
 "#sh-test-result .sh-actions{display:flex!important;gap:8px!important;margin:12px 0!important}",
 "#sh-test-result .sh-go{flex:1!important;min-height:43px!important;background:#087cf0!important;color:white!important;border:0!important;border-radius:10px!important;font-weight:700!important;font-size:14px!important}",
 "#sh-test-result .sh-dismiss{width:76px!important;min-height:43px!important;background:#eff2f6!important;color:#344255!important;border:0!important;border-radius:10px!important;font-size:13px!important}",
 "#sh-test-result .sh-card{border:1px solid #e3e9ef!important;border-radius:14px!important;padding:14px!important;text-align:center!important}",
 "#sh-test-result .sh-route{font-size:14px!important;font-weight:700!important;overflow-wrap:anywhere!important;margin:0 0 10px!important}",
 "#sh-test-result .sh-result-row{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:10px!important;text-align:left!important}",
 "#sh-test-result .sh-label{font-weight:650!important;font-size:13px!important}",
 "#sh-test-result .sh-eta{font-size:29px!important;font-weight:850!important;white-space:nowrap!important}",
 "#sh-test-result .sh-meta{font-size:12px!important;color:#62758a!important;line-height:1.5!important;margin:7px 0!important;overflow-wrap:anywhere!important}",
 "#sh-test-result .sh-warning{background:#fff4dc!important;color:#865e08!important;font-size:11px!important;line-height:1.5!important;border-radius:9px!important;padding:9px!important;margin-top:10px!important}",
 "#sh-test-result details{margin-top:9px!important;border-top:1px solid #e7edf3!important;padding-top:8px!important}",
 "#sh-test-result summary{font-size:12px!important;color:#2869a8!important;cursor:pointer!important}",
 "#sh-test-result .sh-detail{font-size:11px!important;line-height:1.6!important;color:#526479!important;margin-top:6px!important;overflow-wrap:anywhere!important}",
 "#sh-test-result .sh-footer{font-size:10px!important;color:#728094!important;text-align:center!important;margin-top:9px!important}",
 "#sh-test-close{position:absolute!important;right:12px!important;top:12px!important;width:29px!important;height:29px!important;border:0!important;background:#eff4f9!important;border-radius:9px!important;color:#087cf0!important}",
 "#sh-test-reopen{position:fixed!important;right:12px!important;bottom:calc(56px + env(safe-area-inset-bottom,0px))!important;width:122px!important;height:40px!important;z-index:2147483644!important;background:#087cf0!important;color:white!important;border:0!important;border-radius:11px!important;padding:0 10px!important;font-size:14px!important;font-weight:700!important;box-shadow:0 3px 12px #0003!important}",
 "body.sh-lite-open #sh-test-reopen{bottom:calc(73px + var(--sh-timeline-panel-height,130px) + env(safe-area-inset-bottom,0px))!important}"
 ].join("");document.head.appendChild(style);
 const d=document.createElement("div");d.id="sh-test-result";
 const hasTime=typeof data.time==="number"&&Number.isFinite(data.time);
 const opts=Array.isArray(data.options)?data.options.slice(0,1):[];
 function card(o,i){
  const ratio=o.normal>0?o.delay/o.normal:0;
  const color=ratio>=.5&&o.delay>=10?"#c92828":ratio>=.2&&o.delay>=5?"#c98b00":"#087cf0";
  const roads=(o.sequence||[]).map(esc).join(" → ");
  const warns=[o.ground?"一般道を含む可能性":"",o.otherExit?"異なる出口名が案内された可能性":"",o.endpointFar?"終点が指定ICの参考座標から離れています":"",!roads?"経由路線名は未確認":""].filter(Boolean);
  const d=o.diagnostic;
  return '<div class="sh-card" style="margin-top:10px!important"><div class="sh-route">'+"Google最短時間ルート"+' ／ '+esc(data.from)+' → '+esc(data.to)+'</div>'+
  '<div class="sh-result-row"><span class="sh-label">Google渋滞考慮</span><span class="sh-eta" style="color:'+color+'">'+esc(o.time)+'分</span></div>'+
  '<div class="sh-meta">通常 '+esc(o.normal)+'分 / 遅延 '+(o.delay>=0?"+":"")+esc(o.delay)+'分 ・ '+esc(o.km)+'km</div>'+
  '<div class="sh-meta">経由ルート（案内確認分）：'+(roads||"未確認")+'</div>'+
  
  (warns.length?'<div class="sh-warning">'+warns.map(esc).join(" ／ ")+'</div>':"")+
  '<details><summary>経路の詳しい判定</summary><div class="sh-detail">出口判定：'+esc(o.exitAssessment||"未検証")+(o.endpointMeters!=null?"（座標差 "+esc(o.endpointMeters)+"m）":"")+'</div><div class="sh-detail">'+(o.sameAsNavitime?"NAVITIME参考経路との一致条件を満たしました":"NAVITIME経路との一致未確認")+'</div>'+
  (d?'<div class="sh-detail">'+Object.entries(d.checks||{}).map(([k,v])=>esc(k)+(v?" ○":" ×")).join(" / ")+'</div>':"")+
  (d?.geometry?'<div class="sh-detail">形状診断：'+esc(d.geometry.interpretation)+'</div>':"")+'</details></div>';
 }
 const cards=!(data.from&&data.to)?'<div class="sh-footer">入口ICと出口ICを入力して「所要時間を比較」を押してください。</div>':opts.length?opts.map(card).join(""):'<div class="sh-card"><div class="sh-route">'+esc(data.from)+' → '+esc(data.to)+'</div><div class="sh-result-row"><span class="sh-label">NAVITIME通常時間</span><span class="sh-eta">'+(hasTime?esc(data.time)+"分":"取得なし")+'</span></div><div class="sh-warning">Google渋滞考慮時間は取得できませんでした。'+esc(data.status)+'</div></div>';
 d.innerHTML='<button type="button" id="sh-test-close" aria-label="閉じる">×</button>'+
 '<div class="sh-title">所要時間検索</div>'+
 '<div class="sh-input-grid"><div class="sh-fields">'+
 '<div><label>出発IC（入口）<input id="sh-entry-draft" autocomplete="off" value="'+esc(data.from||"")+'"></label></div>'+
 '<div><label>到着IC（出口）<input id="sh-exit-draft" autocomplete="off" value="'+esc(data.to||"")+'"></label></div>'+
 '</div><button type="button" class="sh-swap" id="sh-swap-draft" aria-label="入口と出口を入れ替える">⇅</button></div>'+
 '<div class="sh-actions"><button type="button" class="sh-go" id="sh-retry-search">所要時間を比較</button><button type="button" class="sh-dismiss" id="sh-dismiss">閉じる</button></div>'+
 cards+
 '<div class="sh-footer" id="sh-retry-note">再検索時は地図も再読み込みします。道路名はGoogle案内文に記載されたものだけ表示します。</div>';
 const entry=d.querySelector("#sh-entry-draft"),exit=d.querySelector("#sh-exit-draft");
 d.querySelector("#sh-swap-draft").addEventListener("click",()=>{const t=entry.value;entry.value=exit.value;exit.value=t;});
 d.querySelector("#sh-retry-search").addEventListener("click",()=>{
  const a=entry.value.trim(),b=exit.value.trim(),note=d.querySelector("#sh-retry-note");
  if(!a||!b||a===b||a.length>=50||b.length>=50){note.textContent="異なる入口・出口ICを50文字未満で入力してください。";return;}
  note.textContent="再検索しています。地図も再読み込みします。";
  const url=runURL+(runURL.includes("?")?"&":"?")+"from="+encodeURIComponent(a)+"&to="+encodeURIComponent(b);
  window.location.assign(url);
 });
 const reopen=document.createElement("button");reopen.id="sh-test-reopen";reopen.textContent="所要時間";reopen.setAttribute("aria-expanded","false");
 document.body.appendChild(d);document.body.appendChild(reopen);
 const close=()=>{d.classList.remove("sh-open");reopen.setAttribute("aria-expanded","false");};
 d.querySelector("#sh-test-close").addEventListener("click",close);
 d.querySelector("#sh-dismiss").addEventListener("click",close);
 reopen.addEventListener("click",()=>{
  const open=!d.classList.contains("sh-open");d.classList.toggle("sh-open",open);
  reopen.setAttribute("aria-expanded",String(open));
  if(open)window.dispatchEvent(new Event("sh:route-open"));
 });
 window.addEventListener("sh:timeline-open",close);
 return true;
}.toString()+")("+JSON.stringify(globalThis.__shRouteReport||{})+","+JSON.stringify(rerunURL)+")");
await web.present(true);
Script.complete();