// NAVITIME RapidAPI 接続確認 v1.0
// 1回だけ /ic を呼び出す。403/429が出たら再試行しません。
// 安定版v37.0や既存のIC100進捗には触れません。
await (async function(){
const KEY_NAME="JARTIC_NAVITIME_RAPIDAPI_KEY_IC100";
const HOST_NAME="JARTIC_NAVITIME_RAPIDAPI_HOST_IC100";
function get(k){try{return Keychain.contains(k)?Keychain.get(k):"";}catch(e){return "";}}
async function ask(label,value,secret){
 const a=new Alert();a.title=label;
 a.message=secret?"RapidAPIのAuthorization画面からコピー。キーをチャットに送らないでください。":"RapidAPIのCode snippetまたはHeadersに表示される X-RapidAPI-Host を入力してください。";
 if(secret&&typeof a.addSecureTextField==="function")a.addSecureTextField("入力",value);
 else a.addTextField("入力",value);
 a.addAction("確認");a.addCancelAction("中止");
 if(await a.present()===-1)return null;
 return (a.textFieldValue(0)||"").trim();
}
let key=get(KEY_NAME);
if(!key){key=await ask("X-RapidAPI-Key","",true);if(!key)return;try{Keychain.set(KEY_NAME,key);}catch(e){}}
let host=get(HOST_NAME);
host=await ask("X-RapidAPI-Host を確認",host||"navitime-route-car.p.rapidapi.com",false);
if(!host)return;
host=host.replace(/^https?:\/\//,"").replace(/\/.*$/,"").toLowerCase();
if(!/^[a-z0-9][a-z0-9.-]*\.p\.rapidapi\.com$/.test(host)){
 const a=new Alert();a.title="ホスト形式を確認";a.message="RapidAPIの X-RapidAPI-Host をコピーして入力してください。";a.addAction("OK");await a.present();return;
}
try{Keychain.set(HOST_NAME,host);}catch(e){}
const ok=new Alert();ok.title="1件だけ確認";ok.message="NAVITIMEの /ic?word=横浜駅西口 を1回だけ呼び出します。応答が403/429なら追加通信しません。";ok.addAction("1回実行");ok.addCancelAction("中止");if(await ok.present()===-1)return;
const out={version:"navitime-rapidapi-connection-v1",host,path:"/ic",http:null,matched:[],error:null};
try{
 const url="https://"+host+"/ic?word="+encodeURIComponent("横浜駅西口")+"&limit=2";
 const req=new Request(url);req.method="GET";req.timeoutInterval=25;
 req.headers={"X-RapidAPI-Key":key,"X-RapidAPI-Host":host};
 const raw=await req.loadString();out.http=req.response?.statusCode||null;
 let data={};try{data=JSON.parse(raw);}catch(e){out.error="レスポンスJSON解析不可";}
 if(out.http===200){
  out.matched=(data.items||[]).map(x=>({name:x.name,id:x.id,entrance:x.entrance,exit:x.exit}));
 }else out.error=String(data.message||data.error?.message||raw).slice(0,220);
}catch(e){out.error=String(e).slice(0,220);}
Pasteboard.copy(JSON.stringify(out,null,2));
const a=new Alert();a.title="NAVITIME接続診断";
a.message="HTTP: "+out.http+"\n"+(out.error||("IC "+out.matched.length+"件取得"))+"\n\n結果をコピーしました。APIキーは含みません。チャットに貼り付けてください。";
a.addAction("OK");await a.present();
Script.complete();
})();