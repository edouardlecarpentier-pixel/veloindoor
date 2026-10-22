// Étape 2 : Bluetooth (Web Bluetooth) — home-trainer FTMS (Zwift Ride) + ceinture/montre FC.
(function(){
const $=id=>document.getElementById(id);
const live={power:null,cad:null,speed:null,hr:null};
const samples=[];            // {t,power,cad,speed,hr} 1 point / seconde pendant l'exercice
window.VI={live,samples};

function status(t){$('bleMsg').textContent=t}
function tile(id,v,dec=0){$(id).textContent=v==null?'–':(+v).toFixed(dec)}
function refresh(){tile('lPow',live.power);tile('lCad',live.cad);tile('lSpd',live.speed,1);tile('lHr',live.hr)}

// ---------- Trainer FTMS ----------
const T={dev:null,cp:null,queue:Promise.resolve(),hasControl:false};

function parseBikeData(dv){
  const f=dv.getUint16(0,true); let o=2;
  const u16=()=>{const v=dv.getUint16(o,true);o+=2;return v};
  const s16=()=>{const v=dv.getInt16(o,true);o+=2;return v};
  const out={};
  if(!(f&1)) out.speed=u16()/100;           // km/h
  if(f&2) o+=2;                              // vitesse moyenne
  if(f&4) out.cad=u16()/2;                   // tr/min
  if(f&8) o+=2;                              // cadence moyenne
  if(f&16) o+=3;                             // distance totale
  if(f&32) o+=2;                             // niveau de résistance
  if(f&64) out.power=s16();                  // W
  return out;
}
function onBikeData(e){
  const d=parseBikeData(e.target.value);
  if(d.power!=null) live.power=d.power;
  if(d.cad!=null) live.cad=d.cad;
  if(d.speed!=null) live.speed=d.speed;
  refresh();
}
function onCpIndication(e){
  const v=e.target.value;
  if(v.getUint8(0)!==0x80) return;
  const op=v.getUint8(1), res=v.getUint8(2);
  if(op===0x00) T.hasControl=(res===1);
  if(res!==1) status('Le Ride a refusé la commande 0x'+op.toString(16)+' (code '+res+').');
}
function send(bytes){
  // les écritures GATT doivent être sérialisées
  T.queue=T.queue.then(()=>T.cp.writeValueWithResponse(new Uint8Array(bytes))).catch(e=>status('Erreur envoi : '+e.message));
  return T.queue;
}

async function connectTrainer(){
  if(!navigator.bluetooth){status('Web Bluetooth indisponible : utilise Chrome sur Android, en https.');return}
  try{
    status('Recherche du Ride… (ferme Zwift sur tous tes appareils)');
    T.dev=await navigator.bluetooth.requestDevice({filters:[{services:[0x1826]}]});
    T.dev.addEventListener('gattserverdisconnected',()=>{
      T.hasControl=false;$('btnRide').classList.remove('on');$('btnRide').textContent='Connecter le Ride';
      status('Ride déconnecté.');
    });
    const srv=await T.dev.gatt.connect();
    const ftms=await srv.getPrimaryService(0x1826);
    const bike=await ftms.getCharacteristic(0x2AD2);
    await bike.startNotifications();
    bike.addEventListener('characteristicvaluechanged',onBikeData);
    T.cp=await ftms.getCharacteristic(0x2AD9);
    await T.cp.startNotifications();                      // indications du point de contrôle
    T.cp.addEventListener('characteristicvaluechanged',onCpIndication);
    await send([0x00]);                                   // demande de contrôle
    $('btnRide').classList.add('on');$('btnRide').textContent='Ride : '+(T.dev.name||'connecté');
    status('Ride connecté. Pédale pour voir les valeurs.');
  }catch(e){status('Connexion Ride impossible : '+e.message)}
}

// ---------- Fréquence cardiaque ----------
let hrDev=null;
function onHr(e){
  const v=e.target.value, f=v.getUint8(0);
  live.hr=(f&1)?v.getUint16(1,true):v.getUint8(1);
  refresh();
}
async function connectHr(){
  if(!navigator.bluetooth){status('Web Bluetooth indisponible.');return}
  try{
    status('Recherche de la FC… Sur la montre, active « diffuser la fréquence cardiaque ».');
    hrDev=await navigator.bluetooth.requestDevice({filters:[{services:[0x180D]}]});
    hrDev.addEventListener('gattserverdisconnected',()=>{
      live.hr=null;refresh();$('btnHr').classList.remove('on');$('btnHr').textContent='Connecter la FC';status('FC déconnectée.');
    });
    const srv=await hrDev.gatt.connect();
    const s=await srv.getPrimaryService(0x180D);
    const c=await s.getCharacteristic(0x2A37);
    await c.startNotifications();
    c.addEventListener('characteristicvaluechanged',onHr);
    $('btnHr').classList.add('on');$('btnHr').textContent='FC : '+(hrDev.name||'connectée');
    status('FC connectée.');
  }catch(e){status('Connexion FC impossible : '+e.message)}
}

// ---------- Exercice ERG ----------
let target=200, endAt=0, tick=null, startedAt=0, wake=null;
function setTarget(w){
  target=Math.max(0,Math.min(2000,Math.round(w)));
  $('tgt').textContent=target;
  if(T.cp&&T.hasControl) send([0x05,target&0xFF,(target>>8)&0xFF]);
}
function fmt(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}

// ---------- Séance par intervalles ----------
let steps=[], stepIdx=-1, mode=null, ergDist=0;
function parsePlan(t){
  return t.split('\n').map(l=>l.replace(/#.*/,'').trim()).filter(Boolean).map(l=>{
    const m=l.match(/^(\d+(?:[.,]\d+)?)\s*(?:min)?\s*[x@ ]\s*(\d+)/i);
    return m?{sec:Math.round(parseFloat(m[1].replace(',','.'))*60),w:+m[2]}:null;
  }).filter(s=>s&&s.sec>0);
}
function savePlan(){try{localStorage.setItem('vi_plan',$('plan').value)}catch(e){}}
try{$('plan').value=localStorage.getItem('vi_plan')||''}catch(e){}
$('plan').addEventListener('input',savePlan);
$('btnGen').onclick=()=>{
  const g=id=>+$(id).value||0, L=[];
  if(g('gWu')>0) L.push(g('gWu')+' '+g('gOffW'));
  for(let i=0;i<g('gR');i++){L.push(g('gOnM')+' '+g('gOnW'));L.push(g('gOffM')+' '+g('gOffW'))}
  if(g('gCd')>0) L.push(g('gCd')+' '+g('gOffW'));
  $('plan').value=L.join('\n'); savePlan();
  const tot=parsePlan($('plan').value).reduce((a,s)=>a+s.sec,0);
  status('Séance générée : '+fmt(tot)+' au total. Appuie sur Démarrer.');
};

// ---------- Parcours GPX (simulation de pente) ----------
let simDist=0, lastGradeAt=0, simMarker=null;
function getRoute(){return (typeof pts!=='undefined'&&pts.length>1)?pts:null}
function interp(r,d){
  d=Math.max(0,Math.min(d,r[r.length-1].d));
  let lo=0,hi=r.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1; if(r[m].d<=d) lo=m; else hi=m}
  const a=r[lo],b=r[hi],f=(b.d-a.d)?(d-a.d)/(b.d-a.d):0;
  return {lat:a.lat+(b.lat-a.lat)*f,lon:a.lon+(b.lon-a.lon)*f,ele:a.ele+(b.ele-a.ele)*f};
}
function sendGrade(g){
  const v=Math.round(g*100);                         // pente en 0,01 %
  send([0x11,0,0,v&0xFF,(v>>8)&0xFF,40,51]);         // vent 0, Crr 0,004, Cw 0,51
}
async function startSim(){
  if(!T.cp){status('Connecte d\'abord le Ride.');return}
  if(tick) return;
  if(!getRoute()){status('Charge ou trace d\'abord un parcours.');return}
  mode='sim'; simDist=0; lastGradeAt=0; steps=[];
  await send([0x00]); await send([0x07]);
  samples.length=0; startedAt=Date.now(); window.VI.startTime=startedAt;
  try{wake=await navigator.wakeLock.request('screen')}catch(e){}
  $('btnSim').textContent='Arrêter le parcours'; $('btnSim').classList.add('on');
  if(typeof L!=='undefined'&&typeof map!=='undefined')
    simMarker=L.circleMarker([getRoute()[0].lat,getRoute()[0].lon],{radius:8,color:'#fff',fillColor:'#22c55e',fillOpacity:1}).addTo(map);
  tick=setInterval(()=>{
    const r=getRoute(), total=r[r.length-1].d;
    simDist+=(live.speed||0)/3.6;
    const d0=Math.max(0,simDist-60), d1=Math.min(total,simDist+60);
    let g=d1>d0?(interp(r,d1).ele-interp(r,d0).ele)/(d1-d0)*100:0;
    g=Math.max(-10,Math.min(15,g))*((+$('inDiff').value||100)/100);
    if(Date.now()-lastGradeAt>=2000){lastGradeAt=Date.now();sendGrade(g)}
    const p=interp(r,simDist);
    if(simMarker) simMarker.setLatLng([p.lat,p.lon]);
    $('timer').textContent=fmt((Date.now()-startedAt)/1000);
    $('lKm').textContent=(simDist/1000).toFixed(2);
    $('lLeft').textContent=Math.max(0,(total-simDist)/1000).toFixed(2);
    $('stepInfo').textContent=(simDist/1000).toFixed(2)+' / '+(total/1000).toFixed(1)+' km · pente '+g.toFixed(1)+' % · alt. '+Math.round(p.ele)+' m';
    samples.push({t:Math.round((Date.now()-startedAt)/1000),power:live.power,cad:live.cad,speed:live.speed,hr:live.hr});
    if(simDist>=total) stopErg(true);
  },1000);
  status('Parcours lancé. La pente est envoyée au Ride toutes les 2 s.');
}

async function startErg(){
  if(!T.cp){status('Connecte d\'abord le Ride.');return}
  if(tick){return}
  steps=parsePlan($('plan').value);
  if(!steps.length){
    const w0=+$('inW').value, m0=+$('inM').value;
    if(!(w0>=0&&m0>0)){status('Puissance et durée invalides.');return}
    steps=[{sec:m0*60,w:w0}];
  }
  const w=steps[0].w, m=steps.reduce((a,s)=>a+s.sec,0)/60;
  mode='erg'; stepIdx=-1; ergDist=0;
  $('lKm').textContent='0.00'; $('lLeft').textContent='–';
  await send([0x00]);                // re-demande de contrôle si besoin
  await send([0x07]);                // démarrer / reprendre
  setTarget(w);
  samples.length=0;
  startedAt=Date.now(); endAt=startedAt+m*60000;
  window.VI.startTime=startedAt;
  try{wake=await navigator.wakeLock.request('screen')}catch(e){}
  $('btnErg').textContent='Arrêter';$('btnErg').classList.add('on');
  tick=setInterval(()=>{
    const left=(endAt-Date.now())/1000;
    $('timer').textContent=fmt(left);
    ergDist+=(live.speed||0)/3.6;
    $('lKm').textContent=(ergDist/1000).toFixed(2);
    const el=(Date.now()-startedAt)/1000;
    let acc=0, idx=steps.length-1;
    for(let i=0;i<steps.length;i++){acc+=steps[i].sec; if(el<acc){idx=i;break}}
    if(idx!==stepIdx){
      stepIdx=idx; setTarget(steps[idx].w);
      $('stepInfo').textContent='Étape '+(idx+1)+'/'+steps.length+(steps[idx+1]?' · suivante : '+steps[idx+1].w+' W':'');
    }
    samples.push({t:Math.round((Date.now()-startedAt)/1000),power:live.power,cad:live.cad,speed:live.speed,hr:live.hr});
    if(left<=0) stopErg(true);
  },1000);
  status('Exercice lancé : '+w+' W pendant '+m+' min.');
}
async function stopErg(finished){
  clearInterval(tick);tick=null;
  if(T.cp){await send([0x08,0x01]);}   // arrêt
  if(wake){try{wake.release()}catch(e){} wake=null}
  $('btnErg').textContent='Démarrer';$('btnErg').classList.remove('on');
  $('btnSim').textContent='Rouler le parcours';$('btnSim').classList.remove('on');
  if(simMarker){map.removeLayer(simMarker);simMarker=null}
  $('stepInfo').textContent='';mode=null;
  if(window.VI.onStop) window.VI.onStop();
  status(finished?'Exercice terminé ('+samples.length+' secondes enregistrées).':'Exercice arrêté ('+samples.length+' s enregistrées).');
}

$('btnRide').onclick=connectTrainer;
$('btnHr').onclick=connectHr;
$('btnErg').onclick=()=>tick?stopErg(false):startErg();
$('btnSim').onclick=()=>tick?stopErg(false):startSim();
$('wPlus').onclick=()=>setTarget(target+10);
$('wMinus').onclick=()=>setTarget(target-10);
$('inW').addEventListener('input',e=>{ if(!tick){target=+e.target.value||0;$('tgt').textContent=target} });
})();
