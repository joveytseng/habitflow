import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import firebaseConfig from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ICONS=['🧘','🏃','📚','🗣️','💧','🥗','🎸','✍️','🧠','💪','🌙','☀️','🎯','💼','🚴','🏊','🎨','🔑'];
const COLS=['c0','c1','c2','c3','c4'];
const CHEX={c0:'#f08888',c1:'#b0a0e8',c2:'#80c8e8',c3:'#6ecfa8',c4:'#f0b878'};
const CDONE={c0:'done-c0',c1:'done-c1',c2:'done-c2',c3:'done-c3',c4:'done-c4'};
const SC=['#f08888','#b0a0e8','#80c8e8','#6ecfa8','#f0b878'];
const DTW=['日','一','二','三','四','五','六'];
const WO=[1,2,3,4,5,6,0];
const WL=['一','二','三','四','五','六','日'];
const MTHS=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

let habits=[],goals=[],records={},negRecords={},goalRecords={};
let selIco=ICONS[0],selCol='c0',curFreq='daily',curNFreq='daily',mType='habit',manT='h',stTab='week';
let wkOff=0,calY,calM,hcalY,hcalM,yearY;

function getUserId(){
  let id=localStorage.getItem('hf_uid');
  if(!id){id=crypto.randomUUID();localStorage.setItem('hf_uid',id);}
  return id;
}

function td(){return ds(new Date())}
function ds(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function addD(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r}
function monSt(d){const r=new Date(d),day=r.getDay();r.setDate(r.getDate()+(day===0?-6:1-day));return r}
function inR(item,d){
  if(!d)d=new Date();const s=ds(d);
  if(item.dateStart&&s<item.dateStart)return false;
  if(item.dateEnd&&s>item.dateEnd)return false;
  return true;
}
function isDue(h,d){
  if(!inR(h,d))return false;
  if(h.negative)return true;
  const f=h.freq;
  if(f.type==='daily')return true;
  if(f.type==='weekly-days')return f.days.includes(d.getDay());
  if(f.type==='weekly-n'||f.type==='monthly-n')return true;
  return false;
}
function isDone(id,s){
  const h=habits.find(x=>x.id===id);
  if(h&&h.negative){
    const count=(negRecords[s]&&negRecords[s][id])||0;
    return count<=(h.limit||0);
  }
  return(records[s]||[]).includes(id);
}
function fTxt(f){
  if(!f)return '';
  if(f.type==='daily')return '每天';
  if(f.type==='weekly-n')return f.n?`每週 ${f.n} 次`:'每週';
  if(f.type==='weekly-days')return `每週${f.days.map(d=>DTW[d]).join('、')}`;
  if(f.type==='monthly-n')return f.n?`每月 ${f.n} 次`:'每月';
  return '';
}
function negPeriodLabel(h){
  const ft=h.freq?.type||'daily';
  if(ft==='weekly-n')return '本週';
  if(ft==='monthly-n')return '本月';
  return '今日';
}
function negPeriodCount(h,refDs){
  const ft=h.freq?.type||'daily';
  if(ft==='daily')return(negRecords[refDs]&&negRecords[refDs][h.id])||0;
  const refD=new Date(refDs+'T00:00:00');
  if(ft==='weekly-n'){
    const ws=monSt(refD);let t=0;
    for(let i=0;i<7;i++){const s=ds(addD(ws,i));t+=(negRecords[s]&&negRecords[s][h.id])||0;}
    return t;
  }
  if(ft==='monthly-n'){
    const y=refD.getFullYear(),m=refD.getMonth(),dim=new Date(y,m+1,0).getDate();let t=0;
    for(let day=1;day<=dim;day++){const s=ds(new Date(y,m,day));t+=(negRecords[s]&&negRecords[s][h.id])||0;}
    return t;
  }
  return 0;
}
function rTxt(i){if(!i.dateStart&&!i.dateEnd)return '';return `${i.dateStart||'起'}～${i.dateEnd||'∞'}`}
function strk(id){
  const h=habits.find(x=>x.id===id);
  if(h&&h.negative)return 0;
  let s=0,d=new Date();
  while((records[ds(d)]||[]).includes(id)){s++;d=addD(d,-1);}
  return s;
}
function gpct(g){if(!g.total)return 0;return Math.min(100,Math.round((g.current||0)/g.total*100))}

function showSaveStatus(ok,msg){
  const el=document.getElementById('saveStatus');
  if(!el)return;
  el.textContent=msg;
  el.style.background=ok?'#6ecfa8':'#f08888';
  el.style.color='#fff';
  el.style.display='block';
  clearTimeout(el._t);
  el._t=setTimeout(()=>{el.style.display='none';},ok?2000:5000);
}

function lsSave(){
  // localStorage 為主要儲存，同步寫入
  try{
    localStorage.setItem('hf_data',JSON.stringify({habits,goals,records,negRecords,goalRecords}));
    return true;
  }catch(e){console.error('localStorage save error:',e);return false;}
}
function lsLoad(){
  // 從 localStorage 讀資料，同步
  try{
    const bk=localStorage.getItem('hf_data');
    if(!bk)return false;
    const d=JSON.parse(bk);
    habits=d.habits||[];goals=d.goals||[];records=d.records||{};
    negRecords=d.negRecords||{};goalRecords=d.goalRecords||{};
    return true;
  }catch(e){console.error('localStorage load error:',e);return false;}
}

async function save(){
  // 第一步：同步存本機，立即顯示結果
  const ok=lsSave();
  showSaveStatus(ok,'✓ 已儲存');
  if(!ok){showSaveStatus(false,'✗ 本機儲存失敗（請檢查瀏覽器設定）');return;}
  // 第二步：背景同步到 Firebase（不影響 UI）
  try{
    const userId=getUserId();
    await setDoc(doc(db,'users',userId),{habits,goals,records,negRecords,goalRecords});
  }catch(e){
    const fb=document.getElementById('fbStatus');if(fb)fb.style.display='block';
  }
}

function loadData(){
  // 第一步：從 localStorage 同步讀，立刻建 UI
  const hasLocal=lsLoad();
  buildAll();
  // 第二步：背景嘗試 Firebase 同步（有新資料時更新）
  syncFromFirebase();
}

async function syncFromFirebase(){
  try{
    const userId=getUserId();
    const snap=await getDoc(doc(db,'users',userId));
    if(snap.exists()){
      const data=snap.data();
      habits=data.habits||[];goals=data.goals||[];
      records=data.records||{};negRecords=data.negRecords||{};goalRecords=data.goalRecords||{};
      lsSave();
      buildAll();
      showSaveStatus(true,'✓ 已從雲端同步');
      const fb=document.getElementById('fbStatus');if(fb)fb.style.display='none';
    }
    // Firebase 連通但無資料：靜默，用本機資料就好
  }catch(e){
    // Firebase 失敗：靜默，只在管理頁顯示說明框
    const fb=document.getElementById('fbStatus');if(fb)fb.style.display='block';
  }
}

function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)}

function buildTopDate(){
  const n=new Date();
  const day=DTW[n.getDay()];
  document.getElementById('topdate').textContent=`${n.getFullYear()} 年 ${MTHS[n.getMonth()]} ${n.getDate()} 日（${day}）`;
}
function buildWeek(){
  const now=new Date(),tds=td(),mon=monSt(addD(now,wkOff*7));
  document.getElementById('weekLabel').textContent=`${mon.getMonth()+1}/${mon.getDate()} — ${addD(mon,6).getMonth()+1}/${addD(mon,6).getDate()}`;
  const strip=document.getElementById('weekStrip');strip.innerHTML='';
  WO.forEach((dow,i)=>{
    const d=addD(mon,i),s=ds(d),isT=s===tds;
    const posH=habits.filter(h=>!h.negative),negH=habits.filter(h=>h.negative);
    const posDue=posH.filter(h=>isDue(h,d)),posDone=posDue.filter(h=>(records[s]||[]).includes(h.id)).length;
    const negDue=negH.filter(h=>isDue(h,d)); // isDue 已含 dateStart 判斷
    const negCtrl=negDue.filter(h=>((negRecords[s]&&negRecords[s][h.id])||0)<=(h.limit||0)).length;
    const hasDone=(posDone>0||negCtrl>0)&&!isT;
    const el=document.createElement('div');
    el.className='wday'+(isT?' today':hasDone?' has-done':'');
    el.innerHTML=`<div class="wdn">${WL[i]}</div><div class="wdd">${d.getDate()}</div>${hasDone?`<div class="wstar">★</div>`:''}`;
    strip.appendChild(el);
  });
}
function weekPrev(){wkOff--;buildWeek();}
function weekNext(){wkOff++;buildWeek();}

let viewDate=null;
function toggleRetro(){
  const row=document.getElementById('datePickerRow');
  const btn=document.getElementById('retroBtn');
  if(row.style.display==='none'){
    row.style.display='block';
    const yest=addD(new Date(),-1);
    document.getElementById('retroDate').value=ds(yest);
    viewDate=ds(yest);
    btn.textContent='收起補打卡';
    buildToday();
  }else{
    row.style.display='none';
    btn.textContent='📅 補打卡';
    backToToday();
  }
}
function switchViewDate(v){viewDate=v||null;buildToday();}
function backToToday(){
  viewDate=null;
  document.getElementById('datePickerRow').style.display='none';
  document.getElementById('retroBtn').textContent='📅 補打卡';
  buildToday();
}

function buildToday(){
  buildTodayH();
  buildTodayNeg();
  buildTodayG();
  updatePR();
  // 沒有節制習慣就隱藏該區塊
  const hasNeg=habits.some(h=>h.negative&&isDue(h,viewDate?new Date(viewDate+'T00:00:00'):new Date()));
  document.getElementById('today-n-section').style.display=hasNeg?'block':'none';
}

function buildTodayH(){
  const el=document.getElementById('today-h');
  const targetDs=viewDate||td();
  const targetD=viewDate?new Date(viewDate+'T00:00:00'):new Date();
  const isRetro=!!viewDate&&viewDate!==td();
  const due=habits.filter(h=>!h.negative&&isDue(h,targetD));
  if(!habits.filter(h=>!h.negative).length){
    el.innerHTML=`<div class="empty"><div class="eico">🌱</div>還沒有習慣<br>點右上角 ＋ 新增！</div>`;return;
  }
  if(!due.length){el.innerHTML=`<div class="empty" style="padding:12px 0"><div class="eico">☀️</div>這天沒有安排的習慣</div>`;return;}
  const retroNote=isRetro?`<div style="font-size:11px;color:var(--coral);font-weight:700;margin-bottom:8px;padding:6px 10px;background:var(--pink-l);border-radius:8px">📅 補打 ${viewDate} 的記錄</div>`:'';
  el.innerHTML=retroNote+due.map(h=>{
    const done=isDone(h.id,targetDs),st=strk(h.id),rl=rTxt(h);
    return `<div class="hcard${done?' done':''}" onclick="togH('${h.id}','${targetDs}')">
      <div class="hico ${h.color}">${h.icon}</div>
      <div class="hmeta">
        <div class="hname">${h.name}</div>
        <div class="hfreq">${fTxt(h.freq)}</div>
        ${rl?`<div class="hrange">📅 ${rl}</div>`:''}
        ${st>1&&!isRetro?`<span class="hstreak">🔥 連續${st}天</span>`:''}
      </div>
      <div class="chk">${done?'✓':''}</div>
    </div>`;
  }).join('');
}

function buildTodayNeg(){
  const el=document.getElementById('today-n');
  const targetDs=viewDate||td();
  const targetD=viewDate?new Date(viewDate+'T00:00:00'):new Date();
  const isRetro=!!viewDate&&viewDate!==td();
  const due=habits.filter(h=>h.negative&&isDue(h,targetD));
  if(!due.length){el.innerHTML='';return;}
  const retroNote=isRetro?`<div style="font-size:11px;color:var(--coral);font-weight:700;margin-bottom:8px;padding:6px 10px;background:var(--pink-l);border-radius:8px">📅 補打 ${viewDate} 的記錄</div>`:'';
  el.innerHTML=retroNote+due.map(h=>{
    const limit=h.limit||0;
    const periodCount=negPeriodCount(h,targetDs);
    const dailyCount=(negRecords[targetDs]&&negRecords[targetDs][h.id])||0;
    const isOk=periodCount<=limit;
    const pl=negPeriodLabel(h);
    const rl=rTxt(h);
    return `<div class="hcard">
      <div class="hico ${h.color}">${h.icon}</div>
      <div class="hmeta">
        <div class="hname">${h.name}</div>
        <div class="hfreq">${pl}上限：${limit} 次　<span style="font-weight:800;color:${isOk?'var(--sage)':'var(--coral)'}">${periodCount}/${limit}</span></div>
        ${rl?`<div class="hrange">📅 ${rl}</div>`:''}
        <span class="neg-status ${isOk?'ok':'over'}">${isOk?'✓ 控制中':'⚠️ 超標'}</span>
      </div>
      <div class="neg-counter">
        <button class="neg-btn" onclick="negDec('${h.id}','${targetDs}')">－</button>
        <span class="neg-num ${dailyCount>limit?'over':''}">${dailyCount}</span>
        <button class="neg-btn" onclick="negInc('${h.id}','${targetDs}')">＋</button>
      </div>
    </div>`;
  }).join('');
}

function buildTodayG(){
  const el=document.getElementById('today-g'),now=new Date(),active=goals.filter(g=>inR(g,now));
  if(!goals.length){el.innerHTML=`<div class="empty"><div class="eico">🎯</div>還沒有目標<br>點右上角 ＋ 新增！</div>`;return;}
  if(!active.length){el.innerHTML=`<div class="empty" style="padding:12px 0"><div class="eico">✅</div>目前沒有進行中的目標</div>`;return;}
  el.innerHTML=active.map(g=>{
    const pct=gpct(g),done=pct>=100,rl=rTxt(g);
    return `<div class="gcard${done?' complete':''}">
      <div class="ghead">
        <div class="hico ${g.color}">${g.icon}</div>
        <div class="gmeta"><div class="gname">${g.name}</div><div class="gsub">${g.current||0} / ${g.total} ${g.unit||''}</div>${rl?`<div class="grange">📅 ${rl}</div>`:''}</div>
        <div class="gpct${done?' done':''}">${pct}%</div>
      </div>
      <div class="gbar-bg"><div class="gbar-fill" style="width:${pct}%"></div></div>
      <div class="ginrow">
        <input class="gmini" type="number" id="gs_${g.id}" placeholder="輸入完成%" style="font-size:16px">
        <button class="gbset" onclick="qSet('${g.id}')">設定</button>
        <button class="gbadd gbtn-m" onclick="qDec('${g.id}')">-1</button>
        <button class="gbadd gbtn-p" onclick="qInc('${g.id}')">+1</button>
        <button class="gbadd gbtn-p2" onclick="qInc2('${g.id}')">+2</button>
      </div>
    </div>`;
  }).join('');
}

function negInc(id,targetDs,n){
  if(!n)n=1;
  if(!targetDs)targetDs=td();
  if(!negRecords[targetDs])negRecords[targetDs]={};
  negRecords[targetDs][id]=(negRecords[targetDs][id]||0)+n;
  save();buildTodayNeg();updatePR();
}
function negInc2(id,targetDs){negInc(id,targetDs,2);}
function negDec(id,targetDs){
  if(!targetDs)targetDs=td();
  if(!negRecords[targetDs])negRecords[targetDs]={};
  const cur=negRecords[targetDs][id]||0;
  if(cur>0)negRecords[targetDs][id]=cur-1;
  save();buildTodayNeg();updatePR();
}
function togH(id,targetDs){
  if(!targetDs)targetDs=td();
  if(!records[targetDs])records[targetDs]=[];
  const i=records[targetDs].indexOf(id);
  if(i>=0)records[targetDs].splice(i,1);
  else{records[targetDs].push(id);toast(targetDs===td()?'✓ 打卡成功！':'✓ 補打成功！')}
  save();buildTodayH();updatePR();buildWeek();
}
function qSet(id){const v=parseFloat(document.getElementById('gs_'+id).value);if(isNaN(v)||v<0)return;const g=goals.find(x=>x.id===id);if(!g)return;const delta=v-(g.current||0);if(delta>0){const s=td();if(!goalRecords[s])goalRecords[s]={};goalRecords[s][id]=(goalRecords[s][id]||0)+delta;}g.current=v;save();buildTodayG();toast('進度已更新！')}
function qAdd(id){const v=parseFloat(document.getElementById('ga_'+id).value);if(isNaN(v)||v<=0)return;const g=goals.find(x=>x.id===id);if(!g)return;const s=td();if(!goalRecords[s])goalRecords[s]={};goalRecords[s][id]=(goalRecords[s][id]||0)+v;g.current=Math.min((g.current||0)+v,g.total);save();buildTodayG();toast(`+${v} 已累加！`)}
function qInc(id,n){if(!n)n=1;const g=goals.find(x=>x.id===id);if(!g)return;const s=td();if(!goalRecords[s])goalRecords[s]={};goalRecords[s][id]=(goalRecords[s][id]||0)+n;g.current=Math.min((g.current||0)+n,g.total);save();buildTodayG();toast(`+${n} 已累加！`)}
function qInc2(id){qInc(id,2)}
function qDec(id){const g=goals.find(x=>x.id===id);if(!g||!g.current)return;g.current=Math.max(0,(g.current||0)-1);save();buildTodayG();toast('-1 已減少')}

function updatePR(){
  const targetDs=viewDate||td();
  const targetD=viewDate?new Date(viewDate+'T00:00:00'):new Date();
  const due=habits.filter(h=>isDue(h,targetD));
  const done=due.filter(h=>isDone(h.id,targetDs)).length,total=due.length;
  const pct=total>0?done/total:0,circ=2*Math.PI*19;
  document.getElementById('prRing').style.strokeDashoffset=circ*(1-pct);
  const txt=`${done}/${total}`;
  const prTxt=document.getElementById('prTxt');
  prTxt.textContent=txt;
  prTxt.style.fontSize=txt.length>4?'9px':'12px';
  const label=viewDate&&viewDate!==td()?`${viewDate} 完成`:'今天完成';
  document.getElementById('prTitle').textContent=`${label} ${done} 項習慣`;
  document.getElementById('prSub').textContent=total-done>0?`還有 ${total-done} 項等你 💪`:done>0?'全部完成！🎉':'開始你的第一個打卡！';
}

function goSt(tab){
  stTab=tab;
  ['week','month','hcal','year'].forEach(t=>{
    document.getElementById('stab-'+t).classList.toggle('active',t===tab);
    document.getElementById('sub-'+t).classList.toggle('active',t===tab);
  });
  if(tab==='week')buildWeekSt();
  if(tab==='month')buildMonthSt();
  if(tab==='hcal')buildHcal();
  if(tab==='year')buildYear();
}

function buildWeekTable(){
  const mon=monSt(new Date()),tds=td();
  const days=WO.map((_,i)=>addD(mon,i));
  const headRow=document.getElementById('wt-head-row');
  headRow.innerHTML='<th class="wt-name-h"></th>';
  days.forEach((d,i)=>{
    const isT=ds(d)===tds;
    headRow.innerHTML+=`<th style="${isT?'color:var(--coral);':''}">${WL[i]}<br><span style="font-size:9px;font-weight:600;color:var(--t3)">${d.getDate()}</span></th>`;
  });
  headRow.innerHTML+='<th></th>';
  const tbody=document.getElementById('wt-body');tbody.innerHTML='';
  if(!habits.length){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--t2);font-size:13px;font-weight:600">還沒有習慣</td></tr>`;return;}
  habits.forEach(h=>{
    const doneDays=days.filter(d=>isDone(h.id,ds(d))).length;
    const dueDays=days.filter(d=>isDue(h,d)).length;
    const isPerfect=dueDays>0&&doneDays===dueDays;
    const doneClass=CDONE[h.color]||'done-c0';
    let row=`<tr><td class="wt-name"><div class="wt-name-inner"><span class="wt-ico">${h.icon}</span><span class="wt-lbl">${h.name}</span></div></td>`;
    days.forEach(d=>{
      const s=ds(d),isT=s===tds,due=isDue(h,d),done=isDone(h.id,s);
      let cls='wt-cell';
      if(due&&done)cls+=' '+doneClass;
      if(isT)cls+=' today-cell';
      const label=h.negative?((negRecords[s]&&negRecords[s][h.id])||0)+'':'';
      row+=`<td class="wt-cell-wrap"><div class="${cls}">${due?(done?(h.negative?label:'✓'):''):''}</div></td>`;
    });
    row+=`<td class="wt-badge">${isPerfect?`<span class="perfect">✓全</span>`:''}</td></tr>`;
    tbody.innerHTML+=row;
  });
  goals.filter(g=>inR(g,new Date())).forEach(g=>{
    let row=`<tr><td class="wt-name"><div class="wt-name-inner"><span class="wt-ico">${g.icon}</span><span class="wt-lbl">${g.name}</span></div></td>`;
    days.forEach(d=>{
      const s=ds(d),isT=s===tds,inRange=inR(g,d);
      const delta=inRange?((goalRecords[s]&&goalRecords[s][g.id])||0):0;
      const dayPct=delta>0&&g.total>0?Math.round(delta/g.total*100):0;
      let cls='wt-cell'+(isT?' today-cell':'')+(delta>0?' done-c4':'');
      row+=`<td class="wt-cell-wrap"><div class="${cls}">${delta>0?dayPct+'%':''}</div></td>`;
    });
    row+=`<td class="wt-badge"><span style="font-size:10px;font-weight:800;color:var(--peach)">${gpct(g)}%</span></td></tr>`;
    tbody.innerHTML+=row;
  });
}

function getDs(period){
  const now=new Date();let dates=[];
  if(period==='week'){const ws=monSt(now);for(let i=0;i<7;i++)dates.push(addD(ws,i));}
  else{const y=now.getFullYear(),m=now.getMonth(),dim=new Date(y,m+1,0).getDate();for(let i=1;i<=dim;i++)dates.push(new Date(y,m,i));}
  return dates;
}
function calcSt(dates){
  let td2=0,tt=0;
  dates.forEach(d=>{const s=ds(d),due=habits.filter(h=>isDue(h,d));td2+=due.filter(h=>isDone(h.id,s)).length;tt+=due.length;});
  return{rate:tt>0?Math.round(td2/tt*100):0,count:td2};
}
function buildHRows(dates,elId){
  document.getElementById(elId).innerHTML=!habits.length?'<div style="color:var(--t2);font-size:13px;font-weight:600">還沒有習慣</div>'
    :habits.map((h,i)=>{
      let hd=0,ht=0;dates.forEach(d=>{if(isDue(h,d)){ht++;if(isDone(h.id,ds(d)))hd++;}});
      const pct=ht>0?Math.round(hd/ht*100):0,col=SC[i%5];
      return `<div class="hsr"><div class="hsr-head"><span>${h.icon} ${h.name}</span><span class="hsr-pct" style="color:${col}">${hd}/${ht} · ${pct}%</span></div><div class="hsr-bg"><div class="hsr-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
    }).join('');
}
function buildGRows(elId){
  document.getElementById(elId).innerHTML=!goals.length?'<div style="color:var(--t2);font-size:13px;font-weight:600">還沒有目標</div>'
    :goals.map((g,i)=>{const pct=gpct(g),col=SC[i%5];return `<div class="hsr"><div class="hsr-head"><span>${g.icon} ${g.name}</span><span class="hsr-pct" style="color:${col}">${g.current||0}/${g.total} ${g.unit||''} · ${pct}%</span></div><div class="hsr-bg"><div class="hsr-fill" style="width:${pct}%;background:${col}"></div></div></div>`;}).join('');
}
function buildNegRows(dates,elId){
  const el=document.getElementById(elId);if(!el)return;
  const negH=habits.filter(h=>h.negative);
  if(!negH.length){el.innerHTML='<div style="color:var(--t2);font-size:13px;font-weight:600">還沒有節制習慣</div>';return;}
  el.innerHTML=negH.map((h,i)=>{
    let underDays=0,totalDays=0;
    dates.forEach(d=>{if(!inR(h,d))return;totalDays++;const s=ds(d);const c=(negRecords[s]&&negRecords[s][h.id])||0;if(c<=(h.limit||0))underDays++;});
    const pct=totalDays>0?Math.round(underDays/totalDays*100):100;
    const col=pct>=70?'#6ecfa8':'#f08888';
    return `<div class="hsr"><div class="hsr-head"><span>${h.icon} ${h.name}</span><span class="hsr-pct" style="color:${col}">${underDays}/${totalDays} 天控制中 · ${pct}%</span></div><div class="hsr-bg"><div class="hsr-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
  }).join('');
}
function buildWeekSt(){
  const dates=getDs('week'),{rate,count}=calcSt(dates);
  document.getElementById('sw-r').innerHTML=`${rate}<span style="font-size:15px">%</span>`;
  document.getElementById('sw-c').textContent=count;
  document.getElementById('sw-t').textContent=habits.length+goals.length;
  const posH=habits.filter(h=>!h.negative);
  document.getElementById('sw-s').textContent=posH.length?Math.max(...posH.map(h=>strk(h.id))):0;
  buildWeekTable();buildHRows(dates,'sw-hl');buildNegRows(dates,'sw-nl');buildGRows('sw-gl');
}
function buildMonthSt(){
  const dates=getDs('month'),{rate,count}=calcSt(dates);
  document.getElementById('sm-r').innerHTML=`${rate}<span style="font-size:15px">%</span>`;
  document.getElementById('sm-c').textContent=count;
  document.getElementById('sm-t').textContent=habits.length+goals.length;
  const posH=habits.filter(h=>!h.negative);
  document.getElementById('sm-s').textContent=posH.length?Math.max(...posH.map(h=>strk(h.id))):0;
  renderCal();buildHRows(dates,'sm-hl');buildNegRows(dates,'sm-nl');buildGRows('sm-gl');
}
function renderCal(){
  document.getElementById('calTitle').textContent=`${calY} 年 ${MTHS[calM]}`;
  const grid=document.getElementById('calGrid'),tds=td();
  grid.innerHTML=DTW.map(d=>`<div class="caldow">${d}</div>`).join('');
  const first=new Date(calY,calM,1).getDay(),dim=new Date(calY,calM+1,0).getDate();
  for(let i=0;i<first;i++)grid.innerHTML+=`<div class="calday empty-c"></div>`;
  const posHCal=habits.filter(h=>!h.negative),negHCal=habits.filter(h=>h.negative);
  for(let day=1;day<=dim;day++){
    const d=new Date(calY,calM,day),s=ds(d);
    const posDue=posHCal.filter(h=>isDue(h,d)),posDone=posDue.filter(h=>(records[s]||[]).includes(h.id)).length;
    const negDue=negHCal.filter(h=>isDue(h,d)); // isDue 含 dateStart
    const negCtrl=negDue.filter(h=>((negRecords[s]&&negRecords[s][h.id])||0)<=(h.limit||0)).length;
    const totalDue=posDue.length+negDue.length,totalDone=posDone+negCtrl;
    const isT=s===tds,all=totalDue>0&&totalDone===totalDue,some=totalDone>0&&totalDone<totalDue;
    let cls='calday';
    if(isT)cls+=' today-c';else if(all)cls+=' full';else if(some)cls+=' some';
    grid.innerHTML+=`<div class="${cls}">${day}${totalDone>0&&!isT?`<div class="caldot">${all?'★':'·'}</div>`:''}</div>`;
  }
}
function calPrev(){calM--;if(calM<0){calM=11;calY--;}renderCal()}
function calNext(){calM++;if(calM>11){calM=0;calY++;}renderCal()}

function buildHcal(){
  document.getElementById('hcalTitle').textContent=`${hcalY} 年 ${MTHS[hcalM]}`;
  const el=document.getElementById('hcalList');el.innerHTML='';
  const dim=new Date(hcalY,hcalM+1,0).getDate(),tds=td();
  const first=new Date(hcalY,hcalM,1).getDay();
  function makeMiniCells(drawFn){
    let cells=DTW.map(d=>`<div class="mini-caldow">${d}</div>`).join('');
    for(let i=0;i<first;i++)cells+=`<div class="mini-calday mc-empty"></div>`;
    for(let day=1;day<=dim;day++)cells+=drawFn(day);
    return cells;
  }
  const posH=habits.filter(h=>!h.negative);
  const negH=habits.filter(h=>h.negative);
  if(posH.length){
    el.innerHTML+=`<div class="secdiv"><span class="seclbl hl">習慣打卡</span><div class="secline hl"></div></div>`;
    el.innerHTML+=`<div class="hcal-grid">`+posH.map((h,hi)=>{
      let hd=0,ht=0;
      const cells=makeMiniCells(day=>{
        const d=new Date(hcalY,hcalM,day),s=ds(d);
        const isT=s===tds,due=isDue(h,d),done=isDone(h.id,s);
        if(due)ht++;if(due&&done)hd++;
        let cls='mini-calday';
        if(!inR(h,d))cls+=' mc-empty';
        else if(isT)cls+=' mc-today';
        else if(done)cls+=' mc-done';
        return `<div class="${cls}">${day}</div>`;
      });
      const pct=ht>0?Math.round(hd/ht*100):0,col=SC[hi%5];
      return `<div class="hcal-mini">
        <div class="hcal-mini-head"><div class="hico ${h.color}" style="width:28px;height:28px;font-size:14px;border-radius:7px;font-family:var(--fe)">${h.icon}</div><div class="hcal-mini-name">${h.name}</div><div class="hcal-mini-pct" style="color:${col}">${pct}%</div></div>
        <div class="hcal-mini-sub">${hd}/${ht} 次</div>
        <div class="mini-calgrid">${cells}</div></div>`;
    }).join('')+`</div>`;
  }
  if(negH.length){
    el.innerHTML+=`<div class="secdiv" style="margin-top:14px"><span class="seclbl hl">節制習慣</span><div class="secline hl"></div></div>`;
    el.innerHTML+=`<div class="hcal-grid">`+negH.map((h,hi)=>{
      let ctrl=0,tot2=0;
      const cells=makeMiniCells(day=>{
        const d=new Date(hcalY,hcalM,day),s=ds(d);
        const isT=s===tds,inRange=inR(h,d);
        if(!inRange)return `<div class="mini-calday mc-empty"></div>`;
        tot2++;
        const count=(negRecords[s]&&negRecords[s][h.id])||0;
        const isOk=count<=(h.limit||0);
        if(isOk)ctrl++;
        let cls='mini-calday';
        if(isT)cls+=' mc-today';
        else if(count>0)cls+=isOk?' mc-neg-ok':' mc-neg-over';
        return `<div class="${cls}">${day}</div>`;
      });
      const pct=tot2>0?Math.round(ctrl/tot2*100):100;
      const col=pct>=70?'#6ecfa8':'#f08888';
      return `<div class="hcal-mini">
        <div class="hcal-mini-head"><div class="hico ${h.color}" style="width:28px;height:28px;font-size:14px;border-radius:7px;font-family:var(--fe)">${h.icon}</div><div class="hcal-mini-name">${h.name}</div><div class="hcal-mini-pct" style="color:${col}">${pct}%</div></div>
        <div class="hcal-mini-sub">控制中 ${ctrl}/${tot2} 天</div>
        <div class="mini-calgrid">${cells}</div></div>`;
    }).join('')+`</div>`;
  }
  const activeGoals=goals.filter(g=>inR(g,new Date(hcalY,hcalM,1)));
  if(goals.length){
    el.innerHTML+=`<div class="secdiv" style="margin-top:14px"><span class="seclbl gl">目標</span><div class="secline gl"></div></div>`;
    if(activeGoals.length){
      el.innerHTML+=`<div class="hcal-grid">`+activeGoals.map((g,gi)=>{
        const pct=gpct(g),col=SC[gi%5];
        const cells=makeMiniCells(day=>{
          const d=new Date(hcalY,hcalM,day),s=ds(d);
          const isT=s===tds,inRange=inR(g,d);
          if(!inRange)return `<div class="mini-calday mc-empty"></div>`;
          const delta=(goalRecords[s]&&goalRecords[s][g.id])||0;
          let cls='mini-calday';
          if(isT)cls+=' mc-today';
          else if(delta>0)cls+=' mc-goal';
          return `<div class="${cls}">${day}</div>`;
        });
        return `<div class="hcal-mini">
          <div class="hcal-mini-head"><div class="hico ${g.color}" style="width:28px;height:28px;font-size:14px;border-radius:7px;font-family:var(--fe)">${g.icon}</div><div class="hcal-mini-name">${g.name}</div><div class="hcal-mini-pct" style="color:${col}">${pct}%</div></div>
          <div class="hcal-mini-sub">${g.current||0} / ${g.total} ${g.unit||''}</div>
          <div class="gbar-bg" style="margin-top:4px"><div class="gbar-fill" style="width:${pct}%"></div></div>
          <div class="mini-calgrid" style="margin-top:6px">${cells}</div></div>`;
      }).join('')+`</div>`;
    }else{
      el.innerHTML+=`<div class="empty" style="padding:12px 0"><div class="eico">🎯</div>還沒有進行中的目標</div>`;
    }
  }
}
function hcalPrev(){hcalM--;if(hcalM<0){hcalM=11;hcalY--;}buildHcal()}
function hcalNext(){hcalM++;if(hcalM>11){hcalM=0;hcalY++;}buildHcal()}

function buildYear(){
  document.getElementById('yearTitle').textContent=`${yearY} 年`;
  const el=document.getElementById('yearList'),tds=td();
  const isLeap=y=>(y%4===0&&y%100!==0)||y%400===0;
  const tot=isLeap(yearY)?366:365,ys=new Date(yearY,0,1);
  const posH2=habits.filter(h=>!h.negative);
  const negH2=habits.filter(h=>h.negative);
  if(posH2.length){
    el.innerHTML=posH2.map((h,hi)=>{
      let hd=0,ht=0,cells='';
      for(let i=0;i<tot;i++){
        const d=addD(ys,i),s=ds(d);
        const isT=s===tds,due=isDue(h,d),done=isDone(h.id,s);
        if(due)ht++;if(due&&done)hd++;
        cells+=`<div class="hmc${isT?' today-h':due&&done?' done':''}" title="${s}"></div>`;
      }
      const pct=ht>0?Math.round(hd/ht*100):0,col=SC[hi%5];
      return `<div class="yhblock">
        <div class="yhhead"><div class="hico ${h.color}" style="width:30px;height:30px;font-size:15px;border-radius:8px;font-family:var(--fe)">${h.icon}</div><div class="yhname">${h.name}</div><div class="yhpct" style="color:${col}">${pct}%</div></div>
        <div class="yhsub">已完成 ${hd} 天 · 應完成 ${ht} 天</div>
        <div class="heatmap">${cells}</div></div>`;
    }).join('');
  }else if(!negH2.length&&!goals.length){el.innerHTML=`<div class="empty"><div class="eico">🌱</div>還沒有習慣</div>`;}
  if(negH2.length){
    el.innerHTML+=`<div class="secdiv" style="margin-top:${posH2.length?16:0}px"><span class="seclbl hl">節制習慣</span><div class="secline hl"></div></div>`;
    el.innerHTML+=negH2.map((h,hi)=>{
      let ctrl=0,tot2=0,cells='';
      for(let i=0;i<tot;i++){
        const d=addD(ys,i),s=ds(d);
        const isT=s===tds,inRange=inR(h,d);
        if(inRange){tot2++;const count=(negRecords[s]&&negRecords[s][h.id])||0;const isOk=count<=(h.limit||0);if(isOk)ctrl++;}
        const count2=inRange?(negRecords[s]&&negRecords[s][h.id])||0:0;
        const isOk2=count2<=(h.limit||0);
        cells+=`<div class="hmc${isT?' today-h':!inRange?'':count2>0?isOk2?' hmc-neg-ok':' hmc-neg-over':''}" title="${s}"></div>`;
      }
      const pct=tot2>0?Math.round(ctrl/tot2*100):100,col=pct>=70?'#6ecfa8':'#f08888';
      return `<div class="yhblock">
        <div class="yhhead"><div class="hico ${h.color}" style="width:30px;height:30px;font-size:15px;border-radius:8px;font-family:var(--fe)">${h.icon}</div><div class="yhname">${h.name}</div><div class="yhpct" style="color:${col}">${pct}%</div></div>
        <div class="yhsub">節制習慣 · 控制中 ${ctrl}/${tot2} 天</div>
        <div class="heatmap">${cells}</div></div>`;
    }).join('');
  }
  if(goals.length){
    el.innerHTML+=`<div class="secdiv" style="margin-top:16px"><span class="seclbl gl">目標</span><div class="secline gl"></div></div>`;
    el.innerHTML+=goals.map((g,gi)=>{
      const pct=gpct(g),col=SC[gi%5];
      let cells='';
      for(let i=0;i<tot;i++){
        const d=addD(ys,i),s=ds(d);
        const isT=s===tds,inRange=inR(g,d);
        const delta=inRange?(goalRecords[s]&&goalRecords[s][g.id])||0:0;
        cells+=`<div class="hmc${isT?' today-h':delta>0?' hmc-goal':''}" title="${s}"></div>`;
      }
      return `<div class="yhblock">
        <div class="yhhead"><div class="hico ${g.color}" style="width:30px;height:30px;font-size:15px;border-radius:8px;font-family:var(--fe)">${g.icon}</div><div class="yhname">${g.name}</div><div class="yhpct" style="color:${col}">${pct}%</div></div>
        <div class="yhsub">${g.current||0} / ${g.total} ${g.unit||''}${rTxt(g)?' · '+rTxt(g):''}</div>
        <div class="gbar-bg" style="margin-top:8px"><div class="gbar-fill" style="width:${pct}%"></div></div>
        <div class="heatmap" style="margin-top:8px">${cells}</div></div>`;
    }).join('');
  }
}
function yearPrev(){yearY--;buildYear()}
function yearNext(){yearY++;buildYear()}

function setMT(t){
  manT=t;
  document.getElementById('mt-h').className='mtbtn'+(t==='h'?' ah':'');
  document.getElementById('mt-n').className='mtbtn'+(t==='n'?' an':'');
  document.getElementById('mt-g').className='mtbtn'+(t==='g'?' ag':'');
  document.getElementById('m-hl').style.display=t==='h'?'block':'none';
  document.getElementById('m-nl').style.display=t==='n'?'block':'none';
  document.getElementById('m-gl').style.display=t==='g'?'block':'none';
}

function buildManage(){
  document.getElementById('displayUID').textContent=getUserId();
  // 顯示本機儲存狀態
  const lsInfo=document.getElementById('lsInfo');
  if(lsInfo){
    try{
      const bk=localStorage.getItem('hf_data');
      const d=bk?JSON.parse(bk):null;
      const cnt=d?((d.habits||[]).length):0;
      lsInfo.textContent=`本機備份：${cnt>0?cnt+' 筆習慣已儲存 ✓':'尚無資料'}`;
      lsInfo.style.color=cnt>0?'var(--sage)':'var(--t2)';
    }catch(e){lsInfo.textContent='本機備份讀取錯誤';}
  }
  const posH=habits.filter(h=>!h.negative);
  const negH=habits.filter(h=>h.negative);
  document.getElementById('m-hl').innerHTML=!posH.length
    ?`<div class="empty"><div class="eico">🌱</div>還沒有習慣</div>`
    :posH.map(h=>`
    <div class="swipe-wrap" id="sw_${h.id}">
      <div class="swipe-del-bg">🗑️<br>刪除</div>
      <div class="mitem" data-type="habit" data-id="${h.id}">
        <div class="hico ${h.color}" style="font-family:var(--fe)">${h.icon}</div>
        <div class="minfo"><div class="mname">${h.name}</div><div class="msub">${fTxt(h.freq)}${rTxt(h)?' · '+rTxt(h):''}</div></div>
        <div class="macts"><button class="abtn aedit" onclick="editItem('habit','${h.id}')">✏️</button></div>
      </div>
    </div>`).join('');
  document.getElementById('m-nl').innerHTML=!negH.length
    ?`<div class="empty"><div class="eico">🔴</div>還沒有節制習慣</div>`
    :negH.map(h=>`
    <div class="swipe-wrap" id="sw_${h.id}">
      <div class="swipe-del-bg">🗑️<br>刪除</div>
      <div class="mitem" data-type="habit" data-id="${h.id}">
        <div class="hico ${h.color}" style="font-family:var(--fe)">${h.icon}</div>
        <div class="minfo"><div class="mname">${h.name}</div><div class="msub">節制習慣・${fTxt(h.freq)} 上限 ${h.limit} 次${rTxt(h)?' · '+rTxt(h):''}</div></div>
        <div class="macts"><button class="abtn aedit" onclick="editItem('habit','${h.id}')">✏️</button></div>
      </div>
    </div>`).join('');
  document.getElementById('m-gl').innerHTML=!goals.length
    ?`<div class="empty"><div class="eico">🎯</div>還沒有目標</div>`
    :goals.map(g=>{const pct=gpct(g);return `
    <div class="swipe-wrap" id="sw_${g.id}">
      <div class="swipe-del-bg">🗑️<br>刪除</div>
      <div class="mitem" data-type="goal" data-id="${g.id}" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="hico ${g.color}" style="font-family:var(--fe)">${g.icon}</div>
          <div class="minfo"><div class="mname">${g.name}</div><div class="msub">${g.current||0}/${g.total} ${g.unit||''} · ${pct}%${rTxt(g)?' · '+rTxt(g):''}</div></div>
          <div class="macts"><button class="abtn aedit" onclick="editItem('goal','${g.id}')">✏️</button></div>
        </div>
        <div class="gbar-bg"><div class="gbar-fill" style="width:${pct}%"></div></div>
      </div>
    </div>`;}).join('');
  bindSwipe();
}

function bindSwipe(){
  document.querySelectorAll('.mitem').forEach(el=>{
    let startX=0,startY=0;
    el.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});
    el.addEventListener('touchmove',e=>{
      const dx=e.touches[0].clientX-startX,dy=e.touches[0].clientY-startY;
      if(Math.abs(dy)>Math.abs(dx))return;
      if(dx<0)el.style.transform=`translateX(${Math.max(dx,-80)}px)`;
      else el.style.transform='translateX(0)';
    },{passive:true});
    el.addEventListener('touchend',e=>{
      const dx=e.changedTouches[0].clientX-startX;
      if(dx<-50){
        el.style.transform='translateX(-80px)';
        const type=el.dataset.type,id=el.dataset.id;
        const wrap=document.getElementById('sw_'+id);
        if(wrap){
          const btn=document.createElement('button');
          btn.style.cssText='position:absolute;right:0;top:0;bottom:0;width:80px;background:#e05050;color:#fff;border:none;font-size:12px;font-weight:800;cursor:pointer;z-index:2;border-radius:0 var(--r) var(--r) 0;touch-action:manipulation';
          btn.textContent='確認刪除';
          btn.onclick=()=>{
            if(type==='habit')habits=habits.filter(h=>h.id!==id);
            else goals=goals.filter(g=>g.id!==id);
            save();buildAll();toast('已刪除');
          };
          wrap.appendChild(btn);
          setTimeout(()=>{el.style.transform='translateX(0)';if(btn.parentNode)btn.parentNode.removeChild(btn);},3000);
        }
      }else{el.style.transform='translateX(0)';}
    });
  });
}

function buildIco(){document.getElementById('icoGrid').innerHTML=ICONS.map(ic=>`<div class="iopt${ic===selIco?' sel':''}" onclick="pickIco(this,'${ic}')">${ic}</div>`).join('')}
function buildCol(){document.getElementById('colRow').innerHTML=COLS.map(c=>`<div class="cchip${c===selCol?' sel':''}" style="background:${CHEX[c]}" onclick="pickCol(this,'${c}')"></div>`).join('')}
function pickIco(el,v){selIco=v;document.querySelectorAll('.iopt').forEach(e=>e.classList.remove('sel'));el.classList.add('sel')}
function pickCol(el,v){selCol=v;document.querySelectorAll('.cchip').forEach(e=>e.classList.remove('sel'));el.classList.add('sel')}
function pickFreq(el){curFreq=el.dataset.freq;document.querySelectorAll('.fopt[data-freq]').forEach(e=>e.classList.remove('sel'));el.classList.add('sel');['weekly-n','weekly-days','monthly-n'].forEach(k=>document.getElementById('fs-'+k).classList.toggle('show',curFreq===k))}
function pickNFreq(el){curNFreq=el.dataset.nfreq;document.querySelectorAll('.fopt[data-nfreq]').forEach(e=>e.classList.remove('sel'));el.classList.add('sel');}
function togDay(el){el.classList.toggle('sel')}
function setMT2(t,el){
  mType=t;
  document.querySelectorAll('.mrbtn').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('hfields').style.display=t==='habit'?'block':'none';
  document.getElementById('nfields').style.display=t==='negative'?'block':'none';
  document.getElementById('gfields').style.display=t==='goal'?'block':'none';
}

function openAdd(){
  const onManage=document.getElementById('page-manage').classList.contains('active');
  const defType=onManage&&manT==='g'?'goal':onManage&&manT==='n'?'negative':'habit';
  document.getElementById('mTitle').textContent='新增項目';
  document.getElementById('eId').value='';document.getElementById('eType').value='';
  document.getElementById('iName').value='';document.getElementById('iNote').value='';
  document.getElementById('dStart').value='';document.getElementById('dEnd').value='';
  document.getElementById('gTotal').value='';document.getElementById('gUnit').value='';document.getElementById('gCur').value='0';
  document.getElementById('nLimit').value='5';
  curNFreq='daily';document.querySelectorAll('.fopt[data-nfreq]').forEach(e=>e.classList.toggle('sel',e.dataset.nfreq==='daily'));
  selIco=ICONS[0];selCol='c0';curFreq='daily';mType=defType;
  buildIco();buildCol();
  document.getElementById('mTypeRow').style.display='flex';
  document.querySelectorAll('.mrbtn').forEach(e=>e.classList.remove('active'));
  document.querySelector(`.mrbtn[data-mt="${defType}"]`).classList.add('active');
  document.getElementById('hfields').style.display=defType==='habit'?'block':'none';
  document.getElementById('nfields').style.display=defType==='negative'?'block':'none';
  document.getElementById('gfields').style.display=defType==='goal'?'block':'none';
  document.querySelectorAll('.fopt').forEach(e=>e.classList.remove('sel'));
  document.querySelector('.fopt[data-freq="daily"]').classList.add('sel');
  ['weekly-n','weekly-days','monthly-n'].forEach(k=>document.getElementById('fs-'+k).classList.remove('show'));
  document.querySelectorAll('.dchip').forEach(e=>e.classList.remove('sel'));
  document.getElementById('modal').classList.add('open');
}
function editItem(type,id){
  const item=(type==='habit'?habits:goals).find(x=>x.id===id);if(!item)return;
  document.getElementById('mTitle').textContent='編輯項目';
  document.getElementById('eId').value=id;document.getElementById('eType').value=type;
  document.getElementById('iName').value=item.name;document.getElementById('iNote').value=item.note||'';
  document.getElementById('dStart').value=item.dateStart||'';document.getElementById('dEnd').value=item.dateEnd||'';
  selIco=item.icon;selCol=item.color;mType=item.negative?'negative':type;
  buildIco();buildCol();
  document.getElementById('mTypeRow').style.display='none';
  document.getElementById('hfields').style.display=(type==='habit'&&!item.negative)?'block':'none';
  document.getElementById('nfields').style.display=item.negative?'block':'none';
  document.getElementById('gfields').style.display=type==='goal'?'block':'none';
  if(item.negative){
    document.getElementById('nLimit').value=item.limit||5;
    curNFreq=item.freq?.type||'daily';
    document.querySelectorAll('.fopt[data-nfreq]').forEach(e=>e.classList.toggle('sel',e.dataset.nfreq===curNFreq));
  }else if(type==='habit'){
    curFreq=item.freq.type;
    document.querySelectorAll('.fopt').forEach(e=>e.classList.remove('sel'));
    document.querySelector(`.fopt[data-freq="${item.freq.type}"]`).classList.add('sel');
    ['weekly-n','weekly-days','monthly-n'].forEach(k=>document.getElementById('fs-'+k).classList.remove('show'));
    if(item.freq.type==='weekly-n'){document.getElementById('fs-weekly-n').classList.add('show');document.getElementById('fWN').value=item.freq.n}
    if(item.freq.type==='weekly-days'){document.getElementById('fs-weekly-days').classList.add('show');document.querySelectorAll('.dchip').forEach(el=>el.classList.toggle('sel',item.freq.days.includes(Number(el.dataset.d))))}
    if(item.freq.type==='monthly-n'){document.getElementById('fs-monthly-n').classList.add('show');document.getElementById('fMN').value=item.freq.n}
  }else{
    document.getElementById('gTotal').value=item.total||'';document.getElementById('gUnit').value=item.unit||'';document.getElementById('gCur').value=item.current||0;
  }
  document.getElementById('modal').classList.add('open');
}
function closeModal(){document.getElementById('modal').classList.remove('open')}
function saveItem(){
  const name=document.getElementById('iName').value.trim();if(!name){toast('請輸入名稱');return}
  const eId=document.getElementById('eId').value,eType=document.getElementById('eType').value;
  const existH=habits.find(h=>h.id===eId);
  const type=eId?(existH?.negative?'negative':eType):mType;
  const dateStart=document.getElementById('dStart').value||null,dateEnd=document.getElementById('dEnd').value||null;
  const note=document.getElementById('iNote').value.trim()||null;
  if(type==='negative'){
    const limit=parseInt(document.getElementById('nLimit').value)||1;
    const negFreq={type:curNFreq||'daily'};
    if(eId){const i=habits.findIndex(h=>h.id===eId);if(i>=0)habits[i]={...habits[i],name,icon:selIco,color:selCol,limit,freq:negFreq,dateStart,dateEnd,note};}
    else habits.push({id:uid(),name,icon:selIco,color:selCol,freq:negFreq,negative:true,limit,dateStart,dateEnd,note});
  }else if(type==='habit'){
    let freq={type:curFreq};
    if(curFreq==='weekly-n')freq.n=parseInt(document.getElementById('fWN').value)||3;
    if(curFreq==='weekly-days'){freq.days=[...document.querySelectorAll('.dchip.sel')].map(e=>Number(e.dataset.d));if(!freq.days.length){toast('請選擇至少一天');return}}
    if(curFreq==='monthly-n')freq.n=parseInt(document.getElementById('fMN').value)||4;
    if(eId){const i=habits.findIndex(h=>h.id===eId);if(i>=0)habits[i]={...habits[i],name,icon:selIco,color:selCol,freq,dateStart,dateEnd,note}}
    else habits.push({id:uid(),name,icon:selIco,color:selCol,freq,dateStart,dateEnd,note});
  }else{
    const total=parseFloat(document.getElementById('gTotal').value);if(isNaN(total)||total<=0){toast('請輸入目標總量');return}
    const unit=document.getElementById('gUnit').value.trim(),cur=parseFloat(document.getElementById('gCur').value)||0;
    if(eId){const i=goals.findIndex(g=>g.id===eId);if(i>=0)goals[i]={...goals[i],name,icon:selIco,color:selCol,total,unit,current:cur,dateStart,dateEnd,note}}
    else goals.push({id:uid(),name,icon:selIco,color:selCol,total,unit,current:cur,dateStart,dateEnd,note});
  }
  save();closeModal();buildAll();toast(eId?'已更新！':'已新增！');
}

function goTab(name){
  ['today','stats','manage'].forEach(t=>{
    document.getElementById('page-'+t).classList.toggle('active',t===name);
    document.getElementById('tab-'+t).classList.toggle('active',t===name);
    document.getElementById('nav-'+t).classList.toggle('active',t===name);
  });
  if(name==='stats'){if(stTab==='week')buildWeekSt();else if(stTab==='month')buildMonthSt();else if(stTab==='hcal')buildHcal();else buildYear()}
  if(name==='manage')buildManage();
}
function buildAll(){buildToday();buildWeek();buildManage()}

function exportCSV(){
  const headers=['日期',...habits.map(h=>h.name)];
  const rows=[headers.join(',')];
  const allDates=[...new Set([...Object.keys(records),...Object.keys(negRecords)])].sort();
  allDates.forEach(date=>{
    const row=[date];
    habits.forEach(h=>{
      if(h.negative)row.push((negRecords[date]&&negRecords[date][h.id])||0);
      else row.push((records[date]||[]).includes(h.id)?'✓':'');
    });
    rows.push(row.join(','));
  });
  const blob=new Blob(['\uFEFF'+rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`habitflow_${new Date().toISOString().slice(0,10)}.csv`;a.click();
  URL.revokeObjectURL(url);
}
function copyUID(){navigator.clipboard.writeText(getUserId());toast('ID 已複製！')}
function importUID(){
  const newId=prompt('請輸入你的裝置ID：');
  if(newId&&newId.trim()){
    localStorage.setItem('hf_uid',newId.trim());
    document.getElementById('displayUID').textContent=newId.trim();
    loadData();toast('已切換到新裝置資料！');
  }
}

window.openAdd=openAdd;window.goTab=goTab;window.weekPrev=weekPrev;window.weekNext=weekNext;
window.switchViewDate=switchViewDate;window.backToToday=backToToday;window.toggleRetro=toggleRetro;
window.goSt=goSt;window.calPrev=calPrev;window.calNext=calNext;
window.hcalPrev=hcalPrev;window.hcalNext=hcalNext;window.yearPrev=yearPrev;window.yearNext=yearNext;
window.setMT=setMT;window.setMT2=setMT2;window.pickFreq=pickFreq;window.togDay=togDay;
window.pickIco=pickIco;window.pickCol=pickCol;window.closeModal=closeModal;window.saveItem=saveItem;
window.editItem=editItem;window.togH=togH;window.qSet=qSet;window.qAdd=qAdd;
window.negInc=negInc;window.negInc2=negInc2;window.negDec=negDec;window.pickNFreq=pickNFreq;
window.qDec=qDec;window.qInc=qInc;window.qInc2=qInc2;
window.exportCSV=exportCSV;window.copyUID=copyUID;window.importUID=importUID;

buildTopDate();
const _n=new Date();
calY=_n.getFullYear();calM=_n.getMonth();
hcalY=_n.getFullYear();hcalM=_n.getMonth();
yearY=_n.getFullYear();
document.getElementById('displayUID').textContent=getUserId();
loadData();
