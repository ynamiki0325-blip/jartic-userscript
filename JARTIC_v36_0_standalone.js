// JARTIC v36.0 - standalone streamlined Scriptable edition
// v35.4-style IC suggestions, 12-hour history, favorites, Google Routes.
// No runtime GitHub fetch. No speculative incident-start times.
// Keep your previous working version as a backup.
const URL = 'https://www.jartic.or.jp/map/?p=C01&z=8';
const KEY_NAME = 'JARTIC_ROUTES_API_KEY_V13';
let apiKey = '';
try { if (Keychain.contains(KEY_NAME)) apiKey=Keychain.get(KEY_NAME)||''; } catch(e) {}
if (!apiKey) {
  const a=new Alert(); a.title='Google Routes API'; a.message='APIキーを入力（Keychainに保存）';
  if(typeof a.addSecureTextField==='function') a.addSecureTextField('APIキー',''); else a.addTextField('APIキー','');
  a.addAction('保存'); a.addCancelAction('あとで');
  if(await a.present()!==-1){apiKey=(a.textFieldValue(0)||'').trim();if(apiKey){try{Keychain.set(KEY_NAME,apiKey);}catch(e){}}}
}
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
  #sh-history{position:fixed!important;bottom:0!important;left:0!important;right:0!important;z-index:100000!important;background:#fff!important;color:#172536!important;color-scheme:light!important;padding:4px 12px max(5px,env(safe-area-inset-bottom,0px))!important;box-shadow:0 -1px 6px #0002!important;font:12px -apple-system,sans-serif!important}
  #sh-history .row{display:flex!important;align-items:center!important;gap:8px!important}
  #sh-history output{font-weight:600!important;flex-shrink:0!important}
  #sh-status{flex:1!important;min-width:0!important;text-align:right!important;font-size:10px!important;color:#66788f!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important}
  #sh-history button{flex:none!important;width:auto!important;height:26px!important;min-height:0!important;padding:0 8px!important;background:#edf4fc!important;color:#087cf0!important;border:0!important;border-radius:6px!important;font-size:12px!important}
  #sh-range{-webkit-appearance:none!important;appearance:none!important;width:100%!important;height:26px!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important}
  #sh-range::-webkit-slider-runnable-track{height:4px!important;background:#bedcff!important;border-radius:2px!important}
  #sh-range::-webkit-slider-thumb{-webkit-appearance:none!important;appearance:none!important;width:20px!important;height:20px!important;margin-top:-8px!important;background:#168aff!important;border:2px solid white!important;border-radius:50%!important}
  #sh-history .ticks{display:flex!important;justify-content:space-between!important;color:#66788f!important;font-size:10px!important}
  #sh-mask{position:fixed!important;inset:0!important;z-index:99999!important;display:none;align-items:center;justify-content:center;background:#f8fafc!important;color:#172536!important;text-align:center!important;padding:25px!important;font:17px -apple-system,sans-serif!important}
  #reloadEvent,#offerDate{visibility:hidden!important}`;document.head.appendChild(s);
  const panel=document.createElement('div');panel.id='sh-history';panel.innerHTML=`<div class="row"><output id="sh-choice">現在</output><span id="sh-status">最新情報</span><button id="sh-now">現在へ</button><button id="sh-refresh">↻ 更新</button></div><input id="sh-range" type="range" min="-12" max="0" step="1" value="0"><div class="ticks"><span>12時間前</span><span>6時間前</span><span>現在</span></div>`;document.body.appendChild(panel);
  const slider=panel.querySelector('#sh-range'),choice=panel.querySelector('#sh-choice'),status=panel.querySelector('#sh-status');
  const mask=document.createElement('div');mask.id='sh-mask';document.body.appendChild(mask);
  let deadline,settle;
  const pad=n=>String(n).padStart(2,'0');
  function shift(stamp,h){const x=String(stamp);if(!/^\d{12}$/.test(x))throw Error('時刻不正');const d=new Date(Date.UTC(+x.slice(0,4),+x.slice(4,6)-1,+x.slice(6,8),+x.slice(8,10)-h,+x.slice(10,12)));return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate())+pad(d.getUTCHours())+pad(d.getUTCMinutes());}
  function updateChoice(){const h=-Number(slider.value);choice.textContent=h?h+'時間前':'現在';}
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
          requestAnimationFrame(()=>requestAnimationFrame(()=>{if(token!==state.token||!state.busy||state.pending)return;clearTimeout(deadline);state.busy=false;slider.disabled=false;mask.style.display='none';status.textContent=state.label+(state.stamp?' の履歴':' 現在');}));},300);
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

// Route search: original v32-compatible preference storage and Google API
await web.evaluateJavaScript(`(${function (apiKey) {
  const s=document.createElement('style');s.textContent=`
  #sh-route-btn,#sh-route-panel,#sh-route-panel *{box-sizing:border-box!important;font-family:-apple-system,sans-serif!important}
  #sh-route-btn{position:fixed!important;right:12px!important;bottom:calc(var(--sh-timeline-height,96px) + 12px)!important;z-index:2147483646!important;width:auto!important;height:auto!important;min-height:0!important;padding:9px 15px!important;background:#fff!important;color:#087cf0!important;border:1px solid #e2eaf4!important;border-radius:12px!important;font-size:13px!important;font-weight:600!important;box-shadow:0 3px 12px #152a4822!important}
  #sh-route-panel{position:fixed!important;left:12px!important;right:12px!important;bottom:calc(var(--sh-timeline-height,96px) + 12px)!important;z-index:2147483647!important;display:none!important;max-height:72vh!important;overflow-y:auto!important;padding:14px!important;background:#fff!important;color:#14253c!important;color-scheme:light!important;border:1px solid #e1e8f1!important;border-radius:18px!important;box-shadow:0 9px 28px #142b4736!important;font-size:13px!important;-webkit-overflow-scrolling:touch!important}
  #sh-route-panel.open{display:block!important}
  #sh-route-panel .title{text-align:center!important;font-size:17px!important;font-weight:700!important;margin-bottom:10px!important}
  #sh-route-panel label{display:block!important;margin:8px 0 4px!important;color:#718099!important;font-size:11px!important}
  #sh-route-panel select,#sh-route-panel input{display:block!important;width:100%!important;min-height:36px!important;margin:0!important;padding:5px 9px!important;background:#fff!important;color:#14253c!important;border:1px solid #dce5f0!important;border-radius:8px!important;font-size:12px!important}
  #sh-route-panel #sh-from,#sh-route-panel #sh-to{display:none!important;position:absolute!important;width:0!important;height:0!important;padding:0!important;margin:0!important;border:0!important}
  #sh-route-panel #sh-from-filter,#sh-route-panel #sh-to-filter{min-height:44px!important;padding:8px 12px!important;font-size:15px!important}
  #sh-route-panel .sh-ic-picker{padding:11px!important;margin:6px 0 12px!important;max-height:210px!important;overflow-y:auto!important;border:1px solid #cbdcf0!important;border-radius:12px!important;background:#f5f9ff!important;color:#172536!important}
  #sh-route-panel .sh-ic-picker .sh-picker-heading{font-size:13px!important;font-weight:600!important;margin-bottom:8px!important}
  #sh-route-panel .sh-ic-picker .sh-picker-choice{display:block!important;width:100%!important;min-height:39px!important;height:auto!important;margin:5px 0!important;padding:8px 10px!important;text-align:left!important;background:white!important;color:#135ca2!important;border:1px solid #d0e0ef!important;border-radius:8px!important;font-size:14px!important}
  #sh-route-panel .favorites{display:flex!important;flex-wrap:wrap!important;gap:5px!important;margin:6px 0!important}
  #sh-route-panel button{width:auto!important;min-height:30px!important;padding:0 9px!important;border-radius:8px!important;border:0!important;background:#edf4fc!important;color:#1263ac!important;font-size:12px!important}
  #sh-route-panel .pair{display:inline-flex!important;gap:2px!important}
  #sh-route-panel .swap{display:block!important;margin:7px auto!important;font-size:20px!important;width:38px!important;height:38px!important}
  #sh-route-panel .actions{display:flex!important;gap:8px!important;margin-top:12px!important}
  #sh-route-panel .actions button{flex:1!important;height:38px!important}
  #sh-route-search{background:#087cf0!important;color:white!important}
  #sh-route-result{display:none;margin-top:10px!important;padding:10px!important;border-radius:10px!important;background:#f7faff!important;line-height:1.5!important}
  #sh-route-result .card{border:1px solid #dfe9f6!important;border-radius:10px!important;background:#fff!important;margin:8px 0!important;padding:10px!important}
  #sh-route-result .top{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important}
  #sh-route-result .eta{font-size:23px!important;font-weight:800!important;color:#0b66c3!important;white-space:nowrap!important}
  #sh-route-result .eta.yellow{color:#b77905!important}#sh-route-result .eta.red{color:#d12626!important}
  #sh-route-result .meta{font-size:11px!important;color:#526273!important;margin-top:5px!important}
  #sh-route-result .warn{background:#fff4dc!important;padding:7px!important;border-radius:7px!important;color:#835900!important;margin-top:8px!important;font-size:11px!important}`;document.head.appendChild(s);
  const lines=[
    ['都心環状線','霞が関 飯倉 芝公園 銀座 宝町 江戸橋 神田橋 北の丸 代官町 汐留 新富町 京橋 八丁堀 浜崎橋 呉服橋'],
    ['1号羽田線','芝浦 勝島 鈴ヶ森 平和島 空港西 羽田 東品川'],['1号上野線','上野 入谷 本町 上野公園'],
    ['2号目黒線','天現寺 目黒 戸越 荏原'],['3号渋谷線','高樹町 渋谷 池尻 三軒茶屋 用賀'],
    ['4号新宿線','外苑 代々木 新宿 初台 幡ヶ谷 永福 高井戸 西新宿'],
    ['5号池袋線','飯田橋 護国寺 東池袋 北池袋 板橋本町 中台 高島平 戸田南 戸田 早稲田 一ツ橋 西神田'],
    ['6号向島線','箱崎 浜町 清洲橋 向島 駒形 堤通 墨田 両国'],['6号三郷線','加平 八潮 三郷 八潮南'],
    ['7号小松川線','錦糸町 小松川 一之江'],['9号深川線','福住 木場 塩浜 枝川'],['10号晴海線','豊洲 晴海'],['11号台場線','台場 芝浦'],
    ['中央環状線','富ヶ谷 初台南 中野長者橋 西池袋 高松 滝野川 新板橋 王子南 王子北 千住新橋 小菅 四つ木 平井大橋 清新町 中環小松川 中環大井南 五反田'],
    ['川口線','新井宿 安行 加賀 新郷 川口中央 鹿浜橋 東領家 足立入谷'],['埼玉新都心線','新都心 新都心西 さいたま見沼'],['埼玉大宮線','浦和北 与野 浦和南'],
    ['湾岸線','浦安 舞浜 葛西 新木場 有明 臨海副都心 大井 大井南 空港中央 湾岸環八 浮島 東扇島 大黒ふ頭 本牧ふ頭 南本牧ふ頭 三溪園 磯子 杉田 幸浦 福浦 並木'],
    ['横羽線','汐入 浅田 浜川崎 大師 生麦 子安 東神奈川 横浜駅東口 みなとみらい 横浜公園 石川町 新山下 羽田 守屋町 花之木'],
    ['三ツ沢線','横浜駅西口 三ツ沢'],['狩場線','石川町 阪東橋 花之木 永田 狩場 新山下'],['大黒線','大黒ふ頭'],['川崎線','殿町 大師 浮島'],
    ['横浜北線','岸谷生麦 馬場 新横浜 横浜港北'],['横浜北西線','横浜港北 横浜青葉'],['八重洲線','丸の内 常盤橋']
  ];
  const IC_LIST=lines.flatMap(([road,names])=>names.split(' ').map(name=>[road,name]));
  const fixes={'都心環状線|霞が関|in':{location:{latLng:{latitude:35.673946463237,longitude:139.74799156073}}},'2号目黒線|天現寺|out':{location:{latLng:{latitude:35.646624946671,longitude:139.72583216375}}},'2号目黒線|目黒|out':{location:{latLng:{latitude:35.636062937085,longitude:139.71840321779}}},'三ツ沢線|横浜駅西口|out':{address:'神奈川県横浜市西区北幸2丁目 横浜駅西口出口 首都高速'}};
  function place(entry,kind){const [road,name]=entry;return fixes[road+'|'+name+'|'+kind]||{address:'首都高速 '+road+' '+name+(kind==='in'?'入口':'出口')+' 日本'};}
  const prefKey='sh-route-preferences-v32',usageKey='sh-google-routes-usage-v13',cachePrefix='sh-google-routes-cache-v31-';
  const all=IC_LIST.map((entry,i)=>({id:String(i),entry,title:entry[0]+'｜'+entry[1]}));
  const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad=n=>String(n).padStart(2,'0');function day(){const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  const btn=document.createElement('button');btn.id='sh-route-btn';btn.textContent='所要時間';
  const panel=document.createElement('div');panel.id='sh-route-panel';panel.innerHTML=`<div class="title">🚗 推奨ルート検索</div><div style="display:flex;justify-content:space-between;align-items:center"><small>お気に入りルート（最大5件）</small><button id="sh-save">☆ 保存</button></div><div class="favorites" id="sh-favorites"></div><label>出発IC（入口）</label><input id="sh-from-filter" type="search" placeholder="IC名や路線名で絞り込み"><select id="sh-from"></select><button class="swap" id="sh-swap">⇅</button><label>到着IC（出口）</label><input id="sh-to-filter" type="search" placeholder="IC名や路線名で絞り込み"><select id="sh-to"></select><label>経由地（任意）</label><input id="sh-via" type="search" placeholder="例：大黒JCT"><small>出入口の方向・閉鎖情報は未検証の試験版です。</small><div class="actions"><button id="sh-route-search">所要時間を比較</button><button id="sh-close">閉じる</button></div><div id="sh-route-result"></div>`;document.body.append(btn,panel);
  const timeline=document.getElementById('sh-history');function height(){const h=timeline?.getBoundingClientRect().height;if(h>0)document.documentElement.style.setProperty('--sh-timeline-height',Math.ceil(h)+'px');}height();if(timeline&&window.ResizeObserver)new ResizeObserver(height).observe(timeline);window.addEventListener('resize',height);
  const from=panel.querySelector('#sh-from'),to=panel.querySelector('#sh-to'),ff=panel.querySelector('#sh-from-filter'),tf=panel.querySelector('#sh-to-filter'),via=panel.querySelector('#sh-via'),search=panel.querySelector('#sh-route-search'),result=panel.querySelector('#sh-route-result');
  const valid=id=>typeof id==='string'&&all.some(x=>x.id===id);
  function readPrefs(){try{const o=JSON.parse(localStorage.getItem(prefKey)||'{}'),good=x=>x&&valid(x.from)&&valid(x.to)&&x.from!==x.to&&typeof x.via==='string';return {last:good(o.last)?o.last:null,favorites:Array.isArray(o.favorites)?o.favorites.filter(good).slice(0,5):[]};}catch(e){return {last:null,favorites:[]};}}
  let prefs=readPrefs(),restoring=false;function store(){try{localStorage.setItem(prefKey,JSON.stringify(prefs));}catch(e){}}
  function snapshot(){return {from:from.value,to:to.value,via:via.value.trim().slice(0,120)};}
  function saveLast(){if(restoring)return;const x=snapshot();if(valid(x.from)&&valid(x.to)&&x.from!==x.to){prefs.last=x;store();}}
  const norm=s=>String(s||'').normalize('NFKC').replace(/[\s　]/g,'').replace(/ヶ/g,'ケ').replace(/(?:インターチェンジ|IC)$/i,'').toLowerCase();
  function findNames(text){const q=norm(text);if(!q)return [];return all.filter(x=>norm(x.entry[1]).includes(q)||norm(x.title).includes(q)).sort((a,b)=>{const rank=x=>norm(x.title)===q?0:norm(x.entry[1])===q?1:2;return rank(a)-rank(b);});}
  function displayName(x){return all.filter(y=>norm(y.entry[1])===norm(x.entry[1])).length>1?x.title:x.entry[1];}
  function closePicker(){panel.querySelectorAll('.sh-ic-picker').forEach(x=>x.remove());}
  function sync(sel,filter){const x=all.find(y=>y.id===sel.value);filter.value=x?displayName(x):'';}
  function selectChoice(sel,filter,x){sel.value=x.id;sync(sel,filter);closePicker();result.style.display='none';saveLast();}
  function resolve(sel,filter){const chosen=all.find(x=>x.id===sel.value);if(chosen&&norm(filter.value)===norm(displayName(chosen)))return {ok:true,list:[chosen]};const list=findNames(filter.value);sel.value=list.length===1?list[0].id:'';return {ok:list.length===1,list};}
  function picker(sel,filter,list){closePicker();if(list.length<2)return;const box=document.createElement('div');box.className='sh-ic-picker';const h=document.createElement('div');h.className='sh-picker-heading';h.textContent='該当するICを選択してください';box.appendChild(h);for(const x of list.slice(0,15)){const el=document.createElement('button');el.type='button';el.className='sh-picker-choice';el.textContent=x.title;el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();selectChoice(sel,filter,x);filter.blur();});box.appendChild(el);}if(list.length>15){const note=document.createElement('small');note.textContent='候補が多いため、さらに文字を入力してください。';box.appendChild(note);}filter.insertAdjacentElement('afterend',box);}
  function populate(sel,filter,keep){sel.innerHTML='<option value=""></option>'+all.map(x=>'<option value="'+x.id+'">'+esc(x.title)+'</option>').join('');sel.value=keep&&valid(keep)?keep:'';}
  function apply(x){if(!x||!valid(x.from)||!valid(x.to))return;restoring=true;populate(from,ff,x.from);populate(to,tf,x.to);from.value=x.from;to.value=x.to;via.value=x.via||'';sync(from,ff);sync(to,tf);restoring=false;result.style.display='none';saveLast();}
  function favorites(){const parent=panel.querySelector('#sh-favorites');parent.textContent='';for(const [i,x] of prefs.favorites.entries()){const a=all.find(y=>y.id===x.from),b=all.find(y=>y.id===x.to);if(!a||!b)continue;const pair=document.createElement('span');pair.className='pair';const button=document.createElement('button');button.textContent=a.entry[1]+' → '+b.entry[1]+(x.via?'（経由）':'');button.addEventListener('click',()=>{apply(x);closePicker();});const remove=document.createElement('button');remove.textContent='×';remove.addEventListener('click',()=>{prefs.favorites.splice(i,1);store();favorites();});pair.append(button,remove);parent.appendChild(pair);}if(!prefs.favorites.length)parent.textContent='まだ登録されていません';}
  populate(from,ff);populate(to,tf);from.value=all.find(x=>x.entry[0]==='都心環状線'&&x.entry[1]==='霞が関')?.id||'0';to.value=all.find(x=>x.entry[0]==='三ツ沢線'&&x.entry[1]==='横浜駅西口')?.id||'1';sync(from,ff);sync(to,tf);if(prefs.last)apply(prefs.last);favorites();
  for(const [sel,filter] of [[from,ff],[to,tf]]){filter.placeholder='IC名を入力';filter.addEventListener('input',()=>{sel.value='';const check=resolve(sel,filter);if(check.list.length>1)picker(sel,filter,check.list);else closePicker();result.style.display='none';if(check.ok)saveLast();});filter.addEventListener('change',()=>{const check=resolve(sel,filter);if(check.ok){sync(sel,filter);saveLast();}});filter.addEventListener('focus',()=>{const check=resolve(sel,filter);if(!check.ok&&check.list.length>1)picker(sel,filter,check.list);});}
  via.addEventListener('input',()=>{result.style.display='none';saveLast();});
  panel.querySelector('#sh-swap').addEventListener('click',()=>{const a=resolve(from,ff),b=resolve(to,tf);if(!a.ok||!b.ok){error('入口・出口を確定してください');return;}const old=from.value;from.value=to.value;to.value=old;sync(from,ff);sync(to,tf);closePicker();result.style.display='none';saveLast();});
  panel.querySelector('#sh-save').addEventListener('click',()=>{const x=snapshot();if(!valid(x.from)||!valid(x.to)||x.from===x.to){error('異なる入口と出口を選んでください');return;}const k=y=>y.from+'|'+y.to+'|'+y.via;prefs.favorites=[x,...prefs.favorites.filter(y=>k(y)!==k(x))].slice(0,5);store();favorites();saveLast();});
  btn.addEventListener('click',()=>{panel.classList.toggle('open');btn.style.visibility=panel.classList.contains('open')?'hidden':'';});panel.querySelector('#sh-close').addEventListener('click',()=>{panel.classList.remove('open');btn.style.visibility='';});
  function error(s){result.style.display='block';result.innerHTML='<span style="color:#a21d1d">'+esc(s)+'</span>';}
  function seconds(s){return typeof s==='string'?parseFloat(s):NaN;}const mins=s=>Math.round(s/60);
  const ROADS=[['横羽線',/横羽線|神奈川1号|Yokohane/i],['湾岸線',/湾岸線|Bayshore/i],['中央環状線',/中央環状|Central Circular/i],['都心環状線',/都心環状|Inner Circular/i],['1号羽田線',/羽田線|Haneda Route/i],['2号目黒線',/目黒線|Meguro Route/i],['3号渋谷線',/渋谷線|Shibuya Route/i],['4号新宿線',/新宿線|Shinjuku Route/i],['5号池袋線',/池袋線|Ikebukuro Route/i],['6号向島線',/向島線|Mukojima Route/i],['6号三郷線',/三郷線|Misato Route/i],['7号小松川線',/小松川線|Komatsugawa Route/i],['9号深川線',/深川線|Fukagawa Route/i],['三ツ沢線',/三ツ沢線|Mitsuzawa Route/i],['狩場線',/狩場線|Kariba Route/i],['川崎線',/川崎線|Kawasaki Route/i],['横浜北西線',/横浜北西線|Northwest Route/i],['横浜北線',/横浜北線|Yokohama North Route/i]];
  function details(route){const roads=[],jcts=[],tips=[];for(const leg of route.legs||[])for(const step of leg.steps||[]){const raw=String(step.navigationInstruction?.instructions||'').trim(),met=Number(step.distanceMeters)||0;if(!raw||met<100)continue;const hits=ROADS.filter(x=>x[1].test(raw));if(hits.length===1&&met>=250&&!/(?:方面|行き).*標識/.test(raw)){const road=hits[0][0];if(roads.at(-1)!==road)roads.push(road);}for(const m of raw.matchAll(/([一-龥ぁ-んァ-ヶーA-Za-z0-9]{1,12})(?:JCT|ジャンクション)/gi)){const name=m[1]+'JCT';if(!jcts.includes(name))jcts.push(name);}if(/(?:JCT|ジャンクション|分岐|首都高|高速|方面)/.test(raw)&&tips.length<3)tips.push(raw.slice(0,85));}return {roads:roads.join(' → ')||'未確認',jcts:jcts.slice(0,6).join(' → ')||'未確認',tips:tips.join(' ／ ')};}
  function usage(){try{const x=JSON.parse(localStorage.getItem(usageKey)||'{}');if(x.date===day())return x;}catch(e){}return {date:day(),count:0,lastRequestAt:0};}
  function render(origin,dest,route,cached){const sec=seconds(route.duration),base=seconds(route.staticDuration),difference=sec-base,ratio=base>0?difference/base:NaN,cls=difference>=600&&ratio>=.5?'red':difference>=300&&ratio>=.2?'yellow':'';const detail=details(route);result.style.display='block';result.innerHTML='<b>'+esc(origin)+' → '+esc(dest)+'</b><div class="card"><div class="top"><b>Google推奨ルート</b><span class="eta '+cls+'">'+mins(sec)+'分</span></div><div class="meta">'+(Number.isFinite(base)?'基準 '+mins(base)+'分 / 交通による差 '+(mins(difference)>0?'+':'')+mins(difference)+'分':'基準時間 未取得')+'　'+(Number(route.distanceMeters)/1000).toFixed(1)+'km</div><div class="meta"><b>路線</b> '+esc(detail.roads)+'</div><div class="meta"><b>JCT</b> '+esc(detail.jcts)+'</div>'+(detail.tips?'<details class="meta"><summary>詳しい案内</summary>'+esc(detail.tips)+'</details>':'')+'</div><div class="warn">参考値：入口・出口の位置や高速道路だけの連続走行は未検証です。</div>'+(document.documentElement.dataset.shHistory==='past'?'<div class="warn">Googleは現在の交通状況です。</div>':'')+'<div class="meta">Powered by Google, ©'+new Date().getFullYear()+' Google / '+(cached?'1分以内の結果':'現在取得')+'</div>';}
  search.addEventListener('click',async()=>{if(search.disabled)return;if(!apiKey){error('APIキーが見つかりません');return;}for(const [sel,input] of [[from,ff],[to,tf]]){const x=resolve(sel,input);if(!x.ok){if(x.list.length>1){picker(sel,input,x.list);error('候補からICを選んでください');}else error('IC名を確認してください：'+input.value);return;}}closePicker();const a=all.find(x=>x.id===from.value),b=all.find(x=>x.id===to.value);if(!a||!b||a.id===b.id){error('異なる入口・出口を選択してください');return;}saveLast();const viaName=via.value.trim();if(viaName){error('経由ICの本線通過位置は未検証のため、この条件では所要時間を算出しません。経由地を空欄にしてください。');return;}const cacheKey=a.id+'-'+b.id+'-via-'+viaName.toLowerCase();
    try{const saved=JSON.parse(localStorage.getItem(cachePrefix+cacheKey)||'null');if(saved&&Date.now()-saved.savedAt<60000&&saved.routes?.length){const r=saved.routes[0];render(a.entry[1]+'入口',b.entry[1]+'出口',r.raw||r,true);return;}}catch(e){}
    const u=usage();if(u.count>=50){error('本日の検索は50回に達しました');return;}if(Date.now()-u.lastRequestAt<8000){error('連打防止のため数秒お待ちください');return;}u.count++;u.lastRequestAt=Date.now();try{localStorage.setItem(usageKey,JSON.stringify(u));}catch(e){}
    search.disabled=true;search.textContent='検索中…';result.style.display='block';result.textContent='Google Mapsの交通情報を取得中…';
    const p=entry=>entry.address?{address:entry.address}:{location:entry.location};
    const payload={origin:p(place(a.entry,'in')),destination:p(place(b.entry,'out')),travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE_OPTIMAL',trafficModel:'BEST_GUESS',computeAlternativeRoutes:false,routeModifiers:{avoidTolls:false,avoidHighways:false,avoidFerries:true},languageCode:'ja',units:'METRIC'};
    try{const r=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters'},body:JSON.stringify(payload)});const body=await r.json().catch(()=>null);if(!r.ok)throw Error(body?.error?.message||'HTTP '+r.status);const route=(body?.routes||[]).find(x=>Number.isFinite(seconds(x.duration)));if(!route)throw Error('経路が見つかりません');render(a.entry[1]+'入口',b.entry[1]+'出口',route,false);try{localStorage.setItem(cachePrefix+cacheKey,JSON.stringify({savedAt:Date.now(),routes:[{raw:route}]}));}catch(e){}
    }catch(e){error('取得失敗：'+String(e?.message||e));}finally{search.disabled=false;search.textContent='所要時間を比較';}
  });
  return true;
}.toString()})(${JSON.stringify(apiKey)})`);

await web.present(true);
Script.complete();