// @ts-nocheck
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { pool } from "../src/db/client";
import { env, allowedOrigins } from "../src/lib/env";
import { sendMail, mailConfigured } from "../src/lib/mail";
import { apply, blankFest, ADMIN_ROLES } from "../src/domain/reducer";

const actions = new Set(["accounts","addCoupon","addUser","ask","buy","checkPay","claimPay","couponLogin","coupons","createFest","deleteFest","deleteUser","festInfo","fests","hit","login","logout","myPlan","organisers","ownerStats","public","pull","push","redeem","reviewPay","sendOtp","setAccount","setCode","setCoupon","setPassword","setSignup","signup","users"]);
const text = (v:any, max=200) => String(v ?? "").trim().slice(0,max);
const hash = (v:string) => createHash("sha256").update(v).digest("hex");
const otpHash = (email:string, code:string) => createHmac("sha256", env.AUTH_SECRET || "missing-secret").update(email+":"+code).digest("hex");
const passwordHash = (password:string) => { const salt=randomBytes(16); const derived=scryptSync(password,salt,64); return "scrypt$"+salt.toString("hex")+"$"+derived.toString("hex"); };
const passwordOK = (password:string, stored:string) => { try { const [,salt,expected]=stored.split("$"); const actual=scryptSync(password,Buffer.from(salt,"hex"),64); return timingSafeEqual(actual,Buffer.from(expected,"hex")); } catch { return false; } };
const userView = (u:any, membership:any=null) => ({ id:u.id, u:u.username, name:membership?.display_name || u.display_name || u.username, role:membership?.role || u.role, team:membership?.team_id || "", email:u.email || "" });
const send = (res:VercelResponse,status:number,data:any) => res.status(status).json(data);
const fail = (status:number,message:string) => Object.assign(new Error(message),{status});
const jsonClone = (v:any) => JSON.parse(JSON.stringify(v));
const addMonths = (date:Date, months:number) => { const d=new Date(date); d.setMonth(d.getMonth()+months); return d; };

async function transaction<T>(fn:(client:any)=>Promise<T>):Promise<T> {
 const client=await pool.connect();
 try { await client.query("BEGIN"); const out=await fn(client); await client.query("COMMIT"); return out; }
 catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
async function actorFor(token:string, client:any=pool) {
 if(!token) throw fail(401,"AUTH");
 const r=await client.query(`SELECT u.*, s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() LIMIT 1`,[hash(token)]);
 const u=r.rows[0]; if(!u || !u.is_active || u.account_locked_at) throw fail(401,"AUTH");
 return u;
}
async function membershipFor(fest:string,userId:string,client:any=pool) {
 const r=await client.query("SELECT * FROM festival_memberships WHERE festival_id=$1 AND user_id=$2 AND is_active=true LIMIT 1",[fest,userId]);
 if(!r.rows[0]) throw fail(403,"You do not have access to this festival.");
 return r.rows[0];
}
async function createSession(userId:string,client:any=pool) {
 const token=randomBytes(32).toString("base64url");
 await client.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 days')",[userId,hash(token)]);
 return token;
}
async function getPlan(userId:string,fest?:string,client:any=pool) {
 const r=await client.query("SELECT s.*,p.name AS plan_name FROM subscriptions s LEFT JOIN plans p ON p.code=s.plan_code WHERE s.user_id=$1 AND ($2::uuid IS NULL OR s.trial_festival_id=$2 OR (s.trial_festival_id IS NULL AND s.plan_code<>'free')) ORDER BY CASE WHEN s.plan_code='free' THEN 1 ELSE 0 END,s.created_at DESC LIMIT 1",[userId,fest||null]);
 let sub=r.rows[0];
 if(!sub && fest) {
  const previousTrial=await client.query("SELECT * FROM subscriptions WHERE user_id=$1 AND source='trial' ORDER BY created_at LIMIT 1",[userId]);
  if(previousTrial.rows[0]) return {tier:"expired",ends:previousTrial.rows[0].ends_at,maxStudents:40,paid:false,locked:false,everPaid:false,paidUntil:previousTrial.rows[0].ends_at};
 }
 if(!sub) return {tier:"free",ends:new Date(Date.now()+299*3600000).toISOString(),maxStudents:40,paid:false,locked:false,everPaid:false,paidUntil:null};
 if(sub.status==="locked") return {tier:"locked",ends:sub.ends_at,maxStudents:40,paid:false,locked:true,everPaid:false,paidUntil:sub.ends_at};
 if(["expired","cancelled","past_due"].includes(sub.status) || (sub.ends_at && new Date(sub.ends_at).getTime()<Date.now())) return {tier:"expired",ends:sub.ends_at,maxStudents:40,paid:false,locked:false,everPaid:sub.plan_code!=="free",paidUntil:sub.ends_at};
 const tier=sub.plan_code==="free"?"free":"paid";
 return {tier,ends:sub.ends_at?new Date(sub.ends_at).toISOString():null,maxStudents:tier==="free"?40:999999,plan:sub.plan_code||"free",paid:tier==="paid",locked:false,everPaid:tier==="paid",paidUntil:sub.ends_at?new Date(sub.ends_at).toISOString():null};
}
async function userFests(user:any,client:any=pool) {
 const r=await client.query(`SELECT f.id,f.name,f.status,f.institution,f.created_at,m.role,m.team_id
 FROM festivals f JOIN festival_memberships m ON m.festival_id=f.id
 WHERE m.user_id=$1 AND m.is_active=true AND f.status<>'deleted' ORDER BY f.created_at DESC`,[user.id]);
 return r.rows.map((f:any)=>({id:f.id,name:f.name,role:f.role,team:f.team_id||"",institution:f.institution||""}));
}
async function adminForFest(user:any,fest:string,client:any=pool) {
 const m=await membershipFor(fest,user.id,client);
 if(!ADMIN_ROLES.has(m.role)) throw fail(403,"Administrator access is required.");
 return m;
}
async function requireOwner(user:any) { if(user.role!=="owner") throw fail(403,"Platform owner access is required."); }
async function loadUsers(fest:string,client:any=pool) {
 const r=await client.query(`SELECT u.id,u.username,u.display_name,m.role,m.team_id
 FROM festival_memberships m JOIN users u ON u.id=m.user_id
 WHERE m.festival_id=$1 AND m.is_active=true ORDER BY m.created_at`,[fest]);
 return r.rows.map((u:any)=>({u:u.username,role:u.role,name:u.display_name||u.username,team:u.team_id||""}));
}
async function loadOps(fest:string,since:number,client:any=pool) {
 const r=await client.query(`SELECT festival_seq AS seq,operation,client_id,actor_role,actor_team_id,created_at
 FROM operation_log WHERE festival_id=$1 AND festival_seq>$2 ORDER BY festival_seq ASC LIMIT 1000`,[fest,since]);
 return r.rows.map((row:any)=>({...row.operation,seq:Number(row.seq)}));
}
async function festivalRow(fest:string,client:any=pool) {
 const r=await client.query("SELECT * FROM festivals WHERE id=$1 AND status<>'deleted'",[fest]);
 if(!r.rows[0]) throw fail(404,"Festival not found.");
 return r.rows[0];
}
async function createTrial(userId:string,fest:string,client:any) {
 await client.query(`INSERT INTO subscriptions(user_id,plan_code,status,starts_at,ends_at,trial_festival_id,source)
 VALUES($1,'free','active',now(),now()+interval '299 hours',$2,'trial')`,[userId,fest]);
}
async function refreshCoupons(client:any=pool) {
 const r=await client.query(`SELECT c.code,c.label,c.duration_months AS months,c.is_active AS active,
 (SELECT count(*)::int FROM coupon_redemptions cr WHERE cr.coupon_code=c.code) AS "usedBy",
 (SELECT min(first_redeemed_at) FROM coupon_redemptions cr WHERE cr.coupon_code=c.code) AS "firstUsed",
 c.expires_at AS until,NULL::int AS fests FROM coupons c ORDER BY c.created_at DESC`);
 return {coupons:r.rows};
}
async function ownerAccounts(client:any=pool) {
 const users=await client.query(`SELECT u.id,u.username AS u,u.display_name AS name,u.email,u.phone,u.institution AS inst,u.account_locked_at
 FROM users u ORDER BY u.created_at DESC`);
 const payments=await client.query(`SELECT p.public_ref AS ref,p.created_at AS created,p.paid_at AS "paidAt",u.username AS account,p.plan_code AS plan,
 (p.amount_minor::numeric/100)::float AS amount,p.utr,p.status FROM payments p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 300`);
 const accounts=[];
 for(const u of users.rows){
  const f=await client.query(`SELECT f.name,s.plan_code AS tier,s.ends_at AS ends,
  (SELECT count(*)::int FROM festival_memberships m2 WHERE m2.festival_id=f.id AND m2.is_active) AS logins
  FROM festivals f JOIN festival_memberships m ON m.festival_id=f.id
  LEFT JOIN subscriptions s ON s.trial_festival_id=f.id
  WHERE m.user_id=$1 AND f.status<>'deleted'`,[u.id]);
  accounts.push({id:u.id,u:u.u,name:u.name||u.u,inst:u.inst||"",phone:u.phone||"",email:u.email||"",fests:f.rows,paid:null,trial:null,locked:!!u.account_locked_at});
 }
 return {accounts,payments:payments.rows};
}

async function syncFestivalRelations(c:any,fest:string,state:any,actorId:string) {
 const q=async(sql:string,values:any[]=[])=>c.query(sql,values);
 // Remove dependent projection rows first; the operation log and JSON snapshot remain immutable.
 for(const table of ["festival_gallery_assets","festival_links","festival_notifications","festival_announcements","programme_appeals","programme_schedule","judge_marks","judge_submissions","programme_judges","programme_participants","programmes","candidates"]) {
  await q("DELETE FROM "+table+" WHERE festival_id=$1",[fest]);
 }
 // Configuration rows are updated in place so membership foreign keys remain valid.
 const cfg=state.cfg||{},teams=Array.isArray(cfg.teams)?cfg.teams:[],cats=Array.isArray(cfg.cats)?cfg.cats:[],stages=Array.isArray(cfg.stages)?cfg.stages:[],subs=Array.isArray(cfg.subs)?cfg.subs:[];
 for(let i=0;i<teams.length;i++) await q("INSERT INTO festival_teams(festival_id,id,name,sort_order,is_active,color) VALUES($1,$2,$3,$4,true,$5) ON CONFLICT(festival_id,id) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,is_active=true,color=EXCLUDED.color",[fest,String(teams[i].id),String(teams[i].name||"Team").slice(0,80),i,teams[i].color||null]);
 for(let i=0;i<cats.length;i++) await q("INSERT INTO festival_categories(festival_id,id,name,sort_order,metadata) VALUES($1,$2,$3,$4,$5) ON CONFLICT(festival_id,id) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,metadata=EXCLUDED.metadata",[fest,String(cats[i].id),String(cats[i].name||"Category").slice(0,80),i,JSON.stringify({base:Number(cats[i].base)||0})]);
 for(let i=0;i<stages.length;i++) await q("INSERT INTO festival_stages(festival_id,id,name,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(festival_id,id) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order",[fest,String(stages[i].id),String(stages[i].name||"Stage").slice(0,80),i]);
 for(let i=0;i<subs.length;i++) await q("INSERT INTO festival_subfestivals(festival_id,id,name,sort_order) VALUES($1,$2,$3,$4) ON CONFLICT(festival_id,id) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order",[fest,String(subs[i].id),String(subs[i].name||"Sub-festival").slice(0,80),i]);
 const teamIds=teams.map((x:any)=>String(x.id));
 await q("UPDATE festival_memberships SET team_id=NULL WHERE festival_id=$1 AND team_id IS NOT NULL AND NOT(team_id=ANY($2::text[]))",[fest,teamIds]);
 await q("DELETE FROM festival_teams WHERE festival_id=$1 AND NOT(id=ANY($2::text[]))",[fest,teamIds]);
 await q("DELETE FROM festival_categories WHERE festival_id=$1 AND NOT(id=ANY($2::text[]))",[fest,cats.map((x:any)=>String(x.id))]);
 await q("DELETE FROM festival_stages WHERE festival_id=$1 AND NOT(id=ANY($2::text[]))",[fest,stages.map((x:any)=>String(x.id))]);
 await q("DELETE FROM festival_subfestivals WHERE festival_id=$1 AND NOT(id=ANY($2::text[]))",[fest,subs.map((x:any)=>String(x.id))]);
 const memberships=await q("SELECT u.username,m.user_id FROM festival_memberships m JOIN users u ON u.id=m.user_id WHERE m.festival_id=$1 AND m.is_active=true",[fest]);
 const judgeIds=new Map(memberships.rows.map((x:any)=>[x.username,x.user_id]));
 const candidates=Array.isArray(state.cands)?state.cands:[];
 for(const x of candidates) await q("INSERT INTO candidates(festival_id,id,name,team_id,category_id,skills,legacy_photo_data,chest_number,metadata,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)",[fest,String(x.id),String(x.name||"Candidate").slice(0,60),String(x.team),String(x.cat),JSON.stringify(Array.isArray(x.skills)?x.skills:[]),typeof x.photo==="string"&&x.photo.startsWith("data:image/")?x.photo:null,Number(x.chest)||null,JSON.stringify({}),actorId]);
 const programmes=Array.isArray(state.progs)?state.progs:[];
 for(const p of programmes) {
  await q("INSERT INTO programmes(festival_id,id,name,category_id,stage_id,subfestival_id,topics_enabled,status,result_published_at,metadata,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)",[fest,String(p.id),String(p.n||"Programme").slice(0,60),String(p.cat),String(p.stage),p.sf?String(p.sf):null,!!p.topic,String(p.status||"pending"),p.pubT?new Date(Number(p.pubT)):null,JSON.stringify({judges:p.judges||[],judgeUsers:p.judgeUsers||{}}),actorId]);
  const parts=Array.isArray(p.parts)?p.parts:[];
  for(let i=0;i<parts.length;i++) await q("INSERT INTO programme_participants(festival_id,programme_id,candidate_id,topic,sort_order) VALUES($1,$2,$3,$4,$5)",[fest,String(p.id),String(parts[i]),p.topics?.[parts[i]]||null,i]);
  const judges=Array.isArray(p.judges)?p.judges:[];
  for(const j of judges) {
   const judgeName=String(p.judgeUsers?.[j]||j);const uid=judgeIds.get(judgeName);if(!uid)continue;
   await q("INSERT INTO programme_judges(festival_id,programme_id,judge_user_id,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[fest,String(p.id),uid,actorId]);
   if(p.subm?.[j]) {
    await q("INSERT INTO judge_submissions(festival_id,programme_id,judge_user_id,submitted_by) VALUES($1,$2,$3,$4) ON CONFLICT(festival_id,programme_id,judge_user_id) DO UPDATE SET submitted_at=now(),submitted_by=EXCLUDED.submitted_by,revision=judge_submissions.revision+1",[fest,String(p.id),uid,actorId]);
    const marks=p.marks?.[j]||{};
    for(const [cid,score] of Object.entries(marks)) if(parts.includes(cid)) await q("INSERT INTO judge_marks(festival_id,programme_id,judge_user_id,candidate_id,score) VALUES($1,$2,$3,$4,$5) ON CONFLICT(festival_id,programme_id,judge_user_id,candidate_id) DO UPDATE SET score=EXCLUDED.score,updated_at=now()",[fest,String(p.id),uid,String(cid),Number(score)]);
   }
  }
 }
 const sched=Array.isArray(state.sched)?state.sched:[];
 for(const x of sched) if(programmes.some((p:any)=>String(p.id)===String(x.pid))&&stages.some((v:any)=>String(v.id)===String(x.stage))) await q("INSERT INTO programme_schedule(festival_id,programme_id,stage_id,day_number,start_minute,duration_minutes,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(festival_id,programme_id) DO UPDATE SET stage_id=EXCLUDED.stage_id,day_number=EXCLUDED.day_number,start_minute=EXCLUDED.start_minute,duration_minutes=EXCLUDED.duration_minutes,updated_by=EXCLUDED.updated_by,updated_at=now()",[fest,String(x.pid),String(x.stage),Math.max(1,Math.min(7,Number(x.day)||1)),Math.max(0,Math.min(1439,Number(x.t)||0)),Math.max(1,Math.min(1440,Number(cfg.slot)||30)),actorId]);
 const appeals=Array.isArray(state.appeals)?state.appeals:[];
 for(const x of appeals) {
  const p=programmes.find((v:any)=>String(v.id)===String(x.pid));if(!p)continue;
  const candidate=candidates.find((v:any)=>p.parts?.includes(v.id)&&String(v.team)===String(x.team));if(!candidate)continue;
  const submitter=memberships.rows.find((v:any)=>String(v.username)===String(x.by||""))?.user_id||null;
  const decider=memberships.rows.find((v:any)=>String(v.username)===String(x.decidedBy||""))?.user_id||null;
  await q("INSERT INTO programme_appeals(festival_id,id,programme_id,candidate_id,team_id,reason,status,submitted_by,decided_by,decision_note,decided_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(festival_id,id) DO UPDATE SET reason=EXCLUDED.reason,status=EXCLUDED.status,decided_by=EXCLUDED.decided_by,decision_note=EXCLUDED.decision_note,decided_at=EXCLUDED.decided_at",[fest,String(x.id),String(x.pid),String(candidate.id),String(x.team),String(x.reason||"Appeal").slice(0,500),["pending","accepted","rejected"].includes(x.status)?x.status:"pending",submitter,decider,x.decisionNote||null,x.decidedBy?new Date():null]);
 }
 for(const x of (state.news||[])) await q("INSERT INTO festival_announcements(festival_id,id,body,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(festival_id,id) DO UPDATE SET body=EXCLUDED.body",[fest,String(x.id),String(x.txt||"").slice(0,300),actorId]);
 for(const x of (state.notifs||[])) await q("INSERT INTO festival_notifications(festival_id,id,body,recipient,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(festival_id,id) DO UPDATE SET body=EXCLUDED.body,recipient=EXCLUDED.recipient",[fest,String(x.id),String(x.txt||"").slice(0,300),String(x.to||"all"),actorId]);
 for(const x of (state.gallery||[])) {
  const src=String(x.src||"");if(!src)continue;
  const mime=src.startsWith("data:image/png")?"image/png":src.startsWith("data:image/webp")?"image/webp":"image/jpeg";
  await q("INSERT INTO festival_gallery_assets(festival_id,id,source_url,caption,mime_type,byte_size,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(festival_id,id) DO UPDATE SET source_url=EXCLUDED.source_url,caption=EXCLUDED.caption,mime_type=EXCLUDED.mime_type,byte_size=EXCLUDED.byte_size",[fest,String(x.id),src,String(x.cap||"").slice(0,80),mime,Math.floor(src.length*0.75),actorId]);
 }
 for(const x of (state.links||[])) await q("INSERT INTO festival_links(festival_id,id,title,url,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(festival_id,id) DO UPDATE SET title=EXCLUDED.title,url=EXCLUDED.url",[fest,String(x.id),String(x.t||x.url||"Link").slice(0,80),String(x.url||"").slice(0,500),actorId]);
 const locks=state.locks||{},brand=state.brand||{},site=state.site||{};
 await q("UPDATE festivals SET public_mode=$2,registration_locked=$3,registration_closes_on=$4,results_locked=$5,team_login_locked=$6,brand_color=$7,logo_url=$8,settings=$9,updated_at=now() WHERE id=$1",[fest,["open","results","code","closed"].includes(locks.pub)?locks.pub:"open",!!locks.reg,locks.regDate||null,!!locks.results,!!locks.teams,brand.color||null,brand.logo||null,JSON.stringify({cfg:cfg,site:site,brand:{...brand,logo:brand.logo?"[stored in festival snapshot]":""},locks:{...locks,fest:!!locks.fest},tpl:state.tpl||{}})]);
}

async function dispatch(body:any,req:VercelRequest) {
 const action=body.action, token=text(body.token,500);
 if(action==="sendOtp") {
  const email=text(body.email,254).toLowerCase();
  const signupSetting=await pool.query("SELECT value FROM platform_settings WHERE key='signup_open'");
  if(signupSetting.rows[0]?.value===false) throw fail(403,"New account registration is currently closed.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400,"Enter a valid email address.");
  const existingEmail=await pool.query("SELECT 1 FROM users WHERE lower(email)=lower($1) LIMIT 1",[email]);
  if(existingEmail.rows[0]) throw fail(409,"An account with this email already exists. Please log in instead.");
  if(!mailConfigured() || !env.AUTH_SECRET) throw fail(503,"Email verification is not configured yet. Festora needs its email sender settings before accounts can be created.");
  const recent=await pool.query("SELECT count(*)::int AS n FROM email_otp_challenges WHERE email=$1 AND created_at>now()-interval '15 minutes'",[email]);
  if(recent.rows[0].n>=3) throw fail(429,"Too many verification codes requested. Try again in 15 minutes.");
  const code=String(randomInt(100000,999999));
  await pool.query("INSERT INTO email_otp_challenges(email,code_hash,purpose,expires_at) VALUES($1,$2,'signup',now()+interval '10 minutes')",[email,otpHash(email,code)]);
  const mailSent=await sendMail(email,"Your Festora verification code",`<div style="font-family:Arial,sans-serif"><h2>Verify your Festora account</h2><p>Your verification code is:</p><p style="font-size:30px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>`);
  if(!mailSent) { throw fail(502,"The email provider did not confirm delivery. If a code arrived, you can still enter it; otherwise request a new code."); }
  return {sent:true};
 }
 if(action==="signup") {
  const name=text(body.name,80),inst=text(body.inst,120),phone=text(body.phone,30),place=text(body.place,100),email=text(body.email,254).toLowerCase(),username=text(body.u,30).toLowerCase(),password=String(body.p||""),otp=text(body.otp,6);
  if(!name||!inst||phone.replace(/\D/g,"").length<10||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[a-z0-9_.]{3,30}$/.test(username)||password.length<8||!/^[0-9]{6}$/.test(otp)) throw fail(400,"Check your details. Passwords must be at least 8 characters.");
  if(!env.AUTH_SECRET) throw fail(503,"Authentication is not configured.");
  return transaction(async c=>{
   const challenge=await c.query("SELECT * FROM email_otp_challenges WHERE email=$1 AND purpose='signup' AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[email]);
   if(!challenge.rows[0]) throw fail(400,"That verification code has expired. Request a new one.");
   const ch=challenge.rows[0]; const expected=Buffer.from(ch.code_hash); const actual=Buffer.from(otpHash(email,otp));
   if(ch.attempts>=ch.max_attempts) throw fail(429,"Too many incorrect codes. Request a new one.");
   if(expected.length!==actual.length||!timingSafeEqual(expected,actual)){await c.query("UPDATE email_otp_challenges SET attempts=attempts+1 WHERE id=$1",[ch.id]);throw fail(400,"The verification code is incorrect.");}
   await c.query("SELECT pg_advisory_xact_lock(739281)");
   const signupSetting=await c.query("SELECT value FROM platform_settings WHERE key='signup_open'");
   if(signupSetting.rows[0]?.value===false) throw fail(403,"New account registration is currently closed.");
   const existingEmail=await c.query("SELECT 1 FROM users WHERE lower(email)=lower($1) LIMIT 1",[email]);
   if(existingEmail.rows[0]) throw fail(409,"An account with this email already exists. Please log in instead.");
   const existingUsername=await c.query("SELECT 1 FROM users WHERE lower(username)=lower($1) LIMIT 1",[username]);
   if(existingUsername.rows[0]) throw fail(409,"That username is already taken. Choose another username.");
   const ownerExists=await c.query("SELECT EXISTS(SELECT 1 FROM users WHERE role='owner') AS has_owner");
   const role=ownerExists.rows[0].has_owner?"org":"owner";
   const inserted=await c.query(`INSERT INTO users(username,email,password_hash,display_name,role,phone,institution,place,email_verified_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) RETURNING *`,[username,email,passwordHash(password),name,role,phone,inst,place]);
   const u=inserted.rows[0];
   await c.query("INSERT INTO organiser_profiles(user_id,institution,phone,place,signup_source) VALUES($1,$2,$3,$4,'web')",[u.id,inst,phone,place]);
   await c.query("UPDATE email_otp_challenges SET consumed_at=now() WHERE id=$1",[ch.id]);
   const session=await createSession(u.id,c);
   await c.query("INSERT INTO platform_audit_log(actor_id,action,details) VALUES($1,'signup',jsonb_build_object('role',$2::text))",[u.id,role]);
   return {token:session,user:userView(u)};
  });
 }
 if(action==="login") {
  const identity=text(body.u,254).toLowerCase(), password=String(body.p||"");
  const r=await pool.query("SELECT * FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1) LIMIT 1",[identity]);
  const u=r.rows[0]; if(!u||!u.password_hash||!passwordOK(password,u.password_hash)||!u.is_active||u.account_locked_at) throw fail(401,"Incorrect username or password.");
  let m=null;
  if(body.fest){m=await membershipFor(text(body.fest,80),u.id);const f=await festivalRow(text(body.fest,80));if(m.role==="team"&&f.team_login_locked)throw fail(423,"LOCKED:Team leader login is closed.");}
  const session=await createSession(u.id);
  return {token:session,user:userView(u,m)};
 }
 if(action==="logout") { if(token) await pool.query("UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL",[hash(token)]); return {ok:true}; }
 if(action==="couponLogin") {
  const code=text(body.code,40).toUpperCase();
  if(!code)throw fail(400,"Enter your coupon ID.");
  return transaction(async c=>{
   const q=await c.query("SELECT * FROM coupons WHERE upper(code)=upper($1) AND is_active=true AND (starts_at IS NULL OR starts_at<=now()) AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE",[code]);
   if(!q.rows[0])throw fail(400,"That coupon ID is invalid or expired.");
   const coupon=q.rows[0];
   const found=await c.query("SELECT u.* FROM coupon_redemptions cr JOIN users u ON u.id=cr.user_id WHERE cr.coupon_code=$1 ORDER BY cr.first_redeemed_at LIMIT 1",[coupon.code]);
   let user=found.rows[0];
   if(user&&(!user.is_active||user.account_locked_at))throw fail(403,"This coupon account is locked. Contact Festora support.");
   if(!user){
    const used=await c.query("SELECT count(*)::int AS n FROM coupon_redemptions WHERE coupon_code=$1",[coupon.code]);
    if(coupon.max_redemptions&&used.rows[0].n>=coupon.max_redemptions)throw fail(400,"This coupon has already been used.");
    const username="coupon_"+randomBytes(6).toString("hex");
    const created=await c.query("INSERT INTO users(username,display_name,role,metadata,email_verified_at) VALUES($1,$2,'org',$3,now()) RETURNING *",[username,coupon.label,JSON.stringify({couponLogin:true})]);
    user=created.rows[0];
    const until=addMonths(new Date(),coupon.duration_months);
    await c.query("INSERT INTO coupon_redemptions(coupon_code,user_id,entitlement_until) VALUES($1,$2,$3)",[coupon.code,user.id,until]);
    await c.query("INSERT INTO subscriptions(user_id,plan_code,status,starts_at,ends_at,source) VALUES($1,'coupon','active',now(),$2,'coupon')",[user.id,until]);
   }
   const session=await createSession(user.id,c);
   return {token:session,user:userView(user)};
  });
 }
 if(action==="hit") {
  const k=text(body.k,30),v=text(body.v,80),f=text(body.f,80)||null;
  if(!v||!["home","app","public"].includes(k)) return {ok:true};
  await pool.query("INSERT INTO analytics_visits(visitor_key,page_kind,festival_id) VALUES($1,$2,$3)",[v,k,f]);
  return {ok:true};
 }
 if(action==="ask") return {offline:true,busy:false};
 if(action==="buy"||action==="checkPay") throw fail(503,"Online checkout is not configured yet. Manual UPI claims are available until a payment provider is connected.");
 if(action==="fests"||action==="myPlan") {
  const u=await actorFor(token);
  if(action==="myPlan") {
   const p=await getPlan(u.id), f=await userFests(u);
   const perFestival=[];
   for(const festival of f){const fp=await getPlan(u.id,festival.id);perFestival.push({name:festival.name,tier:fp.tier,ends:fp.ends});}
   const pr=await pool.query("SELECT code,name,duration_months AS months,(amount_minor::numeric/100)::float AS price FROM plans WHERE is_active=true AND code NOT IN ('free','coupon') ORDER BY display_order");
   const pay=await pool.query("SELECT public_ref AS ref,created_at AS created,plan_code AS plan,(amount_minor::numeric/100)::float AS amount,status FROM payments WHERE user_id=$1 ORDER BY created_at DESC",[u.id]);
   const cfg=await pool.query("SELECT key,value FROM platform_settings WHERE key IN ('upi_id','online_payments_enabled')");
   const settings=Object.fromEntries(cfg.rows.map((x:any)=>[x.key,x.value]));
   const plans=Object.fromEntries(pr.rows.map((x:any)=>[x.code,x]));
   return {plan:p,fests:perFestival,plans,upi:settings.upi_id||"",online:settings.online_payments_enabled===true,coupon:!!u.metadata?.couponLogin,trialHours:299,trialStudents:40,payments:pay.rows};
  }
  const fests=await userFests(u);
  const plan=fests.length?await getPlan(u.id,fests[0].id):await getPlan(u.id);
  return {user:userView(u),fests,plan,db:""};
 }
 if(action==="createFest") {
  const u=await actorFor(token); if(!["owner","org"].includes(u.role)) throw fail(403,"Only organisers can create festivals.");
  const name=text(body.name,100); if(name.length<2) throw fail(400,"Festival name must be at least 2 characters.");
  return transaction(async c=>{
   const id=randomUUID(),slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+randomBytes(3).toString("hex");
   const state=blankFest(id,name);
   await c.query("INSERT INTO festivals(id,name,slug,created_by,institution,data,settings) VALUES($1,$2,$3,$4,$5,$6,'{}')",[id,name,slug,u.id,u.institution||null,JSON.stringify(state)]);
   await c.query("INSERT INTO festival_memberships(festival_id,user_id,role,display_name) VALUES($1,$2,'org',$3)",[id,u.id,u.display_name||u.username]);
   await c.query("INSERT INTO festival_counters(festival_id,last_seq) VALUES($1,0)",[id]);
   const existingTrial=await c.query("SELECT 1 FROM subscriptions s JOIN organiser_profiles op ON op.user_id=s.user_id WHERE lower(trim(op.institution))=lower(trim($1)) AND s.source='trial' LIMIT 1",[u.institution||""]);
   const existingPaid=await c.query("SELECT 1 FROM subscriptions WHERE user_id=$1 AND plan_code<>'free' AND status='active' AND (ends_at IS NULL OR ends_at>now()) LIMIT 1",[u.id]);
   if(!existingTrial.rows[0]&&!existingPaid.rows[0]) await createTrial(u.id,id,c);
   await c.query("INSERT INTO platform_audit_log(actor_id,festival_id,action,details) VALUES($1,$2,'festival.create',jsonb_build_object('name',$3::text))",[u.id,id,name]);
   return {fest:{id,name}};
  });
 }
 if(action==="festInfo") {
  const fest=text(body.fest,80);const f=await festivalRow(fest);
  return {name:f.name,color:f.brand_color||"",logo:f.logo_url||"",teamlock:!!f.team_login_locked};
 }
 if(action==="deleteFest") {
  const u=await actorFor(token);const fest=text(body.fest,80);await adminForFest(u,fest);
  await pool.query("UPDATE festivals SET status='deleted',updated_at=now() WHERE id=$1",[fest]);
  return {ok:true};
 }
 if(action==="pull"||action==="push") {
  const u=await actorFor(token),fest=text(body.fest,80);
  if(action==="pull") {
   const m=await membershipFor(fest,u.id);const f=await festivalRow(fest);
   const since=Math.max(0,Number(body.since)||0),ops=await loadOps(fest,since);
   return {ops,seq:ops.length?ops[ops.length-1].seq:since,name:f.name,code:null,plan:await getPlan(u.id,fest)};
  }
  return transaction(async c=>{
   const f=await festivalRow(fest,c);await c.query("SELECT id FROM festivals WHERE id=$1 FOR UPDATE",[fest]);
   const m=await membershipFor(fest,u.id,c);
   const op=body.op||{},type=text(op.type,40),cid=text(op.cid,100),a=op.a&&typeof op.a==="object"?op.a:{};
   if(!type||!cid||!["cfg","reg","bulk","editCand","delCand","enroll","sub","topics","addProg","editProg","delProg","autoSched","setTime","marks","verify","rescore","publish","unpublish","appeal","decide","news","delNews","notify","photo","delPhoto","link","delLink","site","lock","regDate","pub","teamLock","candPhoto","brand","tpl"].includes(type)) throw fail(400,"Unknown festival operation.");
   const dupe=await c.query("SELECT festival_seq AS seq,operation FROM operation_log WHERE festival_id=$1 AND client_id=$2",[fest,cid]);
   if(dupe.rows[0]) return {ops:[{...dupe.rows[0].operation,seq:Number(dupe.rows[0].seq)}],seq:Number(dupe.rows[0].seq)};
   const state=f.data&&Object.keys(f.data).length?jsonClone(f.data):blankFest(fest,f.name);
   const before=JSON.stringify(state), actor={u:u.username,role:m.role,team:m.team_id||"",name:m.display_name||u.display_name||u.username,t:Date.now()};
   const opRecord={type,a,cid,m:actor};
   apply(state,opRecord);
   if(JSON.stringify(state)===before) throw fail(403,"This change is not allowed or its details are invalid.");
   const ctr=await c.query("INSERT INTO festival_counters(festival_id,last_seq) VALUES($1,1) ON CONFLICT(festival_id) DO UPDATE SET last_seq=festival_counters.last_seq+1,updated_at=now() RETURNING last_seq",[fest]);
   const seq=Number(ctr.rows[0].last_seq);
   await c.query("INSERT INTO operation_log(festival_id,actor_id,operation,festival_seq,client_id,operation_type,actor_role,actor_team_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[fest,u.id,JSON.stringify(opRecord),seq,cid,type,m.role,m.team_id||null]);
   await syncFestivalRelations(c,fest,state,u.id);
   await c.query("UPDATE festivals SET data=$2,updated_at=now() WHERE id=$1",[fest,JSON.stringify(state)]);
   return {ops:[{...opRecord,seq}],seq};
  });
 }
 if(action==="public") {
  const fest=text(body.fest,80),f=await festivalRow(fest);
  const mode=f.public_mode||"open";
  if(mode==="closed") return {need:"closed",name:f.name};
  if(mode==="code") {
   const code=text(body.code,30);
   if(!code||!f.public_code_hash||hash(code)!==f.public_code_hash) return {need:true,bad:!!code,name:f.name};
  }
  const since=Math.max(0,Number(body.since)||0),ops=await loadOps(fest,since);
  return {ops,seq:ops.length?ops[ops.length-1].seq:since,name:f.name,pub:mode};
 }
 if(action==="setCode") {
  const u=await actorFor(token),fest=text(body.fest,80),code=text(body.code,20);
  await adminForFest(u,fest);if(code&&!/^[A-Za-z0-9]{4,20}$/.test(code))throw fail(400,"Use 4 to 20 letters or numbers.");
  await pool.query("UPDATE festivals SET public_code_hash=$2,updated_at=now() WHERE id=$1",[fest,code?hash(code):null]);return {ok:true};
 }
 if(action==="users") {
  const u=await actorFor(token),fest=text(body.fest,80);await adminForFest(u,fest);return {users:await loadUsers(fest)};
 }
 if(action==="addUser") {
  const u=await actorFor(token),fest=text(body.fest,80);await adminForFest(u,fest);
  const username=text(body.u,30).toLowerCase(),password=String(body.p||""),role=text(body.role,20),name=text(body.name,80),team=text(body.team,24);
  if(!/^[a-z0-9_.-]{3,30}$/.test(username)||password.length<8||!["admin","team","judge"].includes(role))throw fail(400,"Check the username, password and role.");
  return transaction(async c=>{
   const ins=await c.query("INSERT INTO users(username,password_hash,display_name,role) VALUES($1,$2,$3,$4) RETURNING id",[username,passwordHash(password),name,role]);
   await c.query("INSERT INTO festival_memberships(festival_id,user_id,role,team_id,display_name) VALUES($1,$2,$3,$4,$5)",[fest,ins.rows[0].id,role,team||null,name]);
   return {users:await loadUsers(fest,c)};
  });
 }
 if(action==="deleteUser") {
  const u=await actorFor(token),username=text(body.u,30);
  const target=await pool.query("SELECT tm.festival_id FROM users target JOIN festival_memberships tm ON tm.user_id=target.id AND tm.is_active=true JOIN festival_memberships mine ON mine.festival_id=tm.festival_id AND mine.user_id=$1 AND mine.is_active=true WHERE target.username=$2 AND mine.role IN ('owner','org','admin') ORDER BY tm.created_at LIMIT 1",[u.id,username]);
  if(!target.rows[0]) throw fail(403,"You cannot remove this login from the selected festival.");
  const fest=target.rows[0].festival_id;
  await pool.query("UPDATE festival_memberships SET is_active=false WHERE festival_id=$1 AND user_id=(SELECT id FROM users WHERE username=$2)",[fest,username]);
  return {users:await loadUsers(fest)};
 }
 if(action==="setPassword") {
  const u=await actorFor(token),target=text(body.u,30),next=String(body.p||"");
  if(next.length<8)throw fail(400,"Passwords must be at least 8 characters.");
  if(target===u.username&&body.old) {if(!passwordOK(String(body.old),u.password_hash))throw fail(400,"Your current password is incorrect.");}
  else {
   const allowed=await pool.query("SELECT 1 FROM users target JOIN festival_memberships tm ON tm.user_id=target.id AND tm.is_active=true JOIN festival_memberships mine ON mine.festival_id=tm.festival_id AND mine.user_id=$1 AND mine.is_active=true WHERE target.username=$2 AND mine.role IN ('owner','org','admin') LIMIT 1",[u.id,target]);
   if(!allowed.rows[0])throw fail(403,"You cannot reset this user's password.");
  }
  const changed=await pool.query("UPDATE users SET password_hash=$2,updated_at=now() WHERE username=$1 RETURNING id",[target,passwordHash(next)]);
  if(!changed.rows[0])throw fail(404,"User not found.");
  if(target===u.username) await pool.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL",[changed.rows[0].id,u.session_id]);
  else await pool.query("UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",[changed.rows[0].id]);
  return {ok:true};
 }
 if(action==="claimPay") {
  const u=await actorFor(token),plan=text(body.plan,40),utr=text(body.utr,80);
  if(utr.length<10)throw fail(400,"Enter a valid UPI transaction reference.");
  const p=await pool.query("SELECT * FROM plans WHERE code=$1 AND is_active=true",[plan]);if(!p.rows[0])throw fail(400,"That plan is not available.");
  const ref="FST-"+randomBytes(7).toString("hex").toUpperCase();
  await pool.query("INSERT INTO payments(public_ref,user_id,plan_code,amount_minor,method,status,utr) VALUES($1,$2,$3,$4,'upi','pending',$5)",[ref,u.id,plan,p.rows[0].amount_minor,utr]);
  return {plan:await getPlan(u.id)};
 }
 if(action==="redeem") {
  const u=await actorFor(token),code=text(body.code,40).toUpperCase();
  return transaction(async c=>{
   const cr=await c.query("SELECT * FROM coupons WHERE upper(code)=upper($1) AND is_active=true AND (starts_at IS NULL OR starts_at<=now()) AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE",[code]);
   if(!cr.rows[0])throw fail(400,"That coupon is invalid or expired.");
   const coupon=cr.rows[0];
   const already=await c.query("SELECT 1 FROM coupon_redemptions WHERE coupon_code=$1 AND user_id=$2",[coupon.code,u.id]);
   if(already.rows[0]) return {plan:await getPlan(u.id,null,c)};
   const count=await c.query("SELECT count(*)::int AS n FROM coupon_redemptions WHERE coupon_code=$1",[coupon.code]);
   if(coupon.max_redemptions&&count.rows[0].n>=coupon.max_redemptions)throw fail(400,"This coupon has reached its redemption limit.");
   const until=addMonths(new Date(),coupon.duration_months);
   await c.query("INSERT INTO coupon_redemptions(coupon_code,user_id,entitlement_until) VALUES($1,$2,$3)",[coupon.code,u.id,until]);
   await c.query("INSERT INTO subscriptions(user_id,plan_code,status,starts_at,ends_at,source) VALUES($1,'coupon','active',now(),$2,'coupon')",[u.id,until]);
   return {plan:await getPlan(u.id,null,c)};
  });
 }
 if(action==="coupons") {const u=await actorFor(token);await requireOwner(u);return refreshCoupons();}
 if(action==="addCoupon") {
  const u=await actorFor(token);await requireOwner(u);
  const code=text(body.code,32).toUpperCase(),label=text(body.label,80),months=Math.max(1,Math.min(24,Number(body.months)||1));
  if(!/^[A-Z0-9_-]{4,32}$/.test(code)||!label)throw fail(400,"Enter a valid coupon code and label.");
  await pool.query("INSERT INTO coupons(code,label,duration_months,max_redemptions,created_by) VALUES($1,$2,$3,1,$4)",[code,label,months,u.id]);
  return refreshCoupons();
 }
 if(action==="setCoupon") {
  const u=await actorFor(token);await requireOwner(u);
  await pool.query("UPDATE coupons SET is_active=$2,updated_at=now() WHERE upper(code)=upper($1)",[text(body.code,32),!!body.active]);
  return refreshCoupons();
 }
 if(action==="accounts") {const u=await actorFor(token);await requireOwner(u);return ownerAccounts();}
 if(action==="organisers") {
  const u=await actorFor(token);await requireOwner(u);
  const r=await pool.query("SELECT id,username AS u,display_name AS name,email,institution AS inst,phone,created_at FROM users WHERE role IN ('org','owner') ORDER BY created_at DESC");
  const open=await pool.query("SELECT value FROM platform_settings WHERE key='signup_open'");
  return {organisers:r.rows,signup:open.rows[0]?.value!==false};
 }
 if(action==="ownerStats") {
  const u=await actorFor(token);await requireOwner(u);
  const [orgs,coupons,fests,users,total,today,periods,days,festList]=await Promise.all([
   pool.query("SELECT count(*)::int AS n FROM users WHERE role IN ('org','owner')"),
   pool.query("SELECT count(DISTINCT coupon_code)::int AS n FROM coupon_redemptions"),
   pool.query("SELECT count(*)::int AS n FROM festivals WHERE status<>'deleted'"),
   pool.query("SELECT m.role,count(*)::int AS n FROM festival_memberships m JOIN festivals f ON f.id=m.festival_id WHERE m.is_active=true AND f.status<>'deleted' GROUP BY m.role"),
   pool.query("SELECT count(*)::int AS n FROM analytics_visits"),
   pool.query("SELECT count(DISTINCT visitor_key)::int AS visitors,count(*) FILTER(WHERE page_kind='home')::int AS home,count(*) FILTER(WHERE page_kind='public')::int AS pub,count(*) FILTER(WHERE page_kind='app')::int AS app FROM analytics_visits WHERE day_bucket=(now() AT TIME ZONE 'Asia/Kolkata')::date"),
   pool.query("SELECT count(DISTINCT visitor_key)::int AS visitors, count(*)::int AS views, count(DISTINCT visitor_key) FILTER(WHERE day_bucket >= (now() AT TIME ZONE 'Asia/Kolkata')::date-6)::int AS d7, count(DISTINCT visitor_key) FILTER(WHERE day_bucket >= (now() AT TIME ZONE 'Asia/Kolkata')::date-29)::int AS d30 FROM analytics_visits"),
   pool.query("SELECT gs.day::date::text AS date, count(*) FILTER(WHERE a.page_kind='home')::int AS home, count(*) FILTER(WHERE a.page_kind='public')::int AS pub FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date-13,(now() AT TIME ZONE 'Asia/Kolkata')::date,interval '1 day') AS gs(day) LEFT JOIN analytics_visits a ON a.day_bucket=gs.day::date GROUP BY gs.day ORDER BY gs.day"),
   pool.query("SELECT f.name,coalesce(u.display_name,u.username,'—') AS by,f.created_at::text AS created,(SELECT count(*)::int FROM festival_memberships m WHERE m.festival_id=f.id AND m.is_active=true) AS users,(SELECT count(*)::int FROM analytics_visits a WHERE a.festival_id=f.id AND a.page_kind='public') AS views FROM festivals f LEFT JOIN users u ON u.id=f.created_by WHERE f.status<>'deleted' ORDER BY f.created_at DESC LIMIT 100")
  ]);
  const roleCounts={team:0,judge:0,admin:0};
  for(const row of users.rows){if(row.role==="team")roleCounts.team+=row.n;else if(row.role==="judge")roleCounts.judge+=row.n;else if(["owner","org","admin"].includes(row.role))roleCounts.admin+=row.n;}
  return {orgs:orgs.rows[0].n,coupons:coupons.rows[0].n,fests:fests.rows[0].n,users:roleCounts,
   visits:{today:today.rows[0],d7:periods.rows[0].d7,d30:periods.rows[0].d30,total:total.rows[0].n,days:days.rows},
   festList:festList.rows};
 }
 if(action==="setSignup") {
  const u=await actorFor(token);await requireOwner(u);
  await pool.query("INSERT INTO platform_settings(key,value,updated_by) VALUES('signup_open',$1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()",[JSON.stringify(!!body.open),u.id]);
  return {signup:!!body.open};
 }
 if(action==="setAccount") {
  const u=await actorFor(token);await requireOwner(u);
  const id=text(body.id,80);
  if(body.locked===true)await pool.query("UPDATE users SET account_locked_at=now() WHERE id=$1",[id]);
  if(body.locked===false)await pool.query("UPDATE users SET account_locked_at=NULL WHERE id=$1",[id]);
  if(Number(body.addMonths)>0)await pool.query("UPDATE subscriptions SET ends_at=coalesce(ends_at,now())+($2::text||' months')::interval,updated_at=now() WHERE user_id=$1",[id,Math.min(24,Number(body.addMonths))]);
  return ownerAccounts();
 }
 if(action==="reviewPay") {
  const u=await actorFor(token);await requireOwner(u);
  const ref=text(body.ref,100),ok=!!body.ok;
  return transaction(async c=>{
   const p=await c.query("SELECT * FROM payments WHERE public_ref=$1 FOR UPDATE",[ref]);if(!p.rows[0])throw fail(404,"Payment not found.");
   if(ok){
    await c.query("UPDATE payments SET status='paid',paid_at=now(),reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$1",[p.rows[0].id,u.id]);
    const plan=await c.query("SELECT duration_months FROM plans WHERE code=$1",[p.rows[0].plan_code]);
    const months=plan.rows[0]?.duration_months||1;
    const active=await c.query("SELECT id FROM subscriptions WHERE user_id=$1 AND status='active' AND plan_code<>'free' AND (ends_at IS NULL OR ends_at>now()) ORDER BY ends_at DESC NULLS FIRST LIMIT 1 FOR UPDATE",[p.rows[0].user_id]);
    if(active.rows[0]) await c.query("UPDATE subscriptions SET plan_code=$2,ends_at=coalesce(ends_at,now())+($3::text||' months')::interval,status='active',updated_at=now() WHERE id=$1",[active.rows[0].id,p.rows[0].plan_code,months]);
    else await c.query("INSERT INTO subscriptions(user_id,plan_code,status,starts_at,ends_at,source) VALUES($1,$2,'active',now(),now()+($3::text||' months')::interval,'manual')",[p.rows[0].user_id,p.rows[0].plan_code,months]);
    await c.query("UPDATE users SET account_locked_at=NULL WHERE id=$1",[p.rows[0].user_id]);
   } else {
    await c.query("UPDATE payments SET status='rejected',reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$1",[p.rows[0].id,u.id]);
    if(body.lock) await c.query("UPDATE users SET account_locked_at=now() WHERE id=$1",[p.rows[0].user_id]);
   }
   return ownerAccounts(c);
  });
 }
 throw fail(501,"This action is not implemented yet.");
}

export default async function handler(req:VercelRequest,res:VercelResponse) {
 const origin=req.headers.origin;
 if(origin&&allowedOrigins.has(origin)){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Vary","Origin");}
 res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
 res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
 res.setHeader("Cache-Control","no-store");
 if(req.method==="OPTIONS")return res.status(204).end();
 if(req.method!=="POST"){res.setHeader("Allow","POST, OPTIONS");return send(res,405,{error:"Method not allowed."});}
 const body=req.body&&typeof req.body==="object"?req.body:{};
 if(typeof body.action!=="string"||!actions.has(body.action))return send(res,400,{error:"Unknown API action."});
 try { const out=await dispatch(body,req); return send(res,200,out); }
 catch(e:any){let status=e.status||(e.code==="23505"?409:500);let message=e.message||"The request could not be completed.";if(e.code==="23505"){status=409;if(e.constraint==="users_email_unique"||String(e.constraint||"").includes("email"))message="An account with this email already exists. Please log in instead.";else if(e.constraint==="users_username_unique"||String(e.constraint||"").includes("username"))message="That username is already taken. Choose another username.";else message="This account conflicts with an existing record. Check your details and try again.";}if(status>=500)console.error("Festora API error",body.action,message);return send(res,status,{error:message});}
}
