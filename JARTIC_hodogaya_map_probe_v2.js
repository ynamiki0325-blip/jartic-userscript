// JARTIC 保土ヶ谷バイパス 調査 v2.0 (読み取り専用)
// APIキー不要。普段の首都高アプリは変更しません。
const web = new WebView();
await web.loadURL("https://www.jartic.or.jp/map/?p=C01&z=8");
await new Promise(resolve => setTimeout(resolve, 4500));
let raw = await web.evaluateJavaScript(`
(async function(){
 const out={version:"hodogaya-map-v2",page:location.pathname+location.search,dom:{},resources:[],simplemap:{}};
 try{
   const el=document.getElementById("map");
   out.dom={map:!!el,canvas:el?.querySelectorAll("canvas").length??0,
     images:el?.querySelectorAll("img").length??0,
     svg:el?.querySelectorAll("svg").length??0,
     layers:el?.querySelectorAll(".ol-layer").length??0};
   out.resources=[...new Set(performance.getEntriesByType("resource")
     .map(x=>{try{return new URL(x.name).pathname}catch(e){return ""}})
     .filter(x=>x.includes("/d/traffic_info/")||x.includes("/d/map/simple/"))) ].slice(-25);
   const p=out.resources.find(x=>x.endsWith("/simplemap.json"));
   if(!p){out.simplemap.error="simplemap.json was not observed";completion(JSON.stringify(out));return;}
   const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),8000);
   let response;try{response=await fetch(p,{signal:ctl.signal,cache:"no-store"});}finally{clearTimeout(timer);}
   out.simplemap.http=response.status;
   if(!response.ok){completion(JSON.stringify(out));return;}
   const j=await response.json();
   out.simplemap.topLevel=Array.isArray(j)?"array":Object.keys(j).slice(0,30);
   const found=[];let total=0,nodes=0;
   function scan(v,path,depth){
     if(nodes++>50000||depth>12||found.length>=12||v==null)return;
     if(typeof v==="string"){
       if(/保土ヶ谷バイパス|保土ケ谷バイパス|保土ヶ谷|保土ケ谷|Hodogaya/i.test(v)){
         total++;found.push({path,value:v.slice(0,130)});
       }return;
     }
     if(Array.isArray(v)){for(let i=0;i<Math.min(v.length,5000);i++)scan(v[i],path+"["+i+"]",depth+1);return;}
     if(typeof v==="object"){for(const k of Object.keys(v).slice(0,100)){
       if(/保土ヶ谷|保土ケ谷|Hodogaya/i.test(k)){total++;found.push({path:path+"."+k,value:"key"})}
       scan(v[k],path+"."+k,depth+1);
     }}
   }
   scan(j,"root",0);out.simplemap.matches=found;out.simplemap.scannedNodes=nodes;out.simplemap.matchesFound=total;out.simplemap.sizeHint=JSON.stringify(j).length;
 }catch(e){out.error=String(e)}
 completion(JSON.stringify(out));
})()
`,true);
let data;try{data=JSON.parse(raw)}catch(e){data={error:"解析不可",raw:String(raw).slice(0,300)}}
Pasteboard.copy(JSON.stringify(data,null,2));
const a=new Alert();a.title="保土ヶ谷バイパス診断 v2";
a.message="結果をコピーしました。\n道路名ヒット："+(data.simplemap?.matchesFound??"-")+"件\n地図レイヤー："+(data.dom?.layers??"-")+"\n交通情報通信："+(data.resources?.length??0)+"件\n\nこのチャットに貼り付けてください。";
a.addAction("OK");await a.present();Script.complete();