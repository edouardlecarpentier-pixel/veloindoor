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
function onBikeData(v){
  const d=parseBikeData(v);
  if(d.power!=null) live.power=d.power;
  if(d.cad!=null) live.cad=d.cad;
  if(d.speed!=null) live.speed=d.speed;
  refresh();
}
function onCpIndication(v){
  if(v.getUint8(0)!==0x80) return;
  const op=v.getUint8(1), res=v.getUint8(2);
  if(op===0x00) T.hasControl=(res===1);
  if(res!==1) status('Le Ride a refusé la commande 0x'+op.toString(16)+' (code '+res+').');
}
// ---------- Couche Bluetooth : Web Bluetooth (Chrome) ou plugin natif (appli Android) ----------
const NATIVE=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
const uuid=n=>'0000'+n.toString(16).padStart(4,'0')+'-0000-1000-8000-00805f9b34fb';
let nativeReady=null;
function loadNative(){
  if(nativeReady) return nativeReady;
  nativeReady=new Promise((res,rej)=>{
    const s=document.createElement('script'); s.src='native-ble.js';
    s.onload=async()=>{try{await window.BleClient.initialize({androidNeverForLocation:true});res()}catch(e){rej(e)}};
    s.onerror=()=>rej(new Error('Module Bluetooth natif absent'));
    document.head.appendChild(s);
  });
  return nativeReady;
}
const cu=x=>typeof x==='string'?x:uuid(x);
// svc : service recherché ; dataSvc : service portant les caractéristiques (par défaut svc) ; namePrefix : filtre de nom en plus
async function bleConnect(svc,onDisc,dataSvc=svc,namePrefix){
  if(NATIVE){
    await loadNative();
    const B=window.BleClient;
    const dev=await B.requestDevice(namePrefix?{services:[cu(svc)],namePrefix,optionalServices:[cu(dataSvc)]}:{services:[cu(svc)]});
    await B.connect(dev.deviceId,()=>onDisc());
    return {name:dev.name,id:dev.deviceId,disconnect:()=>B.disconnect(dev.deviceId),
      notify:(c,cb)=>B.startNotifications(dev.deviceId,cu(dataSvc),cu(c),cb),
      write:(c,bytes,s2)=>B.write(dev.deviceId,cu(s2||dataSvc),cu(c),new DataView(new Uint8Array(bytes).buffer))};
  }
  if(!navigator.bluetooth) throw new Error('Web Bluetooth indisponible : utilise Chrome sur Android, en https.');
  const filters=[{services:[svc]}]; if(namePrefix) filters.push({namePrefix});
  const dev=await navigator.bluetooth.requestDevice({filters,optionalServices:[dataSvc]});
  dev.addEventListener('gattserverdisconnected',onDisc);
  const srv=await dev.gatt.connect(), s=await srv.getPrimaryService(dataSvc);
  return {name:dev.name,id:dev.id,disconnect:async()=>dev.gatt.disconnect(),
    async notify(c,cb){const ch=await s.getCharacteristic(c);await ch.startNotifications();ch.addEventListener('characteristicvaluechanged',e=>cb(e.target.value))},
    async write(c,bytes){const ch=await s.getCharacteristic(c);await ch.writeValueWithResponse(new Uint8Array(bytes))}};
}

function send(bytes){
  // les écritures GATT doivent être sérialisées
  T.queue=T.queue.then(()=>T.cp.write(0x2AD9,bytes)).catch(e=>status('Erreur envoi : '+e.message));
  return T.queue;
}

async function connectTrainer(){
  try{
    status('Recherche du Ride… (ferme Zwift sur tous tes appareils)');
    const c=await bleConnect(0x1826,()=>{
      T.hasControl=false;T.cp=null;$('btnRide').classList.remove('on');$('btnRide').textContent='Connecter le Ride';
      status('Ride déconnecté.');
    });
    await c.notify(0x2AD2,onBikeData);
    await c.notify(0x2AD9,onCpIndication);                // indications du point de contrôle
    T.cp=c;
    await send([0x00]);                                   // demande de contrôle
    $('btnRide').classList.add('on');$('btnRide').textContent='Ride : '+(c.name||'connecté');
    status('Ride connecté. Pédale pour voir les valeurs.');
  }catch(e){status('Connexion Ride impossible : '+e.message)}
}

// ---------- Fréquence cardiaque ----------
let hrDev=null;
function onHr(v){
  const f=v.getUint8(0);
  live.hr=(f&1)?v.getUint16(1,true):v.getUint8(1);
  refresh();
}
async function connectHr(){
  try{
    status('Recherche de la FC… Sur la montre, active « diffuser la fréquence cardiaque ».');
    const c=await bleConnect(0x180D,()=>{
      live.hr=null;refresh();$('btnHr').classList.remove('on');$('btnHr').textContent='Connecter la FC';status('FC déconnectée.');
    });
    await c.notify(0x2A37,onHr);
    $('btnHr').classList.add('on');$('btnHr').textContent='FC : '+(c.name||'connectée');
    status('FC connectée.');
  }catch(e){status('Connexion FC impossible : '+e.message)}
}

// ---------- Manettes Zwift Ride (changement de vitesse virtuelle) ----------
// Protocole Zwift (non documenté officiellement) : service 0xFC82 annoncé, service de données
// 00000001-19CA-4651-86E5-FA29DCDD09D1, notifications 02, écriture 03, indications 04, poignée de main « RideOn ».
const ZSVC='00000001-19ca-4651-86e5-fa29dcdd09d1', ZNOT='00000002-19ca-4651-86e5-fa29dcdd09d1',
      ZWR='00000003-19ca-4651-86e5-fa29dcdd09d1', ZIND='00000004-19ca-4651-86e5-fa29dcdd09d1';
const GEARS=24, GEAR0=12, GEAR_STEP=1;       // 24 vitesses ; chaque cran = ±1 % de pente
let gear=GEAR0, padLog=[], padN=0;
const gearOffset=()=>(gear-GEAR0)*GEAR_STEP;
function showGear(){$('lGear').textContent=gear+'/'+GEARS}
function shiftGear(d){
  gear=Math.max(1,Math.min(GEARS,gear+d)); showGear();
  if(mode==='sim') lastGradeAt=0;            // renvoie la pente tout de suite
}
function hex(dv){return Array.from(new Uint8Array(dv.buffer,dv.byteOffset,dv.byteLength),b=>b.toString(16).padStart(2,'0')).join(' ')}
function logPad(t){padLog.unshift(t); if(padLog.length>8) padLog.pop(); $('padDbg').textContent=padLog.join('\n')}
// un état par manette (gauche et droite sont deux appareils distincts) ; le 1er message sert de référence.
// Rôle fixé par l'ordre de connexion : 1re manette = gauche = vitesse inférieure, 2e = droite = vitesse supérieure.
// Gauche / droite : les deux manettes sont deux appareils « Zwift Ride » identiques, et certains boutons sont signalés
// par les DEUX appareils à la fois. On apprend donc, manette par manette (une seule connectée), quel bouton fait quoi :
// règle = {appareil, code du bouton, sens}. Sans règle pour un appareil, repli sur l'ordre de connexion
// (1re = gauche = −, 2e = droite = +) avec les appuis « doublons » ignorés.
let padRules=[];                                  // [{id, bit, dir}]
try{const r=JSON.parse(localStorage.getItem('vi_padrules2')||'[]'); if(Array.isArray(r)) padRules=r}catch(e){}
const pads={};                                    // id appareil → {order, conn}
const padOrder=[-1,1];
const sideTag=d=>d<0?'G':'D';
const padPend={}; let calib=null;
function padPress(id,fresh){                      // repli sans règle
  const other=Object.keys(pads).find(k=>k!==id), po=other&&padPend[other];
  if(po&&po.mask&fresh){
    const common=po.mask&fresh; po.mask&=~common; fresh&=~common;
    logPad('doublon 0x'+common.toString(16)+' ignoré (signalé par G et D)');
  }
  if(!fresh) return;
  const p=padPend[id]||(padPend[id]={mask:0,timer:null});
  p.mask|=fresh; clearTimeout(p.timer);
  p.timer=setTimeout(()=>{
    if(p.mask&&pads[id]){ const d=pads[id].order; shiftGear(d); logPad(sideTag(d)+(d<0?'(−)':'(+)')+' appui 0x'+p.mask.toString(16)+' → vitesse '+gear+'/'+GEARS); }
    p.mask=0;
  },200);
}
function makePadHandler(id){
  let prev=null;
  return dv=>{
    if(dv.byteLength>=3&&dv.getUint8(0)===0x23&&dv.getUint8(1)===0x08){
      let map=0,sh=0,o=2,b;                  // varint protobuf (champ 1) : bit à 0 = bouton appuyé
      do{b=dv.getUint8(o++);map+=(b&0x7F)*Math.pow(2,sh);sh+=7}while(b&0x80&&o<dv.byteLength);
      const pressed=(~map>>>0)&0x1FFFF, fresh=prev===null?0:pressed&~prev, changed=pressed!==prev; prev=pressed;
      const mine=padRules.filter(r=>r.id===id);
      if(fresh&&calib&&calib.id===id){ for(let k=0;k<17;k++) if(fresh&(1<<k)) calib.bits[1<<k]=(calib.bits[1<<k]||0)+1; logPad('étalonnage : bouton 0x'+fresh.toString(16)); }
      else if(fresh&&mine.length){
        const hit=mine.find(r=>fresh&r.bit);
        if(hit){ shiftGear(hit.dir); logPad(sideTag(hit.dir)+(hit.dir<0?'(−)':'(+)')+' bouton 0x'+hit.bit.toString(16)+' → vitesse '+gear+'/'+GEARS); }
        else logPad('bouton 0x'+fresh.toString(16)+' sans effet (non étalonné)');
      }
      else if(fresh) padPress(id,fresh);
      else if(changed) logPad('relâché / état 0x'+pressed.toString(16));
    }
  };
}
// Étalonnage en deux passes : à chaque passe une seule manette est connectée et l'on appuie 2 fois sur son bouton.
let calStep=0;
const CAL_ROLES=[{dir:-1,nom:'GAUCHE',btn:'BAS GAUCHE (descendre)'},{dir:1,nom:'DROITE',btn:'BAS DROIT (monter)'}];
async function calibratePad(){
  const r=CAL_ROLES[calStep];
  for(const id of Object.keys(pads)){ try{pads[id].conn.disconnect()}catch(e){} delete pads[id] }
  $('btnPad').classList.remove('on');$('btnPad').textContent='Connecter les manettes';
  $('btnCal').textContent='Choisis la manette '+r.nom+' dans la liste…';
  status('Étalonnage '+(calStep+1)+'/2 : connecte UNIQUEMENT la manette '+r.nom+'.');
  const id=await connectPad();
  if(!id){$('btnCal').textContent='Étalonner les vitesses';calStep=0;return}
  $('btnCal').textContent='Appuie 2 fois sur le bouton '+r.btn;
  status('Étalonnage '+(calStep+1)+'/2 : appuie 2 fois sur le bouton '+r.btn+' de la manette '+r.nom+' (6 s).');
  calib={id,bits:{}};
  await new Promise(res=>setTimeout(res,6000));
  const bits=calib.bits; calib=null;
  const best=Object.keys(bits).sort((x,y)=>bits[y]-bits[x])[0];
  if(!best){$('btnCal').textContent='Aucun appui détecté — recommence l\'étalonnage';calStep=0;return}
  padRules=padRules.filter(x=>x.id!==id&&x.dir!==r.dir).concat({id,bit:+best,dir:r.dir});
  try{localStorage.setItem('vi_padrules2',JSON.stringify(padRules))}catch(e){}
  logPad('manette '+r.nom+' enregistrée : bouton 0x'+(+best).toString(16)+' ('+bits[best]+' appui(s))');
  calStep++;
  if(calStep>=2){
    calStep=0; $('btnCal').textContent='Étalonnage terminé ✓';
    status('Étalonnage terminé. Reconnecte maintenant les deux manettes (« Connecter les manettes » deux fois).');
  }else{
    $('btnCal').textContent='Gauche enregistrée ✓ — appuie ici pour la DROITE';
    status('Manette gauche enregistrée. Appuie sur « Étalonner » pour enregistrer la manette droite.');
  }
}
async function connectPad(){
  if(Object.keys(pads).length>=2){status('Les deux manettes sont déjà connectées.');return}
  let id=null, added=false, done=false;
  try{
    $('btnPad').textContent='Recherche…';
    const want=Object.keys(pads).length?'l\'AUTRE manette':'une manette';
    status('Recherche de '+want+'… (appuie sur une de ses palettes pour la réveiller)');
    let cur=null;
    const c=await bleConnect(0xFC82,()=>{
      if(!(id&&pads[id]&&pads[id].conn===cur)) return;   // coupure d'une ancienne connexion : on l'ignore
      delete pads[id];delete padPend[id];
      const n=Object.keys(pads).length;
      $('btnPad').classList.toggle('on',n>0);$('btnPad').textContent=n>0?'Manettes : '+n+'/2':'Connecter les manettes';status('Une manette déconnectée.');
    },ZSVC,'Zwift');
    id=c.id; cur=c;
    if(pads[id]) throw new Error('Cette manette est déjà connectée : choisis l\'autre dans la liste.');
    pads[id]={order:padOrder.find(d=>!Object.values(pads).some(p=>p.order===d))||1,conn:c}; added=true;
    const h=makePadHandler(id);
    await c.notify(ZNOT,h);
    await c.notify(ZIND,h);
    await c.write(ZWR,[0x52,0x69,0x64,0x65,0x4F,0x6E,0x01,0x02]);   // « RideOn » + 01 02 (Ride)
    done=true;
    const n=Object.keys(pads).length;
    showGear();
    $('btnPad').classList.add('on');
    $('btnPad').textContent=n<2?'Manette 1/2 OK · connecter l\'autre':'Manettes : 2/2';
    status('Manette connectée ('+(c.name||'?')+').'+(n<2?' Appuie à nouveau sur le bouton pour l\'autre.':''));
    return id;
  }catch(e){
    if(added&&!done) delete pads[id];
    const m=(e&&e.message)||String(e);
    $('btnPad').textContent='Manettes : '+m.slice(0,60);
    status('Connexion manettes impossible : '+m);
    return null;
  }
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
const FLAT=[{lat:0,lon:0,d:0,ele:0},{lat:0,lon:0,d:200000,ele:0}];   // route plate de 200 km pour le mode « pédale libre »
let freeRide=false;
function getRoute(){return freeRide?FLAT:(typeof pts!=='undefined'&&pts.length>1)?pts:null}
function interp(r,d){
  d=Math.max(0,Math.min(d,r[r.length-1].d));
  let lo=0,hi=r.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1; if(r[m].d<=d) lo=m; else hi=m}
  const a=r[lo],b=r[hi],f=(b.d-a.d)?(d-a.d)/(b.d-a.d):0;
  return {lat:a.lat+(b.lat-a.lat)*f,lon:a.lon+(b.lon-a.lon)*f,ele:a.ele+(b.ele-a.ele)*f};
}
function gradeAt(r,d,w){
  const a=Math.max(0,d-w), b=Math.min(r[r.length-1].d,d+w);
  return b>a?(interp(r,b).ele-interp(r,a).ele)/(b-a)*100:0;
}
// Cherche, dans les 500 prochains mètres, le premier endroit où la pente change d'au moins 2 points.
function lookAhead(r,d,gNow,scale,total){
  for(let x=50;x<=500&&d+x<=total;x+=25){
    const gx=Math.max(-10,Math.min(15,gradeAt(r,d+x,40)))*scale;
    if(Math.abs(gx-gNow)>=2) return {dist:x,g:gx};
  }
  return null;
}
function showSlope(g,nx){
  $('slopeNow').textContent=g.toFixed(1)+' %';
  const el=$('slopeNext');
  if(nx){
    const up=nx.g>g;
    el.dataset.dir=up?'up':'down';
    el.textContent=(up?'⬆ Montée':'⬇ Descente / replat')+' dans '+nx.dist+' m ('+nx.g.toFixed(1)+' %) · '+(up?'prépare un petit braquet':'prépare un grand braquet');
  }else{ el.dataset.dir=''; el.textContent='Pente stable sur les 500 prochains mètres'; }
}
function sendGrade(g){
  const v=Math.round(g*100);                         // pente en 0,01 %
  send([0x11,0,0,v&0xFF,(v>>8)&0xFF,40,51]);         // vent 0, Crr 0,004, Cw 0,51
}
async function startSim(free){
  freeRide=!!free;
  if(!T.cp){status('Connecte d\'abord le Ride.');return}
  if(tick) return;
  if(!getRoute()){status('Charge ou trace d\'abord un parcours.');return}
  mode='sim'; simDist=0; lastGradeAt=0; steps=[]; window.VI.simRoute=!free;   // le parcours n'est joint à la sortie que si on l'a vraiment roulé
  await send([0x00]); await send([0x07]);
  samples.length=0; startedAt=Date.now(); window.VI.startTime=startedAt;
  try{wake=await navigator.wakeLock.request('screen')}catch(e){}
  (free?$('btnFree'):$('btnSim')).textContent='Arrêter'; (free?$('btnFree'):$('btnSim')).classList.add('on');
  if(!free&&typeof L!=='undefined'&&typeof map!=='undefined')
    simMarker=L.circleMarker([getRoute()[0].lat,getRoute()[0].lon],{radius:8,color:'#fff',fillColor:'#22c55e',fillOpacity:1}).addTo(map);
  tick=setInterval(()=>{
    const r=getRoute(), total=r[r.length-1].d;
    simDist+=(live.speed||0)/3.6;
    const d0=Math.max(0,simDist-60), d1=Math.min(total,simDist+60);
    let g=d1>d0?(interp(r,d1).ele-interp(r,d0).ele)/(d1-d0)*100:0;
    g=Math.max(-10,Math.min(15,g))*((+$('inDiff').value||100)/100);
    const gSent=Math.max(-10,Math.min(20,g+gearOffset()));
    if(Date.now()-lastGradeAt>=2000){lastGradeAt=Date.now();sendGrade(gSent)}
    showSlope(g,lookAhead(r,simDist,g,((+$('inDiff').value||100)/100),total));
    const p=interp(r,simDist);
    if(simMarker) simMarker.setLatLng([p.lat,p.lon]);
    $('timer').textContent=fmt((Date.now()-startedAt)/1000);
    $('lKm').textContent=(simDist/1000).toFixed(2);
    $('lLeft').textContent=Math.max(0,(total-simDist)/1000).toFixed(2);
    $('stepInfo').textContent=(simDist/1000).toFixed(2)+' / '+(total/1000).toFixed(1)+' km · vitesse '+gear+'/'+GEARS+' · pente envoyée au Ride '+gSent.toFixed(1)+' %';
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
  mode='erg'; stepIdx=-1; ergDist=0; window.VI.simRoute=false;
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
  $('btnFree').textContent='Pédale libre';$('btnFree').classList.remove('on');freeRide=false;
  if(simMarker){map.removeLayer(simMarker);simMarker=null}
  $('stepInfo').textContent='';mode=null;
  $('slopeNow').textContent='';$('slopeNext').textContent='';$('slopeNext').dataset.dir='';
  if(window.VI.onStop) window.VI.onStop();
  status(finished?'Exercice terminé ('+samples.length+' secondes enregistrées).':'Exercice arrêté ('+samples.length+' s enregistrées).');
}

$('btnRide').onclick=connectTrainer;
$('btnHr').onclick=connectHr;
$('btnPad').onclick=connectPad;
$('btnCal').onclick=calibratePad;showGear();
$('lGear').parentNode.onclick=()=>{gear=GEAR0;showGear();logPad('vitesse remise à '+GEAR0)};
$('btnErg').onclick=()=>tick?stopErg(false):startErg();
$('btnSim').onclick=()=>tick?stopErg(false):startSim();
$('btnFree').onclick=()=>tick?stopErg(false):startSim(true);
$('wPlus').onclick=()=>setTarget(target+10);
$('wMinus').onclick=()=>setTarget(target-10);
$('inW').addEventListener('input',e=>{ if(!tick){target=+e.target.value||0;$('tgt').textContent=target} });
})();
