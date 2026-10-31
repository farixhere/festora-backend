// @ts-nocheck
// Festora's reducer is ported from the existing frontend source so the server
// applies the same 35 operations before accepting and persisting them.
const TZ = 5.5 * 3600e3;
const TEAMCOL = ["#0E9F6E","#E2622B","#6D4ED8","#1F78D1","#D9466F","#B7791F","#0891B2","#65A30D","#7C3AED","#DB2777","#0F766E","#9A3412"];
const PUBNAME = {open:"everyone",results:"results hidden",code:"access code required",closed:"closed"};
const istDate = (t:number) => new Date(t + TZ).toISOString().slice(0,10);
const fmtMin = (m:number) => { const h=Math.floor(m/60)%24, mm=m%60, ap=h<12?"am":"pm"; return `${h%12||12}:${String(mm).padStart(2,"0")} ${ap}`; };
export const ADMIN_ROLES = new Set(["owner","org","admin"]);
export function blankFest(id,name){return{id,name,
  cfg:{teams:[],cats:[{id:"k",name:"Kids",base:100},{id:"sj",name:"Sub Junior",base:200},{id:"j",name:"Junior",base:300},{id:"sr",name:"Senior",base:400}],
    stages:[{id:"s1",name:"Stage 1"},{id:"s2",name:"Stage 2"},{id:"hall",name:"Off-stage hall"}],
    subs:[{id:"on",name:"Stage events"},{id:"off",name:"Off-stage events"}],limit:4,days:1,start:540,end:1020,slot:30,pts:{p:[5,3,1],g:{A:2,B:1,C:0},cut:{A:80,B:65,C:50}}},
  cands:[],progs:[],sched:[],appeals:[],news:[],notifs:[],gallery:[],links:[],log:[],tpl:{cert:3,poster:0},brand:{color:"",logo:""},
  locks:{reg:false,regDate:"",results:true,pub:"open",fest:false,teams:false},
  site:{title:name,tag:"Results, schedule and news",color:0,sec:{results:1,board:1,sched:1,news:1,gallery:1,verify:1}}}}

const sid=x=>String(x==null?"":x).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,24);
const ADM=m=>m.role==="owner"||m.role==="org"||m.role==="admin";
const cOf=(S,id)=>S.cands.find(c=>c.id===id);
const pOf=(S,id)=>S.progs.find(p=>p.id===id);
const tOf=(S,id)=>S.cfg.teams.find(t=>t.id===id)||{id,name:"(removed team)",color:"#94a3b8"};
const catName=(S,id)=>(S.cfg.cats.find(c=>c.id===id)||{name:"—"}).name;
const stageName=(S,id)=>(S.cfg.stages.find(c=>c.id===id)||{name:"—"}).name;
const subName=(S,id)=>(S.cfg.subs.find(c=>c.id===id)||{name:"—"}).name;
const teamName=(S,id)=>tOf(S,id).name;
const regClosedAt=(S,t)=>!!(S.locks.reg||(S.locks.regDate&&istDate(t)>S.locks.regDate));
const canReg=(S,m,team)=>ADM(m)||(m.role==="team"&&m.team===team&&!regClosedAt(S,m.t));
const marked=p=>Object.keys(p.subm||{}).length>0;
function addLog(S,m,txt){S.log.unshift({t:m.t,txt});if(S.log.length>150)S.log.length=150}
function addNote(S,m,id,txt,to){S.notifs.unshift({id:sid(id),t:m.t,txt,to:to||"all"});if(S.notifs.length>150)S.notifs.length=150}
function nextChest(S,cat){const c=S.cfg.cats.find(x=>x.id===cat);const base=+c.base||0;let n=Math.max(base,...S.cands.filter(x=>x.cat===cat).map(x=>x.chest))+1;while(S.cands.some(x=>x.chest===n))n++;return n}

/* schedule slots */
const perDay=S=>Math.max(1,Math.floor((S.cfg.end-S.cfg.start)/S.cfg.slot));
function slotAt(S,k){const pd=perDay(S);const day=Math.min(S.cfg.days,Math.floor(k/pd)+1);return{day,t:S.cfg.start+(k-(day-1)*pd)*S.cfg.slot}}
const skey=s=>s.day*1e4+s.t;
const slotOfS=(S,pid)=>S.sched.find(s=>s.pid===pid);
function placeOne(S,p){const used=new Set(S.sched.filter(s=>s.stage===p.stage&&s.pid!==p.id).map(skey));let k=0;while(used.has(skey(slotAt(S,k))))k++;S.sched=S.sched.filter(s=>s.pid!==p.id);S.sched.push({pid:p.id,stage:p.stage,...slotAt(S,k)})}
function autoPlace(S){const order=S.cfg.cats.map(c=>c.id);const busy=new Set(),stage=new Set();S.sched=[];
  [...S.progs].sort((a,b)=>order.indexOf(a.cat)-order.indexOf(b.cat)).forEach(p=>{let k=0,sl;
    for(;;){sl=slotAt(S,k);const key=skey(sl);if(!stage.has(p.stage+"@"+key)&&!p.parts.some(c=>busy.has(c+"@"+key)))break;k++}
    const key=skey(sl);stage.add(p.stage+"@"+key);p.parts.forEach(c=>busy.add(c+"@"+key));S.sched.push({pid:p.id,stage:p.stage,...sl})})}
function conflictsS(S){const out=[];const by={};S.sched.forEach(s=>{(by[skey(s)]=by[skey(s)]||[]).push(s)});
  Object.values(by).forEach(arr=>{for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){const a=arr[i],b=arr[j];const pa=pOf(S,a.pid),pb=pOf(S,b.pid);if(!pa||!pb)continue;
    if(a.stage===b.stage)out.push({a:pa.id,b:pb.id,s:a,why:`both are on ${stageName(S,a.stage)}`});
    pa.parts.filter(c=>pb.parts.includes(c)).forEach(c=>{const cd=cOf(S,c);out.push({a:pa.id,b:pb.id,s:a,why:`${cd?cd.name+" ("+cd.chest+")":"a student"} is in both`})})}});return out}
function enrollError(S,c,pids){const editable=p=>p.cat===c.cat&&p.status==="pending"&&!marked(p);
  const fixed=S.progs.filter(p=>p.parts.includes(c.id)&&!editable(p));const want=S.progs.filter(p=>editable(p)&&pids.includes(p.id));const all=[...fixed,...want];
  if(all.length>S.cfg.limit)return `Too many programmes: ${all.length} chosen, the limit is ${S.cfg.limit}.`;
  const seen={};for(const p of all){const s=slotOfS(S,p.id);if(!s)continue;const k=skey(s);if(seen[k])return `Clash: "${seen[k].n}" and "${p.n}" are both at ${S.cfg.days>1?"Day "+s.day+", ":""}${fmtMin(s.t)}. Remove one.`;seen[k]=p}
  return null}

/* results */
function calcS(S,p){const js=p.judges.filter(j=>p.subm[j]);if(!js.length||!p.parts.length)return[];
  const rows=p.parts.map(cid=>{const ms=js.map(j=>+((p.marks[j]||{})[cid])||0);const avg=Math.round(ms.reduce((a,b)=>a+b,0)/ms.length*10)/10;return{cid,ms,avg,spread:Math.round((Math.max(...ms)-Math.min(...ms))*10)/10}}).sort((a,b)=>b.avg-a.avg);
  let rank=0,prev=null;rows.forEach((r,i)=>{if(r.avg!==prev){rank=i+1;prev=r.avg}r.rank=rank;const pt=S.cfg.pts||DEFPTS;r.grade=r.avg>=pt.cut.A?"A":r.avg>=pt.cut.B?"B":r.avg>=pt.cut.C?"C":"—";r.pts=(pt.p[r.rank-1]||0)+(pt.g[r.grade]||0)});return rows}
const DEFPTS={p:[5,3,1],g:{A:2,B:1,C:0},cut:{A:80,B:65,C:50}};
const ptsText=S=>{const p=S.cfg.pts||DEFPTS;return `1st place ${p.p[0]} points, 2nd ${p.p[1]}, 3rd ${p.p[2]}. Grade A (${p.cut.A}+) adds ${p.g.A}, grade B (${p.cut.B}+) adds ${p.g.B}, grade C (${p.cut.C}+) adds ${p.g.C}. Equal averages share a place. Only published results count.`};
const safeLogo=l=>/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/.test(l||"")&&l.length<=46000?l:"";
function teamPtsS(S){const t={};S.cfg.teams.forEach(x=>t[x.id]=0);S.progs.filter(p=>p.status==="published").forEach(p=>calcS(S,p).forEach(r=>{const c=cOf(S,r.cid);if(c&&t[c.team]!=null)t[c.team]+=r.pts}));return t}

const R={
  cfg(S,a,m){if(!ADM(m))return;const k=a.key,v=a.val;
    if(["teams","cats","stages","subs"].includes(k)){
      if(!Array.isArray(v)||!v.length&&k!=="teams"||!v.every(x=>x&&x.id&&String(x.name||"").trim()))return;
      const ids=new Set(v.map(x=>x.id));
      if(k==="teams"&&S.cands.some(c=>!ids.has(c.team)))return;
      if(k==="cats"&&(S.cands.some(c=>!ids.has(c.cat))||S.progs.some(p=>!ids.has(p.cat))))return;
      if(k==="stages"&&S.progs.some(p=>!ids.has(p.stage)))return;
      if(k==="subs"&&S.progs.some(p=>!ids.has(p.sf)))return;
      S.cfg[k]=v.map(x=>{const o={id:sid(x.id).slice(0,12)||"x",name:String(x.name).trim().slice(0,40)};if(k==="teams")o.color=/^#[0-9a-fA-F]{6}$/.test(x.color)?x.color:TEAMCOL[0];if(k==="cats")o.base=Math.max(0,Math.min(99000,Math.round(+x.base||0)));return o});
      addLog(S,m,`Settings updated: ${({teams:"teams",cats:"categories",stages:"stages",subs:"sub-fests"})[k]}`)}
    else if(k==="sched"){const d=+v.days,st=+v.start,en=+v.end,sl=+v.slot;if(!(d>=1&&d<=7&&st>=0&&en>st&&en<=1440&&[10,15,20,30,45,60,90].includes(sl)))return;Object.assign(S.cfg,{days:d,start:st,end:en,slot:sl});S.sched.forEach(s=>{if(s.day>d)s.day=d});addLog(S,m,"Schedule settings updated")}
    else if(k==="pts"){const n=x=>Math.round(+x);const p=Array.isArray(v.p)?v.p.slice(0,3).map(n):[];const g={A:n(v.g&&v.g.A),B:n(v.g&&v.g.B),C:n(v.g&&v.g.C)};const c={A:+(v.cut&&v.cut.A),B:+(v.cut&&v.cut.B),C:+(v.cut&&v.cut.C)};
      if(p.length!==3||![...p,g.A,g.B,g.C].every(x=>x>=0&&x<=100)||!(c.A<=100&&c.A>c.B&&c.B>c.C&&c.C>=0))return;S.cfg.pts={p,g,cut:c};addLog(S,m,"Points and grades updated")}
    else if(k==="limit"){const n=Math.round(+v);if(n>=1&&n<=20){S.cfg.limit=n;addLog(S,m,`Programme limit set to ${n}`)}}},
  reg(S,a,m){a.id=sid(a.id);const name=String(a.name||"").trim().slice(0,60);if(!name||!a.id||cOf(S,a.id))return;
    const team=m.role==="team"?m.team:a.team;if(!S.cfg.teams.some(t=>t.id===team)||!S.cfg.cats.some(c=>c.id===a.cat)||!canReg(S,m,team))return;
    const c={id:a.id,name,team,cat:a.cat,skills:(a.skills||[]).map(String).slice(0,8),chest:nextChest(S,a.cat)};S.cands.push(c);
    addLog(S,m,`${name} registered (${c.chest})`);if(m.role==="team")addNote(S,m,a.id+"n",`${teamName(S,team)}: ${name} registered`,"admin")},
  bulk(S,a,m){if(!ADM(m))return;let k=0;(a.rows||[]).forEach(r=>{r.id=sid(r.id);const name=String(r.name||"").trim().slice(0,60);if(!name||!r.id||cOf(S,r.id))return;
    if(!S.cfg.teams.some(t=>t.id===r.team)||!S.cfg.cats.some(c=>c.id===r.cat))return;S.cands.push({id:r.id,name,team:r.team,cat:r.cat,skills:[],chest:nextChest(S,r.cat)});k++});
    if(k)addLog(S,m,`${k} candidates added in bulk`)},
  editCand(S,a,m){const c=cOf(S,a.id);if(!c||!canReg(S,m,c.team))return;const name=String(a.name||"").trim().slice(0,60);if(name)c.name=name;if(Array.isArray(a.skills))c.skills=a.skills.map(String).slice(0,8);addLog(S,m,`${c.name}: details updated`)},
  delCand(S,a,m){const c=cOf(S,a.id);if(!c||!canReg(S,m,c.team))return;if(S.progs.some(p=>p.parts.includes(c.id)&&(p.status!=="pending"||marked(p))))return;
    S.progs.forEach(p=>{p.parts=p.parts.filter(x=>x!==c.id);delete p.topics[c.id]});S.cands=S.cands.filter(x=>x.id!==c.id);addLog(S,m,`${c.name} (${c.chest}) removed`)},
  enroll(S,a,m){const c=cOf(S,a.cid);if(!c||!canReg(S,m,c.team))return;const pids=(a.pids||[]).map(String);if(enrollError(S,c,pids))return;
    S.progs.forEach(p=>{if(p.cat!==c.cat||p.status!=="pending"||marked(p))return;const want=pids.includes(p.id),has=p.parts.includes(c.id);
      if(want&&!has)p.parts.push(c.id);if(!want&&has){p.parts=p.parts.filter(x=>x!==c.id);delete p.topics[c.id]}});addLog(S,m,`${c.name}: programmes updated`)},
  sub(S,a,m,op){const p=pOf(S,a.pid),o=cOf(S,a.out),n=cOf(S,a.in);if(!p||!o||!n||p.status!=="pending"||marked(p))return;
    if(!p.parts.includes(o.id)||p.parts.includes(n.id)||n.cat!==p.cat||n.team!==o.team||!canReg(S,m,o.team))return;
    const sl=slotOfS(S,p.id);if(sl&&S.progs.some(q=>q.id!==p.id&&q.parts.includes(n.id)&&(s2=>s2&&skey(s2)===skey(sl))(slotOfS(S,q.id))))return;
    p.parts=p.parts.map(x=>x===o.id?n.id:x);if(p.topics[o.id]){p.topics[n.id]=p.topics[o.id];delete p.topics[o.id]}
    addLog(S,m,`${p.n}: ${n.name} replaces ${o.name}`);if(!ADM(m))addNote(S,m,op.cid,`${p.n}: ${n.name} replaces ${o.name}`,"admin")},
  topics(S,a,m){(a.list||[]).forEach(x=>{const p=pOf(S,x.pid),c=cOf(S,x.cid);if(!p||!c||!p.topic||!p.parts.includes(c.id)||!canReg(S,m,c.team))return;
    const v=String(x.topic||"").trim().slice(0,120);if(v)p.topics[c.id]=v;else delete p.topics[c.id]})},
  addProg(S,a,m){if(!ADM(m))return;a.id=sid(a.id);const n=String(a.n||"").trim().slice(0,60);if(!n||!a.id||pOf(S,a.id))return;
    if(!S.cfg.cats.some(c=>c.id===a.cat)||!S.cfg.stages.some(s=>s.id===a.stage)||!S.cfg.subs.some(s=>s.id===a.sf))return;
    const p={id:a.id,n,cat:a.cat,sf:a.sf,stage:a.stage,topic:!!a.topic,judges:(a.judges||[]).map(sid).filter(Boolean).slice(0,7),parts:[],marks:{},subm:{},topics:{},status:"pending"};
    S.progs.push(p);placeOne(S,p);addLog(S,m,`Programme added: ${n}`)},
  editProg(S,a,m){if(!ADM(m))return;const p=pOf(S,a.id);if(!p)return;const n=String(a.n||"").trim().slice(0,60);if(n)p.n=n;
    if(a.stage&&a.stage!==p.stage&&S.cfg.stages.some(s=>s.id===a.stage)){p.stage=a.stage;const sl=slotOfS(S,p.id);if(sl)sl.stage=a.stage}
    if(a.sf&&S.cfg.subs.some(s=>s.id===a.sf))p.sf=a.sf;
    if(typeof a.topic==="boolean")p.topic=a.topic;
    if(Array.isArray(a.judges)&&p.status==="pending"){const js=a.judges.map(sid).filter(Boolean).filter(j=>j!=="adm").slice(0,7);if(p.judges.includes("adm"))js.push("adm");p.judges.filter(j=>!js.includes(j)).forEach(j=>{delete p.marks[j];delete p.subm[j]});p.judges=js;if(js.length&&js.every(j=>p.subm[j]))p.status="scored"}
    addLog(S,m,`Programme updated: ${p.n}`)},
  delProg(S,a,m){if(!ADM(m))return;const p=pOf(S,a.id);if(!p||marked(p)||p.status!=="pending")return;
    S.progs=S.progs.filter(x=>x.id!==p.id);S.sched=S.sched.filter(s=>s.pid!==p.id);S.appeals=S.appeals.filter(x=>x.pid!==p.id);addLog(S,m,`Programme removed: ${p.n}`)},
  autoSched(S,a,m){if(!ADM(m))return;autoPlace(S);addLog(S,m,"Schedule built automatically")},
  setTime(S,a,m){if(!ADM(m))return;const s=slotOfS(S,a.pid);if(!s)return;const t=Math.round(+a.t);if(!(t>=0&&t<1440))return;s.day=Math.min(S.cfg.days,Math.max(1,Math.round(+a.day)||1));s.t=t},
  marks(S,a,m,op){const p=pOf(S,a.pid);if(!p||p.status!=="pending"||!p.parts.length)return;let j="";
    if(m.role==="judge"){j=m.u;if(!p.judges.includes(j))return}else if(ADM(m)){j=sid(a.j);if(!j||(j!=="adm"&&!p.judges.includes(j))||(j==="adm"&&!p.judges.includes("adm")&&p.judges.length))return}else return;
    if(p.subm[j])return;const mk={};for(const cid of p.parts){const v=Number((a.marks||{})[cid]);if(!(v>=0&&v<=100))return;mk[cid]=Math.round(v*10)/10}
    if(j==="adm"&&!p.judges.includes("adm"))p.judges.push("adm");
    p.marks[j]=mk;p.subm[j]=true;addLog(S,m,m.role==="judge"?`${p.n}: ${m.name||m.u} submitted marks`:`${p.n}: marks entered by ${m.name||"admin"}${j==="adm"?"":" for a judge"}`);
    if(p.judges.every(j=>p.subm[j])){p.status="scored";addNote(S,m,op.cid,`${p.n}: all judges have submitted. Please verify.`,"admin")}},
  verify(S,a,m){if(!ADM(m))return;const p=pOf(S,a.pid);if(p&&p.status==="scored"){p.status="verified";addLog(S,m,`${p.n}: scores verified`)}},
  rescore(S,a,m,op){if(!ADM(m))return;const p=pOf(S,a.pid);if(!p||p.status==="published")return;p.subm={};p.status="pending";addNote(S,m,op.cid,`${p.n}: please enter your marks again`,"judge");addLog(S,m,`${p.n}: sent back to judges`)},
  publish(S,a,m,op){if(!ADM(m))return;(a.pids||[]).forEach((pid,i)=>{const p=pOf(S,pid);if(!p||p.status!=="verified")return;p.status="published";p.pubT=m.t;addLog(S,m,`${p.n} result published`);
    const w=calcS(S,p)[0];if(w){const c=cOf(S,w.cid);if(c)addNote(S,m,op.cid+"_"+i,`${p.n} result: 1st place ${c.name} (${teamName(S,c.team)})`)}})},
  unpublish(S,a,m,op){if(!ADM(m)||S.locks.results)return;const p=pOf(S,a.pid);if(p&&p.status==="published"){p.status="verified";addLog(S,m,`${p.n}: result withdrawn`);addNote(S,m,op.cid,`${p.n}: result temporarily withdrawn`)}},
  appeal(S,a,m,op){const p=pOf(S,a.pid);if(!p||p.status!=="published"||m.role!=="team"||!a.id||S.appeals.some(x=>x.id===a.id))return;
    if(!p.parts.some(c=>(cOf(S,c)||{}).team===m.team))return;const reason=String(a.reason||"").trim().slice(0,500);if(!reason)return;
    S.appeals.unshift({id:sid(a.id),pid:p.id,team:m.team,reason,status:"pending",t:m.t});addNote(S,m,op.cid,`${p.n}: appeal received from team ${teamName(S,m.team)}`,"admin");addLog(S,m,`Team ${teamName(S,m.team)} filed an appeal`)},
  decide(S,a,m,op){if(!ADM(m))return;const x=S.appeals.find(y=>y.id===a.id);if(!x||x.status!=="pending")return;x.status=a.ok?"accepted":"rejected";const p=pOf(S,x.pid);
    if(a.ok&&p&&p.status==="published")p.status="scored";addNote(S,m,op.cid,`${p?p.n:"Appeal"}: appeal ${a.ok?"accepted, result under review":"rejected"}`,x.team);addLog(S,m,`${p?p.n+": ":""}appeal ${a.ok?"accepted":"rejected"}`)},
  news(S,a,m){if(!ADM(m))return;const txt=String(a.txt||"").trim().slice(0,300);if(txt&&sid(a.id))S.news.unshift({id:sid(a.id),t:m.t,txt})},
  delNews(S,a,m){if(ADM(m))S.news=S.news.filter(x=>x.id!==a.id)},
  notify(S,a,m,op){if(!ADM(m))return;const txt=String(a.txt||"").trim().slice(0,300);if(txt)addNote(S,m,op.cid,txt,String(a.to||"all"))},
  photo(S,a,m){if(!ADM(m)||!sid(a.id)||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(a.src||"")||a.src.length>420000||S.gallery.length>=40)return;S.gallery.unshift({id:sid(a.id),cap:String(a.cap||"").slice(0,80),src:a.src})},
  delPhoto(S,a,m){if(ADM(m))S.gallery=S.gallery.filter(x=>x.id!==a.id)},
  link(S,a,m){if(!ADM(m)||!sid(a.id)||!/^https?:\/\/[^\s"'<>]+$/i.test(a.url||""))return;S.links.unshift({id:sid(a.id),t:String(a.t||"").trim().slice(0,80)||String(a.url).slice(0,80),url:String(a.url).slice(0,500)})},
  delLink(S,a,m){if(ADM(m))S.links=S.links.filter(x=>x.id!==a.id)},
  site(S,a,m){if(!ADM(m))return;const s=S.site;if(a.title!=null)s.title=String(a.title).trim().slice(0,80)||S.name;if(a.tag!=null)s.tag=String(a.tag).trim().slice(0,120);
    if(a.color!=null&&COLORS[a.color])s.color=+a.color;if(a.sec)Object.keys(s.sec).forEach(k=>{if(a.sec[k]!=null)s.sec[k]=a.sec[k]?1:0});addLog(S,m,"Website settings updated")},
  lock(S,a,m,op){if(!ADM(m)||!["reg","results","fest"].includes(a.k))return;S.locks[a.k]=!!a.v;addLog(S,m,`${LKNAME[a.k]} ${a.v?"on":"off"}`);
    if(a.k==="fest")addNote(S,m,op.cid,a.v?"The fest is now locked and read-only.":"The fest has been unlocked.");if(a.k==="reg"&&a.v)addNote(S,m,op.cid,"Registration is now closed","team")},
  regDate(S,a,m){if(!ADM(m))return;const d=String(a.d||"");if(d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))return;S.locks.regDate=d;addLog(S,m,"Registration closing date: "+(d||"none"))},
  pub(S,a,m){if(!ADM(m)||!PUBNAME[a.mode])return;S.locks.pub=a.mode;addLog(S,m,"Public site: "+PUBNAME[a.mode])},
  teamLock(S,a,m,op){if(!ADM(m))return;S.locks.teams=!!a.v;addLog(S,m,`Team leader login ${a.v?"closed":"opened"}`);if(a.v)addNote(S,m,op.cid,"Team leader access is closed for now.","team")},
  candPhoto(S,a,m){const c=cOf(S,a.id);if(!c||!canReg(S,m,c.team))return;const img=String(a.img||"");if(img&&!(/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(img)&&img.length<=20000))return;c.photo=img;addLog(S,m,`${c.name}: photo ${img?"added":"removed"}`)},
  brand(S,a,m){if(!ADM(m))return;if(!S.brand)S.brand={color:"",logo:""};if(a.inst!=null)S.brand.inst=String(a.inst).trim().slice(0,80);if(a.color!=null){const c=String(a.color);if(c===""||/^#[0-9a-fA-F]{6}$/.test(c))S.brand.color=c.toUpperCase()}
    if(a.logo!=null){const l=String(a.logo);if(l===""||safeLogo(l))S.brand.logo=l}addLog(S,m,"Fest logo and colour updated")},
  tpl(S,a,m){if(!ADM(m))return;if(a.cert!=null)S.tpl.cert=Math.abs(+a.cert)%4;if(a.poster!=null)S.tpl.poster=Math.abs(+a.poster)%3}
};
export function apply(S,op){const f=R[op.type];if(!f)return;if(S.locks.fest&&!(op.type==="lock"&&op.a&&op.a.k==="fest"))return;try{f(S,op.a||{},op.m||{},op)}catch(e){console.warn("Festora: op failed",op.type,e)}}


