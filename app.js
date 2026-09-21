const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const TIMESLOTS=['8am-10am','10am-12pm','12pm-1pm','1pm-3pm','3pm-5pm','5pm-7pm'];
const TLABELS=['8–10 am','10–12 pm','Lunch','1–3 pm','3–5 pm','5–7 pm'];
const DOMS=['Finance','HR','Marketing','IS','Ops','Strategy','Integrative'];
const CDOMS=['Finance','HR','Marketing','IS','Ops','Strategy']; // core (non-integrative)
const DCOL={Finance:'#185fa5',HR:'#0f6e56',Marketing:'#854f0b',IS:'#534ab7',Ops:'#993c1d',Strategy:'#993556',Integrative:'#777'};
const VC={Finance:'vF',HR:'vH',Marketing:'vM',IS:'vI',Ops:'vO',Strategy:'vS',Integrative:'vX'};

let cQ='Q6';
let sel={Q5:{},Q6:{},Q7:{}};
let liveDailyCache = null;
let liveWeeklyCache = null;

try {
  const savedSel = JSON.parse(localStorage.getItem('mbaplanner_selections'));
  if (savedSel) {
    ['Q5', 'Q6', 'Q7'].forEach(q => {
      if (savedSel[q]) {
        Object.keys(savedSel[q]).forEach(code => {
          const liveSubj = DATA[q].subjects.find(s => s.code === code);
          if (liveSubj) sel[q][code] = liveSubj;
        });
      }
    });
  }
} catch (e) {
  console.warn("Could not parse saved selections from localStorage.", e);
}

let fDom='All';
let fFromTracker='';
let searchQuery='';
let goals={minor:false,major:false,dual:false};
let goalMinorDom='';
let goalMajorDom='';
let goalDualD1='';
let goalDualD2='';
let exportQ='Q5';
let q6AlertShown=false;

function toggleGoal(g){
  goals[g]=!goals[g];
  document.getElementById('g-'+g).classList.toggle('on',goals[g]);
  document.getElementById('gs-'+g).classList.toggle('show',goals[g]);
  if(!goals[g]){
    if(g==='minor')goalMinorDom='';
    if(g==='major')goalMajorDom='';
    if(g==='dual'){goalDualD1='';goalDualD2='';}
  }
  renderGoalDomChips(); render();
}

function setMinorDom(d){goalMinorDom=(goalMinorDom===d?'':d);renderGoalDomChips();render();}
function setMajorDom(d){goalMajorDom=(goalMajorDom===d?'':d);renderGoalDomChips();render();}
function setDualD1(d){goalDualD1=(goalDualD1===d?'':d);goalDualD2='';renderGoalDomChips();render();}
function setDualD2(d){goalDualD2=(goalDualD2===d?'':d);renderGoalDomChips();render();}

function renderGoalDomChips(){
  const mk=(arr,selDom,fn,excl)=>arr.filter(d=>d!==excl).map(d=>`<button class="chip${selDom===d?' on':''}" onclick="${fn}('${d}')">${d}</button>`).join('');
  document.getElementById('minor-doms').innerHTML=mk(CDOMS,goalMinorDom,'setMinorDom','');
  document.getElementById('major-doms').innerHTML=mk(CDOMS,goalMajorDom,'setMajorDom','');
  document.getElementById('dual-d1').innerHTML=mk(CDOMS,goalDualD1,'setDualD1','');
  const d2r=document.getElementById('dual-d2-row');
  if(goalDualD1){d2r.style.display='block';document.getElementById('dual-d2').innerHTML=mk(CDOMS,goalDualD2,'setDualD2',goalDualD1);}
  else d2r.style.display='none';
}

function getGoalHighlights(q){
  const targets=new Set();
  if(goals.minor&&goalMinorDom) targets.add(goalMinorDom);
  if(goals.major&&goalMajorDom) targets.add(goalMajorDom);
  if(goals.dual&&goalDualD1)    targets.add(goalDualD1);
  if(goals.dual&&goalDualD2)    targets.add(goalDualD2);
  return new Set(DATA[q].subjects.filter(s=>targets.has(s.v)).map(s=>s.code));
}

function buildSuggestions(){
  const counts=getDomainCounts();
  const all=allSel();
  const slotsLeft=12-Object.values(counts).reduce((a,b)=>a+b,0);
  const msgs=[];

  function availFor(dom){
    const res=[];
    ['Q6','Q5','Q7'].forEach(q=>{
      DATA[q].subjects.filter(s=>s.v===dom && !s.isCore && !all[s.code]).forEach(s=>res.push({...s,q}));
    });
    return res;
  }

  if(goals.minor&&goalMinorDom){
    const have=counts[goalMinorDom]||0,need=Math.max(0,2-have);
    const av=availFor(goalMinorDom);
    if(need===0){msgs.push({type:'ok',msg:`✅ <b>Minor ${goalMinorDom}</b>: done (${have}/2)`});}
    else if(need>slotsLeft){msgs.push({type:'warn',msg:`⚠️ <b>Minor ${goalMinorDom}</b>: need ${need} more but only ${slotsLeft} slots left.`});}
    else{msgs.push({type:'info',msg:`<b>Minor ${goalMinorDom}</b>: ${have}/2 — need ${need} more. Available: ${av.slice(0,3).map(s=>`<em>${s.name} (${s.q})</em>`).join(', ')}${av.length>3?` +${av.length-3} more`:''}.`});}
  }
  if(goals.major&&goalMajorDom){
    const have=counts[goalMajorDom]||0,need=Math.max(0,4-have);
    const av=availFor(goalMajorDom);
    if(need===0){msgs.push({type:'ok',msg:`✅ <b>Major ${goalMajorDom}</b>: done (${have}/4)`});}
    else if(need>slotsLeft){msgs.push({type:'warn',msg:`⚠️ <b>Major ${goalMajorDom}</b>: need ${need} more but only ${slotsLeft} slots left.`});}
    else{msgs.push({type:'info',msg:`<b>Major ${goalMajorDom}</b>: ${have}/4 — need ${need} more. Available: ${av.slice(0,3).map(s=>`<em>${s.name} (${s.q})</em>`).join(', ')}${av.length>3?` +${av.length-3} more`:''}.`});}
  }
  if(goals.dual){
    if(!goalDualD1){msgs.push({type:'info',msg:'<b>Dual Major</b>: pick domain A above.'});}
    else if(!goalDualD2){msgs.push({type:'info',msg:`<b>Dual Major</b>: ${goalDualD1} selected — now pick domain B.`});}
    else{
      [goalDualD1,goalDualD2].forEach(dom=>{
        const have=counts[dom]||0,need=Math.max(0,4-have);
        const av=availFor(dom);
        if(need===0){msgs.push({type:'ok',msg:`✅ <b>Dual – ${dom}</b>: done (${have}/4)`});}
        else if(need>slotsLeft){msgs.push({type:'warn',msg:`⚠️ <b>Dual – ${dom}</b>: need ${need} more, only ${slotsLeft} slots remain.`});}
        else{msgs.push({type:'info',msg:`<b>Dual – ${dom}</b>: ${have}/4 — need ${need}. Available: ${av.slice(0,3).map(s=>`<em>${s.name} (${s.q})</em>`).join(', ')}${av.length>3?` +${av.length-3} more`:''}.`});}
      });
    }
  }

  const box=document.getElementById('sug-area');
  if(!msgs.length){box.innerHTML='';return;}
  const anyActive=goals.minor||goals.major||goals.dual;
  if(!anyActive){box.innerHTML='';return;}
  box.innerHTML=msgs.map(m=>`<div class="suggestion ${m.type==='ok'?'sug-ok':m.type==='warn'?'sug-warn':'sug-info'} sug-item">${m.msg}</div>`).join('');
}

function getDomainCounts(){
  const c={};DOMS.forEach(d=>c[d]=0);
  ['Q5','Q6','Q7'].forEach(q=>Object.values(sel[q]).forEach(s=>{if(!s.isCore && c[s.v]!==undefined)c[s.v]++;}));
  return c;
}
function allSel(){
  const r={};
  ['Q5','Q6','Q7'].forEach(q=>Object.values(sel[q]).forEach(s=>{
    if(!s.isCore) r[s.code] = s;
  }));
  return r;
}

function renderTracker(){
  const counts=getDomainCounts();
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  document.getElementById('tot').textContent=total;
  const majors=CDOMS.filter(d=>counts[d]>=4);
  const ban=document.getElementById('deg-banner');
  if(majors.length>=2){ban.className='deg-banner show-dual';ban.textContent=`🎓 Dual Major: ${majors[0]} + ${majors[1]}`;}
  else if(majors.length===1){ban.className='deg-banner show-maj';ban.textContent=`🎓 Major: ${majors[0]}`;}
  else ban.className='deg-banner';

  const slotsLeft=12-total;
  const warns=[];
  if(goals.minor&&goalMinorDom){const n=Math.max(0,2-(counts[goalMinorDom]||0));if(n>slotsLeft)warns.push(`Minor ${goalMinorDom}: need ${n} more, ${slotsLeft} slots left.`);}
  if(goals.major&&goalMajorDom){const n=Math.max(0,4-(counts[goalMajorDom]||0));if(n>slotsLeft)warns.push(`Major ${goalMajorDom}: need ${n} more, ${slotsLeft} slots left.`);}
  if(goals.dual&&goalDualD1&&goalDualD2){
    const n1=Math.max(0,4-(counts[goalDualD1]||0)),n2=Math.max(0,4-(counts[goalDualD2]||0));
    if(n1+n2>slotsLeft)warns.push(`Dual Major ${goalDualD1}+${goalDualD2}: need ${n1+n2} more, ${slotsLeft} slots left.`);
  }
  const aw=document.getElementById('ach-warn');
  if(warns.length){aw.style.display='block';aw.innerHTML='⚠️ '+warns.join(' · ');}else aw.style.display='none';

  document.getElementById('dom-grid').innerHTML=DOMS.map(d=>{
    const c=counts[d],pct=Math.min(100,(c/4)*100),col=DCOL[d];
    const isF=fFromTracker===d;
    let st='–',scls='st0';
    if(d!=='Integrative'){if(c>=4){st='Major ✓';scls='st-maj';}else if(c>=2){st='Minor ✓';scls='st-min';}}
    return `<div class="dcard${isF?' flt':''}" onclick="clickDomCard('${d}')">
      <div class="dc-top"><span class="dc-name">${d}</span><span class="dc-n">${c}/4</span></div>
      <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div>
      <div class="dc-st ${scls}">${st}</div>
    </div>`;
  }).join('');
}
function clickDomCard(d){
  fFromTracker=(fFromTracker===d?'':d);
  fDom=fFromTracker||'All';
  render();
}

function toggleSubject(code){
  const q=cQ,subj=DATA[q].subjects.find(s=>s.code===code);
  if(!subj)return;
  if(subj.isCore) { 
    alert("Core courses are automatically included in your timetable and excluded from the 4-elective limit. They cannot be removed."); 
    return; 
  }
  if(sel[q][code]){delete sel[q][code];}
  else{
    const used=Object.values(sel[q]).map(s=>s.slot);
    if(used.includes(subj.slot)||Object.values(sel[q]).filter(s=>!s.isCore).length>=4)return;
    sel[q][code]=subj;
  }
  
  localStorage.setItem('mbaplanner_selections', JSON.stringify(sel));
  render();
}

function closeAlertModal() {
  document.getElementById('alert-modal-bg').classList.remove('open');
}

function switchQ(q){
  cQ=q;
  document.querySelectorAll('.qtab').forEach((t,i)=>t.classList.toggle('on',['Q6','Q5','Q7'][i]===q));

  render();
}
function setFilter(d){fDom=(fDom===d?'All':d);fFromTracker=(fDom!=='All'?fDom:'');render();}
function onSearchInput(v){searchQuery=v;document.getElementById('search-clear-x').classList.toggle('show',!!v);renderGrid();}
function clearSearch(){searchQuery='';document.getElementById('courseSearch').value='';document.getElementById('search-clear-x').classList.remove('show');renderGrid();}
function matchesSearch(s,q){
  if(!q)return true;
  q=q.trim().toLowerCase();
  return s.name.toLowerCase().includes(q)||s.code.toLowerCase().includes(q)||s.instructor.toLowerCase().includes(q);
}
function toggleRules(){const b=document.getElementById('rbody'),a=document.getElementById('rarrow');b.classList.toggle('open');a.textContent=b.classList.contains('open')?'▼':'▶';}

function buildTTHtml(q,compact,interactive){
  const ss=Object.values(sel[q]);
  if(!ss.length)return null;
  if(DATA[q].slots===null)return null;
  const lk={};
  ss.forEach(s=>(DATA[q].slots[s.slot]||[]).forEach(({d,t})=>{if(!lk[d])lk[d]={};lk[d][t]=s;}));
  let h=`<div class="tt-grid"><div></div>`;
  TLABELS.forEach(l=>{h+=`<div class="tt-hcell">${l}</div>`;});h+='</div>';
  DAYS.forEach(day=>{
    h+=`<div class="tt-grid"><div class="tt-day">${compact?day.slice(0,3):day}</div>`;
    TIMESLOTS.forEach(slot=>{
      if(slot==='12pm-1pm'){
        h+= interactive
          ? `<div class="lc lc-click" onclick="switchView('mess')" title="See today's mess menu">🍽 lunch</div>`
          : `<div class="lc">lunch</div>`;
        return;
      }
      const s=lk[day]&&lk[day][slot];
      if(s)h+=`<div class="tcell has"><div class="tc-slot">Slot ${s.slot}</div>${s.room?`<div class="tc-room">📍 Room ${s.room}</div>`:''}<div class="tc-name">${s.name}</div><div class="tc-instr">${s.instructor}</div></div>`;
      else h+=`<div class="tcell emp"></div>`;
    });
    h+='</div>';
  });
  return h;
}

function renderCalendar(){
  const area=document.getElementById('tt-render');
  const q=cQ;
  if(DATA[q].slots===null){
    const ss=Object.values(sel[q]);
    if(!ss.length){area.innerHTML=`<div class="no-tt-box"><p style="font-weight:700;margin-bottom:8px;font-size:13px">📅 Q7 timetable not published yet</p><p style="font-size:12px;color:var(--tx2)">Select subjects to track domain progress — schedule will appear once timings are released.</p></div>`;return;}
    let h=`<div class="no-tt-box"><p style="font-weight:700;margin-bottom:10px;font-size:13px">Q7 selections (timetable TBA)</p>`;
    ss.forEach(s=>{h+=`<div class="no-tt-item"><span class="slotb">Slot ${s.slot}</span><span style="flex:1;font-size:12px;padding:0 6px">${s.name}</span><span class="vb ${VC[s.v]||''}">${s.v}</span></div>`;});
    h+=`<p style="font-size:11px;color:var(--tx3);margin-top:8px">Slot timings will be confirmed when Q7 schedule is published.</p></div>`;
    area.innerHTML=h;return;
  }
  const html=buildTTHtml(q,false,true);
  area.innerHTML=html||'<div class="empty-tt">Select electives above to see your schedule.</div>';
}

function renderGrid(){
  const q=cQ,subs=DATA[q].subjects;
  const used=Object.values(sel[q]).map(s=>s.slot);
  const electiveCnt=Object.values(sel[q]).filter(s=>!s.isCore).length;
  const hl=getGoalHighlights(q);

  const filtered=subs.filter(s=>(fDom==='All'||s.v===fDom)&&matchesSearch(s,searchQuery));

  if(!filtered.length){
    document.getElementById('sgrid').innerHTML=`<div class="search-noresults">No courses match "${searchQuery}"${fDom!=='All'?` in ${fDom}`:''}.</div>`;
    return;
  }

  document.getElementById('sgrid').innerHTML=filtered.map(s=>{
    const isSel=!!sel[q][s.code];
    const isConf=!isSel&&used.includes(s.slot);
    const isDis=!isSel&&electiveCnt>=4;
    const isHL=hl.has(s.code)&&!isSel&&!isConf&&!isDis;
    let cls='scard';
    if(isSel)cls+=' sel';
    if(s.isCore)cls+=' core';
    else if(isConf)cls+=' conf';
    else if(isDis)cls+=' dis';
    else if(isHL)cls+=' hl';
    
    return `<div class="${cls}" onclick="toggleSubject('${s.code}')">
      <div class="schk">${s.isCore?'🔒':(isSel?'✓':'')}</div>
      <div style="flex:1;min-width:0">
        <div class="sname">${s.name} ${s.isCore?'<span style="font-size:9px;background:#185fa5;color:#fff;padding:2px 5px;border-radius:4px;margin-left:4px;vertical-align:middle;font-weight:700">MANDATORY CORE</span>':''}</div>
        <div class="smeta">
          <span class="slotb">Slot ${s.slot}</span>
          ${s.room?`<span class="roomb">📍 Room ${s.room}</span>`:''}
          <span class="vb ${VC[s.v]||''}">${s.v}</span>
          · ${s.instructor}
        </div>
      </div>
    </div>`;
  }).join('');
}

function render(){
  ['Q5','Q6','Q7'].forEach(q => {
    if(DATA[q] && DATA[q].subjects) {
      DATA[q].subjects.forEach(s => {
        if(s.isCore && !sel[q][s.code]) sel[q][s.code] = s;
      });
    }
  });

  const q=cQ,subs=DATA[q].subjects;
  const electiveCnt=Object.values(sel[q]).filter(s=>!s.isCore).length;
  
  document.getElementById('qcnt').textContent=electiveCnt;
  const wm=document.getElementById('wmsg');
  wm.style.display=electiveCnt>=4?'block':'none';

  const verts=[...new Set(subs.map(s=>s.v))].sort();
  document.getElementById('fchips').innerHTML=['All',...verts].map(v=>`<button class="fchip${fDom===v?' on':''}" onclick="setFilter('${v}')">${v}</button>`).join('');

  renderGrid();

  ['Q6','Q5','Q7'].forEach(q=>{
    const n=Object.values(sel[q]).filter(s=>!s.isCore).length;
    const b=document.getElementById('qb-'+q);
    if(n>0){b.textContent=n;b.classList.add('show');}else b.classList.remove('show');
  });

  renderCalendar();
  renderTracker();
  buildSuggestions();
  renderGoalDomChips();
  renderSupply();
}

function openExport(){
  const qs=['Q6','Q5','Q7'].filter(q=>Object.keys(sel[q]).length>0);
  if(!qs.length){alert('Select some electives first!');return;}
  exportQ=qs[0];
  document.getElementById('modal-qs').innerHTML=qs.map(q=>`<button class="mq${exportQ===q?' active':''}" onclick="setExportQ('${q}')">${DATA[q].label}</button>`).join('');
  document.getElementById('modal-bg').classList.add('open');
  document.getElementById('spinner').classList.remove('show');
}
function setExportQ(q){
  exportQ=q;
  document.querySelectorAll('.mq').forEach(b=>b.classList.toggle('active',b.textContent===DATA[q].label));
}
function closeModal(){document.getElementById('modal-bg').classList.remove('open');}
function handleModalBgClick(e){if(e.target===document.getElementById('modal-bg'))closeModal();}

async function doExport(type){
  const q=exportQ;
  const sp=document.getElementById('spinner');
  sp.classList.add('show');

  if(type==='img'){
    await exportImage(q);
  } else if(type==='ics'){
    exportICS(q);
  } else {
    exportExcel(q);
  }
  sp.classList.remove('show');
  closeModal();
}

async function exportImage(q){
  const ss=Object.values(sel[q]);
  if(!ss.length||DATA[q].slots===null){alert('No timetable available for '+q);return;}

  const html=buildTTHtml(q,false);
  if(!html){alert('No subjects selected for '+q);return;}

  const div=document.createElement('div');
  div.style.cssText='position:fixed;top:-9999px;left:-9999px;background:#ffffff;padding:24px;width:900px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';
  div.innerHTML=`
    <div style="margin-bottom:14px">
      <div style="font-size:18px;font-weight:700;color:#1a1a1a">IIT Madras MBA — ${DATA[q].label}</div>
      <div style="font-size:12px;color:#6b6b68;margin-top:3px">Weekly Timetable</div>
    </div>
    <style>
      .tt-grid{display:grid;grid-template-columns:80px repeat(6,1fr);gap:3px;margin-bottom:3px}
      .tt-hcell{font-size:9px;font-weight:700;color:#9b9b98;text-align:center;padding:4px 2px;letter-spacing:.03em}
      .tt-day{font-size:11px;font-weight:600;color:#6b6b68;display:flex;align-items:center;padding-right:4px}
      .tcell{border-radius:6px;border:.5px solid rgba(0,0,0,.10);padding:6px 7px;min-height:64px;background:#fff}
      .tcell.emp{background:#f5f4f0;border-color:transparent}
      .tcell.has{border-color:rgba(24,95,165,.30);background:#e6f1fb}
      .tc-slot{font-size:9px;color:#9b9b98;margin-bottom:2px}
      .tc-room{font-size:9px;font-weight:700;color:#7a4a00;margin-bottom:2px}
      .tc-name{font-size:10px;font-weight:700;color:#185fa5;line-height:1.3}
      .tc-instr{font-size:9px;color:#185fa5;opacity:.7;margin-top:2px}
      .lc{border-radius:6px;border:.5px dashed rgba(0,0,0,.10);min-height:64px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#9b9b98;font-style:italic}
    </style>
    ${html}
    <div style="margin-top:14px;font-size:10px;color:#9b9b98">Generated by IIT Madras MBA Elective Planner</div>
  `;
  document.body.appendChild(div);

  try{
    const canvas=await html2canvas(div,{scale:2,backgroundColor:'#ffffff',logging:false,useCORS:true});
    const url=canvas.toDataURL('image/png');
    const a=document.createElement('a');
    a.href=url;a.download=`Timetable_${q}.png`;a.click();
  }catch(e){alert('Image export failed: '+e.message);}
  document.body.removeChild(div);
}

function exportExcel(q){
  const ss=Object.values(sel[q]);
  if(!ss.length){alert('No subjects selected for '+q);return;}

  const wb=XLSX.utils.book_new();

  if(DATA[q].slots){
    const lk={};
    ss.forEach(s=>(DATA[q].slots[s.slot]||[]).forEach(({d,t})=>{if(!lk[d])lk[d]={};lk[d][t]=s;}));
    const timeLabels=['8–10 am','10–12 pm','LUNCH','1–3 pm','3–5 pm'];
    const timeKeys=['8am-10am','10am-12pm','12pm-1pm','1pm-3pm','3pm-5pm'];
    const rows=[['',  ...DAYS]];
    timeKeys.forEach((tk,i)=>{
      const row=[timeLabels[i]];
      DAYS.forEach(day=>{
        const s=lk[day]&&lk[day][tk];
        row.push(s?`${s.name}\n(${s.instructor}, Slot ${s.slot}${s.room?', Room '+s.room:''})`:(tk==='12pm-1pm'?'— LUNCH —':''));
      });
      rows.push(row);
    });
    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws['!cols']=[{wch:12},...DAYS.map(()=>({wch:28}))];
    ws['!rows']=[{hpt:16},...timeKeys.map(()=>({hpt:40}))];
    XLSX.utils.book_append_sheet(wb,ws,'Timetable');
  }

  const listRows=[['Code','Subject','Instructor','Domain','Slot','Room','Quarter']];
  ss.forEach(s=>listRows.push([s.code,s.name,s.instructor,s.v,s.slot,s.room||'',q]));
  const ws2=XLSX.utils.aoa_to_sheet(listRows);
  ws2['!cols']=[{wch:10},{wch:40},{wch:20},{wch:12},{wch:8},{wch:10},{wch:8}];
  XLSX.utils.book_append_sheet(wb,ws2,'Subject List');

  XLSX.writeFile(wb,`Timetable_${q}.xlsx`);
}

const QDATES = {
  Q5: { start: '2026-08-01', end: '2026-09-30' }, 
  Q6: { start: '2026-10-01', end: '2026-11-30' }, 
  Q7: { start: '2027-01-01', end: '2027-02-28' }  
};
const ICS_TIME_MAP={
  '8am-10am':{sh:8,sm:0,eh:10,em:0},
  '10am-12pm':{sh:10,sm:0,eh:12,em:0},
  '1pm-3pm':{sh:13,sm:0,eh:15,em:0},
  '3pm-5pm':{sh:15,sm:0,eh:17,em:0},
  '5pm-7pm':{sh:17,sm:0,eh:19,em:0}
};
const ICS_DAY_IDX={Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5}; 

function icsStamp(d){ return d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z'; }

function istToUTC(utcMidnight,hh,mm){
  return new Date(utcMidnight.getTime() + ((hh*60+mm-330)*60000));
}

function buildICS(q){
  const ss=Object.values(sel[q]);
  if(!ss.length){ alert('No subjects selected for '+q); return null; }
  if(!DATA[q].slots || !QDATES[q]){ alert(q+"'s dates aren't set up for calendar export yet."); return null; }

  const qd=QDATES[q];
  const untilStr=icsStamp(new Date(qd.end+'T23:59:59Z'));
  const stamp=icsStamp(new Date());
  const startOfQuarter=new Date(qd.start+'T00:00:00Z');
  const quarterStartDay=startOfQuarter.getUTCDay();

  let ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//IITM MBA Elective Planner//EN\r\nCALSCALE:GREGORIAN\r\n';

  ss.forEach(s=>{
    (DATA[q].slots[s.slot]||[]).forEach(({d,t})=>{
      const timeInfo=ICS_TIME_MAP[t];
      const wd=ICS_DAY_IDX[d];
      if(!timeInfo||!wd) return;
      const diffDays=(wd-quarterStartDay+7)%7;
      const baseDate=new Date(startOfQuarter.getTime()+diffDays*86400000);
      const dtStart=istToUTC(baseDate,timeInfo.sh,timeInfo.sm);
      const dtEnd=istToUTC(baseDate,timeInfo.eh,timeInfo.em);
      const uid=`${s.code}-${d}-${q}-${Date.now()}-${Math.random().toString(36).slice(2)}@mbaplanner`;
      ics+='BEGIN:VEVENT\r\n';
      ics+=`UID:${uid}\r\n`;
      ics+=`DTSTAMP:${stamp}\r\n`;
      ics+=`DTSTART:${icsStamp(dtStart)}\r\n`;
      ics+=`DTEND:${icsStamp(dtEnd)}\r\n`;
      ics+=`RRULE:FREQ=WEEKLY;UNTIL=${untilStr}\r\n`;
      ics+=`SUMMARY:${s.name}\r\n`;
      if(s.room) ics+=`LOCATION:Room ${s.room}\r\n`;
      ics+=`DESCRIPTION:Slot ${s.slot} - ${s.instructor}${s.room?' - Room '+s.room:''}\r\n`;
      ics+='END:VEVENT\r\n';
    });
  });

  ics+='END:VCALENDAR\r\n';
  return ics;
}

function exportICS(q){
  const ics=buildICS(q);
  if(!ics) return;
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`Timetable_${q}.ics`; a.click();
  URL.revokeObjectURL(url);
}

function renderSupply(){
  const q=cQ;
  const subs=DATA[q].subjects.filter(s=>!s.isCore);
  const total=subs.length;
  document.getElementById('supply-qlabel').textContent=q+' — '+total+' electives';

  const avail={};
  DOMS.forEach(d=>avail[d]=0);
  subs.forEach(s=>{ if(avail[s.v]!==undefined) avail[s.v]++; });

  const taken={};
  DOMS.forEach(d=>taken[d]=0);
  Object.values(sel[q]).forEach(s=>{ if(!s.isCore && taken[s.v]!==undefined) taken[s.v]++; });

  const warnings=[];
  const cards=DOMS.map(d=>{
    const n=avail[d];
    if(n===0) return ''; 
    const left=n-taken[d];

    let pillCls,pillLabel,cardCls='sdom',countColor='color:var(--tx)';
    if(n===1){
      pillCls='pill-scarce';pillLabel='⚠️ Only 1';cardCls='sdom scarce';countColor='color:#a33000';
      if(d!=='Integrative') warnings.push(`<b>${d}</b> — only 1 subject in ${q}`);
    } else if(n===2){
      pillCls='pill-lim';pillLabel='🟡 Limited';countColor='color:#7a4a00';
      if(d!=='Integrative'&&q==='Q7') warnings.push(`<b>${d}</b> — only 2 in ${q}, pick early`);
    } else {
      pillCls='pill-ok';pillLabel='✅ Good';
    }

    return `<div class="${cardCls}">
      <div class="sdom-name">${d}</div>
      <div class="sdom-count" style="${countColor}">${left}<span style="font-size:10px;font-weight:400;color:var(--tx3)"> left / ${n} total</span></div>
      <div class="sdom-pill ${pillCls}">${pillLabel}</div>
    </div>`;
  }).filter(Boolean);

  document.getElementById('supply-grid').innerHTML=cards.join('');

  const noteEl=document.getElementById('supply-note');
  const allGood = total>=13;
  if(warnings.length){
    const prefix = q==='Q7'
      ? `📉 Q7 is the thinnest quarter (${total} subjects vs 15 in Q5). `
      : `ℹ️ `;
    noteEl.innerHTML=prefix+warnings.join('; ')+'. Consider locking these in early across Q5/Q6.';
  } else {
    noteEl.innerHTML=`${total} electives available across all domains this quarter — ${allGood?'good variety':'reasonable spread'}.`;
  }
}

function encodeState(){
  const parts=[];
  ['Q5','Q6','Q7'].forEach(q=>{
    const codes=Object.keys(sel[q]);
    if(codes.length) parts.push(q+':'+codes.join(','));
  });
  return parts.join('|');
}

function decodeState(str){
  if(!str) return;
  try{
    str.split('|').forEach(part=>{
      const [q,codesStr]=part.split(':');
      if(!sel[q]||!codesStr) return;
      codesStr.split(',').forEach(code=>{
        const subj=DATA[q].subjects.find(s=>s.code===code);
        if(!subj) return;
        const used=Object.values(sel[q]).map(s=>s.slot);
        if(!used.includes(subj.slot)&&Object.values(sel[q]).filter(s=>!s.isCore).length<4){
          sel[q][code]=subj;
        }
      });
    });
    localStorage.setItem('mbaplanner_selections', JSON.stringify(sel));
  }catch(e){console.warn('Could not decode shared state',e);}
}

function buildShareURL(){
  const encoded=encodeState();
  if(!encoded) return window.location.href.split('#')[0];
  return window.location.href.split('#')[0]+'#plan='+encodeURIComponent(encoded);
}

function openSharePanel(){
  const total=Object.values(sel).reduce((a,q)=>a+Object.keys(q).length,0);
  if(total===0){alert('Select some subjects first to share your plan!');return;}
  const bar=document.getElementById('share-bar');
  const isOpen=bar.classList.contains('show');
  bar.classList.toggle('show',!isOpen);
  document.getElementById('share-toggle-btn').textContent=isOpen?'🔗 Share':'✕ Close share';
  if(!isOpen){
    const url=buildShareURL();
    document.getElementById('share-url-input').value=url;
    if(history.replaceState) history.replaceState(null,'',url);
    if(navigator.share) document.getElementById('native-share-btn').style.display='flex';
  }
}

function copyShareLink(){
  const url=buildShareURL();
  if(navigator.clipboard){
    navigator.clipboard.writeText(url).then(()=>{showCopied();}).catch(()=>fallbackCopy(url));
  } else fallbackCopy(url);
}
function fallbackCopy(url){
  const el=document.getElementById('share-url-input');
  el.select();document.execCommand('copy');showCopied();
}
function showCopied(){
  const el=document.getElementById('share-copied');
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2500);
}

function shareWhatsApp(){
  const url=buildShareURL();
  const msg=encodeURIComponent('Check out my IIT Madras MBA elective plan! '+url);
  window.open('https://wa.me/?text='+msg,'_blank');
}

async function shareNative(){
  try{
    await navigator.share({title:'My MBA Elective Plan',text:'Check out my IIT Madras MBA elective timetable!',url:buildShareURL()});
  }catch(e){}
}

function clearSharedBanner(){
  document.getElementById('shared-banner').classList.remove('show');
}

function loadFromURL(){
  const hash=window.location.hash;
  const match=hash.match(/plan=([^&]*)/);
  if(!match) return false;
  try{
    const decoded=decodeURIComponent(match[1]);
    decodeState(decoded);
    return true;
  }catch(e){return false;}
}

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBFZ2NfMxFApWvbswSiL9uLNpeoc-aALUA",
  authDomain: "q567mba.firebaseapp.com",
  databaseURL: "https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "q567mba",
  storageBucket: "q567mba.firebasestorage.app",
  messagingSenderId: "935454311755",
  appId: "1:935454311755:web:9c0b44191e8a84026fd4ce",
  measurementId: "G-C2T1TH06GB"
};
let myName='';
let myGroupCode='';
let roster={}; 
let compareQ='Q6';
let compareFilter='all'; 
let currentView='daily';
let fbApp=null, fbDb=null, groupRef=null;

const CMP_PALETTE=['#185fa5','#0f6e56','#993556','#854f0b','#534ab7','#993c1d','#1a6b3c','#a32d2d','#0c6478','#6b4f9e'];
function cmpColorFor(key){
  let h=0;
  for(let i=0;i<key.length;i++) h=(h*31+key.charCodeAt(i))>>>0;
  return CMP_PALETTE[h%CMP_PALETTE.length];
}

function sanitizeGroupCode(code){
  return code.trim().toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').slice(0,40);
}
function sanitizeKey(name){
  return name.trim().replace(/[.#$[\]]/g, '_').slice(0, 30);
}

function initFirebase(){
  if(fbApp){ return true; } 
  try{
    fbApp=firebase.initializeApp(FIREBASE_CONFIG);
    fbDb=firebase.database();
    return true;
  }catch(e){
    console.error('Firebase init failed',e);
    return false;
  }
}

function dismissCompareHint(){
  localStorage.setItem('mbaplanner_seen_compare_hint','1');
  document.getElementById('compare-onboard-hint').classList.remove('show');
}

function switchView(v){
  currentView=v;
  document.getElementById('vtab-plan').classList.toggle('on', v==='plan');
  document.getElementById('vtab-att')?.classList.toggle('on', v==='att');
  document.getElementById('vtab-compare').classList.toggle('on', v==='compare');
  document.getElementById('vtab-mess').classList.toggle('on', v==='mess');
  document.getElementById('vtab-daily')?.classList.toggle('on', v==='daily');
  document.getElementById('vtab-master')?.classList.toggle('on', v==='master');
  
  document.getElementById('view-plan').style.display = v==='plan' ? '' : 'none';
  if(document.getElementById('view-att')) document.getElementById('view-att').style.display = v==='att' ? '' : 'none';
  document.getElementById('view-compare').style.display = v==='compare' ? '' : 'none';
  document.getElementById('view-mess').style.display = v==='mess' ? '' : 'none';
  if(document.getElementById('view-daily')) document.getElementById('view-daily').style.display = v==='daily' ? '' : 'none';
  if(document.getElementById('view-master')) document.getElementById('view-master').style.display = v==='master' ? '' : 'none';
  if (v !== 'daily' && window._nextClassInterval) {
      clearInterval(window._nextClassInterval);
      window._nextClassInterval = null;
  }
  
  if (v === 'master') renderMasterSchedule();
  if (v === 'daily') renderDailySchedule();
  
  if(v==='compare'){
    renderCompareView();
    if(!localStorage.getItem('mbaplanner_seen_compare_hint')){
      document.getElementById('compare-onboard-hint').classList.add('show');
    }
  }
  if(v==='mess'){
    const f=document.getElementById('mess-iframe');
    if(!f.src) f.src='https://mess-menu-iitm.vercel.app/';
  }
  if(v==='att'){
    setAttQ(cQ);
    const savedAttName = localStorage.getItem('mbaplanner_att_username');
    const savedCompareName = localStorage.getItem('mbaplanner_myname');
    const inputEl = document.getElementById('att-sync-username');
    if(!inputEl.value) {
      if(savedAttName) inputEl.value = savedAttName;
      else if(savedCompareName) inputEl.value = savedCompareName;
    }
  }
}

function cmpConnect(){
  const statusEl=document.getElementById('cmp-status');
  if(!fbDb){ statusEl.textContent='⚠️ Could not reach the live database — check your internet connection and reload.'; return; }
  const nameInput=document.getElementById('cmp-name-input');
  const codeInput=document.getElementById('cmp-code-input');
  const name=nameInput.value.trim();
  const codeRaw=codeInput.value.trim();

  const code=sanitizeGroupCode(codeRaw);
  if(!code){ flashError(codeInput); return; }

  joinGroup(code);

  if(!name){
    myName='';
    statusEl.innerHTML=`📍 Viewing group <b>"${myGroupCode}"</b> anonymously. Add a name above and tap Compare again to publish your own schedule.`;
    statusEl.classList.add('connected');
    return;
  }

  const totalLocal=Object.values(sel).reduce((a,q)=>a+Object.values(q).filter(s=>!s.isCore).length,0);
  if(totalLocal===0){
    fbDb.ref('groups/'+code+'/members/'+sanitizeKey(name)).once('value').then(snap=>{
      const saved=snap.val();
      if(saved){
        ['Q5','Q6','Q7'].forEach(q=>{
          sel[q]={};
          Object.entries(saved[q]||{}).forEach(([c,s])=>{ sel[q][c]=resolveSubj(q,s); });
        });
        localStorage.setItem('mbaplanner_selections', JSON.stringify(sel));
        render();
      }
      publishMyPlan(name);
    });
  } else {
    publishMyPlan(name);
  }
}

function joinGroup(code){
  if(!fbDb) return;
  myGroupCode=code;
  compareFilter='all';
  localStorage.setItem('mbaplanner_groupcode', code);
  document.getElementById('cmp-code-input').value=code;

  if(groupRef) groupRef.off(); 
  groupRef=fbDb.ref('groups/'+code+'/members');
  groupRef.on('value', snap=>{
    roster=snap.val()||{};
    renderCompareView();
  }, err=>{
    console.error('Firebase read error',err);
    document.getElementById('cmp-status').textContent='⚠️ Could not connect — check your internet connection.';
  });
}

function resolveSubj(q, storedSubj){
  const live=((DATA[q]&&DATA[q].subjects)||[]).find(x=>x.code===storedSubj.code);
  return live ? {...storedSubj, ...live} : storedSubj;
}

function getMyEncodedPlan(){
  const r={};
  ['Q5','Q6','Q7'].forEach(q=>{ r[q]={}; Object.values(sel[q]).forEach(s=>{ r[q][s.code]=resolveSubj(q,s); }); });
  return r;
}

function publishMyPlan(name){
  if(!groupRef){ return; }
  name=(name||myName||'').trim();
  if(!name) return;

  const oldName=myName;
  myName=name;
  localStorage.setItem('mbaplanner_myname', name);
  const key=sanitizeKey(name);
  const statusEl=document.getElementById('cmp-status');

  const total=Object.values(sel).reduce((a,q)=>a+Object.values(q).filter(s=>!s.isCore).length,0);
  if(total===0){
    groupRef.child(key).remove();
    if(oldName && sanitizeKey(oldName)!==key) groupRef.child(sanitizeKey(oldName)).remove();
    statusEl.innerHTML=`📍 Connected to <b>"${myGroupCode}"</b> as <b>${name}</b>. Pick some electives in My Planner so friends can see your schedule!`;
    statusEl.classList.add('connected');
    renderCompareView();
    return;
  }

  const plan=getMyEncodedPlan();
  groupRef.child(key).set(plan).then(()=>{
    if(oldName && sanitizeKey(oldName)!==key) groupRef.child(sanitizeKey(oldName)).remove();
    statusEl.innerHTML=`📍 Connected to <b>"${myGroupCode}"</b> as <b>${name}</b> — share the group code so friends can join.`;
    statusEl.classList.add('connected');
  }).catch(e=>{
    statusEl.textContent='⚠️ Could not publish — check your internet connection.';
    console.error(e);
  });
}

function flashError(el){
  el.focus();
  const orig=el.style.borderColor;
  el.style.borderColor='#a32d2d';
  setTimeout(()=>{ el.style.borderColor=orig; },1100);
}

function removeFromRoster(key){
  if(!groupRef) return;
  groupRef.child(key).remove();
  if(key===sanitizeKey(myName)){
    myName='';
    document.getElementById('cmp-name-input').value='';
  }
  if(compareFilter===key) compareFilter='all';
}

function cmpSetFilter(key){
  compareFilter=(compareFilter===key)?'all':key;
  renderCompareView();
}

function setCompareQ(q){ compareQ=q; renderCompareView(); }

function cmpParticipants(){
  const parts={};
  Object.keys(roster).forEach(k=>{
    const rawPlan=roster[k]||{};
    const plan={};
    ['Q5','Q6','Q7'].forEach(q=>{
      plan[q]={};
      Object.entries(rawPlan[q]||{}).forEach(([code,s])=>{ plan[q][code]=resolveSubj(q,s); });
    });
    parts[k]={label:k, plan};
  });
  if(myName){
    const key=sanitizeKey(myName);
    parts[key]={label:myName, plan:getMyEncodedPlan()};
  }
  return parts;
}

function cmpFilteredParticipants(){
  const all=cmpParticipants();
  if(compareFilter!=='all' && !all[compareFilter]) compareFilter='all';
  if(compareFilter==='all') return all;
  const myKey=sanitizeKey(myName);
  const out={};
  if(all[myKey]) out[myKey]=all[myKey];
  out[compareFilter]=all[compareFilter];
  return out;
}

function renderCompareView(){
  renderCmpFriends();
  renderCmpQtabs();
  renderCmpLegend();
  renderCmpGrid();
  renderCmpTogether();
}

function renderCmpFriends(){
  const parts=cmpParticipants();
  const keys=Object.keys(parts);
  const row=document.getElementById('cmp-friends-row');
  const empty=document.getElementById('cmp-empty');
  if(!keys.length){ row.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display='none';

  const myKey=sanitizeKey(myName);
  const others=keys.filter(k=>k!==myKey);

  let html='';
  if(others.length>1){
    html+=`<div class="cmp-chip cmp-allchip${compareFilter==='all'?' active':''}" onclick="cmpSetFilter('all')">👥 Everyone</div>`;
  }
  html+=keys.map(k=>{
    const isMe=k===myKey;
    const plan=parts[k].plan;
    const count=['Q5','Q6','Q7'].reduce((a,q)=>a+Object.values(plan[q]||{}).filter(s=>!s.isCore).length,0);
    const initial=(parts[k].label.trim().charAt(0)||'?').toUpperCase();
    const color=cmpColorFor(k);
    const isActive=compareFilter===k;
    const keyEsc=k.replace(/'/g,"\\'");
    return `<div class="cmp-chip${isMe?' me':''}${isActive?' active':''}"${isMe?'':` onclick="cmpSetFilter('${keyEsc}')" style="cursor:pointer"`}>
      <div class="cmp-avatar" style="background:${color}">${initial}</div>
      <span class="cmp-chip-name">${parts[k].label}${isMe?' (you)':''}</span>
      <span class="cmp-chip-count">${count}/12</span>
      <span class="cmp-chip-x" onclick="event.stopPropagation();removeFromRoster('${keyEsc}')" title="Remove from group">✕</span>
    </div>`;
  }).join('');
  row.innerHTML=html;
}

function renderCmpQtabs(){
  document.getElementById('cmp-qtabs').innerHTML=['Q6','Q5','Q7'].map(q=>
    `<button class="cmp-qtab${compareQ===q?' on':''}" onclick="setCompareQ('${q}')">${q}</button>`
  ).join('');
}

function renderCmpLegend(){
  const parts=cmpFilteredParticipants();
  const keys=Object.keys(parts);
  document.getElementById('cmp-legend').innerHTML=keys.map(k=>{
    const isMe=k===sanitizeKey(myName);
    return `<div class="cmp-leg"><div class="cmp-leg-dot" style="background:${cmpColorFor(k)}"></div>${parts[k].label}${isMe?' (you)':''}</div>`;
  }).join('');
}

function renderCmpGrid(){
  const area=document.getElementById('cmp-grid-render');
  const q=compareQ;
  const parts=cmpFilteredParticipants();
  const keys=Object.keys(parts);

  if(!keys.length){ area.innerHTML='<div class="empty-tt">Enter your name and group code above, then tap Compare.</div>'; return; }
  if(DATA[q].slots===null){
    area.innerHTML=`<div class="no-tt-box"><p style="font-weight:700;margin-bottom:8px;font-size:13px">📅 ${q} timetable not published yet</p><p style="font-size:12px;color:var(--tx2)">Slot timings will appear here once ${q} schedule is released.</p></div>`;
    return;
  }

  const lk={};
  keys.forEach(k=>{
    const plan=parts[k].plan[q]||{};
    Object.values(plan).forEach(s=>{
      (DATA[q].slots[s.slot]||[]).forEach(({d,t})=>{
        if(!lk[d]) lk[d]={};
        if(!lk[d][t]) lk[d][t]=[];
        lk[d][t].push({key:k,subj:s});
      });
    });
  });

  let h=`<div class="cmp-tgrid"><div></div>`;
  TLABELS.forEach(l=>{h+=`<div class="cmp-hcell">${l}</div>`;}); h+='</div>';
  DAYS.forEach(day=>{
    h+=`<div class="cmp-tgrid"><div class="cmp-day">${day.slice(0,3)}</div>`;
    TIMESLOTS.forEach(slot=>{
      if(slot==='12pm-1pm'){ h+=`<div class="cmp-lc lc-click" onclick="switchView('mess')" title="See today's mess menu">🍽 lunch</div>`; return; }
      const occ=(lk[day]&&lk[day][slot])||[];
      if(!occ.length){ h+=`<div class="cmp-cell emp"></div>`; return; }
      const codes=new Set(occ.map(o=>o.subj.code));
      const together = occ.length>=2 && codes.size===1;
      const clash = codes.size>=2;
      const cls='cmp-cell'+(together?' together':clash?' clash':'');
      let inner=occ.map(o=>`<div class="cmp-pplrow"><div class="cmp-dot" style="background:${cmpColorFor(o.key)}"></div><div style="flex:1;min-width:0"><div class="cmp-classname">${o.subj.name}</div>${o.subj.room?`<span class="cmp-roomb">📍 ${o.subj.room}</span>`:''}</div></div>`).join('');
      if(together) inner+=`<div class="cmp-together-tag">🎉 together</div>`;
      else if(clash) inner+=`<div class="cmp-clash-tag">⚡ clash</div>`;
      h+=`<div class="${cls}">${inner}</div>`;
    });
    h+='</div>';
  });
  area.innerHTML=h;
}

function renderCmpTogether(){
  const area=document.getElementById('cmp-together-sec');
  const q=compareQ;
  const parts=cmpFilteredParticipants();
  const keys=Object.keys(parts);
  if(!keys.length){ area.innerHTML=''; return; }

  const myKey=sanitizeKey(myName);
  const focusKey=keys.find(k=>k!==myKey);
  const headerLabel = (compareFilter!=='all' && focusKey)
    ? `🎉 Classes with ${parts[focusKey].label} — ${q}`
    : `🎉 Classes together — ${q}`;

  const codeToInfo={};
  keys.forEach(k=>{
    const plan=parts[k].plan[q]||{};
    Object.values(plan).forEach(s=>{
      if(!codeToInfo[s.code]) codeToInfo[s.code]={subj:s, people:[]};
      codeToInfo[s.code].people.push(k);
    });
  });

  const entries=Object.values(codeToInfo).filter(e=>e.people.length>=2).sort((a,b)=>b.people.length-a.people.length);
  if(!entries.length){
    const noneMsg = keys.length<2
      ? 'Ask your friend to enter the same group code and tap Compare.'
      : (compareFilter!=='all' && focusKey ? `No shared classes with ${parts[focusKey].label} in ${q} yet.` : `No shared classes in ${q} yet.`);
    area.innerHTML=`<div class="sec-lbl">${headerLabel}</div><div class="cmp-empty">${noneMsg}</div>`;
    return;
  }
  let html=`<div class="sec-lbl">${headerLabel}</div>`;
  entries.forEach(e=>{
    html+=`<div class="cmp-tcard">
      <div class="cmp-tcard-top">
        <div class="cmp-tcard-name">${e.subj.name}</div>
        <div style="display:flex;gap:5px;flex-shrink:0">
          <div class="cmp-tcard-slot">Slot ${e.subj.slot}</div>
          ${e.subj.room?`<div class="roomb">📍 ${e.subj.room}</div>`:''}
        </div>
      </div>
      <div class="cmp-tcard-ppl">${e.people.map(k=>`<span class="cmp-tperson"><span class="cmp-dot" style="background:${cmpColorFor(k)}"></span>${parts[k].label}${k===myKey?' (you)':''}</span>`).join('')}</div>
    </div>`;
  });
  area.innerHTML=html;
}

// ── ATTENDANCE LOGIC ─────────────────────────────────────────────────────────
let attQ = 'Q6';
let attData = JSON.parse(localStorage.getItem('mbaplanner_attendance')) || { Q5:{}, Q6:{}, Q7:{} };

function setAttQ(q) { 
  attQ = q; 
  renderAttQtabs(); 
  renderAttendance(); 
}

function renderAttQtabs() {
  document.getElementById('att-qtabs').innerHTML = ['Q6','Q5','Q7'].map(q =>
    `<button class="cmp-qtab${attQ===q?' on':''}" onclick="setAttQ('${q}')">${q}</button>`
  ).join('');
}

function updateAtt(code, type, delta) {
  if(!attData[attQ]) attData[attQ] = {};
  if(!attData[attQ][code]) attData[attQ][code] = { p: 0, a: 0 };
  
  const current = attData[attQ][code];
  const totalHeld = current.p + current.a;
  
  if (delta > 0 && totalHeld >= 14) {
    alert("Maximum 14 classes reached for this subject.");
    return;
  }
  
  current[type] = Math.max(0, current[type] + delta);
  
  localStorage.setItem('mbaplanner_attendance', JSON.stringify(attData));
  renderAttendance();
  
  if(document.getElementById('att-sync-username').value.trim()) {
    saveAttendanceCloud(false); 
  }
}

function renderAttendance() {
  const area = document.getElementById('att-grid');
  const subjects = Object.values(sel[attQ] || {});

  let html = '';
  subjects.forEach(s => {
    const data = attData[attQ][s.code] || { p: 0, a: 0 };
    const totalHeld = data.p + data.a;
    
    const pct = totalHeld === 0 ? 100 : Math.round((data.p / totalHeld) * 100);
    const absences = data.a;
    let pctCls = 'ok', barColor = '#1a6b3c'; 
    let statusText = `<span style="color:var(--tx-success)">${2 - absences} absences remaining</span>`;
    
    if (absences === 2) {
      pctCls = 'warn'; barColor = '#854f0b'; 
      statusText = `<span style="color:var(--tx-warn)">0 absences remaining (At limit!)</span>`;
    } else if (absences > 2) {
      pctCls = 'danger'; barColor = '#a32d2d'; 
      statusText = `<span style="color:var(--tx-danger)">Limit exceeded (${absences}/2 missed)</span>`;
    } else if (pct < 85 && totalHeld > 0) {
      pctCls = 'warn'; barColor = '#854f0b';
    }

    html += `
    <div class="att-card">
      <div class="att-top">
        <div class="att-name">${s.name} 
          <div style="font-size:11px;font-weight:400;color:var(--tx2);margin-top:2px">${s.code} · ${s.slot}</div>
          <div style="font-size:11px;font-weight:600;margin-top:5px;background:var(--bg);padding:3px 8px;border-radius:10px;border:.5px solid var(--bd);display:inline-block;">
            ${statusText} · ${totalHeld}/14 classes held
          </div>
        </div>
        <div class="att-pct ${pctCls}">${pct}%</div>
      </div>
      <div class="att-bar-bg"><div class="att-bar-fill" style="width:${pct}%; background:${barColor}"></div></div>
      
      <div class="att-steppers">
        <div class="att-step-group">
          <span class="att-lbl">Present</span>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="att-step-btn" onclick="updateAtt('${s.code}', 'p', -1)">-</button>
            <span class="att-count">${data.p}</span>
            <button class="att-step-btn" style="background:#e6f6ee;color:#1a6b3c" onclick="updateAtt('${s.code}', 'p', 1)">+</button>
          </div>
        </div>
        
        <div class="att-step-group">
          <span class="att-lbl">Absent</span>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="att-step-btn" onclick="updateAtt('${s.code}', 'a', -1)">-</button>
            <span class="att-count">${data.a}</span>
            <button class="att-step-btn" style="background:#fcebeb;color:#a32d2d" onclick="updateAtt('${s.code}', 'a', 1)">+</button>
          </div>
        </div>
      </div>
    </div>`;
  });
  area.innerHTML = html;
}

// ── ATTENDANCE CLOUD SYNC ────────────────────────────────────────────────────
function getAttUsername() {
  const u = document.getElementById('att-sync-username').value.trim();
  const statusEl = document.getElementById('att-sync-status');
  if (!u) {
    statusEl.textContent = '⚠️ Please enter a username first.';
    statusEl.style.color = 'var(--tx-danger)';
    return null;
  }
  const key = sanitizeKey(u);
  localStorage.setItem('mbaplanner_att_username', key);
  return key;
}

function saveAttendanceCloud(showStatus = false) {
  const key = getAttUsername();
  if (!key) return;
  const statusEl = document.getElementById('att-sync-status');
  
  if (!fbDb) {
     if(showStatus) {
       statusEl.textContent = '⚠️ Database not connected. Check internet connection.';
       statusEl.style.color = 'var(--tx-warn)';
     }
     return;
  }
  
  if(showStatus) {
    statusEl.textContent = 'Saving... ⏳';
    statusEl.style.color = 'var(--tx2)';
  }

  const payload = {
    counts: attData,
    plan: getMyEncodedPlan() 
  };

  fbDb.ref('attendance_trackers/' + key).set(payload).then(() => {
    if(showStatus) {
      statusEl.textContent = '✅ Successfully saved to cloud!';
      statusEl.style.color = 'var(--tx-success)';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }).catch(e => {
    if(showStatus) {
      statusEl.textContent = '❌ Error saving to cloud.';
      statusEl.style.color = 'var(--tx-danger)';
    }
  });
}

function loadAttendanceCloud() {
  const key = getAttUsername();
  if (!key) return;
  const statusEl = document.getElementById('att-sync-status');

  if (!fbDb) {
     statusEl.textContent = '⚠️ Database not connected. Check internet connection.';
     statusEl.style.color = 'var(--tx-warn)';
     return;
  }

  statusEl.textContent = 'Loading... ⏳';
  statusEl.style.color = 'var(--tx2)';
  
  fbDb.ref('attendance_trackers/' + key).once('value').then(snap => {
    const data = snap.val();
    if (data) {
      if (data.counts) {
        attData = data.counts;
        if (data.plan) {
          ['Q5','Q6','Q7'].forEach(q => {
            sel[q] = {};
            Object.entries(data.plan[q] || {}).forEach(([c, s]) => { sel[q][c] = resolveSubj(q, s); });
          });
          localStorage.setItem('mbaplanner_selections', JSON.stringify(sel));
        }
      } else {
        attData = data; 
      }

      ['Q5','Q6','Q7'].forEach(q => { if(!attData[q]) attData[q] = {}; });
      
      localStorage.setItem('mbaplanner_attendance', JSON.stringify(attData));
      
      render(); 
      renderAttendance();
      
      statusEl.textContent = '✅ Data loaded successfully!';
      statusEl.style.color = 'var(--tx-success)';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    } else {
      statusEl.textContent = 'ℹ️ No saved data found for this username.';
      statusEl.style.color = 'var(--tx-warn)';
    }
  }).catch(e => {
    statusEl.textContent = '❌ Error loading from cloud.';
    statusEl.style.color = 'var(--tx-danger)';
  });
}

// ── COHORT SEARCH ────────────────────────────────────────────────────────────
function searchCohortAttendance() {
  const query = document.getElementById('cohort-search-input').value.trim().toUpperCase();
  const container = document.getElementById('cohort-att-table-container');
  
  if (!query) {
    container.style.display = 'none';
    return;
  }

  let foundStudentId = null;
  let foundStudent = null;

  for (const [roll, data] of Object.entries(CLASS_ATTENDANCE_DB)) {
    if (roll.includes(query) || data.name.toUpperCase().includes(query)) {
      foundStudentId = roll;
      foundStudent = data;
      break;
    }
  }

  if (!foundStudent) {
    container.style.display = 'block';
    container.innerHTML = `<div class="cmp-empty" style="border-color: var(--bd-warn)">No student found matching "${query}". Check the Roll No or Name.</div>`;
    return;
  }

  let html = `<div style="font-size: 13px; font-weight: 700; color: var(--tx-info); margin-bottom: 8px;">👤 ${foundStudent.name} (${foundStudentId})</div>`;
  html += '<table style="width:100%; border-collapse: collapse; font-size: 12px; text-align: left; background: var(--bg); border: .5px solid var(--bd);">';
  html += '<thead><tr style="border-bottom: 1px solid var(--bd); background: var(--bg2);">';
  html += '<th style="padding: 8px 10px;">Subject</th>';
  html += '<th style="padding: 8px 10px; text-align: center;">Present</th>';
  html += '<th style="padding: 8px 10px; text-align: center;">Absent</th>';
  html += '<th style="padding: 8px 10px; text-align: center;">Percentage</th>';
  html += '</tr></thead><tbody>';

  const subjectsToDisplay = Object.keys(foundStudent.attendance);

  for (const attKey of subjectsToDisplay) {
    const att = foundStudent.attendance[attKey];

    let color = 'var(--tx)';
    if (att.pct < 85) color = 'var(--tx-danger)';
    else if (att.pct >= 85) color = 'var(--tx-success)';

    let subjectName = "Unknown Subject";
    for (let q of ['Q5', 'Q6', 'Q7']) {
        if (DATA[q] && DATA[q].subjects) {
            let found = DATA[q].subjects.find(s => s.code.includes(attKey) || attKey.includes(s.code));
            if (found) {
                subjectName = found.name;
                break;
            }
        }
    }

    html += `<tr style="border-bottom: .5px solid var(--bd);">`;
    html += `<td style="padding: 8px 10px; line-height: 1.3;">
                <span style="font-weight:700;">${attKey}</span><br>
                <span style="font-size:11px; color:var(--tx2);">${subjectName}</span>
             </td>`;
    html += `<td style="padding: 8px 10px; text-align: center;">${att.p}</td>`;
    html += `<td style="padding: 8px 10px; text-align: center;">${att.a}</td>`;
    html += `<td style="padding: 8px 10px; text-align: center; color: ${color}; font-weight: 700;">${att.pct}%</td>`;
    html += `</tr>`;
  }

  html += '</tbody></table>';

  container.style.display = 'block';
  container.innerHTML = html;
}

// ── INIT ────────────────────────────────────────────────────────────────────
renderGoalDomChips();
const wasShared=loadFromURL();
render();
if(wasShared) document.getElementById('shared-banner').classList.add('show');

let pwaAlertShownStorage = localStorage.getItem('mbaplanner_pwa_alert');
if(!pwaAlertShownStorage) {
   setTimeout(() => {
     const modal = document.getElementById('alert-modal-bg');
     if(modal) modal.classList.add('open');
     localStorage.setItem('mbaplanner_pwa_alert', '1');
   }, 500);
}

roster={};
document.getElementById('cmp-status').classList.remove('connected');
document.getElementById('cmp-code-input').value='';
document.getElementById('cmp-name-input').value='';
document.getElementById('cmp-status').textContent='Enter your name and a group code, then tap Compare.';
if(!initFirebase()){
  document.getElementById('cmp-status').textContent='⚠️ Could not reach the live database — check your internet connection and reload the page.';
}

const savedAttNameInit = localStorage.getItem('mbaplanner_att_username') || localStorage.getItem('mbaplanner_myname');
if(savedAttNameInit) {
  document.getElementById('att-sync-username').value = savedAttNameInit;
}

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('SW registration failed', err));
  });
}


// --- FIREBASE LIVE SCHEDULE LISTENER ---
window.lastSyncedTime = null;
window._isOfflineFallback = false;

window.refreshLiveSchedule = function(btnElement) {
    if(btnElement) btnElement.innerText = "⏳ Syncing...";
    const ptrEl = document.getElementById('ptr-indicator');
    if (ptrEl && !btnElement) ptrEl.style.height = '40px';
    
    if(typeof fbDb !== 'undefined' && fbDb) {
      fbDb.ref('schedule').once('value').then(snap => {
        const data = snap.val();
        if(data) {
            liveDailyCache = data.daily;
            liveWeeklyCache = data.weekly;
            window.lastSyncedTime = new Date();
            window._isOfflineFallback = false;
            
            // Offline Cache
            localStorage.setItem('mbaplanner_daily_cache', JSON.stringify({
                data: liveDailyCache,
                time: window.lastSyncedTime.getTime()
            }));
            
            if (typeof currentView !== 'undefined') {
                if (currentView === 'daily') renderDailySchedule();
                if (currentView === 'master') renderMasterSchedule();
            }
        }
        if (ptrEl) ptrEl.style.height = '0px';
      }).catch(e => {
          console.warn('Could not fetch live cloud schedule.', e);
          if(btnElement) btnElement.innerText = "❌ Sync failed";
          if (ptrEl) ptrEl.style.height = '0px';
          
          if (!liveDailyCache) {
             // Let renderDailySchedule handle the fallback UI
             if (currentView === 'daily') renderDailySchedule();
          }
      });
    }
};

// Initial fetch
refreshLiveSchedule();

// Pull-to-refresh logic
let touchStartY = 0;
let isPulling = false;
window.addEventListener('touchstart', e => {
    if (typeof currentView !== 'undefined' && currentView === 'daily' && window.scrollY <= 10) {
        touchStartY = e.touches[0].clientY;
        isPulling = true;
    }
}, {passive: true});
window.addEventListener('touchmove', e => {
    if (!isPulling || currentView !== 'daily') return;
    const dy = e.touches[0].clientY - touchStartY;
    if (dy > 60 && window.scrollY <= 10) {
        let ptr = document.getElementById('ptr-indicator');
        if (!ptr) {
            ptr = document.createElement('div');
            ptr.id = 'ptr-indicator';
            ptr.style = 'height:0px; overflow:hidden; transition:height 0.2s; text-align:center; font-size:12px; font-weight:700; color:var(--tx-info); display:flex; align-items:center; justify-content:center; background:var(--bg2);';
            ptr.innerHTML = '⏳ Syncing live schedule...';
            const area = document.getElementById('daily-render');
            if (area && area.parentNode) area.parentNode.insertBefore(ptr, area);
        }
        ptr.style.height = '40px';
    }
}, {passive: true});
window.addEventListener('touchend', e => {
    if (!isPulling || currentView !== 'daily') return;
    isPulling = false;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (dy > 60 && window.scrollY <= 10) {
        window.refreshLiveSchedule();
    } else {
        const ptr = document.getElementById('ptr-indicator');
        if (ptr) ptr.style.height = '0px';
    }
}, {passive: true});

// Notification Request
window.requestNotificationPermission = function() {
    if ('Notification' in window) {
        Notification.requestPermission().then(perm => {
            renderDailySchedule(); // re-render to update btn
        });
    }
};

window._activeNotifications = window._activeNotifications || [];
function scheduleClassNotifications(todaysClasses, ymdStr) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    const [y, m, d] = ymdStr.split('-');
    const utcMidnight = new Date(Date.UTC(y, m - 1, d));
    
    for (const [t, data] of Object.entries(todaysClasses)) {
        if (data.type === 'free' || data.type === 'lunch' || data.cancelled) continue;
        
        const timeInfo = ICS_TIME_MAP[t];
        if (!timeInfo) continue;
        
        const classStartUTC = istToUTC(utcMidnight, timeInfo.sh, timeInfo.sm);
        const timeUntilClassMs = classStartUTC.getTime() - Date.now();
        const notifyLeadTimeMs = 10 * 60 * 1000; // 10 mins
        
        if (timeUntilClassMs > notifyLeadTimeMs) {
            const delayMs = timeUntilClassMs - notifyLeadTimeMs;
            const timeoutId = setTimeout(() => {
                if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
                    navigator.serviceWorker.ready.then(reg => {
                        const title = `${data.subject ? data.subject.name : 'ICRC'} starts in 10 min`;
                        const roomText = data.subject && data.subject.room ? ` · Room ${data.subject.room}` : '';
                        reg.showNotification(title + roomText, {
                            icon: '/favicon.ico',
                            tag: `class-${ymdStr}-${t}` // Prevent duplicates
                        });
                    });
                }
            }, delayMs);
            window._activeNotifications.push(timeoutId);
        }
    }
}

// --- DAILY AGENDA LOGIC ---
function renderMasterSchedule() {
  const area = document.getElementById('master-tt-render');
  if (!area) return;

  if (!liveWeeklyCache) {
      area.innerHTML = '<div class="empty-tt">Loading weekly schedule from database... ⏳</div>';
      return;
  }

  // Define standard columns/timeslots from the sheet
  const timeslots = ['8am-10am', '10am-12pm', '12pm-1pm', '1pm-3pm', '3pm-5pm', '5pm-7pm'];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  let h = `
    <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
      <thead>
        <tr style="background:var(--bg2); border-bottom:2px solid var(--bd);">
          <th style="padding:10px; border:1px solid var(--bd); width:100px;">Day</th>
          <th style="padding:10px; border:1px solid var(--bd);">8am - 10am</th>
          <th style="padding:10px; border:1px solid var(--bd);">10am - 12pm</th>
          <th style="padding:10px; border:1px solid var(--bd); background:var(--bg3);">12pm - 1pm</th>
          <th style="padding:10px; border:1px solid var(--bd);">1pm - 3pm</th>
          <th style="padding:10px; border:1px solid var(--bd);">3pm - 5pm</th>
          <th style="padding:10px; border:1px solid var(--bd);">5pm - 7pm</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const day of days) {
      const daySlots = liveWeeklyCache[day] || {};
      h += `<tr>`;
      h += `<td style="padding:10px; border:1px solid var(--bd); font-weight:700; background:var(--bg2);">${day}</td>`;

      for (const t of timeslots) {
          if (t === '12pm-1pm') {
              h += `<td style="padding:10px; border:1px solid var(--bd); text-align:center; color:var(--tx3); font-style:italic; background:var(--bg3);">Lunch</td>`;
              continue;
          }

          const cellData = daySlots[t];
          if (!cellData) {
              h += `<td style="padding:10px; border:1px solid var(--bd); color:var(--tx3); text-align:center;">—</td>`;
          } else {
              const entries = Array.isArray(cellData) ? cellData : [cellData];
              let formattedContent = '';
              for (const entry of entries) {
                  const text = typeof entry === 'object' ? entry.text : String(entry);
                  const isStrike = typeof entry === 'object' ? entry.strike : false;
                  
                  // Also support legacy manual triggers
                  const isCancelled = isStrike || text.includes('~') || text.toLowerCase().includes('cancel') || text.includes('<s>') || text.includes('<strike>');
                  
                  const style = isCancelled ? 'text-decoration: line-through; opacity: 0.6; color: var(--tx-warn);' : '';
                  formattedContent += `<div style="margin-bottom:2px; font-weight:600; ${style}">${text}</div>`;
              }
              h += `<td style="padding:10px; border:1px solid var(--bd);">${formattedContent}</td>`;
          }
      }
      h += `</tr>`;
  }

  h += `</tbody></table>`;
  area.innerHTML = h;
}


// --- DAILY AGENDA LOGIC ---
function renderDailySchedule() {
  const area = document.getElementById('daily-render');
  if (!area) return;
  const activeSubjects = Object.values(sel[cQ]);

  if(activeSubjects.length === 0) {
      area.innerHTML = '<div class="empty-tt">Select electives in My Planner to see your live schedule.</div>';
      return;
  }
  
  if (!liveDailyCache) {
      const cached = localStorage.getItem('mbaplanner_daily_cache');
      if (cached) {
          try {
              const parsed = JSON.parse(cached);
              liveDailyCache = parsed.data;
              window.lastSyncedTime = new Date(parsed.time);
              window._isOfflineFallback = true;
          } catch(e) {}
      }
  }

  if (!liveDailyCache) {
      area.innerHTML = `
      <div style="border-radius:12px; padding:14px; margin-bottom:14px; background:var(--bg); border:.5px solid var(--bd);">
          <div style="height:20px; width:140px; background:var(--bg2); border-radius:6px; margin-bottom:12px;" class="skeleton-shimmer"></div>
          <div style="height:64px; background:var(--bg2); border-radius:8px; margin-bottom:8px;" class="skeleton-shimmer"></div>
          <div style="height:64px; background:var(--bg2); border-radius:8px; margin-bottom:8px;" class="skeleton-shimmer"></div>
      </div>
      <div style="border-radius:12px; padding:14px; margin-bottom:14px; background:var(--bg); border:.5px solid var(--bd);">
          <div style="height:20px; width:100px; background:var(--bg2); border-radius:6px; margin-bottom:12px;" class="skeleton-shimmer"></div>
          <div style="height:64px; background:var(--bg2); border-radius:8px; margin-bottom:8px;" class="skeleton-shimmer"></div>
      </div>`;
      return;
  }

  const excelAcronyms = {
      'MBA2029': 'GTM', 'MBA2067': 'BM', 'MBA2146': 'FSA', 'MBA2096': 'SBM',
      'MBA2128': 'C&B', 'MBA2145': 'HRA', 'MBA2038': 'L&C', 'MBA2027': 'DMC',
      'MBA2055': 'SCM', 'MBA2052': 'SOM', 'MBA2098': 'B2B', 'MBA2104': 'SDM',
      'MBA2117': 'MR'
  };
  const timeOrder = ['8am-10am', '10am-12pm', '12pm-1pm', '1pm-3pm', '3pm-5pm', '5pm-7pm'];
  
  // IST Date logic
  const now = new Date();
  const nowIST = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}));
  const todayYmd = `${nowIST.getFullYear()}-${String(nowIST.getMonth()+1).padStart(2,'0')}-${String(nowIST.getDate()).padStart(2,'0')}`;
  const tmrw = new Date(nowIST); tmrw.setDate(tmrw.getDate() + 1);
  const tomorrowYmd = `${tmrw.getFullYear()}-${String(tmrw.getMonth()+1).padStart(2,'0')}-${String(tmrw.getDate()).padStart(2,'0')}`;
  
  let currentSlot = null;
  const currentHour = nowIST.getHours();
  if (currentHour >= 8 && currentHour < 10) currentSlot = '8am-10am';
  else if (currentHour >= 10 && currentHour < 12) currentSlot = '10am-12pm';
  else if (currentHour >= 12 && currentHour < 13) currentSlot = '12pm-1pm';
  else if (currentHour >= 13 && currentHour < 15) currentSlot = '1pm-3pm';
  else if (currentHour >= 15 && currentHour < 17) currentSlot = '3pm-5pm';
  else if (currentHour >= 17 && currentHour < 19) currentSlot = '5pm-7pm';

  // Build Pager
  let pagerHtml = `<div class="day-pager" style="display:flex; gap:8px; overflow-x:auto; margin-bottom:15px; padding-bottom:8px; scrollbar-width:none; -webkit-overflow-scrolling:touch;">`;
  for (const dateString of Object.keys(liveDailyCache)) {
      const [ymd, dayName] = dateString.split(' ');
      const shortDay = dayName ? dayName.substring(0,3) : '';
      const dd = ymd ? ymd.split('-')[2] : '';
      const chipId = `chip-${dateString.replace(/\s/g, '-')}`;
      const isToday = ymd === todayYmd;
      const activeStyle = isToday ? 'background:var(--bg-info); color:var(--tx-info); border-color:var(--bd-info);' : 'background:var(--bg2); color:var(--tx2);';
      pagerHtml += `<div id="${chipId}" onclick="document.querySelectorAll('.day-chip').forEach(c => { c.style.background='var(--bg2)'; c.style.color='var(--tx2)'; c.style.borderColor='var(--bd2)'; }); this.style.background='var(--bg-info)'; this.style.color='var(--tx-info)'; this.style.borderColor='var(--bd-info)'; document.getElementById('card-${dateString.replace(/\s/g, '-')}').scrollIntoView({behavior:'smooth', block:'start'})" class="day-chip" style="flex-shrink:0; padding:6px 12px; border-radius:16px; border:.5px solid var(--bd2); cursor:pointer; font-size:12px; font-weight:700; ${activeStyle}">${shortDay} ${dd}</div>`;
  }
  pagerHtml += `</div>`;

  // Time Since Logic
  let syncText = "Synced just now";
  if (window.lastSyncedTime) {
      const seconds = Math.floor((now - window.lastSyncedTime) / 1000);
      if (seconds > 60) {
          let m = Math.floor(seconds/60);
          syncText = `Synced ${m}m ago`;
          if (m > 60) syncText = `Synced ${Math.floor(m/60)}h ago`;
      }
  }
  if (window._isOfflineFallback) {
      syncText = `Showing last synced data from ${syncText.replace('Synced ', '')} — you're offline`;
  }

  let notifyBtnHtml = '';
  if ('Notification' in window && 'serviceWorker' in navigator) {
      if (Notification.permission === 'default') {
          notifyBtnHtml = `<div onclick="requestNotificationPermission()" style="background:var(--bg-info); color:var(--tx-info); padding:6px 10px; border-radius:6px; font-size:10px; font-weight:700; cursor:pointer; border:.5px solid var(--bd-info);">🔔 Notify me before class</div>`;
      } else if (Notification.permission === 'granted') {
          notifyBtnHtml = `<div style="color:var(--tx-success); background:var(--bg-success); padding:6px 10px; border-radius:6px; border:.5px solid var(--bd-success); font-size:10px; font-weight:700;">🔔 Notifications active</div>`;
      }
  }

  let fullHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        ${pagerHtml}
    </div>
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        ${notifyBtnHtml}
        
    </div>
    <div style="margin-bottom: 20px; border-radius: 8px; border: .5px solid var(--bd-info); background: var(--bg-info); padding: 15px; display: flex; align-items: center; gap: 15px;">
        <div style="font-size: 24px;">🎉</div>
        <div>
            <div style="font-size: 13px; font-weight: 700; color: var(--tx-info);">Q6 Term Begins Sept 24th</div>
            <div style="font-size: 11px; color: var(--tx-info); opacity: 0.85; margin-top: 2px;">Your daily schedule will commence on Thursday, September 24, 2026.</div>
        </div>
    </div>
  `;

  // Clear existing notifications
  if (window._activeNotifications) {
      window._activeNotifications.forEach(id => clearTimeout(id));
      window._activeNotifications = [];
  }

  let nextClassFound = null; // Sticky bar tracker

  for (const [dateString, dailySlots] of Object.entries(liveDailyCache)) {
      let dailyHtml = '';
      const comment = dailySlots['Comments'];
      const birthdays = dailySlots['Birthdays'];
      
      if (comment) {
          const isExam = comment.toLowerCase().includes('end term') || comment.toLowerCase().includes('exam') || comment.toLowerCase().includes('quiz');
          const badgeBg = isExam ? 'var(--bg-danger)' : 'var(--bg-warn)';
          const badgeBorder = isExam ? 'var(--bd-danger)' : 'var(--bd-warn)';
          const badgeColor = isExam ? 'var(--tx-danger)' : 'var(--tx-warn)';
          const icon = isExam ? '📝' : '⚠️';

          dailyHtml += `<div style="font-size:12px; font-weight:700; color:${badgeColor}; margin-bottom:8px; background:${badgeBg}; padding:8px 12px; border-radius:6px; border:.5px solid ${badgeBorder}; display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px;">${icon}</span>
              <span style="flex:1;">${comment}</span>
          </div>`;
      }

      if (birthdays) {
          dailyHtml += `<div style="font-size:12px; font-weight:700; color:var(--tx-pink); margin-bottom:8px; background:var(--bg-pink); border:.5px solid var(--bd-pink); padding:6px 10px; border-radius:6px;">🎉 Happy Birthday: ${birthdays}!</div>`;
      }

      let todaysClasses = {};
      let hasClasses = false;

      for (const t of timeOrder) {
          if (t === '12pm-1pm') continue;
          
          const slotData = dailySlots[t];
          if (!slotData) continue;

          let classStr = '';
          let isStrikethrough = false;
          if (Array.isArray(slotData)) {
              classStr = slotData.map(e => typeof e === 'object' && e ? (e.text||'') : String(e)).join(' / ');
              isStrikethrough = slotData.some(e => typeof e === 'object' && e ? e.strike : false);
          } else if (typeof slotData === 'object' && slotData !== null) {
              classStr = slotData.text || '';
              isStrikethrough = slotData.strike || false;
          } else {
              classStr = String(slotData);
          }
          if (!classStr) continue;
          const cancelled = isStrikethrough || classStr.includes('~') || classStr.toLowerCase().includes('cancel') || classStr.includes('<s>') || classStr.includes('<strike>');

          if (classStr.toUpperCase().includes('ICRC')) {
              todaysClasses[t] = { type: 'icrc', cancelled: cancelled };
              hasClasses = true;
              continue;
          }

          const classesInCell = classStr.split('/').map(c => c.trim());
          for (const s of activeSubjects) {
              const acronym = excelAcronyms[s.code];
              if (classesInCell.includes(s.code) || (acronym && classesInCell.includes(acronym)) || classesInCell.includes(s.name)) {
                  todaysClasses[t] = { type: 'class', subject: s, cancelled: cancelled, rawStr: classStr };
                  hasClasses = true;
                  break;
              }
          }
      }
      
      const [ymd, dayName] = dateString.split(' ');
      const isToday = ymd === todayYmd;
      
      if (isToday && hasClasses) {
          scheduleClassNotifications(todaysClasses, ymd);
      }

      const finalBlocks = [];
      if (hasClasses) {
          for (const t of timeOrder) {
              if (t === '12pm-1pm') {
                  finalBlocks.push({ type: 'lunch', t });
                  continue;
              }
              if (todaysClasses[t]) {
                  finalBlocks.push({ type: 'class', t, data: todaysClasses[t] });
              } else {
                  const last = finalBlocks[finalBlocks.length - 1];
                  if (last && last.type === 'free') {
                      last.end = t.split('-')[1];
                  } else {
                      finalBlocks.push({ type: 'free', start: t.split('-')[0], end: t.split('-')[1] });
                  }
              }
          }
      }

      const isTomorrow = ymd === tomorrowYmd;
      
      if (hasClasses) {
          for (const b of finalBlocks) {
              const isHappeningNow = isToday && currentSlot === b.t;
              
              // Next Class Logic (Sticky bar)
              if (isToday && b.type === 'class' && !b.data.cancelled && !nextClassFound && !isHappeningNow) {
                  const timeInfo = ICS_TIME_MAP[b.t];
                  if (timeInfo) {
                      const utcMidnight = new Date(Date.UTC(parseInt(ymd.split('-')[0]), parseInt(ymd.split('-')[1])-1, parseInt(ymd.split('-')[2])));
                      const classStartUTC = istToUTC(utcMidnight, timeInfo.sh, timeInfo.sm);
                      if (classStartUTC.getTime() > Date.now()) {
                          nextClassFound = {
                              name: b.data.subject ? b.data.subject.name : 'ICRC',
                              room: b.data.subject ? b.data.subject.room : null,
                              timeMs: classStartUTC.getTime()
                          };
                      }
                  }
              }

              if (b.type === 'lunch') {
                  dailyHtml += `<div class="lc" style="min-height:30px; margin-bottom:6px; font-weight:600; color:var(--tx3); text-align:center; font-size:11px;">🍽 Lunch Break (12pm - 1pm)</div>`;
              } else if (b.type === 'class') {
                  const data = b.data;
                  const cancelled = data.cancelled;
                  const strikeStyle = cancelled ? 'text-decoration: line-through; opacity: 0.7;' : '';
                  let bgStyle = cancelled ? 'background:var(--bg-warn); border:.5px solid var(--bd-warn);' : 'background:var(--bg-info); border:.5px solid var(--bd-info);';
                  const txColor = cancelled ? 'var(--tx-warn)' : 'var(--tx-info)';
                  
                  if (isHappeningNow) {
                      bgStyle = 'background:var(--tx-info); border:.5px solid var(--bd-info); color:var(--bg);';
                  }

                  if (data.type === 'icrc') {
                      dailyHtml += `
                      <div style="display:flex; justify-content:flex-start; align-items:center; padding:10px; ${bgStyle} border-radius:8px; margin-bottom:6px;">
                          <div style="width: 75px; font-size:11px; font-weight:700; color:${isHappeningNow ? 'var(--bg)' : txColor};">${b.t}</div>
                          <div style="font-size:13px; font-weight:700; color:${isHappeningNow ? 'var(--bg)' : txColor}; ${strikeStyle}">🏢 ICRC</div>
                      </div>`;
                  } else {
                      const subjectDetails = data.subject;
                      dailyHtml += `
                      <div style="display:flex; justify-content:flex-start; align-items:center; padding:10px; ${bgStyle} border-radius:8px; margin-bottom:6px;">
                          <div style="width: 75px; font-size:11px; font-weight:700; color:${isHappeningNow ? 'var(--bg)' : txColor}; opacity: 0.8;">${b.t}</div>
                          <div style="flex:1;">
                              <div style="font-size:13px; font-weight:700; color:${isHappeningNow ? 'var(--bg)' : txColor}; ${strikeStyle}">${subjectDetails.name}</div>
                          </div>
                          ${subjectDetails.room && !cancelled ? `<div style="font-size:10px; font-weight:700; color:var(--tx-warn); background:var(--bg-warn); padding:3px 6px; border-radius:6px; border:.5px solid var(--bd-warn);">📍 ${subjectDetails.room}</div>` : ''}
                      </div>`;
                  }
              } else if (b.type === 'free') {
                  const tStr = `${b.start.replace(/[a-z]/g, '')}-${b.end}`;
                  dailyHtml += `
                  <div style="display:flex; justify-content:flex-start; align-items:center; padding:6px 10px; border:.5px dashed var(--bd); background:var(--bg2); border-radius:8px; margin-bottom:6px; opacity: 0.4; min-height: 20px;">
                      <div style="width: 75px; font-size:10px; font-weight:600; color:var(--tx3);">${b.start}-${b.end}</div>
                      <div style="font-size:11px; font-weight:600; color:var(--tx3);">☕ Free</div>
                  </div>`;
              }
          }
      } else {
          dailyHtml += `<div style="font-size:12px; color:var(--tx3); padding: 12px 0; text-align:center; border: .5px dashed var(--bd); border-radius: 8px; background: var(--bg2);">☕ No classes today.</div>`;
      }

      let cleanDate = dateString;
      try {
          const [yyyy, mm, dd] = ymd.split('-');
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          cleanDate = `${dayName}, ${monthNames[parseInt(mm, 10)-1]} ${parseInt(dd, 10)}`;
      } catch (e) {
          cleanDate = dateString.replace(/-/g, ' '); 
      }
      
      if (isToday) {
          cleanDate = `Today · ${cleanDate}`;
      } else if (isTomorrow) {
          cleanDate = `Tomorrow · ${cleanDate}`;
      }

      const cardStyle = isToday ? 'background:var(--bg2); border:1px solid var(--bd-info); box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 30px;' : 'background:var(--bg); border:1px solid var(--bd2); box-shadow: 0 4px 10px rgba(0,0,0,0.04); margin-bottom: 30px;';
      const hdrStyle = isToday ? 'color:var(--tx-info);' : 'color:var(--tx);';
      
      fullHtml += `
      <div id="card-${dateString.replace(/\s/g, '-')}" data-is-today="${isToday ? 'true' : 'false'}" style="border-radius:12px; padding:14px; scroll-margin-top: 80px; ${cardStyle}">
          <div style="font-size:15px; font-weight:800; border-bottom:1px solid var(--bd); padding-bottom:8px; margin-bottom:10px; ${hdrStyle}">📅 ${cleanDate}</div>
          ${dailyHtml}
      </div>`;
  }
  
  // Sticky Mini Bar Injection
  let stickyHtml = '';
  if (nextClassFound) {
      stickyHtml = `
      <div id="sticky-next-class" style="position:sticky; top:60px; z-index:90; background:var(--bg-info); border:.5px solid var(--bd-info); color:var(--tx-info); padding:8px 14px; border-radius:12px; margin-bottom:14px; font-weight:700; font-size:12px; display:flex; justify-content:space-between; align-items:center; box-shadow: 0 4px 15px rgba(0,0,0,0.1); backdrop-filter:blur(8px);">
          <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">🔜 ${nextClassFound.name} ${nextClassFound.room ? `· Room ${nextClassFound.room}` : ''}</div>
          <div id="sticky-next-countdown" style="font-variant-numeric: tabular-nums; flex-shrink:0; padding-left:10px; background:var(--bg); color:var(--tx); padding:3px 8px; border-radius:6px; margin-left:8px; border:.5px solid var(--bd2);"></div>
      </div>`;
  } else if (todayYmd in liveDailyCache) {
      // If we parsed today and there's no next class found
      stickyHtml = `
      <div id="sticky-next-class" style="position:sticky; top:60px; z-index:90; background:var(--bg2); border:.5px solid var(--bd); color:var(--tx3); padding:8px 14px; border-radius:12px; margin-bottom:14px; font-weight:700; font-size:12px; text-align:center; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          No more classes today! 🎉
      </div>`;
  }
  
  area.innerHTML = stickyHtml + (fullHtml || '<div class="empty-tt">No upcoming schedule found.</div>');
  
  if (nextClassFound) {
      const updateCountdown = () => {
          const cd = document.getElementById('sticky-next-countdown');
          if (!cd) return;
          const diffMin = Math.ceil((nextClassFound.timeMs - Date.now()) / 60000);
          if (diffMin <= 0) {
              document.getElementById('sticky-next-class').style.display = 'none';
          } else if (diffMin > 60) {
              cd.textContent = `in ${Math.floor(diffMin/60)}h ${diffMin%60}m`;
          } else {
              cd.textContent = `in ${diffMin} min`;
          }
      };
      updateCountdown();
      if (window._nextClassInterval) clearInterval(window._nextClassInterval);
      window._nextClassInterval = setInterval(updateCountdown, 30000);
  } else {
      if (window._nextClassInterval) clearInterval(window._nextClassInterval);
  }

  if (window._isFirstDailyRender === undefined) {
      window._isFirstDailyRender = true;
      setTimeout(() => {
          const todayCard = document.querySelector('[data-is-today="true"]');
          if (todayCard) todayCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
  }
}



// --- PWA SPECIFIC LOGIC ---
setTimeout(() => {
    // Detect if running as standalone PWA
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    
    if (isPWA) {
        // 1. Force the PWA to boot directly into the Daily Agenda
        switchView('daily');
        
        // 2. Reorder the DOM tabs so Daily Agenda is the first button physically 
        const viewTabs = document.querySelector('.view-tabs');
        const vtabDaily = document.getElementById('vtab-daily');
        if (viewTabs && vtabDaily) {
            viewTabs.insertBefore(vtabDaily, viewTabs.firstChild);
        }

        // 3. Make Daily Agenda prominent by hiding the massive desktop header
        const hdr = document.querySelector('.hdr');
        if (hdr) hdr.style.display = 'none';
        
        // 4. Optionally scroll the view tabs strictly to the left so it's focused
        if (viewTabs) viewTabs.scrollLeft = 0;
    }
}, 50);
