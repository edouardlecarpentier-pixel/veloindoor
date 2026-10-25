// Envoi d'une sortie vers Vento (analyse : forme, courbe de puissance, zones…).
// La sortie (1 point par seconde : puissance, cadence, vitesse, FC) est compressée (gzip) dans un lien
// https://…/vento/training.html#ride=… que Vento décode et ajoute à ses sorties. Automatique à la fin d'une sortie (réglable).
(function(){
const $=id=>document.getElementById(id);
const VENTO='https://edouardlecarpentier-pixel.github.io/vento/training.html';
const AUTO_KEY='vi_autoVento', HIST_KEY='vi_history';
function say(t){const m=$('bleMsg'); if(m) m.textContent=t}
const b64url=u8=>{let s='';for(let i=0;i<u8.length;i+=0x4000)s+=String.fromCharCode(...u8.subarray(i,i+0x4000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
async function gzip(text){
  const cs=new CompressionStream('gzip'), w=cs.writable.getWriter();
  w.write(new TextEncoder().encode(text)); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
function climb(route){                                          // dénivelé positif approximatif du parcours (seuil 3 m)
  if(!route||route.length<2) return 0;
  let up=0,ref=route[0][2];
  for(const p of route){ if(p[2]==null) continue; const d=p[2]-ref; if(d>=3){up+=d;ref=p[2]} else if(d<=-3) ref=p[2]; }
  return Math.round(up);
}
async function pack(r){
  let s=r.samples; if(s.length>10800) s=s.filter((_,i)=>i%2===0);   // très longue sortie : 1 point sur 2
  const d=new Date(r.start), name='VeloIndoor '+d.toLocaleDateString('fr-FR')+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const payload={v:1,kind:'ride',name,start:r.start,gain:climb(r.route),samples:s};
  if(r.route&&r.route.length>1) payload.route=r.route.map(p=>[Math.round((p[2]||0)*10)/10,Math.round(p[3]||0)]);   // [altitude, distance] : Vento en déduit l'altitude à chaque seconde
  return b64url(await gzip(JSON.stringify(payload)));
}
function open(url){
  if(window.CapBrowser&&window.CapBrowser.open){ window.CapBrowser.open({url}).catch(()=>window.open(url,'_blank')); }
  else window.open(url,'_blank');
}
async function sendRide(r,opt){
  try{
    if(!r||!r.samples||r.samples.length<60){ say('Sortie trop courte pour être envoyée à Vento (moins d\'une minute).'); return }
    if(typeof CompressionStream==='undefined'){ say('Ce navigateur ne sait pas compresser la sortie : utilise l\'export FIT puis importe-le dans Strava.'); return }
    const d=await pack(r);
    say((opt&&opt.auto?'Sortie terminée — ':'')+'envoi à Vento… (analyse mise à jour dans l\'onglet Entraînement)');
    open(VENTO+'#ride='+d);
  }catch(e){ say('Envoi à Vento impossible : '+e.message) }
}
window.VI=window.VI||{};
window.VI.sendRide=sendRide;

// Réglage « envoi automatique »
const cb=$('autoVento');
if(cb){
  try{cb.checked=localStorage.getItem(AUTO_KEY)!=='0'}catch(e){}
  cb.onchange=()=>{try{localStorage.setItem(AUTO_KEY,cb.checked?'1':'0')}catch(e){}};
}
// À la fin d'une sortie : export.js enregistre la sortie (window.VI.onStop), puis on l'envoie à Vento
const prev=window.VI.onStop;
window.VI.onStop=function(){
  if(prev) prev.apply(this,arguments);
  let auto=true; try{auto=localStorage.getItem(AUTO_KEY)!=='0'}catch(e){}
  if(!auto) return;
  try{ const last=(JSON.parse(localStorage.getItem(HIST_KEY))||[])[0]; if(last) setTimeout(()=>sendRide(last,{auto:true}),800); }catch(e){}
};
})();
