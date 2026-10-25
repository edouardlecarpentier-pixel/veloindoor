// Import depuis Vento : séance (étapes « minutes watts ») et/ou parcours (points latitude, longitude, altitude).
// Quatre voies : lien web (…/veloindoor/#d=…), lien Android (veloindoor://import?d=…), bouton « Importer depuis Vento » (presse-papiers),
// ou simple collage de lignes « minutes watts » dans la zone de séance.
(function(){
const $=id=>document.getElementById(id);
function say(t){const m=$('bleMsg'); if(m) m.textContent=t}
function decode(d){
  try{
    const b=atob(d.replace(/-/g,'+').replace(/_/g,'/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(b,c=>c.charCodeAt(0))));
  }catch(e){return null}
}
function planStats(text){
  const st=text.split('\n').map(l=>l.replace(/#.*/,'').trim()).filter(Boolean).map(l=>{
    const m=l.match(/^(\d+(?:[.,]\d+)?)\s*(?:min)?\s*[x@ ]\s*(\d+)/i); return m?{min:parseFloat(m[1].replace(',','.')),w:+m[2]}:null;
  }).filter(x=>x&&x.min>0);
  const tot=st.reduce((a,b)=>a+b.min,0);
  return {n:st.length,min:Math.round(tot),sec:Math.round(tot*60),w:st.length?st[0].w:null};
}
function mmss(s){return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
// Résumé sous la zone de séance, et mise à jour de la zone « Exercice » (puissance, durée, minuteur)
// quand la séance change (saisie, import, « Générer ») et qu'aucun exercice n'est en cours.
function showPlanInfo(){
  const el=$('planInfo'), pl=$('plan'); if(!el||!pl) return;
  const s=planStats(pl.value);
  el.textContent=s.n?'Séance active : '+s.n+' étapes, '+s.min+' min':'';
  if(!s.n||(window.VI&&window.VI.steps)) return;               // vide, ou exercice en cours : on ne touche à rien
  $('inW').value=s.w; $('inW').dispatchEvent(new Event('input'));   // cible = 1re étape
  $('inM').value=Math.max(1,Math.round(s.sec/60));
  $('timer').textContent=mmss(s.sec);
  $('stepInfo').textContent='Séance prête : '+s.n+' étapes, '+mmss(s.sec)+' · départ à '+s.w+' W';
}
if($('plan')){ $('plan').addEventListener('input',showPlanInfo); showPlanInfo(); }
if($('btnGen')) $('btnGen').addEventListener('click',showPlanInfo);
async function apply(p){
  if(!p||p.v!==1) throw new Error('Données Vento non reconnues');
  const done=[];
  if(typeof p.plan==='string'&&p.plan.trim()){
    $('plan').value=p.plan.trim();
    $('plan').dispatchEvent(new Event('input'));                 // sauvegarde la séance (vi_plan)
    const s=planStats(p.plan); done.push('séance'+(p.name?' « '+p.name+' »':'')+' : '+s.n+' étapes, '+s.min+' min');
  }
  if(Array.isArray(p.route)&&p.route.length>1){
    const pts=p.route.filter(r=>Array.isArray(r)&&isFinite(r[0])&&isFinite(r[1])).map(r=>({lat:+r[0],lon:+r[1],ele:r[2]==null?null:+r[2]}));
    if(pts.length>1&&typeof setRoute==='function'){
      if(typeof waypoints!=='undefined') waypoints.length=0;
      await setRoute(pts); done.push('parcours'+(p.name?' « '+p.name+' »':'')+' : '+pts.length+' points');
    }
  }
  if(!done.length) throw new Error('Rien à importer');
  say('Reçu de Vento — '+done.join(' · ')+'. Connecte le Ride puis appuie sur Démarrer.');
  const target=p.plan?$('btnErg'):$('map'); if(target&&target.scrollIntoView) target.scrollIntoView({behavior:'smooth',block:'center'});
}
function fromUrl(u){
  const m=String(u).match(/[?#&]d=([^&#]+)/); if(!m) return false;
  const p=decode(m[1]); if(!p) return false;
  apply(p).catch(e=>say('Import impossible : '+e.message)); return true;
}
window.VI=window.VI||{};
window.VI.refreshPlan=showPlanInfo;                            // rappelé à l'arrêt d'un exercice
window.VI.importUrl=fromUrl;                                  // appelé par l'appli Android (lien veloindoor://…)

// Lien web : on lit #d=… puis on nettoie l'adresse
if(/[#&]d=/.test(location.hash)){ fromUrl(location.hash); try{history.replaceState(null,'',location.pathname+location.search)}catch(e){} }

// Bouton : lit le presse-papiers (JSON Vento ou lignes « minutes watts »)
const btn=$('btnPasteVento');
if(btn) btn.onclick=async()=>{
  let t='';
  try{t=await navigator.clipboard.readText()}catch(e){say('Autorise l\'accès au presse-papiers, ou colle la séance dans la zone de texte.');return}
  t=(t||'').trim(); if(!t){say('Le presse-papiers est vide : copie d\'abord la séance dans Vento.');return}
  try{
    let p=null; try{p=JSON.parse(t)}catch(e){}
    if(!p) p={v:1,plan:t};
    await apply(p);
  }catch(e){say('Import impossible : '+e.message)}
};
})();
