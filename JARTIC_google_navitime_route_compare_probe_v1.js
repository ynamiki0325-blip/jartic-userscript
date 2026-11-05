// JARTIC / NAVITIME / Google 2ルート比較 診断 v1.0
// v37.0は変更しません。APIキーを共有・送信しないでください。
// 2 Google Routes API requests. Charges may apply.
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
confirm.title="2ルート比較を実行";
confirm.message="横浜駅西口→汐留についてGoogle Routes APIを2回呼びます。TRAFFIC_AWARE_OPTIMALは課金対象となる場合があります。安定版は変更しません。";
confirm.addAction("2回検索");confirm.addCancelAction("中止");
if(await confirm.present()===-1){Script.complete();return;}
const origin={location:{latLng:{latitude:35.468129,longitude:139.619741}}};
const destination={location:{latLng:{latitude:35.660815,longitude:139.76054}}};
function waypoint(lat,lon){return {via:true,location:{latLng:{latitude:lat,longitude:lon}}};}
const cases=[
  {name:"横羽線候補",via:waypoint(35.537042,139.741331),navitimeKm:29.320},
  {name:"湾岸線候補",via:waypoint(35.5499,139.786301),navitimeKm:39.137}
];
const result={version:"google-navitime-compare-v1",testedAt:new Date().toISOString(),route:"横浜駅西口IC → 汐留IC",note:"経由地点はNAVITIME由来の参考座標。Googleの結果が同一道路・高速道路だけとは限りません。距離一致だけでは採用しません。",results:[]};
const fieldMask="routes.duration,routes.staticDuration,routes.distanceMeters,routes.legs.steps.navigationInstruction.instructions,routes.legs.steps.distanceMeters,routes.legs.steps.startLocation,routes.legs.steps.endLocation";
for(const test of cases){
  const row={candidate:test.name,navitimeReferenceKm:test.navitimeKm,viaLat:test.via.location.latLng.latitude,viaLon:test.via.location.latLng.longitude};
  result.results.push(row);
  try{
    const request=new Request("https://routes.googleapis.com/directions/v2:computeRoutes");
    request.method="POST";
    request.timeoutInterval=35;
    request.headers={"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":fieldMask};
    request.body=JSON.stringify({
      origin,destination,intermediates:[test.via],
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
    row.warning="道路名と実際の進入・退出経路を必ず照合。高速道路走行の保証なし";
  }catch(e){row.error=String(e);}
}
Pasteboard.copy(JSON.stringify(result,null,2));
let a=new Alert();a.title="2ルート診断 終了";
a.message=result.results.map(x=>x.candidate+": "+(x.error?"エラー "+x.error:(x.durationMin+"分 / "+x.km+"km / 通常 "+x.staticMin+"分"))).join("\n")+"\n\n結果をクリップボードにコピーしました。APIキーは含まれません。ChatGPTに貼り付けてください。";
a.addAction("OK");await a.present();
Script.complete();