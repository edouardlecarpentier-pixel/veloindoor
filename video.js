// Mode vidéo : liste de liens YouTube (lus à la suite) ou fichiers locaux, avec une bande de métriques en bas.
(function(){
const $=id=>document.getElementById(id);
const V=$('vid'), stage=$('vidStage'), setup=$('vidSetup');
let player=null, fileUrl=null, wake=null, ytReady=null, toastT=null;
let queue=[], qi=0, curType=null;

function msg(t,link){
  setup.hidden=false;$('vidMsg').textContent=t;
  const a=$('vidOpenYt'); a.hidden=!link; if(link) a.href=link;
}
function toast(t){
  const e=$('vidToast'); e.textContent=t; e.hidden=false;
  clearTimeout(toastT); toastT=setTimeout(()=>{e.hidden=true},4500);
}

function loadYT(){
  if(ytReady) return ytReady;
  ytReady=new Promise((res,rej)=>{
    if(window.YT&&window.YT.Player) return res();
    window.onYouTubeIframeAPIReady=res;
    const s=document.createElement('script');
    s.src='https://www.youtube.com/iframe_api';
    s.onerror=()=>{ytReady=null;rej(new Error('YouTube inaccessible (vérifie ta connexion).'))};
    document.head.appendChild(s);
  });
  return ytReady;
}
function parseYT(u){
  try{
    const x=new URL(u.trim()); let id=null; const list=x.searchParams.get('list');
    if(x.hostname.includes('youtu.be')) id=x.pathname.slice(1);
    else if(x.searchParams.get('v')) id=x.searchParams.get('v');
    else{const m=x.pathname.match(/\/(embed|shorts|live)\/([\w-]{6,})/); if(m) id=m[2]}
    return (id||list)?{id,list}:null;
  }catch(e){return null}
}

function upd(){
  const L=window.VI.live, f=(v,d=0)=>v==null?'–':(+v).toFixed(d);
  const left=$('lLeft').textContent, sn=$('slopeNext');
  // 'v' = bande du mode vidéo, 'b' = bande du bas en mode paysage
  ['v','b'].forEach(p=>{
    $(p+'W').textContent=f(L.power); $(p+'Hr').textContent=f(L.hr);
    $(p+'Cad').textContent=f(L.cad); $(p+'Spd').textContent=f(L.speed,1);
    $(p+'Km').textContent=$('lKm').textContent;
    $(p+'Left').textContent=left==='–'?'':'reste '+left+' km';
    $(p+'Time').textContent=$('timer').textContent;
    $(p+'Slope').textContent=$('slopeNow').textContent||'–';
    $(p+'Next').textContent=sn.textContent; $(p+'Next').dataset.dir=sn.dataset.dir||'';
  });
  $('vInfo').textContent=$('stepInfo').textContent;
}
async function enter(){
  setup.hidden=true; $('vidMsg').textContent=''; $('vidOpenYt').hidden=true;
  upd();
  try{await V.requestFullscreen()}catch(e){}
  try{wake=await navigator.wakeLock.request('screen')}catch(e){}
}
function clearPlayer(){
  if(player){try{player.destroy()}catch(e){} player=null}
  if(fileUrl){URL.revokeObjectURL(fileUrl);fileUrl=null}
  stage.innerHTML=''; curType=null;
}

// ---------- file de lecture ----------
function next(){
  if(qi+1<queue.length) playItem(qi+1);
  else msg('Liste terminée. Ajoute d\'autres liens ou ferme le mode vidéo.');
}
function prev(){ if(qi>0) playItem(qi-1) }
function skipOrFail(text,link){
  if(qi+1<queue.length){toast(text+' — passage à la suivante.');playItem(qi+1)}
  else msg(text,link);
}
async function playItem(i){
  qi=i; const it=queue[i];
  $('vidNow').textContent=(i+1)+'/'+queue.length;
  if(it.type==='yt') await playYT(it); else playFile(it);
}

function ytLink(it){
  return it.id?'https://www.youtube.com/watch?v='+it.id:'https://www.youtube.com/playlist?list='+it.list;
}
const ERR={2:'Lien de vidéo invalide',5:'Erreur du lecteur',100:'Vidéo introuvable, supprimée ou privée'};
function ytError(code,it){
  const link=ytLink(it);
  if([101,150,153].includes(code))
    skipOrFail('Vidéo bloquée par son propriétaire (code '+code+') : lecture impossible hors de YouTube. Ouvre-la dans YouTube ou choisis-en une autre',link);
  else skipOrFail((ERR[code]||'Erreur de lecture (code '+code+')'),link);
}
function onEnded(){
  const it=queue[qi];
  if(it&&it.list&&!it.id){   // playlist YouTube : on n'enchaîne qu'après sa dernière vidéo
    try{ if(player.getPlaylistIndex()<player.getPlaylist().length-1) return }catch(e){}
  }
  next();
}
async function playYT(it){
  try{await loadYT()}catch(e){msg(e.message);return}
  if(player&&curType==='yt'&&player.loadVideoById){
    if(it.id) player.loadVideoById(it.id);
    else player.loadPlaylist({list:it.list,listType:'playlist'});
    return;
  }
  clearPlayer(); curType='yt';
  stage.innerHTML='<div id="ytDiv"></div>';
  const pv={autoplay:1,playsinline:1,rel:0};
  const cfg={width:'100%',height:'100%',playerVars:pv,events:{
    onStateChange:e=>{if(e.data===0) onEnded()},
    onError:e=>ytError(e.data,queue[qi])}};
  if(it.id) cfg.videoId=it.id;
  if(it.list){pv.listType='playlist';pv.list=it.list}
  player=new YT.Player('ytDiv',cfg);
}
function playFile(it){
  clearPlayer(); curType='file';
  fileUrl=URL.createObjectURL(it.file);
  const v=document.createElement('video');
  v.src=fileUrl; v.controls=true; v.autoplay=true; v.playsInline=true;
  v.onended=next;
  v.onerror=()=>skipOrFail('Format non lu par le navigateur ('+it.file.name+')');
  stage.appendChild(v);
}
async function startQueue(items){
  if(!items.length) return;
  queue=items; await enter(); playItem(0);
}
function close(){
  clearPlayer(); queue=[]; qi=0;
  if(wake){try{wake.release()}catch(e){} wake=null}
  if(document.fullscreenElement){try{document.exitFullscreen()}catch(e){}}
  V.classList.remove('on');
}

// ---------- interface ----------
try{$('vidUrls').value=localStorage.getItem('vi_urls')||''}catch(e){}
upd(); setInterval(upd,500);   // met à jour en permanence les deux bandes (vidéo et paysage)

$('btnVideo').onclick=()=>{V.classList.add('on');setup.hidden=false;upd()};
$('vidGo').onclick=()=>{
  try{localStorage.setItem('vi_urls',$('vidUrls').value)}catch(e){}
  const lines=$('vidUrls').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const items=[]; let bad=0;
  lines.forEach(l=>{const p=parseYT(l); if(p) items.push({type:'yt',id:p.id,list:p.list}); else bad++});
  if(!items.length){msg('Aucun lien YouTube valide. Colle un lien par ligne.');return}
  if(bad) toast(bad+' ligne(s) ignorée(s) : lien non reconnu.');
  startQueue(items);
};
$('vidFile').addEventListener('change',e=>{
  const fs=[...e.target.files]; e.target.value='';
  startQueue(fs.map(f=>({type:'file',file:f})));
});
$('vidClose').onclick=close;
$('vidPrev').onclick=prev;
$('vidNext').onclick=next;
$('vidChange').onclick=()=>{setup.hidden=false};
$('vidSetupBack').onclick=()=>{ if(stage.firstChild) setup.hidden=true; else close() };
$('vidBarBtn').onclick=()=>$('vidBar').classList.toggle('off');
$('vidFs').onclick=()=>{
  if(document.fullscreenElement) document.exitFullscreen();
  else V.requestFullscreen().catch(()=>{});
};
})();
