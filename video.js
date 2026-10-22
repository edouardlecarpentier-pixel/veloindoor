// Mode vidéo : YouTube (lecture intégrée) ou fichier local, avec une bande de métriques en bas.
(function(){
const $=id=>document.getElementById(id);
const V=$('vid'), stage=$('vidStage'), setup=$('vidSetup');
let player=null, fileUrl=null, wake=null, timer=null, ytReady=null;

function msg(t){setup.hidden=false;$('vidMsg').textContent=t}

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
  $('vW').textContent=f(L.power); $('vHr').textContent=f(L.hr);
  $('vCad').textContent=f(L.cad); $('vSpd').textContent=f(L.speed,1);
  $('vKm').textContent=$('lKm').textContent;
  const left=$('lLeft').textContent; $('vLeft').textContent=left==='–'?'':'reste '+left+' km';
  $('vTime').textContent=$('timer').textContent;
  $('vInfo').textContent=$('stepInfo').textContent;
}
async function enter(){
  setup.hidden=true; $('vidMsg').textContent='';
  upd(); clearInterval(timer); timer=setInterval(upd,500);
  try{await V.requestFullscreen()}catch(e){}
  try{wake=await navigator.wakeLock.request('screen')}catch(e){}
}
function clearPlayer(){
  if(player){try{player.destroy()}catch(e){} player=null}
  if(fileUrl){URL.revokeObjectURL(fileUrl);fileUrl=null}
  stage.innerHTML='';
}

async function openYT(u){
  const p=parseYT(u);
  if(!p){msg('Lien YouTube non reconnu. Colle l\'adresse complète de la vidéo.');return}
  clearPlayer(); await enter();
  try{await loadYT()}catch(e){msg(e.message);return}
  stage.innerHTML='<div id="ytDiv"></div>';
  const pv={autoplay:1,playsinline:1,rel:0};
  const cfg={width:'100%',height:'100%',playerVars:pv,events:{
    onError:e=>msg('Cette vidéo refuse la lecture intégrée (code '+e.data+'). Essaie une autre vidéo ou un fichier.')}};
  if(p.id) cfg.videoId=p.id;
  if(p.list){pv.listType='playlist';pv.list=p.list}
  player=new YT.Player('ytDiv',cfg);
}
async function openFile(f){
  clearPlayer(); await enter();
  fileUrl=URL.createObjectURL(f);
  const v=document.createElement('video');
  v.src=fileUrl; v.controls=true; v.autoplay=true; v.playsInline=true;
  v.onerror=()=>msg('Format non lu par le navigateur. Essaie MP4 (H.264) ou WebM.');
  stage.appendChild(v);
}
function close(){
  clearInterval(timer);timer=null; clearPlayer();
  if(wake){try{wake.release()}catch(e){} wake=null}
  if(document.fullscreenElement){try{document.exitFullscreen()}catch(e){}}
  V.classList.remove('on');
}

$('btnVideo').onclick=()=>{V.classList.add('on');setup.hidden=false;upd()};
$('vidGo').onclick=()=>openYT($('vidUrl').value);
$('vidUrl').addEventListener('keydown',e=>{if(e.key==='Enter')openYT(e.target.value)});
$('vidFile').addEventListener('change',e=>{const f=e.target.files[0]; if(f) openFile(f); e.target.value=''});
$('vidClose').onclick=close;
$('vidChange').onclick=()=>{setup.hidden=false};
$('vidSetupBack').onclick=()=>{ if(stage.firstChild) setup.hidden=true; else close() };
$('vidBarBtn').onclick=()=>$('vidBar').classList.toggle('off');
$('vidFs').onclick=()=>{
  if(document.fullscreenElement) document.exitFullscreen();
  else V.requestFullscreen().catch(()=>{});
};
})();
