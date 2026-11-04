// JARTIC 首都高交通情報 — お友達向け Lite v1.1（全画面・タイムライン開閉）
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
  #sh-history{position:fixed!important;bottom:calc(67px + env(safe-area-inset-bottom,0px))!important;left:12px!important;right:12px!important;z-index:100000!important;background:#fff!important;color:#172536!important;color-scheme:light!important;padding:9px 12px 8px!important;box-shadow:0 3px 20px #0003!important;border:1px solid #dce8f5!important;border-radius:14px!important;font:12px -apple-system,sans-serif!important;display:none!important}
  body.sh-lite-open #sh-history{display:block!important}
  #sh-lite-toggle{position:fixed!important;right:16px!important;bottom:calc(13px + env(safe-area-inset-bottom,0px))!important;z-index:100002!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-width:116px!important;height:44px!important;padding:0 14px!important;background:#087cf0!important;color:#fff!important;border:0!important;border-radius:12px!important;box-shadow:0 3px 12px #0004!important;font:600 14px -apple-system,sans-serif!important;letter-spacing:0!important;-webkit-appearance:none!important;appearance:none!important;cursor:pointer!important}
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
  toggle.addEventListener('click',()=>{const open=document.body.classList.toggle('sh-lite-open');toggle.textContent=open?'× 閉じる':'タイムライン';toggle.setAttribute('aria-expanded',String(open));});
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

await web.present(true);
Script.complete();