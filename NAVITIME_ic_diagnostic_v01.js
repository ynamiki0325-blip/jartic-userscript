// NAVITIME IC diagnostic v0.1 for Scriptable
// Does not modify the JARTIC app. Keeps credentials in local Keychain.
const K_KEY='NAVITIME_RAPID_KEY_V1';
const K_URL='NAVITIME_RAPID_IC_URL_V1';
async function ask(title,message,fields){
  const a=new Alert();a.title=title;a.message=message;
  for(const f of fields){if(f.secure)a.addSecureTextField(f.label,f.value||'');else a.addTextField(f.label,f.value||'');}
  a.addAction('続ける');a.addCancelAction('中止');
  if(await a.present()<0)throw Error('中止しました');
  return fields.map((_,i)=>a.textFieldValue(i).trim());
}
async function getSetup(){
  let key=Keychain.contains(K_KEY)?Keychain.get(K_KEY):'';
  let url=Keychain.contains(K_URL)?Keychain.get(K_URL):'';
  if(!key||!url){
    const values=await ask('NAVITIME API 接続設定','RapidAPIのNAVITIME Route(car)で /ic のエンドポイントURLと X-RapidAPI-Key を確認してください。APIキーはChatGPTに送らないでください。',[{label:'IC検索 /ic のURL',value:url},{label:'X-RapidAPI-Key',value:key,secure:true}]);
    url=values[0];key=values[1];
    if(!key||!/^https:\/\//i.test(url))throw Error('https:// のIC検索URLとAPIキーが必要です');
    if(!/\/ic(?:\?|$)/.test(url))throw Error('IC検索 /ic のURLを指定してください');
    Keychain.set(K_KEY,key);Keychain.set(K_URL,url);
  }
  return {url,key};
}
function icUrl(base,word){
  const root=base.split('?')[0].replace(/\/$/,'');
  return root+'?word='+encodeURIComponent(word)+'&limit=10';
}
async function icSearch(base,key,name){
  const url=icUrl(base,name);
  const req=new Request(url);req.method='GET';
  req.headers={'X-RapidAPI-Key':key,'X-RapidAPI-Host':new URL(url).hostname};
  const data=await req.loadJSON();
  const items=(data.items||data.result?.items||[]);
  return {query:name,count:items.length,candidates:items.map(x=>({id:x.id,name:x.name,road:x.road_name,entrance:x.entrance,exit:x.exit,coord:x.coord}))};
}
try {
  const {url,key}=await getSetup();
  const output={version:'NAVITIME IC test v0.1',results:[]};
  for(const name of ['横浜駅西口','外苑','戸田南']){
    try{output.results.push(await icSearch(url,key,name));}
    catch(e){output.results.push({query:name,error:String(e)});}
  }
  Pasteboard.copy(JSON.stringify(output,null,2));
  const a=new Alert();a.title='NAVITIME IC検索結果';
  a.message=output.results.map(r=>r.query+'：'+(r.error?'取得失敗':r.count+'件')).join('\n')+'\n\n結果をコピーしました。APIキーは含まれていません。';
  a.addAction('OK');await a.present();
}catch(e){const a=new Alert();a.title='NAVITIME 診断';a.message=String(e);a.addAction('OK');await a.present();}
Script.complete();