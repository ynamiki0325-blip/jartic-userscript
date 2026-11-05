// JARTIC / NAVITIME / Google 2ルート比較 診断 v5.0
// v37.0は変更しません。APIキーを共有・送信しないでください。
// 2 Google Routes API requests. Charges may apply.
await (async function(){
const KEY_NAME="JARTIC_ROUTES_API_KEY_V13";
let key="";
try{if(Keychain.contains(KEY_NAME))key=Keychain.get(KEY_NAME)||"";}catch(e){}
if(!key){
  let a=new Alert();a.title="Google Routes APIキー";
  a.message="既存のAPIキーがKeychainにありません。入力したキーは端末内に保存します。";
  if(typeof a.addSecureTextField==="function")a.addSecureTextField("APIキー","");
  else a.addTextField("APIキー","");
  a.addAction("保存");a.addCancelAction("中止");
  if(await a.present()===-1){Script.complete();return;}
  key=(a.textFieldValue(0)||"").trim();
  if(!key){Script.complete();return;}
  try{Keychain.set(KEY_NAME,key);}catch(e){}
}
const confirm=new Alert();
confirm.title="羽田線直進テスト v5";
confirm.message="汐留出口は名称指定のまま、芝浦JCTの羽田線上り方面の座標を通過点に追加します。Google Routes APIを1回実行し、課金される場合があります。ルート一致は未検証です。v37.0は変更しません。";
confirm.addAction("1回だけ検索");confirm.addCancelAction("中止");
if(await confirm.present()===-1){Script.complete();return;}
const origin={location:{latLng:{latitude:35.468129,longitude:139.619741}}};
// NAVITIME turn-by-turn '汐留' off-ramp point; no assertion of exact lane geometry
const destination={address:"首都高速都心環状線 汐留出口, 東京都港区"};
function waypoint(lat,lon){return {via:true,location:{latLng:{latitude:lat,longitude:lon}}};}
const cases=[
  {name:"横羽線→羽田線上り→浜崎橋→汐留",vias:[waypoint(35.537042,139.741331),waypoint(35.6493885,139.7583858)],navitimeKm:29.320}
];
const result={destinationText:"首都高速都心環状線 汐留出口, 東京都港区",version:"google-navitime-compare-v5",testedAt:new Date().toISOString(),route:"横浜駅西口IC → 汐留IC",note:"芝浦JCTの羽田線上り方向の座標を経由に追加。座標はMapFan参考値で、Googleが正確に本線へマッチする保証はありません。NAVITIMEと同一路線か、汐留出口に到達するか手動確認が必要です。",results:[]};
const fieldMask="routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters,routes.legs.steps.startLocation,routes.legs.steps.endLocation";
for(const test of cases){
  const row={candidate:test.name,navitimeReferenceKm:test.navitimeKm,waypoints:test.vias.map(w=>[w.location.latLng.latitude,w.location.latLng.longitude])};
  result.results.push(row);
  try{
    const request=new Request("https://routes.googleapis.com/directions/v2:computeRoutes");
    request.method="POST";
    request.timeoutInterval=35;
    request.headers={"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":fieldMask};
    request.body=JSON.stringify({
      origin,destination,intermediates:test.vias,
      travelMode:"DRIVE",routingPreference:"TRAFFIC_AWARE_OPTIMAL",
      trafficModel:"BEST_GUESS",computeAlternativeRoutes:false,
      routeModifiers:{avoidTolls:false,avoidHighways:false,avoidFerries:true},
      languageCode:"ja",units:"METRIC"
    });
    const text=await request.loadString();
    const http=request.response?.statusCode||null;
    row.http=http;
    let body={};try{body=JSON.parse(text);}catch(e){row.error="JSON解析失敗";continue;}
    if(http!==200){row.error=body.error?.message||String(text).slice(0,240);continue;}
    const route=body.routes?.[0];if(!route){row.error="ルートが返りませんでした";continue;}
    row.km=Number((Number(route.distanceMeters)/1000).toFixed(2));
    row.durationMin=Math.ceil(Number(String(route.duration||"").replace("s",""))/60);
    row.staticMin=Math.ceil(Number(String(route.staticDuration||"").replace("s",""))/60);
    row.diffFromNavitimeKm=Number((row.km-test.navitimeKm).toFixed(2));
    row.legs=route.legs?.length||0;
    const steps=(route.legs||[]).flatMap(l=>l.steps||[]);
    row.navigationInstructions=steps.map(x=>x.navigationInstruction?.instructions||"").filter(Boolean).slice(0,35);
    row.stepCount=steps.length;
    const instructions=row.navigationInstructions.join(" ");
    row.hasShibauraExit=/芝浦.{0,8}出口/.test(instructions);
    row.hasSurfaceRoad=/海岸通り|都道316号/.test(instructions);
    row.hasIshikawacho=/石川町JCT|石川町ＪＣＴ/.test(instructions);
    row.hasDaikoku=/大黒JCT|大黒ＪＣＴ|大黒線|神奈川5号|神奈川５号/.test(instructions);
    row.hasShiodomeExit=/汐留.{0,8}出口/.test(instructions);
    row.hasHamazakibashi=/浜崎橋JCT|浜崎橋ＪＣＴ/.test(instructions);
    row.hasRainbowBridge=/レインボーブリッジ|台場線|有明JCT|有明ＪＣＴ/.test(instructions);
    row.hasShibauraJCT=/芝浦JCT|芝浦ＪＣＴ/.test(instructions);
    row.distanceDifferenceKm=Math.abs(row.diffFromNavitimeKm);
    row.judgement=(row.hasShibauraExit||row.hasSurfaceRoad||row.hasRainbowBridge)?"不採用：一般道への逸脱または台場線へ迂回":"要確認：高速道路と汐留出口の接続は未認証のため未採用";
    row.warning="距離が近くても同一路線とは限りません。API所要時間を自動採用しません。";
  }catch(e){row.error=String(e);}
}
Pasteboard.copy(JSON.stringify(result,null,2));
let a=new Alert();a.title="2ルート診断 終了";
a.message=result.results.map(x=>x.candidate+": "+(x.error?"エラー "+x.error:(x.durationMin+"分 / "+x.km+"km / 通常 "+x.staticMin+"分"))).join("\n")+"\n\n結果をクリップボードにコピーしました。APIキーは含まれません。ChatGPTに貼り付けてください。";
a.addAction("OK");await a.present();
Script.complete();
})();
