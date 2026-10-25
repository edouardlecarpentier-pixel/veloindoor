// Graphe de la séance dans les bandes du bas (paysage et mode vidéo) :
// profil des étapes (watts), curseur « maintenant », temps restant dans l'étape et prochain changement (effort / récup).
(function(){
const $=id=>document.getElementById(id);
const WIN_ALL=900, PAST=120, FUTURE=780;   // séance ≤ 15 min : tout afficher ; sinon fenêtre glissante
const DELTA=15;                            // écart (W) à partir duquel on parle d'un vrai changement
const fmt=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};

function color(w,max){
  const f=max?w/max:0;
  return f<0.55?'#4ade80':f<0.8?'#facc15':'#f87171';
}
function draw(cv,steps,starts,total,el){
  const dpr=window.devicePixelRatio||1, W=cv.clientWidth, H=cv.clientHeight;
  if(!W||!H) return;
  if(cv.width!==Math.round(W*dpr)||cv.height!==Math.round(H*dpr)){cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
  const g=cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0); g.clearRect(0,0,W,H);
  let t0=0,t1=total;
  if(total>WIN_ALL){t0=Math.max(0,Math.min(el-PAST,total-PAST-FUTURE)); t1=Math.min(total,t0+PAST+FUTURE)}
  const max=Math.max(...steps.map(s=>s.w),1), x=t=>(t-t0)/(t1-t0)*W;
  steps.forEach((s,i)=>{
    const a=starts[i], b=a+s.sec; if(b<t0||a>t1) return;
    const xa=Math.max(0,x(a)), xb=Math.min(W,x(b)), h=Math.max(2,s.w/max*(H-4));
    g.globalAlpha=b<=el?0.35:0.9; g.fillStyle=color(s.w,max);
    g.fillRect(xa,H-h,Math.max(1,xb-xa-0.5),h);
  });
  g.globalAlpha=1;
  const cx=x(Math.min(el,t1)); g.fillStyle='#fff'; g.fillRect(Math.max(0,cx-1),0,2,H);
}
function info(steps,starts,total,el){
  let idx=steps.length-1;
  for(let i=0;i<steps.length;i++) if(el<starts[i]+steps[i].sec){idx=i;break}
  const cur=steps[idx], left=starts[idx]+cur.sec-el;
  let nx=-1;
  for(let i=idx+1;i<steps.length;i++) if(Math.abs(steps[i].w-cur.w)>=DELTA){nx=i;break}
  const l1=cur.w+' W · encore '+fmt(left);
  let l2,dir='';
  if(nx<0) l2='fin de séance dans '+fmt(total-el);
  else{
    const up=steps[nx].w>cur.w; dir=up?'up':'down';
    l2=(up?'⬆ effort ':'⬇ récup ')+steps[nx].w+' W dans '+fmt(starts[nx]-el);
  }
  return {l1,l2,dir};
}
function upd(){
  const steps=window.VI&&window.VI.steps, st=window.VI&&window.VI.startTime;
  const on=!!(steps&&steps.length&&st);
  let starts,total,el;
  if(on){
    starts=[]; total=0; steps.forEach(s=>{starts.push(total);total+=s.sec});
    el=Math.max(0,(Date.now()-st)/1000);
  }
  ['b','v'].forEach(p=>{
    const w=$(p+'PlanW'); if(!w) return;
    w.hidden=!on; if(!on) return;
    draw($(p+'Plan'),steps,starts,total,el);
    const r=info(steps,starts,total,Math.min(el,total));
    $(p+'PlanA').textContent=r.l1; $(p+'PlanB').textContent=r.l2; $(p+'PlanB').dataset.dir=r.dir;
  });
}
setInterval(upd,500); upd();
})();
