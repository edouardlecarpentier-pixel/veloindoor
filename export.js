// Étape 3 : historique des sorties + export FIT / TCX / GPX.
(function(){
const $=id=>document.getElementById(id);
const KEY='vi_history', MAX=15;

// ---------- calculs ----------
// sample = [t(s), puissance, cadence, vitesse km/h, fc]
function summarize(r){
  const s=r.samples; let dist=0, prevT=null; const cum=[];
  for(const x of s){
    if(prevT!=null) dist+=((x[3]||0)/3.6)*Math.max(1,x[0]-prevT);
    cum.push(dist); prevT=x[0];
  }
  const col=i=>s.map(x=>x[i]).filter(v=>v!=null);
  const avg=a=>a.length?Math.round(a.reduce((p,c)=>p+c,0)/a.length):null;
  const mx=a=>a.length?Math.max(...a):null;
  const P=col(1),C=col(2),H=col(4);
  return {cum,dist,dur:s.length?s[s.length-1][0]-s[0][0]+1:0,
    avgP:avg(P),maxP:mx(P),avgC:avg(C),avgH:avg(H),maxH:mx(H)};
}

// ---------- FIT ----------
const CRC=[0x0000,0xCC01,0xD801,0x1400,0xF001,0x3C00,0x2800,0xE401,0xA001,0x6C00,0x7800,0xB401,0x5000,0x9C01,0x8801,0x4400];
function crc16(bytes,c=0){
  for(const b of bytes){
    let t=CRC[c&0xF]; c=(c>>4)&0x0FFF; c=c^t^CRC[b&0xF];
    t=CRC[c&0xF]; c=(c>>4)&0x0FFF; c=c^t^CRC[(b>>4)&0xF];
  }
  return c;
}
function buildFit(r){
  const sm=summarize(r), body=[];
  const put=(v,size)=>{ // valeur invalide = tous bits à 1
    if(v==null) v=size===1?0xFF:size===2?0xFFFF:0xFFFFFFFF;
    v=Math.round(v)>>>0;
    for(let i=0;i<size;i++) body.push((v>>>(8*i))&0xFF);
  };
  const def=(local,glob,fields)=>{
    body.push(0x40|local,0,0,glob&0xFF,glob>>8,fields.length);
    fields.forEach(f=>body.push(f[0],f[1],f[2]));
  };
  const data=(local,fields,vals)=>{ body.push(local); fields.forEach((f,i)=>put(vals[i],f[1])); };
  const U8=0x02,U16=0x84,U32=0x86,EN=0x00,U32Z=0x8C;
  const E0=Date.UTC(1989,11,31)/1000;
  const fit=ms=>Math.floor(ms/1000)-E0;
  const start=fit(r.start), end=start+sm.dur;
  const elapsed=sm.dur*1000, distCm=sm.dist*100;

  const fFile=[[0,1,EN],[1,2,U16],[2,2,U16],[3,4,U32Z],[4,4,U32]];
  def(0,0,fFile); data(0,fFile,[4,255,0,1,start]);

  const fEv=[[253,4,U32],[0,1,EN],[1,1,EN]];
  def(1,21,fEv); data(1,fEv,[start,0,0]);

  const fRec=[[253,4,U32],[3,1,U8],[4,1,U8],[5,4,U32],[6,2,U16],[7,2,U16]];
  def(2,20,fRec);
  r.samples.forEach((x,i)=>data(2,fRec,[
    start+x[0], x[4], x[2]==null?null:Math.round(x[2]), sm.cum[i]*100,
    x[3]==null?null:(x[3]/3.6)*1000, x[1]]));

  data(1,fEv,[end,0,4]);

  const fLap=[[253,4,U32],[2,4,U32],[7,4,U32],[8,4,U32],[9,4,U32],[25,1,EN],[19,2,U16],[20,2,U16],[15,1,U8],[16,1,U8],[17,1,U8],[0,1,EN],[1,1,EN]];
  def(3,19,fLap); data(3,fLap,[end,start,elapsed,elapsed,distCm,2,sm.avgP,sm.maxP,sm.avgH,sm.maxH,sm.avgC,9,1]);

  const fSes=[[253,4,U32],[2,4,U32],[7,4,U32],[8,4,U32],[9,4,U32],[5,1,EN],[6,1,EN],[20,2,U16],[21,2,U16],[16,1,U8],[17,1,U8],[18,1,U8],[25,2,U16],[26,2,U16],[0,1,EN],[1,1,EN]];
  def(4,18,fSes); data(4,fSes,[end,start,elapsed,elapsed,distCm,2,6,sm.avgP,sm.maxP,sm.avgH,sm.maxH,sm.avgC,0,1,8,1]);

  const fAct=[[253,4,U32],[0,4,U32],[1,2,U16],[2,1,EN],[3,1,EN],[4,1,EN]];
  def(5,34,fAct); data(5,fAct,[end,elapsed,1,0,26,1]);

  const h=[14,0x20,0x54,0x08,body.length&0xFF,(body.length>>8)&0xFF,(body.length>>16)&0xFF,(body.length>>>24)&0xFF,0x2E,0x46,0x49,0x54];
  const hc=crc16(h); h.push(hc&0xFF,hc>>8);
  const all=h.concat(body), fc=crc16(all); all.push(fc&0xFF,fc>>8);
  return new Uint8Array(all);
}

// ---------- TCX (indoor, sans GPS) ----------
const iso=ms=>new Date(ms).toISOString();
function buildTcx(r){
  const sm=summarize(r);
  const pts=r.samples.map((x,i)=>'<Trackpoint><Time>'+iso(r.start+x[0]*1000)+'</Time>'+
    '<DistanceMeters>'+sm.cum[i].toFixed(1)+'</DistanceMeters>'+
    (x[4]!=null?'<HeartRateBpm><Value>'+x[4]+'</Value></HeartRateBpm>':'')+
    (x[2]!=null?'<Cadence>'+Math.round(x[2])+'</Cadence>':'')+
    (x[1]!=null?'<Extensions><ns3:TPX><ns3:Watts>'+x[1]+'</ns3:Watts></ns3:TPX></Extensions>':'')+
    '</Trackpoint>').join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
  '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Activities><Activity Sport="Biking"><Id>'+iso(r.start)+'</Id>'+
  '<Lap StartTime="'+iso(r.start)+'"><TotalTimeSeconds>'+sm.dur+'</TotalTimeSeconds><DistanceMeters>'+sm.dist.toFixed(1)+'</DistanceMeters><Calories>0</Calories>'+
  (sm.avgH?'<AverageHeartRateBpm><Value>'+sm.avgH+'</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>'+sm.maxH+'</Value></MaximumHeartRateBpm>':'')+
  '<Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>'+pts+'</Track></Lap></Activity></Activities></TrainingCenterDatabase>';
}

// ---------- GPX (nécessite un parcours chargé) ----------
function buildGpx(r){
  const rt=r.route, sm=summarize(r);
  let k=0;
  const pos=d=>{
    d=Math.min(d,rt[rt.length-1][3]);
    while(k<rt.length-2&&rt[k+1][3]<d) k++;
    const a=rt[k],b=rt[k+1],span=(b[3]-a[3])||1,f=Math.max(0,Math.min(1,(d-a[3])/span));
    return {lat:a[0]+(b[0]-a[0])*f,lon:a[1]+(b[1]-a[1])*f,ele:a[2]+(b[2]-a[2])*f};
  };
  const pts=r.samples.map((x,i)=>{
    const p=pos(sm.cum[i]);
    return '<trkpt lat="'+p.lat.toFixed(6)+'" lon="'+p.lon.toFixed(6)+'"><ele>'+p.ele.toFixed(1)+'</ele><time>'+iso(r.start+x[0]*1000)+'</time>'+
      '<extensions>'+(x[1]!=null?'<power>'+x[1]+'</power>':'')+
      '<gpxtpx:TrackPointExtension>'+(x[4]!=null?'<gpxtpx:hr>'+x[4]+'</gpxtpx:hr>':'')+(x[2]!=null?'<gpxtpx:cad>'+Math.round(x[2])+'</gpxtpx:cad>':'')+'</gpxtpx:TrackPointExtension></extensions></trkpt>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="VeloIndoor" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><name>VeloIndoor '+iso(r.start)+'</name><type>VirtualRide</type><trkseg>'+pts+'</trkseg></trk></gpx>';
}

// ---------- téléchargement ----------
function stamp(ms){const d=new Date(ms),p=n=>String(n).padStart(2,'0');return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())}
function download(name,data,type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([data],{type}));
  a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),10000);
}
function exportRide(r,kind){
  const base='sortie-'+stamp(r.start);
  if(kind==='fit') download(base+'.fit',buildFit(r),'application/octet-stream');
  else if(kind==='tcx') download(base+'.tcx',buildTcx(r),'application/vnd.garmin.tcx+xml');
  else if(kind==='gpx'){
    if(!r.route||r.route.length<2){alert('Le GPX demande un parcours chargé ou tracé pendant la sortie. Utilise FIT ou TCX.');return}
    download(base+'.gpx',buildGpx(r),'application/gpx+xml');
  }
}

// ---------- historique ----------
function load(){try{return JSON.parse(localStorage.getItem(KEY))||[]}catch(e){return []}}
function store(list){
  while(list.length){
    try{localStorage.setItem(KEY,JSON.stringify(list));return}catch(e){list.pop()} // quota : on retire la plus ancienne
  }
}
function saveRide(){
  const V=window.VI;
  if(!V||!V.samples.length||!V.startTime) return;
  const ride={start:V.startTime,samples:V.samples.map(x=>[x.t,x.power,x.cad,x.speed,x.hr])};
  try{
    if(typeof pts!=='undefined'&&pts.length>1){
      const step=Math.max(1,Math.floor(pts.length/300));
      ride.route=pts.filter((_,i)=>i%step===0||i===pts.length-1).map(p=>[p.lat,p.lon,p.ele,p.d]);
    }
  }catch(e){}
  const list=load(); list.unshift(ride); store(list.slice(0,MAX)); render();
}
function render(){
  const box=$('hist'), list=load();
  box.innerHTML=list.length?'':'<div class="hline">Aucune sortie enregistrée.</div>';
  list.forEach((r,i)=>{
    const sm=summarize(r), d=new Date(r.start);
    const row=document.createElement('div'); row.className='hline';
    row.innerHTML='<div><b>'+d.toLocaleDateString('fr-FR')+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+'</b><br><span>'+
      Math.round(sm.dur/60)+' min · '+(sm.dist/1000).toFixed(1)+' km · '+(sm.avgP??'–')+' W moy. · '+(sm.avgH??'–')+' bpm moy.</span></div>'+
      '<div class="acts"><button data-k="vento" title="Envoyer à Vento (analyse)">Vento</button><button data-k="fit">FIT</button><button data-k="tcx">TCX</button><button data-k="gpx">GPX</button><button data-k="del">✕</button></div>';
    row.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      if(b.dataset.k==='vento'){ if(window.VI.sendRide) window.VI.sendRide(r); }
      else if(b.dataset.k==='del'){ if(confirm('Supprimer cette sortie ?')){const l=load();l.splice(i,1);store(l);if(!l.length)localStorage.removeItem(KEY);render()} }
      else exportRide(r,b.dataset.k);
    });
    box.appendChild(row);
  });
}
window.VI=window.VI||{};
window.VI.onStop=saveRide;
render();
})();
