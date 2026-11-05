// v0.8 input-and-swap UI trial (no new API bridge): stable v37.0 untouched. Do not share API keys.
// 首都高 NAVITIME×Google 試用版 v0.8: 経路一致だけ渋滞考慮
// 安定版v37.0とは別。起動時に1区間を検索し、地図上に結果を重ねます。
// 1検索あたり NAVITIME /ic 最大2回, /route_car 1回, Google Routes 1回。
// NAVITIMEの経路一致が未確認の場合は「渋滞未考慮」を明示します。
await (async function(){
const NK="JARTIC_NAVITIME_RAPIDAPI_KEY_IC100",HK="JARTIC_NAVITIME_RAPIDAPI_HOST_IC100",GK="JARTIC_ROUTES_API_KEY_V13";
function get(k){try{return Keychain.contains(k)?Keychain.get(k):"";}catch(_){return "";}}
const navKey=get(NK),googKey=get(GK),host=get(HK)||"navitime-route-car.p.rapidapi.com";
const known={"横浜駅西口":"252010","外苑":"209010","汐留":"201050","空港中央":"217020"};
const q=new Alert();q.title="首都高 所要時間テスト";q.message="入口・出口のIC名を入力（首都高のみ）。今回は起動時に1回検索します。";
q.addTextField("入口IC","横浜駅西口");q.addTextField("出口IC","汐留");q.addAction("検索");q.addCancelAction("地図だけ");
const selection=await q.present();
const fromName=selection===-1?"":(q.textFieldValue(0)||"").trim();
const toName=selection===-1?"":(q.textFieldValue(1)||"").trim();
let report={name:"首都高ルート試用版",from:fromName,to:toName,source:"なし",status:"検索しませんでした",time:null,normal:null,km:null,roads:[],jcts:[],delay:null,matched:false};
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
async function google(a,b){
 const r=new Request("https://routes.googleapis.com/directions/v2:computeRoutes");r.method="POST";r.timeoutInterval=35;
 r.headers={"Content-Type":"application/json","X-Goog-Api-Key":googKey,"X-Goog-FieldMask":"routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.steps.navigationInstruction.instructions"};
 r.body=JSON.stringify({
 origin:{location:{latLng:{latitude:a.lat,longitude:a.lon}}},
 destination:{location:{latLng:{latitude:b.lat,longitude:b.lon}}},
 travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE_OPTIMAL",trafficModel:"BEST_GUESS",
 routeModifiers:{avoidTolls:false,avoidHighways:false,avoidFerries:true},languageCode:"ja",units:"METRIC"
 });
 const x=await getJSON(r);
 if(!x.routes?.[0])throw Error("Googleの経路結果なし");
 return x.routes[0];
}
function matches(n,g,goal){
 const nsec=n.sections||[], move=nsec.filter(x=>x.type==="move");
 const roads=move.map(x=>norm(x.line_name)).filter(Boolean);
 const nJcts=extractJcts(nsec.filter(x=>x.type==="point"&&/JCT|ＪＣＴ/i.test(x.name||"")).map(x=>x.name));
 const gs=(g.legs||[]).flatMap(x=>x.steps||[]).map(x=>x.navigationInstruction?.instructions||"").filter(Boolean);
 const gJcts=extractJcts(gs.filter(x=>/JCT|ＪＣＴ/i.test(x)&&!/方面の標識に従う/.test(x.replace(/^.*?JCT/,""))));
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
 // Google must show the destination's actual off-ramp in its instructions.
 const destCheck=gs.some(x=>norm(x).includes(norm(goal)+"IC")&&/出口|を出る/.test(x))||
                 gs.some(x=>norm(x).includes(norm(goal)+"出口"));
 return {ok:!ground&&!badDistance&&!badOther&&jctCheck&&destCheck,reason:
   ground?"一般道の走行が含まれます":badDistance?"距離が一致しません":badOther?"路線が一致しません":
   !jctCheck?"通過JCTの一致を確認できません":"出口を確認できません",
  nJcts,gJcts,gRoads,ground,distanceKm:+gkm.toFixed(2)};
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
    const g=await google(from,to),c=matches(route,g,toName);
    if(c.ok){
      report.time=Math.ceil(parseFloat(g.duration)/60);
      report.normal=Math.ceil(parseFloat(g.staticDuration)/60);
      report.source="Google（渋滞考慮）";report.status="経路一致確認";report.matched=true;
      report.delay=report.time-report.normal;
    }else{report.status="渋滞未考慮：Google経路不一致・"+c.reason;}
   }catch(e){report.status="渋滞未考慮：Google検索不可・"+String(e).slice(0,60);}
  }catch(e){report.status="検索できません："+String(e).slice(0,140);}
 }
}
globalThis.__shRouteReport=report;
})();
// JARTIC 首都高交通情報 — 試用版 v0.1（NAVITIME×Google・経路照合）
// 地図 + 12時間履歴のみ。APIキー・Google Routes検索・お気に入り機能なし。
// Scriptableに全文を貼り付けて実行してください。
const URL = 'https://www.jartic.or.jp/map/?p=C01&z=8';
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
  #sh-lite-toggle{position:fixed!important;right:12px!important;bottom:calc(5px + env(safe-area-inset-bottom,0px))!important;z-index:100002!important;display:flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:114px!important;height:36px!important;padding:0 12px!important;background:#087cf0!important;color:#fff!important;border:0!important;border-radius:12px!important;box-shadow:0 3px 12px #0004!important;font:600 14px -apple-system,sans-serif!important;letter-spacing:0!important;-webkit-appearance:none!important;appearance:none!important;cursor:pointer!important}
  /* Keep the route button clear of the timeline card while it is open. */
  body.sh-lite-open #sh-test-reopen{bottom:calc(73px + var(--sh-timeline-panel-height,130px) + env(safe-area-inset-bottom,0px))!important}
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


await web.evaluateJavaScript("(" + function(data){
 const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const old=document.getElementById("sh-test-result");if(old)old.remove();
 const style=document.createElement("style");
 style.textContent=[
 "#sh-test-result{position:fixed!important;bottom:calc(65px + env(safe-area-inset-bottom,0px))!important;left:12px!important;right:12px!important;top:auto!important;z-index:2147483645!important;background:#fff!important;color:#15283b!important;border:1px solid #d7e7f6!important;box-shadow:0 4px 20px #0003!important;border-radius:16px!important;padding:13px 13px 15px!important;font:13px -apple-system,sans-serif!important;max-height:44vh!important;overflow:auto!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translateY(28px)!important;transition:transform .22s ease,opacity .22s ease,visibility .22s!important}",
 "#sh-test-result.sh-open{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:translateY(0)!important}",
 "#sh-test-result .sh-title{font-size:12px!important;font-weight:650!important;padding-right:30px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
 "#sh-test-result .sh-line{display:flex!important;align-items:baseline!important;gap:8px!important;margin-top:2px!important}",
 "#sh-test-result .sh-eta{font-size:27px!important;line-height:1.25!important;font-weight:800!important}",
 "#sh-test-result .sh-tag{font-size:11px!important;color:#617082!important}",
 "#sh-test-result .sh-warning{font-size:11px!important;color:#8b5b0a!important;margin-top:5px!important}",
 "#sh-test-result details{border-top:1px solid #e6ebf0!important;margin-top:7px!important;padding-top:6px!important}",
 "#sh-test-result summary{color:#4079b5!important;font-size:11px!important;cursor:pointer!important}",
 "#sh-test-result .sh-detail{font-size:11px!important;color:#53657a!important;line-height:1.55!important;margin-top:5px!important;overflow-wrap:anywhere!important}",
 "#sh-test-close{position:absolute!important;right:9px!important;top:9px!important;width:28px!important;height:28px!important;min-height:28px!important;background:#edf3fa!important;border:0!important;border-radius:8px!important;color:#1668be!important;font-size:15px!important}",
 "#sh-route-editor{margin:8px 0 7px!important;border-top:1px solid #e6ebf0!important;padding-top:8px!important}",
 "#sh-route-editor summary{font-weight:600!important;color:#176db9!important;font-size:12px!important}",
 "#sh-route-editor .sh-form{display:flex!important;flex-direction:column!important;gap:4px!important;margin-top:8px!important}",
 "#sh-route-editor label{font-size:11px!important;color:#51647b!important}",
 "#sh-route-editor input{display:block!important;box-sizing:border-box!important;width:100%!important;height:42px!important;min-height:42px!important;padding:8px 10px!important;font-size:14px!important;color:#23364d!important;background:#fff!important;border:1px solid #cbd9e7!important;border-radius:10px!important}",
 "#sh-route-editor .sh-swap{align-self:center!important;min-width:42px!important;min-height:36px!important;background:#edf5ff!important;color:#087cf0!important;border:1px solid #d8e5f5!important;border-radius:10px!important;font-weight:700!important;font-size:18px!important}",
 "#sh-route-editor .sh-notice{font-size:11px!important;color:#886400!important;background:#fff6e3!important;padding:7px!important;border-radius:8px!important;margin-top:7px!important}",
 "#sh-test-reopen{position:fixed!important;right:14px!important;bottom:calc(80px + env(safe-area-inset-bottom,0px))!important;z-index:2147483644!important;background:#087cf0!important;color:#fff!important;border:0!important;border-radius:11px!important;padding:10px 14px!important;font-size:13px!important;font-weight:700!important;box-shadow:0 3px 12px #0003!important;display:block!important}"
 ].join("");
 document.head.appendChild(style);
 const d=document.createElement("div");d.id="sh-test-result";
 const matched=!!data.matched,hasTime=Number.isFinite(data.time);
 const ratio=matched&&data.normal>0?(data.time-data.normal)/data.normal:0;
 const color=ratio>=.5&&data.delay>=10?"#d12626":ratio>=.2&&data.delay>=5?"#b77905":"#1265af";
 const badge=matched?"渋滞考慮":"渋滞未考慮";
 const note=matched?"通常"+esc(data.normal)+"分"+(data.delay>=0?" ／ +":" ／ ")+esc(data.delay)+"分":("通常の所要時間"+(hasTime?"":"を取得できません"));
 d.innerHTML='<button id="sh-test-close" aria-label="折りたたむ">×</button>'+
 '<div class="sh-title">🚗 '+esc(data.from||"首都高")+' → '+esc(data.to||"")+'</div>'+
 '<div class="sh-line">'+(hasTime?'<span class="sh-eta" style="color:'+(matched?color:"#1265af")+'">'+esc(data.time)+'分</span>':'<span class="sh-tag">所要時間の取得なし</span>')+
 '<span class="sh-tag">'+esc(badge)+'</span></div>'+
 '<div class="sh-tag">'+(matched?note:'通常の所要時間')+'</div>'+
 '<details id="sh-route-editor"><summary>入口・出口を変更（入力テスト）</summary>'+
 '<div class="sh-form"><label>入口IC<input id="sh-entry-draft" autocomplete="off" placeholder="入口IC名" value="'+esc(data.from||"")+'"></label>'+
 '<button type="button" class="sh-swap" id="sh-swap-draft" aria-label="入口と出口を入れ替える">⇅</button>'+
 '<label>出口IC<input id="sh-exit-draft" autocomplete="off" placeholder="出口IC名" value="'+esc(data.to||"")+'"></label></div>'+
 '<div class="sh-notice">この版は入力欄と入れ替えの動作確認用です。変更した区間の再検索はまだ行いません。上の所要時間は起動時の検索結果です。</div></details>'+
 (!matched?'<div class="sh-warning">※渋滞未考慮。実際の所要時間と異なる場合があります。</div>':'')+
 '<details><summary>経路・判定理由を見る</summary><div class="sh-detail">'+esc(data.source)+' / '+esc(data.status)+'</div>'+
 (data.roads?.length?'<div class="sh-detail">経路：'+data.roads.map(esc).join(" → ")+'</div>':'')+
 (data.jcts?.length?'<div class="sh-detail">JCT：'+data.jcts.map(esc).join(" → ")+'</div>':'')+
 '<div class="sh-detail">経路一致は試験的な自動判定です。出発前に交通情報も確認してください。</div></details>';
 const entryDraft=d.querySelector("#sh-entry-draft"),exitDraft=d.querySelector("#sh-exit-draft");
 d.querySelector("#sh-swap-draft").addEventListener("click",()=>{
  const prior=entryDraft.value;entryDraft.value=exitDraft.value;exitDraft.value=prior;
 });
 const reopen=document.createElement("button");reopen.id="sh-test-reopen";reopen.textContent="所要時間";reopen.setAttribute("aria-expanded","false");
 document.body.appendChild(d);document.body.appendChild(reopen);d.classList.remove("sh-open");reopen.style.display="block";
 const close=()=>{d.classList.remove("sh-open");reopen.setAttribute("aria-expanded","false");};
 d.querySelector("#sh-test-close").addEventListener("click",close);
 reopen.addEventListener("click",()=>{
  const open=!d.classList.contains("sh-open");
  d.classList.toggle("sh-open",open);
  reopen.setAttribute("aria-expanded",String(open));
  if(open)window.dispatchEvent(new Event("sh:route-open"));
 });
 window.addEventListener("sh:timeline-open",close);
 return true;
}.toString()+")("+JSON.stringify(globalThis.__shRouteReport||{})+")");
await web.present(true);
Script.complete();