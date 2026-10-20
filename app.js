const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const TIMESLOTS=['8am-10am','10am-12pm','12pm-1pm','1pm-3pm','3pm-5pm','5pm-7pm'];
const TLABELS=['8–10 am','10–12 pm','Lunch','1–3 pm','3–5 pm','5–7 pm'];
const DOMS=['Finance','HR','Marketing','IS','Ops','Strategy','Integrative'];
const CDOMS=['Finance','HR','Marketing','IS','Ops','Strategy']; // core (non-integrative)
const DCOL={Finance:'#2b6cb0',HR:'#0e7c86',Marketing:'#c2761b',IS:'#6b52ae',Ops:'#b4492e',Strategy:'#a23b66',Integrative:'#6b7a70'};
const VC={Finance:'vF',HR:'vH',Marketing:'vM',IS:'vI',Ops:'vO',Strategy:'vS',Integrative:'vX'};

let cQ='Q6';
let sel={Q5:{},Q6:{},Q7:{}};
let goals={minor:false,major:false,dual:false};
let goalMinorDom='';
let goalMajorDom='';
let goalDualD1='';
let goalDualD2='';
let fDom='All';
let fFromTracker='';
let searchQuery='';
let exportQ='Q5';
let q6AlertShown=false;
let liveDailyCache = null;
let liveWeeklyCache = null;
var fbApp=null, fbDb=null, groupRef=null;

// ── ROLL NUMBER & PREFERENCES HELPERS ──────────────────────────────
function getActiveRollNo() {
  return (localStorage.getItem('mbaplanner_roll_no') || '').trim().toUpperCase();
}

function triggerAutoSavePulse() {
  const badges = document.querySelectorAll('.plan-student-badge, .agenda-autosave-badge');
  badges.forEach(b => {
    b.dataset.origText = b.dataset.origText || b.textContent;
    b.textContent = '✓ Saved';
    b.style.transition = 'all 0.2s ease';
    b.style.opacity = '1';
  });
  if (window._autoSaveTimer) clearTimeout(window._autoSaveTimer);
  window._autoSaveTimer = setTimeout(() => {
    badges.forEach(b => {
      b.textContent = b.dataset.origText || '✓ Auto-Saved';
    });
  }, 1200);
}

function applyPreferences(prefObj) {
  if (!prefObj) return;

  // 1. Elective Selections
  if (prefObj.selections) {
    ['Q5', 'Q6', 'Q7'].forEach(q => {
      sel[q] = {};
      if (prefObj.selections[q] && DATA[q] && DATA[q].subjects) {
        Object.keys(prefObj.selections[q]).forEach(code => {
          const liveSubj = DATA[q].subjects.find(s => s.code === code);
          if (liveSubj) sel[q][code] = liveSubj;
          else if (prefObj.selections[q][code]) sel[q][code] = prefObj.selections[q][code];
        });
      }
    });
    try {
      localStorage.setItem('mbaplanner_selections', JSON.stringify(sel));
    } catch(e) {}
  }

  // 2. Academic Goals
  // Goals UI was removed: ignore saved goals so a stale one can't keep showing banners and warnings.

  // 3. Personal Attendance Counters (attData)
  if (prefObj.attData && typeof prefObj.attData === 'object') {
    try {
      if (typeof attData !== 'undefined') {
        Object.assign(attData, prefObj.attData);
        localStorage.setItem('mbaplanner_attendance', JSON.stringify(attData));
      }
    } catch(e) {}
  }

  // 4. Class-by-Class Attendance (Session Present / Absent)
  if (prefObj.classAttendance && typeof prefObj.classAttendance === 'object') {
    try {
      localStorage.setItem('mbaplanner_class_attendance', JSON.stringify(prefObj.classAttendance));
      const cleanRoll = getActiveRollNo();
      if (cleanRoll) {
        const rollAtt = JSON.parse(localStorage.getItem('mbaplanner_roll_attendance')) || {};
        rollAtt[cleanRoll] = Object.assign({}, prefObj.classAttendance);
        localStorage.setItem('mbaplanner_roll_attendance', JSON.stringify(rollAtt));
      }
      if (typeof window.syncClassAttendanceToAttData === 'function') {
        window.syncClassAttendanceToAttData();
      }
    } catch(e) {}
  }

  // 5. 30-Min Alert Reminder Preference
  if (prefObj.reminder30m) {
    try {
      localStorage.setItem('mbaplanner_reminder_30m', prefObj.reminder30m);
      if (typeof window.updateDrawerSettingsUI === 'function') {
        window.updateDrawerSettingsUI();
      }
    } catch(e) {}
  }

  // 6. Classes hidden "for me only" in the agenda
  if (prefObj.hiddenSessions && typeof prefObj.hiddenSessions === 'object') {
    saveOfflineCopy('mbaplanner_hidden_sessions', prefObj.hiddenSessions);
  }

  // 7. Student Name Sync
  if (prefObj.studentName) {
    try {
      localStorage.setItem('mbaplanner_myname', prefObj.studentName);
      localStorage.setItem('mbaplanner_att_username', prefObj.studentName);
      const attInput = document.getElementById('att-sync-username');
      if (attInput) attInput.value = prefObj.studentName;
    } catch(e) {}
  }
}

function savePreferencesForRoll(roll) {
  const cleanRoll = (roll || getActiveRollNo()).trim().toUpperCase();
  if (!cleanRoll) return;

  let classAtt = {};
  try {
    classAtt = JSON.parse(localStorage.getItem('mbaplanner_class_attendance')) || {};
  } catch(e) {}

  let sName = '';
  if (typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[cleanRoll]) {
    sName = CLASS_ATTENDANCE_DB[cleanRoll].name || '';
  }
  if (!sName) {
    sName = localStorage.getItem('mbaplanner_myname') || '';
  }

  const payload = {
    selections: sel,
    goals: goals,
    goalMinorDom: goalMinorDom,
    goalMajorDom: goalMajorDom,
    goalDualD1: goalDualD1,
    goalDualD2: goalDualD2,
    attData: (typeof attData !== 'undefined' && attData) ? attData : {},
    classAttendance: classAtt,
    reminder30m: localStorage.getItem('mbaplanner_reminder_30m') || 'on',
    theme: localStorage.getItem('mbaplanner_theme') || 'system',
    studentName: sName,
    hiddenSessions: getHiddenSessions(),
    updatedAt: Date.now()
  };

  try {
    const allPrefs = JSON.parse(localStorage.getItem('mbaplanner_roll_preferences')) || {};
    allPrefs[cleanRoll] = payload;
    localStorage.setItem('mbaplanner_roll_preferences', JSON.stringify(allPrefs));
    localStorage.setItem('mbaplanner_selections', JSON.stringify(sel));

    // Keep session-by-session roll attendance synced
    const allRollAtt = JSON.parse(localStorage.getItem('mbaplanner_roll_attendance')) || {};
    allRollAtt[cleanRoll] = Object.assign({}, classAtt);
    localStorage.setItem('mbaplanner_roll_attendance', JSON.stringify(allRollAtt));
  } catch(e) {
    console.warn("Could not save roll preferences locally", e);
  }
  setTimeout(() => { if (window.syncPush) window.syncPush(); }, 0);

  // Backup to Firebase Realtime Database
  if (fbDb) {
    try {
      const safeRoll = cleanRoll.replace(/[.#$[\]]/g, '_');
      fbDb.ref(`roll_preferences/${safeRoll}`).set(payload);
      if (!window._fbConnected) localStorage.setItem('mbaplanner_pending_pref_sync', cleanRoll);
    } catch(err) {
      console.warn('Firebase roll_preferences set error:', err);
    }
  }

  // Provide visual save confirmation
  triggerAutoSavePulse();
}

function loadPreferencesForRoll(roll) {
  if (!roll) return false;
  const cleanRoll = roll.trim().toUpperCase();
  let loaded = false;

  try {
    const allPrefs = JSON.parse(localStorage.getItem('mbaplanner_roll_preferences')) || {};
    if (allPrefs[cleanRoll] && allPrefs[cleanRoll].selections) {
      applyPreferences(allPrefs[cleanRoll]);
      loaded = true;
    }
  } catch(e) {}

  // Restore class attendance for this roll if available locally
  try {
    const allRollAtt = JSON.parse(localStorage.getItem('mbaplanner_roll_attendance')) || {};
    if (allRollAtt[cleanRoll]) {
      localStorage.setItem('mbaplanner_class_attendance', JSON.stringify(allRollAtt[cleanRoll]));
      if (typeof window.syncClassAttendanceToAttData === 'function') {
        window.syncClassAttendanceToAttData();
      }
    }
  } catch(e) {}

  if (!loaded && window._cloudRollPreferences && window._cloudRollPreferences[cleanRoll]) {
    applyPreferences(window._cloudRollPreferences[cleanRoll]);
    loaded = true;
  }

  if (fbDb) {
    try {
      const safeRoll = cleanRoll.replace(/[.#$[\]]/g, '_');
      fbDb.ref(`roll_preferences/${safeRoll}`).once('value').then(snap => {
        const data = snap.val();
        if (data && data.selections) {
          applyPreferences(data);
          try {
            const allPrefs = JSON.parse(localStorage.getItem('mbaplanner_roll_preferences')) || {};
            allPrefs[cleanRoll] = data;
            localStorage.setItem('mbaplanner_roll_preferences', JSON.stringify(allPrefs));
          } catch(e) {}
          render();
          if (typeof renderDailySchedule === 'function') renderDailySchedule();
          if (typeof renderAttendance === 'function' && document.getElementById('att-grid')) renderAttendance();
          if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-search-input')) {
            searchCohortAttendance();
          }
        }
      });

      // Also pull q6_attendance sessions from Firebase
      fbDb.ref(`q6_attendance/${safeRoll}`).once('value').then(snap => {
        const q6Data = snap.val();
        if (q6Data && typeof q6Data === 'object') {
          let classAtt = {};
          try {
            classAtt = JSON.parse(localStorage.getItem('mbaplanner_class_attendance')) || {};
          } catch(e) {}
          Object.assign(classAtt, q6Data);
          localStorage.setItem('mbaplanner_class_attendance', JSON.stringify(classAtt));

          const allRollAtt = JSON.parse(localStorage.getItem('mbaplanner_roll_attendance')) || {};
          allRollAtt[cleanRoll] = Object.assign(allRollAtt[cleanRoll] || {}, q6Data);
          localStorage.setItem('mbaplanner_roll_attendance', JSON.stringify(allRollAtt));

          if (typeof window.syncClassAttendanceToAttData === 'function') {
            window.syncClassAttendanceToAttData();
          }
          if (typeof renderDailySchedule === 'function' && typeof currentView !== 'undefined' && currentView === 'daily') {
            renderDailySchedule();
          }
          if (typeof renderAttendance === 'function' && document.getElementById('att-grid')) {
            renderAttendance();
          }
          if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-att-table-container')) {
            searchCohortAttendance();
          }
        }
      });
    } catch(err) {}
  }

  return loaded;
}

try {
  const activeRoll = getActiveRollNo();
  let loadedFromRoll = false;
  if (activeRoll) {
    loadedFromRoll = loadPreferencesForRoll(activeRoll);
  }
  
  if (!loadedFromRoll) {
    const savedSel = JSON.parse(localStorage.getItem('mbaplanner_selections'));
    if (savedSel) {
      ['Q5', 'Q6', 'Q7'].forEach(q => {
        if (savedSel[q] && DATA[q] && DATA[q].subjects) {
          Object.keys(savedSel[q]).forEach(code => {
            const liveSubj = DATA[q].subjects.find(s => s.code === code);
            if (liveSubj) sel[q][code] = liveSubj;
          });
        }
      });
    }
  }
} catch (e) {
  console.warn("Could not parse saved selections from localStorage.", e);
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
  if(!box)return;
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
  
  savePreferencesForRoll();
  localStorage.setItem('mbaplanner_selections', JSON.stringify(sel));
  render();
  if (typeof renderDailySchedule === 'function') {
    renderDailySchedule();
  }
  if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-att-table-container')) {
    searchCohortAttendance();
  }
}

function closeAlertModal() {
  document.getElementById('alert-modal-bg').classList.remove('open');
}

// ── PWA INSTALL PROMPT ───────────────────────────────────────────────────────
let _deferredInstallPrompt = null;

// Capture the event early — must be registered before the modal opens
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // stop the automatic browser mini-bar
  _deferredInstallPrompt = e;
  // Show install button in header and popup
  _showInstallButtons();
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  _hideInstallButtons();
});

function _showInstallButtons() {
  const hdrBtn = document.getElementById('hdr-install-btn');
  const popupBtn = document.getElementById('pwa-install-btn');
  if (hdrBtn) hdrBtn.style.display = 'inline-block';
  if (popupBtn) popupBtn.style.display = 'block';
}

function _hideInstallButtons() {
  const hdrBtn = document.getElementById('hdr-install-btn');
  const popupBtn = document.getElementById('pwa-install-btn');
  if (hdrBtn) hdrBtn.style.display = 'none';
  if (popupBtn) popupBtn.style.display = 'none';
}

// Called by both the header button and the popup button
function handleInstallClick() {
  if (_deferredInstallPrompt) {
    // Android Chrome — one-tap native prompt
    _deferredInstallPrompt.prompt();
    _deferredInstallPrompt.userChoice.then((choice) => {
      _deferredInstallPrompt = null;
      if (choice.outcome === 'accepted') {
        _hideInstallButtons();
        closeAlertModal();
      }
    });
  } else {
    // iOS Safari — show instructions tooltip
    const existing = document.getElementById('ios-install-tooltip');
    if (existing) { existing.remove(); return; }
    const tip = document.createElement('div');
    tip.id = 'ios-install-tooltip';
    tip.style.cssText = 'position:fixed; top:70px; right:16px; z-index:9999; background:var(--bg); border:.5px solid var(--bd-info); border-radius:10px; padding:12px 14px; font-size:12px; color:var(--tx); max-width:240px; box-shadow:0 4px 20px rgba(0,0,0,0.15); line-height:1.5;';
    tip.innerHTML = `<strong style="color:var(--tx-info);">📱 Add to Home Screen</strong><br>Tap the <strong>Share icon (⎙)</strong> at the bottom of Safari, then tap <strong>Add to Home Screen</strong>.<br><br><span style="font-size:10px;color:var(--tx3);">Tap Install App again to close.</span>`;
    document.body.appendChild(tip);
    // Auto-dismiss after 6s
    setTimeout(() => { if (tip.parentNode) tip.remove(); }, 6000);
  }
}

function triggerPWAInstall() { handleInstallClick(); }

function _setupInstallPopupUI() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const iosHint = document.getElementById('pwa-ios-hint');
  const desktopHint = document.getElementById('pwa-desktop-hint');

  if (isIOS && isSafari) {
    // iOS: show manual instruction card in popup + header button
    if (iosHint) iosHint.style.display = 'block';
    const hdrBtn = document.getElementById('hdr-install-btn');
    if (hdrBtn) hdrBtn.style.display = 'inline-block';
  } else if (_deferredInstallPrompt) {
    // Android: button already shown by event handler
  } else {
    // Desktop / unsupported
    if (desktopHint) desktopHint.style.display = 'block';
  }
}

function switchQ(q){
  cQ=q;
  document.querySelectorAll('.qtab').forEach((t,i)=>t.classList.toggle('on',['Q6','Q5','Q7'][i]===q));

  render();
}
function setFilter(d){fDom=(fDom===d?'All':d);fFromTracker=(fDom!=='All'?fDom:'');render();}
function matchesSearch(s,q){
  if(!q)return true;
  q=q.trim().toLowerCase();
  return (s.name ? s.name.toLowerCase() : '').includes(q)||(s.code ? s.code.toLowerCase() : '').includes(q)||s.instructor.toLowerCase().includes(q);
}

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
          ? `<div class="lc lc-click" onclick="switchView('menu')" title="See today's mess menu">🍽 lunch</div>`
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
        <div class="sname">${s.name} ${s.isCore?'<span style="font-size:9px;background:var(--tx-info);color:#fff;padding:2px 5px;border-radius:4px;margin-left:4px;vertical-align:middle;font-weight:700">MANDATORY CORE</span>':''}</div>
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
  renderSupply();
  renderPlannerRollBanner();
}

window.renderPlannerRollBanner = function() {
  const container = document.getElementById('plan-roll-banner');
  if (!container) return;

  const savedRoll = getActiveRollNo();
  if (savedRoll) {
    let studentName = '';
    if (typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[savedRoll]) {
      studentName = CLASS_ATTENDANCE_DB[savedRoll].name;
    }

    container.innerHTML = `
    <div class="plan-student-bar" style="padding:7px 12px; margin-bottom:12px;">
      <div class="plan-student-title" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12px;">
        <span>🎓</span><span>${savedRoll}</span>
        ${studentName ? `<span style="font-weight:600; color:var(--tx2);">· ${studentName}</span>` : ''}
        <span class="plan-student-badge">✓ Auto-Saving</span>
      </div>
      <button class="ios-seg-btn" onclick="changePlannerRollNo()" style="padding:4px 10px; font-size:11px; color:var(--tx-info);">Change</button>
    </div>`;
  } else {
    container.innerHTML = `
    <div class="plan-student-prompt">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">🎓</span>
          <span style="font-size:13px; font-weight:700; color:var(--tx);">Auto-Save to your Roll Number</span>
        </div>
        <span style="font-size:10.5px; font-weight:700; color:var(--tx-info); background:rgba(30,122,75,0.1); padding:2px 7px; border-radius:6px;">Auto-Sync</span>
      </div>
      <div style="font-size:11.5px; color:var(--tx2); margin-bottom:10px; line-height:1.4;">
        Enter your Roll No (e.g. <code>MS25A071</code>) so all your chosen electives, goals, daily schedule and attendance automatically save to your profile.
      </div>
      <div style="display:flex; gap:8px;">
        <input type="text" id="planner-roll-input" class="cmp-input" placeholder="e.g. MS25A071" style="flex:1; text-transform:uppercase; font-weight:700; font-size:12px; padding:6px 10px; border-radius:8px;" onkeydown="if(event.key==='Enter') savePlannerRollNo()">
        <button class="cmp-btn" onclick="savePlannerRollNo()" style="padding:6px 14px; border-radius:8px; font-size:12px; white-space:nowrap;">Link & Auto-Save</button>
      </div>
    </div>`;
  }
};

window.setRollNumber = function(val) {
  const clean = (val || '').trim().toUpperCase();
  const prevRoll = getActiveRollNo();
  if (prevRoll && prevRoll !== clean) {
    savePreferencesForRoll(prevRoll);
  }

  if (!clean) {
    localStorage.removeItem('mbaplanner_roll_no');
    if (window._activeRollPrefRef) {
      window._activeRollPrefRef.off();
      window._activeRollPrefRef = null;
    }
  } else {
    localStorage.setItem('mbaplanner_roll_no', clean);
    let sName = '';
    if (typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[clean]) {
      sName = CLASS_ATTENDANCE_DB[clean].name || '';
    }
    const finalName = sName || clean;
    localStorage.setItem('mbaplanner_myname', finalName);
    localStorage.setItem('mbaplanner_att_username', finalName);
    myName = finalName;
    const cmpNameInp = document.getElementById('cmp-name-input');
    if (cmpNameInp) cmpNameInp.value = finalName;
    if (typeof groupRef !== 'undefined' && groupRef && typeof publishMyPlan === 'function') {
      publishMyPlan(finalName);
    }
    const loaded = loadPreferencesForRoll(clean);
    if (!loaded) {
      savePreferencesForRoll(clean);
    }

    // Set up continuous live Firebase listener on this student's profile
    if (fbDb) {
      try {
        const safeRoll = clean.replace(/[.#$[\]]/g, '_');
        if (window._activeRollPrefRef) {
          window._activeRollPrefRef.off();
        }
        window._activeRollPrefRef = fbDb.ref(`roll_preferences/${safeRoll}`);
        window._activeRollPrefRef.on('value', snap => {
          const val = snap.val();
          if (val && val.updatedAt) {
            const allPrefs = JSON.parse(localStorage.getItem('mbaplanner_roll_preferences')) || {};
            const local = allPrefs[clean];
            if (!local || (val.updatedAt > (local.updatedAt || 0))) {
              applyPreferences(val);
              allPrefs[clean] = val;
              localStorage.setItem('mbaplanner_roll_preferences', JSON.stringify(allPrefs));
              render();
              if (typeof renderDailySchedule === 'function') renderDailySchedule();
              if (typeof renderAttendance === 'function' && document.getElementById('att-grid')) renderAttendance();
              if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-search-input')) searchCohortAttendance();
            }
          }
        });
      } catch(e) {}
    }
  }

  renderPlannerRollBanner();
  render();
  if (typeof renderDailySchedule === 'function') renderDailySchedule();
  if (typeof updatePwaDrawerStudent === 'function') updatePwaDrawerStudent();
  if (typeof renderAttendance === 'function' && document.getElementById('att-grid')) renderAttendance();
  if (typeof searchCohortAttendance === 'function') {
    const cohortInput = document.getElementById('cohort-search-input');
    if (cohortInput) cohortInput.value = clean;
    searchCohortAttendance();
  }
};

window.savePlannerRollNo = function() {
  const inp = document.getElementById('planner-roll-input');
  if (!inp) return;
  const val = inp.value.trim().toUpperCase();
  if (!val) {
    alert('Please enter a valid Roll Number.');
    return;
  }
  setRollNumber(val);
};

window.changePlannerRollNo = function() {
  const current = getActiveRollNo();
  const val = prompt('Enter your Roll Number to link planner preferences & agenda (e.g. MS25A071):', current);
  if (val !== null) {
    setRollNumber(val);
  }
};

window.updatePwaDrawerStudent = function() {
  const el = document.getElementById('pwa-drawer-student');
  if (!el) return;
  const roll = getActiveRollNo();
  if (roll) {
    let name = '';
    if (typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[roll]) {
      name = CLASS_ATTENDANCE_DB[roll].name;
    }
    el.innerHTML = `🎓 <strong>${roll}</strong> ${name ? `· ${name}` : ''}`;
  } else {
    el.innerHTML = `<span onclick="changePlannerRollNo()" style="color:var(--tx-info); cursor:pointer;">+ Set Roll Number</span>`;
  }
};

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
      .tc-name{font-size:10px;font-weight:700;color:#1e7a4b;line-height:1.3}
      .tc-instr{font-size:9px;color:#1e7a4b;opacity:.7;margin-top:2px}
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

let myName='';
let myGroupCode='';
let roster={}; 
let compareQ='Q6';
let compareFilter='all'; 
let currentView='plan';

const CMP_PALETTE=['#2b6cb0','#0f6e56','#993556','#854f0b','#534ab7','#993c1d','#1a6b3c','#a32d2d','#0c6478','#6b4f9e'];
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
    fbApp=firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
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
  document.getElementById('vtab-plan')?.classList.toggle('on', v==='plan');
  document.getElementById('vtab-att')?.classList.toggle('on', v==='att');
  document.getElementById('vtab-compare')?.classList.toggle('on', v==='compare');
  document.getElementById('vtab-menu')?.classList.toggle('on', v==='menu');
  document.getElementById('vtab-daily')?.classList.toggle('on', v==='daily');
  document.getElementById('vtab-master')?.classList.toggle('on', v==='master');
  
  if(document.getElementById('view-plan')) document.getElementById('view-plan').style.display = v==='plan' ? '' : 'none';
  if(document.getElementById('view-att')) document.getElementById('view-att').style.display = v==='att' ? '' : 'none';
  if(document.getElementById('view-compare')) document.getElementById('view-compare').style.display = v==='compare' ? '' : 'none';
  if(document.getElementById('view-menu')) document.getElementById('view-menu').style.display = v==='menu' ? '' : 'none';
  if(document.getElementById('view-daily')) document.getElementById('view-daily').style.display = v==='daily' ? '' : 'none';
  if(document.getElementById('view-master')) document.getElementById('view-master').style.display = v==='master' ? '' : 'none';
  if (v !== 'daily' && window._nextClassInterval) {
      clearInterval(window._nextClassInterval);
      window._nextClassInterval = null;
  }
  
  if (v === 'master') renderMasterSchedule();
  if (v === 'daily') renderDailySchedule();
  
  if(v==='compare'){
    const nameInp = document.getElementById('cmp-name-input');
    const codeInp = document.getElementById('cmp-code-input');
    let currentSavedName = (nameInp && nameInp.value ? nameInp.value.trim() : '') || localStorage.getItem('mbaplanner_myname') || '';
    if (!currentSavedName) {
      const activeRoll = getActiveRollNo();
      if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
        currentSavedName = CLASS_ATTENDANCE_DB[activeRoll].name;
      } else if (activeRoll) {
        currentSavedName = activeRoll;
      }
    }
    const currentSavedCode = (codeInp && codeInp.value ? codeInp.value.trim() : '') || localStorage.getItem('mbaplanner_groupcode') || 'doms-mba-2026';
    if (nameInp && !nameInp.value) nameInp.value = currentSavedName;
    if (codeInp && !codeInp.value) codeInp.value = currentSavedCode;

    if (!myName && currentSavedName) myName = currentSavedName;
    if (!myGroupCode && currentSavedCode) {
      cmpConnect();
    } else {
      if (currentSavedName && groupRef) publishMyPlan(currentSavedName);
      renderCompareView();
    }
    if(!localStorage.getItem('mbaplanner_seen_compare_hint')){
      document.getElementById('compare-onboard-hint')?.classList.add('show');
    }
  }
  if(v==='menu' && typeof renderMenu==='function') renderMenu();
  if(v==='plan'){
    renderPlannerRollBanner();
    render();
  }
  if(v==='att'){
    setAttQ(cQ);
    const savedAttName = localStorage.getItem('mbaplanner_att_username');
    const savedCompareName = localStorage.getItem('mbaplanner_myname');
    const inputEl = document.getElementById('att-sync-username');
    if(inputEl && !inputEl.value) {
      if(savedAttName) inputEl.value = savedAttName;
      else if(savedCompareName) inputEl.value = savedCompareName;
    }
    const cohortSearchInp = document.getElementById('cohort-search-input');
    const savedRoll = getActiveRollNo();
    if (cohortSearchInp && savedRoll) {
      if (!cohortSearchInp.value) cohortSearchInp.value = savedRoll;
      searchCohortAttendance();
    }
  }

  // Sync PWA side drawer active state + top bar title
  const DRAWER_LABELS = {
    plan: '📋 Planner', daily: '📅 Daily Agenda', master: '🗓️ Weekly Schedule',
    att: '✅ Attendance', compare: '👥 Compare', mess: '🍽 Mess Menu'
  };
  const titleEl = document.getElementById('pwa-topbar-title');
  if (titleEl) titleEl.textContent = DRAWER_LABELS[v] || '';
  document.querySelectorAll('.pwa-drawer-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === v);
  });
}

function cmpConnect(){
  const statusEl=document.getElementById('cmp-status');
  if(!fbDb){
    if(!initFirebase()){
      if (statusEl) statusEl.textContent='⚠️ Could not reach the live database — check your internet connection and reload.';
      renderCompareView();
      return;
    }
  }
  const nameInput=document.getElementById('cmp-name-input');
  const codeInput=document.getElementById('cmp-code-input');
  let currentSavedName = (nameInput && nameInput.value ? nameInput.value.trim() : '') || localStorage.getItem('mbaplanner_myname') || '';
  if (!currentSavedName) {
    const activeRoll = getActiveRollNo();
    if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
      currentSavedName = CLASS_ATTENDANCE_DB[activeRoll].name;
    } else if (activeRoll) {
      currentSavedName = activeRoll;
    }
  }
  const currentSavedCode = (codeInput && codeInput.value ? codeInput.value.trim() : '') || localStorage.getItem('mbaplanner_groupcode') || 'doms-mba-2026';
  const name = (nameInput && nameInput.value ? nameInput.value.trim() : '') || currentSavedName;
  const codeRaw = (codeInput && codeInput.value ? codeInput.value.trim() : '') || currentSavedCode;

  const code = sanitizeGroupCode(codeRaw);
  if(!code){ if(codeInput) flashError(codeInput); return; }

  if (nameInput && !nameInput.value && name) nameInput.value = name;
  if (codeInput && !codeInput.value) codeInput.value = code;

  myName = name;
  if (name) localStorage.setItem('mbaplanner_myname', name);
  joinGroup(code);

  if(!name){
    myName='';
    if (statusEl) {
      statusEl.innerHTML=`📍 Viewing group <b>"${myGroupCode}"</b> anonymously. Add a name above and tap Compare again to publish your own schedule.`;
      statusEl.classList.add('connected');
    }
    renderCompareView();
    return;
  }

  publishMyPlan(name);
}

function joinGroup(code){
  if(!fbDb) return;
  myGroupCode=code;
  compareFilter='all';
  localStorage.setItem('mbaplanner_groupcode', code);
  const codeInp = document.getElementById('cmp-code-input');
  if (codeInp) codeInp.value=code;

  if(groupRef) groupRef.off(); 
  groupRef=fbDb.ref('groups/'+code+'/members');
  groupRef.on('value', snap=>{
    roster=snap.val()||{};
    renderCompareView();
  }, err=>{
    console.error('Firebase read error',err);
    const statusEl = document.getElementById('cmp-status');
    if (statusEl) statusEl.textContent='⚠️ Could not connect — check your internet connection.';
  });
}

function resolveSubj(q, storedSubj){
  const live=((DATA[q]&&DATA[q].subjects)||[]).find(x=>x.code===storedSubj.code);
  return live ? {...storedSubj, ...live} : storedSubj;
}

function getMyEncodedPlan(){
  const r={};
  ['Q5','Q6','Q7'].forEach(q=>{
    r[q]={};
    if (typeof DATA !== 'undefined' && DATA[q] && DATA[q].subjects) {
      DATA[q].subjects.filter(s => s.isCore).forEach(s => {
        r[q][s.code] = resolveSubj(q, s);
      });
    }
    Object.values(sel[q]||{}).forEach(s=>{
      r[q][s.code] = resolveSubj(q, s);
    });
  });
  return r;
}

function publishMyPlan(name){
  if(!groupRef){ return; }
  name=(name||myName||'').trim();
  if(!name) {
    const activeRoll = getActiveRollNo();
    if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
      name = CLASS_ATTENDANCE_DB[activeRoll].name;
    } else {
      name = localStorage.getItem('mbaplanner_myname') || activeRoll || '';
    }
  }
  if(!name) return;

  const oldName=myName;
  myName=name;
  localStorage.setItem('mbaplanner_myname', name);
  const key=sanitizeKey(name);
  const statusEl=document.getElementById('cmp-status');

  const plan=getMyEncodedPlan();
  groupRef.child(key).set(plan).then(()=>{
    if(oldName && sanitizeKey(oldName)!==key) groupRef.child(sanitizeKey(oldName)).remove();
    if (statusEl) {
      statusEl.innerHTML=`📍 Connected to <b>"${myGroupCode}"</b> as <b>${name}</b> — share the group code so friends can join.`;
      statusEl.classList.add('connected');
    }
    renderCompareView();
  }).catch(e=>{
    if (statusEl) statusEl.textContent='⚠️ Could not publish — check your internet connection.';
    console.error(e);
  });

  renderCompareView();
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
    const nameInp = document.getElementById('cmp-name-input');
    if (nameInp) nameInp.value='';
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

  // Also include classmates from cloud roll preferences in default batch group 'doms-mba-2026'
  if ((myGroupCode === 'doms-mba-2026' || !myGroupCode) && window._cloudRollPreferences) {
    Object.entries(window._cloudRollPreferences).forEach(([roll, pref]) => {
      if (pref && pref.selections) {
        let label = pref.studentName || roll;
        if (typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[roll] && CLASS_ATTENDANCE_DB[roll].name) {
          label = CLASS_ATTENDANCE_DB[roll].name;
        }
        const key = sanitizeKey(label);
        if (!parts[key]) {
          const plan = {};
          ['Q5', 'Q6', 'Q7'].forEach(q => {
            plan[q] = {};
            if (DATA[q] && DATA[q].subjects) {
              DATA[q].subjects.filter(s => s.isCore).forEach(s => {
                plan[q][s.code] = resolveSubj(q, s);
              });
            }
            if (pref.selections[q]) {
              Object.values(pref.selections[q]).forEach(s => {
                plan[q][s.code] = resolveSubj(q, s);
              });
            }
          });
          parts[key] = { label, plan };
        }
      }
    });
  }

  let currentName = (myName || localStorage.getItem('mbaplanner_myname') || '').trim();
  if (!currentName) {
    const activeRoll = getActiveRollNo();
    if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
      currentName = CLASS_ATTENDANCE_DB[activeRoll].name;
    } else if (activeRoll) {
      currentName = activeRoll;
    }
  }
  if(currentName){
    const key=sanitizeKey(currentName);
    parts[key]={label:currentName, plan:getMyEncodedPlan()};
  }
  return parts;
}

function cmpFilteredParticipants(){
  const all=cmpParticipants();
  if(compareFilter!=='all' && !all[compareFilter]) compareFilter='all';
  if(compareFilter==='all') return all;
  let currentName = (myName || localStorage.getItem('mbaplanner_myname') || '').trim();
  if (!currentName) {
    const activeRoll = getActiveRollNo();
    if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
      currentName = CLASS_ATTENDANCE_DB[activeRoll].name;
    } else if (activeRoll) {
      currentName = activeRoll;
    }
  }
  const myKey=sanitizeKey(currentName);
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
  if(!row) return;
  if(!keys.length){ row.innerHTML=''; if (empty) empty.style.display='block'; return; }
  if (empty) empty.style.display='none';

  let currentName = (myName || localStorage.getItem('mbaplanner_myname') || '').trim();
  if (!currentName) {
    const activeRoll = getActiveRollNo();
    if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
      currentName = CLASS_ATTENDANCE_DB[activeRoll].name;
    } else if (activeRoll) {
      currentName = activeRoll;
    }
  }
  const myKey=sanitizeKey(currentName);
  const others=keys.filter(k=>k!==myKey);

  let html='';
  if(others.length>0){
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
      <span class="cmp-chip-count">${count} electives</span>
      <span class="cmp-chip-x" onclick="event.stopPropagation();removeFromRoster('${keyEsc}')" title="Remove from group">✕</span>
    </div>`;
  }).join('');

  if (others.length === 0) {
    html += `<div style="font-size:12px; color:var(--tx2); padding:6px 12px; background:var(--bg2); border-radius:8px; border:0.5px dashed var(--bd); margin-left:4px; display:inline-flex; align-items:center; gap:6px;">
      <span>📣</span> <span>Share code <b>"${myGroupCode || 'doms-mba-2026'}"</b> with friends to compare!</span>
    </div>`;
  }

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
  let currentName = (myName || localStorage.getItem('mbaplanner_myname') || '').trim();
  if (!currentName) {
    const activeRoll = getActiveRollNo();
    if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
      currentName = CLASS_ATTENDANCE_DB[activeRoll].name;
    } else if (activeRoll) {
      currentName = activeRoll;
    }
  }
  const myKey = sanitizeKey(currentName);
  document.getElementById('cmp-legend').innerHTML=keys.map(k=>{
    const isMe=k===myKey;
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
      if(slot==='12pm-1pm'){ h+=`<div class="cmp-lc lc-click" onclick="switchView('menu')" title="See today's mess menu">🍽 lunch</div>`; return; }
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

  let currentName = (myName || localStorage.getItem('mbaplanner_myname') || '').trim();
  if (!currentName) {
    const activeRoll = getActiveRollNo();
    if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
      currentName = CLASS_ATTENDANCE_DB[activeRoll].name;
    } else if (activeRoll) {
      currentName = activeRoll;
    }
  }
  const myKey=sanitizeKey(currentName);
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
  const el = document.getElementById("att-qtabs");
  if(el) {
    el.innerHTML = ["Q6","Q5","Q7"].map(q => `<button class="cmp-qtab${attQ===q?" on":""}" onclick="setAttQ('${q}')">${q}</button>`).join("");
  }
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
  
  // Auto-save to active roll number
  savePreferencesForRoll();

  const syncUserEl = document.getElementById('att-sync-username');
  if(syncUserEl && typeof syncUserEl.value === 'string' && syncUserEl.value.trim()) {
    saveAttendanceCloud(false); 
  }
  if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-att-table-container')) {
    searchCohortAttendance();
  }
}

function renderAttendance() {
  const area = document.getElementById('att-grid');
  if (!area) return;
  const coreCourses = (DATA[attQ] && DATA[attQ].subjects) 
      ? DATA[attQ].subjects.filter(s => s.isCore) 
      : [];
  const chosenElectives = Object.values(sel[attQ] || {});
  const activeMap = {};
  coreCourses.forEach(s => { activeMap[s.code] = s; });
  chosenElectives.forEach(s => { activeMap[s.code] = s; });
  const subjects = Object.values(activeMap);

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
  const el = document.getElementById('att-sync-username');
  const u = (el && typeof el.value === 'string' ? el.value.trim() : '') || getActiveRollNo();
  const statusEl = document.getElementById('att-sync-status');
  if (!u) {
    if (statusEl) {
      statusEl.textContent = '⚠️ Please enter a roll number or username first.';
      statusEl.style.color = 'var(--tx-danger)';
    }
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

// ── COHORT & LIVE Q6 ATTENDANCE SEARCH ──────────────────────────────────────────
window.currentCohortTerm = 'Q6';
window.setCohortTerm = function(term) {
  window.currentCohortTerm = term;
  const q6Btn = document.getElementById('cohort-tab-q6');
  const q5Btn = document.getElementById('cohort-tab-q5');
  const bothBtn = document.getElementById('cohort-tab-both');
  if (q6Btn && q5Btn && bothBtn) {
    q6Btn.className = 'ios-seg-btn ' + (term === 'Q6' ? 'active-p' : '');
    q5Btn.className = 'ios-seg-btn ' + (term === 'Q5' ? 'active-p' : '');
    bothBtn.className = 'ios-seg-btn ' + (term === 'BOTH' ? 'active-p' : '');
  }
  searchCohortAttendance();
};

window.getQ6AttendanceForRoll = function(query) {
  const cleanQuery = (query || '').trim().toUpperCase();
  if (!cleanQuery) return null;

  // 1. Identify student and roll number
  let foundRoll = null;
  let studentName = '';

  if (typeof CLASS_ATTENDANCE_DB !== 'undefined') {
    for (const [roll, data] of Object.entries(CLASS_ATTENDANCE_DB)) {
      if (roll.toUpperCase() === cleanQuery || roll.toUpperCase().includes(cleanQuery) || (data.name && data.name.toUpperCase().includes(cleanQuery))) {
        foundRoll = roll.toUpperCase();
        studentName = data.name;
        break;
      }
    }
  }

  if (!foundRoll) {
    foundRoll = cleanQuery;
  }

  const currentSavedRoll = (localStorage.getItem('mbaplanner_roll_no') || '').trim().toUpperCase();
  const isCurrentStudent = currentSavedRoll && (currentSavedRoll === foundRoll);

  // 2. Gather all attendance sessions recorded for this roll
  let rollAttMap = {};
  if (window._cloudQ6Attendance) {
    const safeRoll = foundRoll.replace(/[.#$[\]]/g, '_');
    if (window._cloudQ6Attendance[foundRoll]) Object.assign(rollAttMap, window._cloudQ6Attendance[foundRoll]);
    if (window._cloudQ6Attendance[safeRoll]) Object.assign(rollAttMap, window._cloudQ6Attendance[safeRoll]);
  }
  try {
    const allRolls = JSON.parse(localStorage.getItem('mbaplanner_roll_attendance')) || {};
    if (allRolls[foundRoll]) {
      rollAttMap = Object.assign({}, allRolls[foundRoll]);
    }
  } catch(e) {}

  if (isCurrentStudent) {
    try {
      const activeSessions = JSON.parse(localStorage.getItem('mbaplanner_class_attendance')) || {};
      rollAttMap = Object.assign({}, activeSessions);
    } catch(e) {}
  }

  // 3. Count Present (P) and Absent (A) per subject code (and remember which dates were missed)
  const counts = {};
  const absentByCode = {};
  for (const [sessionId, status] of Object.entries(rollAttMap)) {
    const parts = sessionId.split('_');
    if (parts.length >= 3) {
      const code = parts.slice(2).join('_');
      if (status === 'A') (absentByCode[code] = absentByCode[code] || new Set()).add(parts[0]);
      if (!counts[code]) counts[code] = { p: 0, a: 0 };
      if (status === 'P') counts[code].p++;
      else if (status === 'A') counts[code].a++;
    }
  }

  // Only fallback to attData for courses that have no session records at all
  if (isCurrentStudent && attData && attData['Q6']) {
    for (const [code, c] of Object.entries(attData['Q6'])) {
      if (counts[code] === undefined && (c.p > 0 || c.a > 0)) {
        counts[code] = { p: c.p || 0, a: c.a || 0 };
      }
    }
  }

  // 4. Build subject list for Q6
  // Mandatory Core courses in Q6: MS6210 (Business Models) & MS5529 (Behavioural lab)
  const q6Subjects = (DATA['Q6'] && DATA['Q6'].subjects) ? DATA['Q6'].subjects : [];
  const coreCodes = ['MS6210', 'MS5529'];

  const subjectMap = {};
  q6Subjects.forEach(s => { subjectMap[s.code] = s; });

  const targetCodes = new Set(coreCodes);
  let studentElectives = null;
  if (isCurrentStudent && sel && sel['Q6']) {
    studentElectives = Object.values(sel['Q6']);
  } else {
    try {
      const allPrefs = JSON.parse(localStorage.getItem('mbaplanner_roll_preferences')) || {};
      if (allPrefs[foundRoll] && allPrefs[foundRoll].selections && allPrefs[foundRoll].selections['Q6']) {
        studentElectives = Object.values(allPrefs[foundRoll].selections['Q6']);
      }
    } catch(e) {}
    if (!studentElectives && window._cloudRollPreferences && window._cloudRollPreferences[foundRoll] && window._cloudRollPreferences[foundRoll].selections && window._cloudRollPreferences[foundRoll].selections['Q6']) {
      studentElectives = Object.values(window._cloudRollPreferences[foundRoll].selections['Q6']);
    }
  }

  if (studentElectives) {
    studentElectives.forEach(s => { if (s && s.code) targetCodes.add(s.code); });
  }
  Object.keys(counts).forEach(c => targetCodes.add(c));

  // Held classes with no Present/Absent mark yet (only for the signed-in student).
  if (isCurrentStudent && !window._attSessions && typeof renderDailySchedule === 'function') {
    try { renderDailySchedule(); } catch (e) {}
  }
  const unmarkedByCode = {};
  if (isCurrentStudent && window._attSessions) {
    const markedCodes = new Set(Object.keys(rollAttMap).map(id => id.split('_').slice(2).join('_')));
    Object.entries(window._attSessions).forEach(([code, list]) => {
      // skip courses tracked only with the old +/- counters (no per-class marks at all)
      if (counts[code] && !markedCodes.has(code)) return;
      const days = [...new Set(list.filter(x => !rollAttMap[x.id]).map(x => x.y))].sort();
      if (days.length) unmarkedByCode[code] = days;
    });
  }

  const subjectRecords = [];
  let totalAttended = 0;
  let totalAbsent = 0;
  let totalHeld = 0;
  const totalPlannedPerCourse = 14;

  targetCodes.forEach(code => {
    const subj = subjectMap[code] || {
      code,
      name: code,
      isCore: coreCodes.includes(code),
      v: coreCodes.includes(code) ? 'Core' : 'Elective'
    };

    const p = counts[code] ? counts[code].p : 0;
    const a = counts[code] ? counts[code].a : 0;
    const held = p + a;
    const remaining = Math.max(0, totalPlannedPerCourse - held);

    const pctHeld = held > 0 ? Math.round((p / held) * 100) : 100;
    const pctTotal = Math.round((p / totalPlannedPerCourse) * 100);
    const absencesLeft = 2 - a;

    totalAttended += p;
    totalAbsent += a;
    totalHeld += held;

    subjectRecords.push({
      code,
      name: subj.name,
      isCore: Boolean(subj.isCore),
      domain: subj.v || (subj.isCore ? 'Core' : 'Elective'),
      p,
      a,
      absentDates: [...(absentByCode[code] || [])].sort(),
      unmarkedDates: unmarkedByCode[code] || [],
      held,
      remaining,
      totalPlanned: totalPlannedPerCourse,
      pctHeld,
      pctTotal,
      absencesLeft
    });
  });

  subjectRecords.sort((x, y) => {
    if (x.isCore && !y.isCore) return -1;
    if (!x.isCore && y.isCore) return 1;
    return x.code.localeCompare(y.code);
  });

  const totalPlannedAll = subjectRecords.length * totalPlannedPerCourse;
  const overallPctHeld = totalHeld > 0 ? Math.round((totalAttended / totalHeld) * 100) : 100;
  const overallPctTotal = totalPlannedAll > 0 ? Math.round((totalAttended / totalPlannedAll) * 100) : 0;

  return {
    roll: foundRoll,
    name: studentName,
    isCurrentStudent,
    records: subjectRecords,
    summary: {
      totalAttended,
      totalAbsent,
      totalHeld,
      totalPlannedAll,
      overallPctHeld,
      overallPctTotal
    }
  };
};

function searchCohortAttendance() {
  const inputEl = document.getElementById('cohort-search-input');
  if (!inputEl) return;
  
  let query = inputEl.value.trim().toUpperCase();
  const container = document.getElementById('cohort-att-table-container');
  if (!container) return;

  if (!query) {
    const saved = (localStorage.getItem('mbaplanner_roll_no') || '').trim().toUpperCase();
    if (saved) {
      query = saved;
      inputEl.value = saved;
    }
  }

  if (!query) {
    container.style.display = 'none';
    return;
  }

  const term = window.currentCohortTerm || 'Q6';
  let htmlOutput = '';
  
  let totalP = 0;
  let totalA = 0;
  let totalHeld = 0;
  let studentName = '';
  let studentRoll = '';

  // GENERATOR FOR Q6
  const getQ6Html = () => {
    const res = getQ6AttendanceForRoll(query);
    if (!res) return '';
    const { roll, name, records, summary, isCurrentStudent } = res;
    
    totalP += summary.totalAttended;
    totalA += summary.totalAbsent;
    totalHeld += summary.totalHeld;
    if (!studentName && name) studentName = name;
    if (!studentRoll) studentRoll = roll;

    const overallColor = summary.overallPctHeld < 85 ? 'var(--tx-danger)' : '#34C759';
    let html = `
    <div style="background:var(--bg2); border:0.5px solid var(--bd); border-radius:14px; padding:14px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
        <div>
          <div style="font-size:15px; font-weight:800; color:var(--tx); display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span>🟢</span> <span>${name ? `${name} · ` : ''}<strong>${roll}</strong></span>
            ${(roll === getActiveRollNo()) 
              ? '<span class="agenda-autosave-badge" style="font-size:10.5px; font-weight:700; color:#34C759; background:rgba(52,199,89,0.12); border:0.5px solid rgba(52,199,89,0.3); padding:2px 8px; border-radius:8px;">✓ Auto-Saving</span>' 
              : `<button class="ios-seg-btn" onclick="setRollNumber('${roll}')" style="padding:2px 8px; font-size:11px; color:var(--tx-info); font-weight:700;">Set as My Profile</button>`}
          </div>
          <div style="font-size:11px; color:var(--tx2); margin-top:2px;">
            Q6 Active Attendance Record · 14 Classes Planned Per Course
          </div>
        </div>
        ${term !== 'BOTH' ? `<button class="ios-seg-btn active-p" onclick="switchView('daily')" style="padding:4px 10px; font-size:11px;">
          📅 Log in Daily Agenda
        </button>` : ''}
      </div>

      <!-- Quick Metrics Summary Grid -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; margin-bottom:14px;">
        <div style="background:var(--bg); border:0.5px solid var(--bd); border-radius:10px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:var(--tx3); text-transform:uppercase;">Attended</div>
          <div style="font-size:18px; font-weight:800; color:#34C759; margin-top:2px;">${summary.totalAttended}</div>
        </div>
        <div style="background:var(--bg); border:0.5px solid var(--bd); border-radius:10px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:var(--tx3); text-transform:uppercase;">Absent</div>
          <div style="font-size:18px; font-weight:800; color:${summary.totalAbsent > 0 ? '#FF3B30' : 'var(--tx2)'}; margin-top:2px;">${summary.totalAbsent}</div>
        </div>
        <div style="background:var(--bg); border:0.5px solid var(--bd); border-radius:10px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:var(--tx3); text-transform:uppercase;">Held / Total</div>
          <div style="font-size:18px; font-weight:800; color:var(--tx); margin-top:2px;">${summary.totalHeld} <span style="font-size:12px; font-weight:600; color:var(--tx3);">/ ${summary.totalPlannedAll}</span></div>
        </div>
        <div style="background:var(--bg); border:0.5px solid var(--bd); border-radius:10px; padding:8px 10px; text-align:center;">
          <div style="font-size:10px; font-weight:700; color:var(--tx3); text-transform:uppercase;">Overall %</div>
          <div style="font-size:18px; font-weight:800; color:${overallColor}; margin-top:2px;">${summary.overallPctHeld}%</div>
        </div>
      </div>

      <!-- Subject Breakdown Table -->
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left; background:var(--bg); border-radius:10px; overflow:hidden; border:0.5px solid var(--bd);">
          <thead>
            <tr style="border-bottom:1px solid var(--bd); background:var(--bg3);">
              <th style="padding:9px 10px; font-weight:700;">Subject</th>
              <th style="padding:9px 10px; text-align:center; font-weight:700;">Present</th>
              <th style="padding:9px 10px; text-align:center; font-weight:700;">Absent</th>
              <th style="padding:9px 10px; text-align:center; font-weight:700;">Margin</th>
              <th style="padding:9px 10px; text-align:center; font-weight:700;">% (Held)</th>
              <th style="padding:9px 10px; text-align:center; font-weight:700;">% (Total)</th>
            </tr>
          </thead>
          <tbody>
    `;

    records.forEach(rec => {
      const pctColor = rec.pctHeld < 85 ? 'var(--tx-danger)' : 'var(--tx)';
      const typeBadge = rec.isCore 
        ? '<span style="font-size:9px; background:var(--bg3); padding:2px 4px; border-radius:4px; margin-left:4px; color:var(--tx2);">CORE</span>'
        : `<span style="font-size:9px; background:rgba(30,122,75,0.1); padding:2px 4px; border-radius:4px; margin-left:4px; color:var(--tx-info);">${rec.domain}</span>`;
      
      let marginHtml = '-';
      if (rec.absencesLeft > 0) marginHtml = `<span style="color:#34C759; font-weight:600;">+${rec.absencesLeft}</span>`;
      else if (rec.absencesLeft === 0) marginHtml = `<span style="color:var(--tx-warn); font-weight:600;">0</span>`;
      else if (rec.absencesLeft < 0) marginHtml = `<span style="color:var(--tx-danger); font-weight:600;">${rec.absencesLeft}</span>`;

      html += `
        <tr style="border-bottom:0.5px solid var(--bd);">
          <td style="padding:8px 10px;">
            <div style="font-weight:600; color:var(--tx);">${rec.code}${typeBadge}</div>
            <div style="font-size:10.5px; color:var(--tx2); margin-top:2px;">${rec.name}</div>
            ${rec.absentDates.length ? `<div style="font-size:10.5px; margin-top:5px; color:var(--tx-danger); line-height:1.7;">Absent: ${rec.absentDates.map(d => {
              const label = new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              return isCurrentStudent
                ? `<a href="#" onclick="openAgendaDate('${d}'); return false" style="color:var(--tx-danger); font-weight:700; text-decoration:underline; margin-right:8px; white-space:nowrap;">${label}</a>`
                : `<span style="margin-right:8px; white-space:nowrap;">${label}</span>`;
            }).join('')}</div>` : ''}
            ${rec.unmarkedDates && rec.unmarkedDates.length ? `<div style="font-size:10.5px; margin-top:5px; color:var(--tx-warn); line-height:1.7;">Not marked: ${rec.unmarkedDates.map(d => {
              const label = new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
              return `<a href="#" onclick="openAgendaDate('${d}'); return false" style="color:var(--tx-warn); font-weight:700; text-decoration:underline; margin-right:8px; white-space:nowrap;">${label}</a>`;
            }).join('')}</div>` : ''}
          </td>
          <td style="padding:8px 10px; text-align:center; font-weight:600; color:#34C759;">${rec.p}</td>
          <td style="padding:8px 10px; text-align:center; font-weight:600; color:${rec.a > 0 ? '#FF3B30' : 'var(--tx2)'};">${rec.a}</td>
          <td style="padding:8px 10px; text-align:center;">${marginHtml}</td>
          <td style="padding:8px 10px; text-align:center; color:${pctColor};"><strong>${rec.pctHeld}%</strong></td>
          <td style="padding:8px 10px; text-align:center; color:var(--tx2);">${rec.pctTotal}%</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
      ${isCurrentStudent && records.some(r => r.unmarkedDates && r.unmarkedDates.length) ? `<div style="font-size:12px; color:var(--tx-warn); margin-top:10px; font-weight:600;">⚠️ ${records.reduce((n, r) => n + (r.unmarkedDates ? r.unmarkedDates.length : 0), 0)} class day(s) not marked yet. They are not counted above until you mark Present or Absent.</div>` : ''}
      ${isCurrentStudent && records.some(r => r.absentDates.length || (r.unmarkedDates && r.unmarkedDates.length)) ? '<div style="font-size:11px; color:var(--tx3); margin-top:8px;">Tap a date to open it in the Agenda and mark or change it.</div>' : ''}
    </div>`;
    return html;
  };

  // GENERATOR FOR Q5
  const getQ5Html = () => {
    let foundStudentId = null;
    let foundStudent = null;
    let attDb = (typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB) ? CLASS_ATTENDANCE_DB : {};
    if (window._cloudQ5Attendance) {
      attDb = window._cloudQ5Attendance;
    }
    for (const [roll, data] of Object.entries(attDb)) {
      if (roll.toUpperCase() === query || roll.toUpperCase().includes(query) || (data.name && data.name.toUpperCase().includes(query))) {
        foundStudentId = roll;
        foundStudent = data;
        break;
      }
    }
    if (!foundStudent) return '';

    if (!studentName && foundStudent.name) studentName = foundStudent.name;
    if (!studentRoll) studentRoll = foundStudentId;

    let html = `<div style="font-size: 13px; font-weight: 700; color: var(--tx-info); margin-bottom: 8px;">📁 ${foundStudent.name} (${foundStudentId}) · Official Q5 Record</div>`;
    html += '<table style="width:100%; border-collapse: collapse; font-size: 12px; text-align: left; background: var(--bg); border: .5px solid var(--bd); border-radius:10px; overflow:hidden; margin-bottom: 12px;">';
    html += '<thead><tr style="border-bottom: 1px solid var(--bd); background: var(--bg2);">';
    html += '<th style="padding: 8px 10px;">Subject</th>';
    html += '<th style="padding: 8px 10px; text-align: center;">Present</th>';
    html += '<th style="padding: 8px 10px; text-align: center;">Absent</th>';
    html += '<th style="padding: 8px 10px; text-align: center;">Percentage</th>';
    html += '</tr></thead><tbody>';

    const subjectsToDisplay = Object.keys(foundStudent.attendance);
    for (const attKey of subjectsToDisplay) {
      const att = foundStudent.attendance[attKey];
      
      totalP += att.p;
      totalA += att.a;
      totalHeld += att.t;

      let color = 'var(--tx)';
      if (att.pct < 85) color = 'var(--tx-danger)';
      else if (att.pct >= 90) color = '#34C759';

      html += `<tr style="border-bottom: 1px solid var(--bd);">`;
      html += `<td style="padding: 8px 10px; font-weight:600; color:var(--tx);">${attKey}</td>`;
      html += `<td style="padding: 8px 10px; text-align: center; color: #34C759; font-weight:600;">${att.p}</td>`;
      html += `<td style="padding: 8px 10px; text-align: center; color: ${att.a > 0 ? '#FF3B30' : 'var(--tx2)'}; font-weight:600;">${att.a}</td>`;
      html += `<td style="padding: 8px 10px; text-align: center; font-weight: bold; color: ${color}">${att.pct}%</td>`;
      html += `</tr>`;
    }
    html += '</tbody></table>';
    return html;
  };

  let q6html = '';
  let q5html = '';

  if (term === 'Q6' || term === 'BOTH') {
      q6html = getQ6Html();
  }
  if (term === 'Q5' || term === 'BOTH') {
      q5html = getQ5Html();
  }

  if (term === 'BOTH' && (q6html || q5html)) {
      const combinedPct = totalHeld > 0 ? Math.round((totalP / totalHeld) * 100) : 100;
      const combinedColor = combinedPct < 85 ? 'var(--tx-danger)' : '#34C759';
      
      htmlOutput += `
      <div style="background:var(--bg2); border:1.5px solid var(--tx-info); border-radius:14px; padding:16px; margin-bottom:16px; box-shadow: 0 4px 12px rgba(30,122,75,0.15);">
        <div style="font-size:16px; font-weight:800; color:var(--tx-info); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
          <span>🏆</span> Grand Total Combined (Q5 + Q6)
        </div>
        <div style="font-size:12px; color:var(--tx2); margin-bottom:14px;">${studentName} (${studentRoll})</div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px;">
          <div style="text-align:center;">
            <div style="font-size:10px; font-weight:700; color:var(--tx3); text-transform:uppercase;">Attended</div>
            <div style="font-size:22px; font-weight:800; color:#34C759; margin-top:2px;">${totalP}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:10px; font-weight:700; color:var(--tx3); text-transform:uppercase;">Absent</div>
            <div style="font-size:22px; font-weight:800; color:${totalA > 0 ? '#FF3B30' : 'var(--tx2)'}; margin-top:2px;">${totalA}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:10px; font-weight:700; color:var(--tx3); text-transform:uppercase;">Total Classes</div>
            <div style="font-size:22px; font-weight:800; color:var(--tx); margin-top:2px;">${totalHeld}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size:10px; font-weight:700; color:var(--tx3); text-transform:uppercase;">Grand %</div>
            <div style="font-size:22px; font-weight:800; color:${combinedColor}; margin-top:2px;">${combinedPct}%</div>
          </div>
        </div>
      </div>
      `;
  }

  if (q6html) htmlOutput += q6html;
  else if (term === 'Q6') htmlOutput += `<div class="cmp-empty" style="border-color: var(--bd-warn)">No student found matching "${query}". Check the Roll No or Name.</div>`;

  if (q5html) htmlOutput += q5html;
  else if (term === 'Q5') htmlOutput += `<div class="cmp-empty" style="border-color: var(--bd-warn)">No student found matching "${query}". Check the Roll No or Name.</div>`;

  if (term === 'BOTH' && !htmlOutput) {
      htmlOutput = `<div class="cmp-empty" style="border-color: var(--bd-warn)">No student found matching "${query}". Check the Roll No or Name.</div>`;
  }

  container.style.display = 'block';
  container.innerHTML = htmlOutput;
}


// ── INIT ────────────────────────────────────────────────────────────────────

const wasShared=loadFromURL();
render();
if(wasShared) document.getElementById('shared-banner').classList.add('show');

const _isRunningAsPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
let pwaAlertShownStorage = localStorage.getItem('mbaplanner_pwa_alert_v2');
if(!pwaAlertShownStorage && !_isRunningAsPWA) {
   setTimeout(() => {
     const modal = document.getElementById('alert-modal-bg');
     if(modal) {
       modal.classList.add('open');
       _setupInstallPopupUI(); // show the right install UI for this platform
     }
     localStorage.setItem('mbaplanner_pwa_alert_v2', '1');
   }, 800);
}

roster={};
const cmpStatusEl = document.getElementById('cmp-status');
const cmpCodeInp = document.getElementById('cmp-code-input');
const cmpNameInp = document.getElementById('cmp-name-input');
let initCmpName = localStorage.getItem('mbaplanner_myname') || '';
if (!initCmpName) {
  const activeRoll = getActiveRollNo();
  if (activeRoll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[activeRoll] && CLASS_ATTENDANCE_DB[activeRoll].name) {
    initCmpName = CLASS_ATTENDANCE_DB[activeRoll].name;
  } else if (activeRoll) {
    initCmpName = activeRoll;
  }
}
const initCmpCode = localStorage.getItem('mbaplanner_groupcode') || 'doms-mba-2026';
if (cmpCodeInp) cmpCodeInp.value = initCmpCode;
if (cmpNameInp && initCmpName) cmpNameInp.value = initCmpName;
if (initCmpName) myName = initCmpName;
if (cmpStatusEl) cmpStatusEl.classList.remove('connected');
if (cmpStatusEl) cmpStatusEl.textContent = 'Enter your name and a group code, then tap Compare.';
if(!initFirebase()){
  if (cmpStatusEl) cmpStatusEl.textContent='⚠️ Could not reach the live database — check your internet connection and reload the page.';
} else if (initCmpCode) {
  joinGroup(initCmpCode);
  if (initCmpName) {
    publishMyPlan(initCmpName);
  }
}

const savedAttNameInit = localStorage.getItem('mbaplanner_att_username') || localStorage.getItem('mbaplanner_myname');
const attSyncUserInp = document.getElementById('att-sync-username');
if(savedAttNameInit && attSyncUserInp) {
  attSyncUserInp.value = savedAttNameInit;
}

if('serviceWorker' in navigator){
  // app.js is injected by index.html after the views load, so the window
  // 'load' event has usually already fired by the time we get here.
  const registerSW = ()=>navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('SW registration failed', err));
  if (document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW);
}


// --- OFFLINE SUPPORT ---
// Last-known copies of cloud data, so every tab still has something to show
// when the app is opened without internet.
function saveOfflineCopy(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch(e) { console.warn('Could not store offline copy of', key, e); }
}
function loadOfflineCopy(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch(e) { return null; }
}
liveWeeklyCache = liveWeeklyCache || loadOfflineCopy('mbaplanner_weekly_cache');
window._cloudQ6Attendance = window._cloudQ6Attendance || loadOfflineCopy('mbaplanner_cloud_q6_attendance');
window._cloudQ5Attendance = window._cloudQ5Attendance || loadOfflineCopy('mbaplanner_cloud_q5_attendance');
window._cloudRollPreferences = window._cloudRollPreferences || loadOfflineCopy('mbaplanner_cloud_roll_preferences');
window._scheduleChanges = loadOfflineCopy('mbaplanner_cloud_schedule_changes') || {};

function updateOfflineBanner() {
  let el = document.getElementById('offline-banner');
  if (navigator.onLine) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement('div');
  el.id = 'offline-banner';
  el.style.cssText = 'position:fixed; bottom:26px; left:50%; transform:translateX(-50%); max-width:calc(100% - 150px); z-index:10000; text-align:center; padding:8px 14px; border-radius:20px; font-size:12px; font-weight:600; background:var(--bg-warn); color:var(--tx-warn); border:.5px solid var(--bd-warn); box-shadow:0 4px 10px rgba(0,0,0,0.15);';
  el.textContent = '📴 Offline — showing saved data';
  el.title = 'Changes you make will sync when you reconnect.';
  document.body.appendChild(el);
}
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);
updateOfflineBanner();

// --- FIREBASE LIVE SCHEDULE LISTENER ---
window.lastSyncedTime = null;
window._isOfflineFallback = false;

window.refreshLiveSchedule = function(btnElement) {
    if(btnElement) btnElement.innerText = "⏳ Syncing...";
    const ptrEl = document.getElementById('ptr-indicator');
    if (ptrEl && !btnElement) ptrEl.style.height = '40px';
    
    if(typeof fbDb !== 'undefined' && fbDb) {
      // 1. Live Excel Timetable
      fbDb.ref('schedule').once('value').then(snap => {
        const data = snap.val();
        if(data) {
            liveDailyCache = data.daily;
            liveWeeklyCache = data.weekly;
            saveOfflineCopy('mbaplanner_weekly_cache', liveWeeklyCache);
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
        if (btnElement) btnElement.innerText = "✓ Synced";
      }).catch(e => {
          console.warn('Could not fetch live cloud schedule.', e);
          if(btnElement) btnElement.innerText = "❌ Sync failed";
          if (ptrEl) ptrEl.style.height = '0px';
          
          if (!liveDailyCache) {
             if (typeof currentView !== 'undefined' && currentView === 'daily') renderDailySchedule();
          }
      });

      // 2. Q6 Attendance Sync
      fbDb.ref('q6_attendance').once('value').then(snap => {
        const cloudAtt = snap.val();
        if (cloudAtt) {
            window._cloudQ6Attendance = cloudAtt;
            saveOfflineCopy('mbaplanner_cloud_q6_attendance', cloudAtt);
            if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-att-table-container')) {
                searchCohortAttendance();
            }
            if (typeof renderDailySchedule === 'function' && typeof currentView !== 'undefined' && currentView === 'daily') {
                renderDailySchedule();
            }
        }
      }).catch(e => console.warn('Could not fetch cloud q6 attendance.', e));

      fbDb.ref('q5_attendance').once('value').then(snap => {
        const cloudQ5 = snap.val();
        if (cloudQ5) {
            window._cloudQ5Attendance = cloudQ5;
            saveOfflineCopy('mbaplanner_cloud_q5_attendance', cloudQ5);
            if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-att-table-container')) {
                searchCohortAttendance();
            }
        }
      }).catch(e => console.warn('Could not fetch cloud q5 attendance.', e));

      // 3. Roll Preferences Sync
      fbDb.ref('roll_preferences').once('value').then(snap => {
        const cloudPrefs = snap.val();
        if (cloudPrefs) {
          window._cloudRollPreferences = cloudPrefs;
          saveOfflineCopy('mbaplanner_cloud_roll_preferences', cloudPrefs);
          const activeRoll = getActiveRollNo();
          if (activeRoll && cloudPrefs[activeRoll]) {
            const allLocal = JSON.parse(localStorage.getItem('mbaplanner_roll_preferences')) || {};
            const localPref = allLocal[activeRoll];
            if (!localPref || (cloudPrefs[activeRoll].updatedAt && cloudPrefs[activeRoll].updatedAt > (localPref.updatedAt || 0))) {
              applyPreferences(cloudPrefs[activeRoll]);
              allLocal[activeRoll] = cloudPrefs[activeRoll];
              localStorage.setItem('mbaplanner_roll_preferences', JSON.stringify(allLocal));
              localStorage.setItem('mbaplanner_selections', JSON.stringify(sel));
              render();
              if (typeof renderDailySchedule === 'function') renderDailySchedule();
              if (typeof renderAttendance === 'function' && document.getElementById('att-grid')) renderAttendance();
            }
          }
          if (activeRoll) {
            const safeRoll = activeRoll.replace(/[.#$[\]]/g, '_');
            if (window._activeRollPrefRef) window._activeRollPrefRef.off();
            window._activeRollPrefRef = fbDb.ref(`roll_preferences/${safeRoll}`);
            window._activeRollPrefRef.on('value', snap => {
              const val = snap.val();
              if (val && val.updatedAt) {
                const allPrefs = JSON.parse(localStorage.getItem('mbaplanner_roll_preferences')) || {};
                const local = allPrefs[activeRoll];
                if (!local || (val.updatedAt > (local.updatedAt || 0))) {
                  applyPreferences(val);
                  allPrefs[activeRoll] = val;
                  localStorage.setItem('mbaplanner_roll_preferences', JSON.stringify(allPrefs));
                  render();
                  if (typeof renderDailySchedule === 'function') renderDailySchedule();
                  if (typeof renderAttendance === 'function' && document.getElementById('att-grid')) renderAttendance();
                  if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-search-input')) searchCohortAttendance();
                }
              }
            });
          }
        }
      }).catch(e => console.warn('Could not fetch cloud roll preferences.', e));
    }
};

// Continuous Real-Time Listener on Schedule (Excel updates)
if (typeof fbDb !== 'undefined' && fbDb) {
  try {
    fbDb.ref('schedule').on('value', snap => {
      const data = snap.val();
      if (data && data.daily) {
        liveDailyCache = data.daily;
        liveWeeklyCache = data.weekly;
        saveOfflineCopy('mbaplanner_weekly_cache', liveWeeklyCache);
        window.lastSyncedTime = new Date();
        window._isOfflineFallback = false;
        localStorage.setItem('mbaplanner_daily_cache', JSON.stringify({
          data: liveDailyCache,
          time: window.lastSyncedTime.getTime()
        }));
        if (typeof currentView !== 'undefined') {
          if (currentView === 'daily') renderDailySchedule();
          if (currentView === 'master') renderMasterSchedule();
        }
      }
    });

    fbDb.ref('q6_attendance').on('value', snap => {
      const cloudAtt = snap.val();
      if (cloudAtt) {
        window._cloudQ6Attendance = cloudAtt;
        saveOfflineCopy('mbaplanner_cloud_q6_attendance', cloudAtt);
        if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-att-table-container')) {
          searchCohortAttendance();
        }
      }
    });

    fbDb.ref('q5_attendance').on('value', snap => {
      const cloudQ5 = snap.val();
      if (cloudQ5) {
        window._cloudQ5Attendance = cloudQ5;
        saveOfflineCopy('mbaplanner_cloud_q5_attendance', cloudQ5);
        if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-att-table-container')) {
          searchCohortAttendance();
        }
      }
    });

    fbDb.ref('schedule_changes').on('value', snap => {
      window._scheduleChanges = snap.val() || {};
      saveOfflineCopy('mbaplanner_cloud_schedule_changes', window._scheduleChanges);
      if (typeof currentView !== 'undefined') {
        if (currentView === 'daily') renderDailySchedule();
      }
    });

    fbDb.ref('roll_preferences').on('value', snap => {
      const cloudPrefs = snap.val();
      if (cloudPrefs) {
        window._cloudRollPreferences = cloudPrefs;
        saveOfflineCopy('mbaplanner_cloud_roll_preferences', cloudPrefs);
        if (typeof renderCompareView === 'function' && typeof currentView !== 'undefined' && currentView === 'compare') {
          renderCompareView();
        }
      }
    });
  } catch(e) {}

  // Firebase only queues offline writes in memory, so anything changed while
  // offline would be lost if the app is closed before reconnecting. Pending
  // writes are also kept in localStorage and pushed on the next connection.
  window._fbConnected = false;
  fbDb.ref('.info/connected').on('value', snap => {
    window._fbConnected = snap.val() === true;
    if (window._fbConnected) flushPendingOfflineWrites();
  });
}

function flushPendingOfflineWrites() {
  const pendingRoll = localStorage.getItem('mbaplanner_pending_pref_sync');
  if (pendingRoll) {
    const local = (loadOfflineCopy('mbaplanner_roll_preferences') || {})[pendingRoll];
    const safeRoll = pendingRoll.replace(/[.#$[\]]/g, '_');
    const ref = fbDb.ref(`roll_preferences/${safeRoll}`);
    ref.once('value').then(snap => {
      const cloud = snap.val();
      // Don't clobber a newer save made from another device.
      if (local && (!cloud || (local.updatedAt || 0) > (cloud.updatedAt || 0))) return ref.set(local);
    }).then(() => localStorage.removeItem('mbaplanner_pending_pref_sync'))
      .catch(e => console.warn('Could not sync offline preference changes.', e));
  }

  const pendingAtt = loadOfflineCopy('mbaplanner_pending_q6_attendance');
  if (pendingAtt && Object.keys(pendingAtt).length) {
    fbDb.ref().update(pendingAtt)
      .then(() => localStorage.removeItem('mbaplanner_pending_q6_attendance'))
      .catch(e => console.warn('Could not sync offline attendance changes.', e));
  }
}

// ── PWA INSTANT BOOT FROM CACHE + SIDE DRAWER INJECTION ─────────────────────
// ── PWA STANDALONE BOOT + DRAWER (ONLY FOR PWA) ─────────────────────────────
(function initDrawerAndBoot() {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    // 1. Only inject topbar and side drawer HTML if running as PWA
    if (isPWA) {
      const topbarHtml = `
      <div id="pwa-topbar">
        <button id="pwa-hamburger" onclick="pwaOpenDrawer()" aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
        <span id="pwa-topbar-title">📅 Daily Agenda</span>
        <button id="pwa-theme-inline" onclick="toggleTheme()" style="background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;-webkit-tap-highlight-color:transparent;">🌗</button>
      </div>`;
      const floatingTheme = document.getElementById('theme-toggle');
      if (floatingTheme) floatingTheme.style.display = 'none';

      const drawerHTML = `
      ${topbarHtml}
      <div id="pwa-drawer-backdrop" onclick="pwaCloseDrawer()"></div>
      <nav id="pwa-drawer">
        <div id="pwa-drawer-header">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>MBA Planner</span>
            <button onclick="pwaCloseDrawer()" style="background:none; border:none; font-size:18px; color:var(--tx2); cursor:pointer; padding:2px 6px;">✕</button>
          </div>
          <div id="pwa-drawer-student" style="font-size:11.5px; font-weight:600; color:var(--tx2); margin-top:4px;"></div>
        </div>
        
        <div class="pwa-drawer-section">Navigation</div>
        <button class="pwa-drawer-item active" data-view="daily"   onclick="pwaNav('daily')">📅 Daily Agenda</button>
        <button class="pwa-drawer-item"        data-view="plan"    onclick="pwaNav('plan')">📋 My Planner</button>
        <button class="pwa-drawer-item"        data-view="master"  onclick="pwaNav('master')">🗓️ Weekly Schedule</button>
        <button class="pwa-drawer-item"        data-view="att"     onclick="pwaNav('att')">✅ Attendance</button>
        <button class="pwa-drawer-item"        data-view="compare" onclick="pwaNav('compare')">👥 Compare</button>
        <button class="pwa-drawer-item"        data-view="menu"    onclick="pwaNav('menu')">🥘 Mess Menu</button>
        
        <div class="pwa-drawer-section">Preferences & Alerts</div>
        
        <!-- 30-Min Alert Toggle in Menu -->
        <div class="drawer-setting-row">
          <div class="drawer-setting-info">
            <span class="drawer-setting-title">🔔 30-Min Class Alerts</span>
            <span class="drawer-setting-sub" id="drawer-alert-status-text">Alerts before each class</span>
          </div>
          <label class="ios-switch">
            <input type="checkbox" id="drawer-alert-checkbox" onchange="toggle30mAlertFromDrawer(this.checked)">
            <span class="ios-slider"></span>
          </label>
        </div>

        <details class="drawer-push-prefs">
          <summary class="drawer-setting-title" style="cursor:pointer; padding:8px 0;">🔔 Notification settings</summary>
          <div id="drawer-push-prefs"></div>
        </details>

        <div class="drawer-setting-row" onclick="testNotification()" style="cursor:pointer;">
          <div class="drawer-setting-info">
            <span class="drawer-setting-title">🧪 Test notification</span>
            <span class="drawer-setting-sub">Check phone alerts are working</span>
          </div>
        </div>

        <div id="drawer-admin"></div>

        <!-- Student Roll Number Setting -->
        <div class="drawer-setting-row" onclick="changeAgendaRollNo()" style="cursor:pointer;">
          <div class="drawer-setting-info">
            <span class="drawer-setting-title">🎓 Student Roll No</span>
            <span class="drawer-setting-sub" id="drawer-roll-display">Tap to set roll number</span>
          </div>
          <span style="color:var(--tx3); font-size:18px;">›</span>
        </div>

        <!-- Appearance: System / Light / Dark -->
        <div class="drawer-setting-row" style="flex-direction:column; align-items:stretch; gap:8px;">
          <div class="drawer-setting-info">
            <span class="drawer-setting-title">🌓 Appearance</span>
            <span class="drawer-setting-sub">System follows your phone</span>
          </div>
          <div class="ios-segmented" style="width:100%; display:flex;">
            <button class="ios-seg-btn" data-theme-mode="system" onclick="setThemeMode('system')" style="flex:1;">System</button>
            <button class="ios-seg-btn" data-theme-mode="light" onclick="setThemeMode('light')" style="flex:1;">Light</button>
            <button class="ios-seg-btn" data-theme-mode="dark" onclick="setThemeMode('dark')" style="flex:1;">Dark</button>
          </div>
        </div>
      </nav>`;
      document.body.insertAdjacentHTML('afterbegin', drawerHTML);
      applyTheme();
    }

    // 2. Try loading cached schedule immediately
    const cached = localStorage.getItem('mbaplanner_daily_cache');
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.data) {
                liveDailyCache = parsed.data;
                window.lastSyncedTime = parsed.time ? new Date(parsed.time) : null;
                window._isOfflineFallback = false;
            }
        } catch(e) { console.warn('PWA boot cache parse error', e); }
    }

    // 3. Landing view: PWA lands on Daily Agenda; Website lands on My Planner
    if (isPWA) {
        switchView('daily');
        renderDailySchedule();
    } else {
        switchView('plan');
    }
})();

window.updateDrawerSettingsUI = function() {
    if (window.renderDrawerAdmin) window.renderDrawerAdmin();
    const prefsBox = document.getElementById('drawer-push-prefs');
    if (prefsBox && window.renderPushPrefsHtml) prefsBox.innerHTML = window.renderPushPrefsHtml();
    const isGranted = ('Notification' in window) && Notification.permission === 'granted';
    const reminderPref = localStorage.getItem('mbaplanner_reminder_30m');
    const isAlertActive = isGranted && reminderPref !== 'off';

    const alertCb = document.getElementById('drawer-alert-checkbox');
    const alertSub = document.getElementById('drawer-alert-status-text');
    if (alertCb) alertCb.checked = isAlertActive;
    if (alertSub) alertSub.textContent = isAlertActive ? 'Active · tap Notification settings to choose' : 'Disabled';

    const roll = (localStorage.getItem('mbaplanner_roll_no') || '').trim();
    const rollDisp = document.getElementById('drawer-roll-display');
    const studentHeader = document.getElementById('pwa-drawer-student');
    let studentName = '';
    if (roll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[roll]) {
        studentName = CLASS_ATTENDANCE_DB[roll].name;
    }
    if (rollDisp) {
        rollDisp.textContent = roll ? `${roll}${studentName ? ` · ${studentName}` : ''}` : 'Tap to set roll number';
    }
    if (studentHeader) {
        studentHeader.textContent = roll ? `🎓 ${roll}${studentName ? ` · ${studentName}` : ''}` : '';
    }

    document.querySelectorAll('[data-theme-mode]').forEach(b => b.classList.toggle('active-p', b.dataset.themeMode === themeMode()));
};

window.toggle30mAlertFromDrawer = function(checked) {
    if (checked) {
        if (!('Notification' in window)) {
            alert('Push notifications are not supported in this browser.');
            updateDrawerSettingsUI();
            return;
        }
        if (Notification.permission === 'granted') {
            localStorage.setItem('mbaplanner_reminder_30m', 'on');
            savePreferencesForRoll();
            updateDrawerSettingsUI();
            if (typeof currentView !== 'undefined' && currentView === 'daily') renderDailySchedule();
        } else if (Notification.permission === 'denied') {
            alert('Notifications are blocked in your browser settings. Please allow notifications for this site to receive 30-min reminders.');
            updateDrawerSettingsUI();
        } else {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') {
                    localStorage.setItem('mbaplanner_reminder_30m', 'on');
                } else {
                    localStorage.setItem('mbaplanner_reminder_30m', 'off');
                }
                savePreferencesForRoll();
                updateDrawerSettingsUI();
                if (typeof currentView !== 'undefined' && currentView === 'daily') renderDailySchedule();
            });
        }
    } else {
        localStorage.setItem('mbaplanner_reminder_30m', 'off');
        savePreferencesForRoll();
        if (window._activeNotifications) {
            window._activeNotifications.forEach(id => clearTimeout(id));
            window._activeNotifications = [];
        }
        updateDrawerSettingsUI();
        if (typeof currentView !== 'undefined' && currentView === 'daily') renderDailySchedule();
    }
};

window.pwaOpenDrawer = function() {
    updateDrawerSettingsUI();
    document.getElementById('pwa-drawer')?.classList.add('open');
    document.getElementById('pwa-drawer-backdrop')?.classList.add('open');
};
window.pwaCloseDrawer = function() {
    document.getElementById('pwa-drawer')?.classList.remove('open');
    document.getElementById('pwa-drawer-backdrop')?.classList.remove('open');
};
window.pwaNav = function(v) {
    pwaCloseDrawer();
    switchView(v);
};

// Initial Firebase fetch — runs in background, updates view when done
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

// 30-Min Notification Toggle & Scheduling
window.toggle30mAlert = function() {
    const isGranted = ('Notification' in window) && Notification.permission === 'granted';
    const reminderPref = localStorage.getItem('mbaplanner_reminder_30m');
    const isCurrentlyActive = isGranted && reminderPref !== 'off';

    if (isCurrentlyActive) {
        localStorage.setItem('mbaplanner_reminder_30m', 'off');
        savePreferencesForRoll();
        if (window._activeNotifications) {
            window._activeNotifications.forEach(id => clearTimeout(id));
            window._activeNotifications = [];
        }
        renderDailySchedule();
    } else {
        if (!('Notification' in window)) {
            alert('Push notifications are not supported in this browser.');
            return;
        }
        if (Notification.permission === 'granted') {
            localStorage.setItem('mbaplanner_reminder_30m', 'on');
            savePreferencesForRoll();
            renderDailySchedule();
        } else if (Notification.permission === 'denied') {
            alert('Notifications are blocked in your browser settings. Please allow notifications for this site to receive 30-min reminders.');
        } else {
            Notification.requestPermission().then(perm => {
                if (perm === 'granted') {
                    localStorage.setItem('mbaplanner_reminder_30m', 'on');
                } else {
                    localStorage.setItem('mbaplanner_reminder_30m', 'off');
                }
                savePreferencesForRoll();
                renderDailySchedule();
            });
        }
    }
};

window.requestNotificationPermission = function() {
    window.toggle30mAlert();
};

window._activeNotifications = window._activeNotifications || [];
function scheduleClassNotifications(todaysClasses, ymdStr) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Server push is active on this device: it sends the 30-min reminder, so
    // skip the local one to avoid a double notification.
    if (/\|true$/.test(window._pushSig || '')) return;
    if (localStorage.getItem('mbaplanner_reminder_30m') === 'off') return;
    
    // Clear pending timeouts. renderDailySchedule() can run while app.js is
    // still loading, before the declaration below has executed, so make sure
    // the list exists here instead of relying on that.
    if (!Array.isArray(window._activeNotifications)) window._activeNotifications = [];
    window._activeNotifications.forEach(id => clearTimeout(id));
    window._activeNotifications = [];

    const [y, m, d] = ymdStr.split('-');
    const utcMidnight = new Date(Date.UTC(y, m - 1, d));
    
    for (const [t, data] of Object.entries(todaysClasses)) {
        if (data.type === 'free' || data.type === 'lunch' || data.cancelled || data.hidden) continue;
        
        const timeInfo = data.timeInfo || ICS_TIME_MAP[t];
        if (!timeInfo) continue;
        
        const classStartUTC = istToUTC(utcMidnight, timeInfo.sh, timeInfo.sm);
        const timeUntilClassMs = classStartUTC.getTime() - Date.now();
        const notifyLeadTimeMs = 30 * 60 * 1000; // 30 mins
        
        if (timeUntilClassMs > notifyLeadTimeMs) {
            const delayMs = timeUntilClassMs - notifyLeadTimeMs;
            const timeoutId = setTimeout(() => {
                if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
                    navigator.serviceWorker.ready.then(reg => {
                        const title = `${data.subject ? data.subject.name : 'ICRC'} starts in 30 min`;
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
      area.innerHTML = navigator.onLine
        ? '<div class="empty-tt">Loading weekly schedule from database... ⏳</div>'
        : '<div class="empty-tt">📴 You\'re offline and the weekly schedule hasn\'t been saved on this device yet. Open the app once with internet to make it available offline.</div>';
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
                  const isCancelled = isStrike || text.includes('~') || (text ? text.toLowerCase() : '').includes('cancel') || text.includes('<s>') || text.includes('<strike>');
                  
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


// ── AGENDA ATTENDANCE & ROLL NO HELPERS ──────────────────────────────
window.saveAgendaRollNo = function() {
    const inp = document.getElementById('agenda-roll-input');
    if (!inp) return;
    const val = inp.value.trim().toUpperCase();
    if (!val) {
        alert('Please enter a valid Roll Number.');
        return;
    }
    setRollNumber(val);
};

window.changeAgendaRollNo = function() {
    const current = getActiveRollNo();
    const val = prompt('Enter Roll Number to track attendance & preferences (e.g. MS25A071):', current);
    if (val !== null) {
        setRollNumber(val);
    }
};

window.syncClassAttendanceToAttData = function() {
    let classAtt = {};
    try {
        classAtt = JSON.parse(localStorage.getItem('mbaplanner_class_attendance')) || {};
    } catch(e) {}

    if (!attData['Q6']) attData['Q6'] = {};

    const counts = {};
    for (const [sId, status] of Object.entries(classAtt)) {
        const parts = sId.split('_');
        if (parts.length >= 3) {
            const code = parts.slice(2).join('_');
            if (!counts[code]) counts[code] = { p: 0, a: 0 };
            if (status === 'P') counts[code].p++;
            else if (status === 'A') counts[code].a++;
        }
    }

    // Reset ALL existing keys in attData['Q6'] to live counts so unmarking resets count
    Object.keys(attData['Q6']).forEach(code => {
      attData['Q6'][code] = {
        p: counts[code] ? counts[code].p : 0,
        a: counts[code] ? counts[code].a : 0
      };
    });

    if (typeof DATA !== 'undefined' && DATA.Q6 && DATA.Q6.subjects) {
      DATA.Q6.subjects.forEach(s => {
        attData['Q6'][s.code] = {
          p: counts[s.code] ? counts[s.code].p : 0,
          a: counts[s.code] ? counts[s.code].a : 0
        };
      });
    }

    // Keep attData in sync for any additional subjects recorded in class attendance
    for (const [code, c] of Object.entries(counts)) {
        attData['Q6'][code] = { p: c.p, a: c.a };
    }

    localStorage.setItem('mbaplanner_attendance', JSON.stringify(attData));
};

// count = 2 for a double session: a twin entry `${ymd}_${slot}+2_${code}` is
// kept in step with the main one, so every attendance counter sees 2 sessions.
window.markClassAttendance = function(ymd, timeSlot, code, targetStatus, count) {
    let roll = getActiveRollNo();
    if (!roll) {
        const entered = prompt('Please enter your Roll Number to log attendance (e.g. MS25A071):');
        if (!entered || !entered.trim()) {
            const inp = document.getElementById('agenda-roll-input') || document.getElementById('planner-roll-input');
            if (inp) {
                inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
                inp.focus();
            }
            return;
        }
        roll = entered.trim().toUpperCase();
        setRollNumber(roll);
    }

    let classAtt = {};
    try {
        classAtt = JSON.parse(localStorage.getItem('mbaplanner_class_attendance')) || {};
    } catch(e) {}

    const sessionId = `${ymd}_${timeSlot}_${code}`;

    const finalStatus = classAtt[sessionId] === targetStatus ? null : targetStatus;
    // [sessionId, status] pairs to write; the twin is cleared if it's no longer a double
    const writes = [[sessionId, finalStatus], [`${ymd}_${timeSlot}+2_${code}`, count === 2 ? finalStatus : null]];
    for (const [id, status] of writes) {
        if (status) classAtt[id] = status;
        else delete classAtt[id];
    }

    localStorage.setItem('mbaplanner_class_attendance', JSON.stringify(classAtt));

    // Save into mbaplanner_roll_attendance for this roll
    const cleanRoll = roll.trim().toUpperCase();
    try {
        const rollAtt = JSON.parse(localStorage.getItem('mbaplanner_roll_attendance')) || {};
        if (!rollAtt[cleanRoll]) rollAtt[cleanRoll] = {};
        for (const [id, status] of writes) {
            if (status) rollAtt[cleanRoll][id] = status;
            else delete rollAtt[cleanRoll][id];
        }
        localStorage.setItem('mbaplanner_roll_attendance', JSON.stringify(rollAtt));
    } catch(e) {}

    // Realtime sync to Firebase q6_attendance
    if (typeof fbDb !== 'undefined' && fbDb) {
        try {
            const safeRoll = cleanRoll.replace(/[.#$[\]]/g, '_');
            const updates = {};
            for (const [id, status] of writes) {
                updates[`q6_attendance/${safeRoll}/${id.replace(/[.#$[\]]/g, '_')}`] = status || null;
            }
            fbDb.ref().update(updates);
            if (!window._fbConnected) {
                const pendingAtt = loadOfflineCopy('mbaplanner_pending_q6_attendance') || {};
                Object.assign(pendingAtt, updates);
                saveOfflineCopy('mbaplanner_pending_q6_attendance', pendingAtt);
            }
        } catch(err) {
            console.warn('Firebase q6_attendance write error:', err);
        }
    }

    // Keep in-memory cloud attendance synced
    if (window._cloudQ6Attendance) {
        const safeRoll = cleanRoll.replace(/[.#$[\]]/g, '_');
        [cleanRoll, safeRoll].forEach(r => {
            if (!window._cloudQ6Attendance[r]) return;
            for (const [id, status] of writes) {
                const safeId = id.replace(/[.#$[\]]/g, '_');
                if (status) {
                    window._cloudQ6Attendance[r][id] = status;
                    window._cloudQ6Attendance[r][safeId] = status;
                } else {
                    delete window._cloudQ6Attendance[r][id];
                    delete window._cloudQ6Attendance[r][safeId];
                }
            }
        });
    }

    // Sync to attData['Q6']
    window.syncClassAttendanceToAttData();

    // Auto-save EVERYTHING to the roll number profile
    savePreferencesForRoll(cleanRoll);

    // Re-render Daily Agenda & Attendance View (if active)
    renderDailySchedule();
    if (typeof renderAttendance === 'function' && document.getElementById('att-grid')) {
        renderAttendance();
    }
    if (typeof searchCohortAttendance === 'function' && document.getElementById('cohort-att-table-container')) {
        searchCohortAttendance();
    }
};

// Jump to a date in the Daily Agenda (used by the missed-class links in Attendance).
window.openAgendaDate = function(ymd) {
    const day = new Date(ymd + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
    window._selectedAgendaDate = `${ymd} ${day}`;
    switchView('daily');
    window.scrollTo(0, 0);
};

// "Today" button: jump to today's date and centre it in the strip.
window.agendaToday = function() {
    window._selectedAgendaDate = null;
    window._agendaCenter = true;
    renderDailySchedule();
};

window.selectAgendaDate = function(dateKey) {
    window._selectedAgendaDate = dateKey;
    renderDailySchedule();
};

// --- CLASS UPDATES (cancel / move / new time / note) ---
// Shared updates live in Firebase at schedule_changes/{ymd}/{slot}_{code},
// separate from schedule/daily so the Google Sheet sync can never wipe them.
// They're layered on top of the official schedule when the agenda renders.
// "Hide for me" is personal and saved with the roll-number preferences.

const CLASS_UPDATE_SLOTS = ['8am-10am', '10am-12pm', '1pm-3pm', '3pm-5pm', '5pm-7pm'];

function escHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtClock(h, m) {
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function hhmmToTimeInfo(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return { sh, sm, eh, em };
}

function timeInfoToHHMM(ti) {
  const p = n => String(n).padStart(2, '0');
  return { start: `${p(ti.sh)}:${p(ti.sm)}`, end: `${p(ti.eh)}:${p(ti.em)}` };
}

function fmtDayLabel(ymd) {
  const d = new Date(ymd + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeAgo(ms) {
  if (!ms) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function getHiddenSessions() {
  return loadOfflineCopy('mbaplanner_hidden_sessions') || {};
}

window.toggleHideClass = function(sessionId) {
  const hidden = getHiddenSessions();
  if (hidden[sessionId]) delete hidden[sessionId];
  else hidden[sessionId] = true;
  saveOfflineCopy('mbaplanner_hidden_sessions', hidden);
  savePreferencesForRoll();
  closeClassUpdateSheet();
  renderDailySchedule();
};

// Layer shared updates + personal hides onto a day's parsed classes.
// Every entry gets .slot and .timeInfo so callers never need ICS_TIME_MAP.
function applyClassUpdates(dayClasses, ymd, activeSubjects) {
  const allChanges = window._scheduleChanges || {};

  // Classes moved INTO this day from elsewhere
  for (const byDay of Object.values(allChanges)) {
    for (const ch of Object.values(byDay || {})) {
      if (!ch || ch.status !== 'moved' || ch.toYmd !== ymd) continue;
      const subject = activeSubjects.find(s => s.code === ch.code);
      if (!subject) continue;
      const key = dayClasses[ch.toSlot] ? `${ch.toSlot}+${ch.code}` : ch.toSlot;
      dayClasses[key] = {
        type: 'class', subject, cancelled: false, slot: ch.toSlot, movedIn: ch, double: Boolean(ch.double),
        timeInfo: (ch.start && ch.end) ? hhmmToTimeInfo(ch.start, ch.end) : ICS_TIME_MAP[ch.toSlot]
      };
    }
  }

  const dayChanges = allChanges[ymd] || {};
  const hidden = getHiddenSessions();
  for (const [key, data] of Object.entries(dayClasses)) {
    if (!data.slot) data.slot = key;
    if (!data.timeInfo) data.timeInfo = ICS_TIME_MAP[data.slot] || null;
    if (data.type !== 'class' || !data.subject) continue;
    const ch = dayChanges[`${data.slot}_${data.subject.code}`];
    if (ch) {
      data.update = ch;
      if (ch.status === 'cancelled' || ch.status === 'moved') data.cancelled = true;
      if (ch.status === 'retimed' && ch.start && ch.end) data.timeInfo = hhmmToTimeInfo(ch.start, ch.end);
      if (ch.double) data.double = true;
    }
    if (hidden[`${ymd}_${data.slot}_${data.subject.code}`]) data.hidden = true;
  }
}

// Display label for a class's time, honouring updates and admin custom times.
function classTimeLabel(data, dailySlots, slotLabels) {
  const ti = data.timeInfo;
  const hasCustomTime = (data.update && data.update.status === 'retimed') || (data.movedIn && data.movedIn.start);
  if (hasCustomTime && ti) return `${fmtClock(ti.sh, ti.sm)} – ${fmtClock(ti.eh, ti.em)}`;
  if (dailySlots && dailySlots.customTimes && dailySlots.customTimes[data.slot]) return dailySlots.customTimes[data.slot];
  return slotLabels[data.slot] || data.slot;
}

function getClassUpdateAuthor() {
  const roll = getActiveRollNo();
  let name = '';
  if (roll && typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[roll]) name = CLASS_ATTENDANCE_DB[roll].name || '';
  return { roll, name: name || localStorage.getItem('mbaplanner_myname') || roll };
}

function closeClassUpdateSheet() {
  const bg = document.getElementById('class-update-modal');
  if (bg) bg.classList.remove('open');
}
window.closeClassUpdateSheet = closeClassUpdateSheet;

window.openClassUpdateSheet = function(ymd, slot, code) {
  const quarter = (typeof cQ !== 'undefined' && cQ) ? cQ : 'Q6';
  const subject = (DATA[quarter].subjects || []).find(s => s.code === code);
  if (!subject) return;
  const existing = ((window._scheduleChanges || {})[ymd] || {})[`${slot}_${code}`] || null;
  const sessionId = `${ymd}_${slot}_${code}`;
  const isHidden = !!getHiddenSessions()[sessionId];
  const baseTimes = timeInfoToHHMM(
    (existing && existing.start && existing.end) ? hhmmToTimeInfo(existing.start, existing.end) : (ICS_TIME_MAP[slot] || { sh: 8, sm: 0, eh: 10, em: 0 })
  );

  let bg = document.getElementById('class-update-modal');
  if (!bg) {
    bg = document.createElement('div');
    bg.id = 'class-update-modal';
    bg.className = 'modal-bg';
    bg.style.zIndex = '10001';
    bg.addEventListener('click', e => { if (e.target === bg) closeClassUpdateSheet(); });
    document.body.appendChild(bg);
  }

  const statusLabels = { cancelled: '🚫 Cancelled', moved: '↪️ Moved', retimed: '⏱ New time', note: '📝 Note' };
  const existingHtml = existing ? `
    <div style="background:var(--bg2); border:.5px solid var(--bd); border-radius:10px; padding:10px 12px; margin-bottom:14px; font-size:12px; color:var(--tx2);">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
        <span><strong style="color:var(--tx);">Current update: ${statusLabels[existing.status] || ''}</strong><br>
        by ${escHtml(existing.byName)} · ${timeAgo(existing.at)}</span>
        <button class="ios-seg-btn" onclick="undoClassUpdate('${ymd}','${slot}','${code}')" style="padding:5px 10px; font-size:11px; color:var(--tx-danger); font-weight:700;">Undo</button>
      </div>
    </div>` : '';

  const slotOptions = CLASS_UPDATE_SLOTS.map(s =>
    `<option value="${s}" ${existing && existing.toSlot === s ? 'selected' : ''}>${TLABELS[TIMESLOTS.indexOf(s)]}</option>`
  ).join('');

  bg.innerHTML = `
  <div class="modal">
    <h3>✏️ Update this class</h3>
    <p>${escHtml(subject.name)} · ${fmtDayLabel(ymd)}</p>
    ${existingHtml}
    <div class="ios-segmented" id="cu-status" style="width:100%; margin-bottom:12px;">
      ${['cancelled', 'moved', 'retimed', 'note'].map(s => `<button class="ios-seg-btn ${(existing ? existing.status : 'cancelled') === s ? 'active-p' : ''}" data-status="${s}" onclick="selectClassUpdateStatus('${s}')" style="flex:1; padding:7px 4px; font-size:11px;">${statusLabels[s]}</button>`).join('')}
    </div>
    <div id="cu-move-fields" style="display:none; gap:8px; margin-bottom:10px;">
      <input type="date" id="cu-to-date" class="cmp-input" style="min-width:0;" value="${existing && existing.toYmd ? existing.toYmd : ''}">
      <select id="cu-to-slot" class="cmp-input" style="min-width:0;" onchange="syncMoveTimes()">${slotOptions}</select>
    </div>
    <div id="cu-time-fields" style="display:none; gap:8px; align-items:center; margin-bottom:10px; font-size:12px; color:var(--tx2);">
      <input type="time" id="cu-start" class="cmp-input" style="min-width:0;" value="${baseTimes.start}">
      <span>to</span>
      <input type="time" id="cu-end" class="cmp-input" style="min-width:0;" value="${baseTimes.end}">
    </div>
    <div id="cu-time-hint" style="display:none; font-size:11px; color:var(--tx3); margin:-4px 0 10px;">Adjust the times only if it's not the slot's usual timing.</div>
    <label id="cu-double-row" style="display:none; align-items:center; gap:8px; font-size:12.5px; color:var(--tx); margin-bottom:10px; cursor:pointer;">
      <input type="checkbox" id="cu-double" ${existing && existing.double ? 'checked' : ''} style="width:16px; height:16px;">
      <span><strong>Double class</strong> — 2 classes taken in one go, counts as 2 attendance</span>
    </label>
    <input type="text" id="cu-note" class="cmp-input" maxlength="120" placeholder="Note (optional) — e.g. room changed to 310" style="width:100%; box-sizing:border-box; margin-bottom:12px;" value="${existing && existing.note ? escHtml(existing.note) : ''}">
    <button class="cmp-btn" style="width:100%; padding:12px;" onclick="postClassUpdate('${ymd}','${slot}','${code}')">Post update for everyone</button>
    <div style="font-size:11px; color:var(--tx3); margin-top:6px; text-align:center;">Everyone taking ${escHtml(subject.name)} will see this, with your name on it.</div>
    <div style="border-top:.5px solid var(--bd); margin:14px 0 0; padding-top:12px;">
      <button class="modal-close" style="margin-top:0;" onclick="toggleHideClass('${sessionId}')">${isHidden ? '👁 Show this class again' : "🙈 Hide this class for me only (I'm not attending)"}</button>
    </div>
    <button class="modal-close" onclick="closeClassUpdateSheet()">Close</button>
  </div>`;

  bg.dataset.baseStart = baseTimes.start;
  bg.dataset.baseEnd = baseTimes.end;
  selectClassUpdateStatus(existing ? existing.status : 'cancelled', true);
  if (existing && existing.status === 'moved' && !existing.start) syncMoveTimes();
  bg.classList.add('open');
};

// Moving a class: the time fields follow the chosen slot's usual timing.
window.syncMoveTimes = function() {
  const t = timeInfoToHHMM(ICS_TIME_MAP[document.getElementById('cu-to-slot').value]);
  document.getElementById('cu-start').value = t.start;
  document.getElementById('cu-end').value = t.end;
};

window.selectClassUpdateStatus = function(status, initial) {
  document.querySelectorAll('#cu-status .ios-seg-btn').forEach(b => b.classList.toggle('active-p', b.dataset.status === status));
  document.getElementById('cu-status').dataset.value = status;
  document.getElementById('cu-move-fields').style.display = status === 'moved' ? 'flex' : 'none';
  document.getElementById('cu-time-fields').style.display = (status === 'moved' || status === 'retimed') ? 'flex' : 'none';
  document.getElementById('cu-time-hint').style.display = status === 'moved' ? 'block' : 'none';
  document.getElementById('cu-double-row').style.display = status === 'cancelled' ? 'none' : 'flex';
  if (initial) return;
  if (status === 'moved') syncMoveTimes();
  if (status === 'retimed') {
    const bg = document.getElementById('class-update-modal');
    document.getElementById('cu-start').value = bg.dataset.baseStart;
    document.getElementById('cu-end').value = bg.dataset.baseEnd;
  }
};

window.postClassUpdate = function(ymd, slot, code) {
  if (!navigator.onLine || !fbDb) {
    alert("You're offline. Class updates need internet so everyone else sees them — try again once you're connected.");
    return;
  }
  let author = getClassUpdateAuthor();
  if (!author.roll) {
    const entered = prompt('Enter your Roll Number (e.g. MS25A071) — your name is shown on updates you post:');
    if (!entered || !entered.trim()) return;
    localStorage.setItem('mbaplanner_roll_no', entered.trim().toUpperCase());
    author = getClassUpdateAuthor();
  }

  const status = document.getElementById('cu-status').dataset.value;
  const note = document.getElementById('cu-note').value.trim().slice(0, 120);
  const start = document.getElementById('cu-start').value;
  const end = document.getElementById('cu-end').value;
  const normal = timeInfoToHHMM(ICS_TIME_MAP[slot] || { sh: 0, sm: 0, eh: 0, em: 0 });
  const rec = { code, ymd, slot, status, byRoll: author.roll, byName: author.name, at: firebase.database.ServerValue.TIMESTAMP };
  if (note) rec.note = note;
  if (status !== 'cancelled' && document.getElementById('cu-double').checked) rec.double = true;

  if (status === 'moved') {
    rec.toYmd = document.getElementById('cu-to-date').value;
    rec.toSlot = document.getElementById('cu-to-slot').value;
    if (!rec.toYmd) { alert('Pick the new date for this class.'); return; }
    if (rec.toYmd === ymd && rec.toSlot === slot) { alert("That's the same date and time slot — pick where the class moved to."); return; }
    const slotNormal = timeInfoToHHMM(ICS_TIME_MAP[rec.toSlot]);
    if (start && end && (start !== slotNormal.start || end !== slotNormal.end)) {
      if (start >= end) { alert('The end time must be after the start time.'); return; }
      rec.start = start; rec.end = end;
    }
  } else if (status === 'retimed') {
    if (!start || !end || start >= end) { alert('Enter a valid start and end time.'); return; }
    const sameTiming = start === normal.start && end === normal.end;
    if (sameTiming && !rec.double) { alert("That's the normal timing — change the start or end time."); return; }
    if (!sameTiming) { rec.start = start; rec.end = end; }
  } else if (status === 'note' && !note && !rec.double) {
    alert('Write the note you want to share, or tick Double class.');
    return;
  }

  fbDb.ref(`schedule_changes/${ymd}/${slot}_${code}`).set(rec).then(() => {
    fbDb.ref('schedule_changes_log').push(Object.assign({ action: 'post' }, rec));
    closeClassUpdateSheet();
  }).catch(e => alert('Could not post the update: ' + e.message));
};

window.undoClassUpdate = function(ymd, slot, code) {
  if (!navigator.onLine || !fbDb) { alert("You're offline — try again once you're connected."); return; }
  if (!confirm('Remove this update for everyone?')) return;
  const author = getClassUpdateAuthor();
  fbDb.ref(`schedule_changes/${ymd}/${slot}_${code}`).remove().then(() => {
    fbDb.ref('schedule_changes_log').push({ action: 'undo', code, ymd, slot, byRoll: author.roll || '', byName: author.name || '', at: firebase.database.ServerValue.TIMESTAMP });
    closeClassUpdateSheet();
  }).catch(e => alert('Could not remove the update: ' + e.message));
};

// --- DAILY AGENDA LOGIC ---
function renderDailySchedule() {
  try {
    _renderDailyScheduleInner();
  } catch(e) {
    alert("Crash in Agenda: " + e.message);
    console.error(e);
  }
}
function _renderDailyScheduleInner() {

  const area = document.getElementById('daily-render');
  if (!area) return;
  const quarter = (typeof cQ !== 'undefined' && cQ) ? cQ : 'Q6';
  
  // In Q6, Behavioural lab (MS5529) & Business Models (MS6210) are Mandatory Core
  const coreCourses = (DATA[quarter] && DATA[quarter].subjects) 
      ? DATA[quarter].subjects.filter(s => s.isCore) 
      : [];
  const chosenElectives = Object.values(sel[quarter] || {});
  
  const activeMap = {};
  coreCourses.forEach(s => { activeMap[s.code] = s; });
  chosenElectives.forEach(s => { activeMap[s.code] = s; });
  const activeSubjects = Object.values(activeMap);

  if (activeSubjects.length === 0) {
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
      <div style="border-radius:16px; padding:16px; margin-bottom:14px; background:var(--bg); border:1px solid var(--bd);">
          <div style="height:20px; width:140px; background:var(--bg2); border-radius:6px; margin-bottom:12px;" class="skeleton-shimmer"></div>
          <div style="height:64px; background:var(--bg2); border-radius:12px; margin-bottom:10px;" class="skeleton-shimmer"></div>
          <div style="height:64px; background:var(--bg2); border-radius:12px; margin-bottom:10px;" class="skeleton-shimmer"></div>
      </div>`;
      return;
  }

  const excelAcronyms = {
      'MS5015': 'DT', 'MS6580': 'SDM', 'MS5460': 'CM', 'MS5690': 'CF', 'MS5529': 'B.Lab',
      'MS6230': 'SS', 'MS5613': 'CHS', 'MS5770': 'SM', 'MS6030': 'ADAM', 'MS5750': 'BM',
      'MS6600': 'GCG', 'MS6022': 'AIM', 'MS6210': 'Bs.Models', 'CORE-LAW': 'LAW'
  };
  const DOMAIN_ICONS = {
      Finance: '📈', Marketing: '🎯', Strategy: '♟️', Ops: '⚙️', HR: '🤝', IS: '💻', Integrative: '🌐', Placement: '🏢'
  };
  const timeOrder = ['8am-10am', '10am-12pm', '12pm-1pm', '1pm-3pm', '3pm-5pm', '5pm-7pm'];
  const SLOT_LABELS = {
      '8am-10am': '8:00 AM – 10:00 AM',
      '10am-12pm': '10:00 AM – 12:00 PM',
      '12pm-1pm': '12:00 PM – 1:00 PM',
      '1pm-3pm': '1:00 PM – 3:00 PM',
      '3pm-5pm': '3:00 PM – 5:00 PM',
      '5pm-7pm': '5:00 PM – 7:00 PM'
  };
  
  // IST Date logic
  const nowIST = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Kolkata'}));
  const todayYmd = `${nowIST.getFullYear()}-${String(nowIST.getMonth()+1).padStart(2,'0')}-${String(nowIST.getDate()).padStart(2,'0')}`;
  const tmrw = new Date(nowIST); tmrw.setDate(tmrw.getDate() + 1);
  const tomorrowYmd = `${tmrw.getFullYear()}-${String(tmrw.getMonth()+1).padStart(2,'0')}-${String(tmrw.getDate()).padStart(2,'0')}`;
  
  const currentMins = nowIST.getHours() * 60 + nowIST.getMinutes();
  let currentSlot = null;
  if (currentMins >= 8*60 && currentMins < 10*60) currentSlot = '8am-10am';
  else if (currentMins >= 10*60 && currentMins < 12*60) currentSlot = '10am-12pm';
  else if (currentMins >= 12*60 && currentMins < 13*60) currentSlot = '12pm-1pm';
  else if (currentMins >= 13*60 && currentMins < 15*60) currentSlot = '1pm-3pm';
  else if (currentMins >= 15*60 && currentMins < 17*60) currentSlot = '3pm-5pm';
  else if (currentMins >= 17*60 && currentMins < 19*60) currentSlot = '5pm-7pm';

  // Helper to parse day's classes
  const parseDayClasses = (dailySlots, dateKey) => {
      const dayClasses = {};
      let hasCls = false;
      let hasActiveCls = false;

      for (const t of (dailySlots ? timeOrder : [])) {
          if (t === '12pm-1pm') continue;
          const slotData = dailySlots[t];
          if (!slotData) continue;

          let classStr = '';
          let isStrikethrough = false;
          let isShifted = false;
          let shiftedTo = null;
          
          if (Array.isArray(slotData)) {
              classStr = slotData.map(e => typeof e === 'object' && e ? (e.text||'') : String(e)).join(' / ');
              isStrikethrough = slotData.some(e => typeof e === 'object' && e ? e.strike : false);
              isShifted = slotData.some(e => typeof e === 'object' && e ? e.isShifted : false);
              shiftedTo = slotData.find(e => typeof e === 'object' && e && e.shiftedTo)?.shiftedTo || null;
          } else if (typeof slotData === 'object' && slotData !== null) {
              classStr = slotData.text || '';
              isStrikethrough = slotData.strike || false;
              isShifted = slotData.isShifted || false;
              shiftedTo = slotData.shiftedTo || null;
          } else {
              classStr = String(slotData);
          }
          if (!classStr) continue;
          
          let cancelled = isStrikethrough || classStr.includes('~') || (classStr ? classStr.toLowerCase() : '').includes('cancel') || classStr.includes('<s>') || classStr.includes('<strike>');

          if (classStr.toUpperCase().includes('ICRC')) {
              let icrcCancelled = cancelled;
              if (Array.isArray(slotData)) {
                  const icrcObj = slotData.find(e => typeof e === 'object' && e && e.text && e.text.toUpperCase().includes('ICRC'));
                  if (icrcObj) icrcCancelled = icrcObj.strike || icrcObj.text.includes('~') || (icrcObj && icrcObj.text ? icrcObj.text.toLowerCase() : '').includes('cancel');
              }
              dayClasses[t] = { type: 'icrc', cancelled: icrcCancelled, isShifted, shiftedTo };
              hasCls = true;
              if (!icrcCancelled) hasActiveCls = true;
              continue;
          }

          const classesInCell = classStr.split('/').map(c => c.trim().toLowerCase());
          for (const s of activeSubjects) {
              const acronym = excelAcronyms[s.code] ? excelAcronyms[s.code].toLowerCase() : '';
              const codeLower = (s.code ? s.code.toLowerCase() : '');
              const nameLower = (s.name ? s.name.toLowerCase() : '');

              const isMatch = classesInCell.includes(codeLower) || 
                              (acronym && classesInCell.includes(acronym)) || 
                              classesInCell.includes(nameLower) ||
                              classesInCell.some(c => c === acronym || c === codeLower || c === nameLower);

              if (isMatch) {
                  let subjCancelled = cancelled;
                  if (Array.isArray(slotData)) {
                      const subjObj = slotData.find(e => typeof e === 'object' && e && e.text && (
                          (e && e.text ? e.text.toLowerCase() : '').includes(codeLower) || 
                          (acronym && (e && e.text ? e.text.toLowerCase() : '').includes(acronym)) || 
                          (e && e.text ? e.text.toLowerCase() : '').includes(nameLower)
                      ));
                      if (subjObj) subjCancelled = subjObj.strike || subjObj.text.includes('~') || (subjObj && subjObj.text ? subjObj.text.toLowerCase() : '').includes('cancel');
                  }
                  dayClasses[t] = { type: 'class', subject: s, cancelled: subjCancelled, rawStr: classStr, isShifted, shiftedTo };
                  hasCls = true;
                  if (!subjCancelled) hasActiveCls = true;
                  break;
              }
          }
      }
      applyClassUpdates(dayClasses, dateKey ? dateKey.split(' ')[0] : '', activeSubjects);
      hasCls = Object.keys(dayClasses).length > 0;
      hasActiveCls = Object.values(dayClasses).some(d => !d.cancelled && !d.hidden);
      return { dayClasses, hasCls, hasActiveCls };
  };

  let dateKeys = Object.keys(liveDailyCache);
  if (dateKeys.length > 0) {
      dateKeys.sort((a,b) => a.localeCompare(b));
      const firstDate = new Date(dateKeys[0].split(' ')[0]);
      const lastDate = new Date(dateKeys[dateKeys.length-1].split(' ')[0]);
      
      const continuousKeys = [];
      let curr = new Date(firstDate);
      while (curr <= lastDate) {
          const ymd = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}-${String(curr.getDate()).padStart(2,'0')}`;
          const dName = curr.toLocaleDateString('en-US', { weekday: 'long' });
          continuousKeys.push(`${ymd} ${dName}`);
          curr.setDate(curr.getDate() + 1);
      }
      dateKeys = continuousKeys;
  }
  if (!window._selectedAgendaDate || !liveDailyCache[window._selectedAgendaDate]) {
      const todayMatch = dateKeys.find(k => k.startsWith(todayYmd));
      if (todayMatch) {
          window._selectedAgendaDate = todayMatch;
      } else {
          const sep24Match = dateKeys.find(k => k.startsWith('2026-09-24'));
          window._selectedAgendaDate = sep24Match || dateKeys[0];
      }
  }
  const currentDateKey = window._selectedAgendaDate;

  // Hand the next few days of my classes, absences and meals to the push sync
  // (the server sends reminders, summaries and meal alerts from this).
  try {
    let marks = {};
    try { marks = JSON.parse(localStorage.getItem('mbaplanner_class_attendance')) || {}; } catch (e) {}
    const items = [];
    dateKeys.filter(k => k.slice(0, 10) >= todayYmd).slice(0, 3).forEach(k => {
      const ymd = k.slice(0, 10);
      const { dayClasses } = parseDayClasses(liveDailyCache[k], k);
      const [yy, mm, dd] = ymd.split('-').map(Number);
      const midnight = new Date(Date.UTC(yy, mm - 1, dd));
      Object.values(dayClasses).forEach(d => {
        if (d.hidden || !d.timeInfo || !d.slot) return;
        const isIcrc = d.type === 'icrc';
        const code = isIcrc ? 'ICRC' : d.subject.code;
        const it = {
          t: istToUTC(midnight, d.timeInfo.sh, d.timeInfo.sm).getTime(),
          e: istToUTC(midnight, d.timeInfo.eh, d.timeInfo.em).getTime(),
          n: isIcrc ? 'ICRC Placement Prep' : d.subject.name,
          y: ymd, s: d.slot, c: code
        };
        if (d.cancelled) it.x = 1;
        if (!isIcrc && d.subject.room) it.r = String(d.subject.room);
        const mk = marks[`${ymd}_${d.slot}_${code}`];
        if (mk) it.m = mk;
        items.push(it);
      });
    });
    const subj = activeSubjects.map(x => ({ c: x.code, n: x.name, a: excelAcronyms[x.code] || '' }));
    const abs = {};
    Object.entries(marks).forEach(([id, st]) => {
      if (st !== 'A') return;
      const code = id.split('_').slice(2).join('_');
      if (code) abs[code] = (abs[code] || 0) + 1;
    });
    const meals = [];
    if (window.mealAlertsFor) {
      [todayYmd, tomorrowYmd].forEach(ymd => window.mealAlertsFor(ymd).forEach(m => meals.push(m)));
    }
    if (window.syncPushReminders) window.syncPushReminders({ items, subj, abs, meals });
  } catch (e) { console.warn('Reminder list failed', e); }

  // Build Interactive Day Capsules Carousel
  const attSessions = {};
  let capsulesHtml = `<div class="date-capsules">`;
  for (const dateString of dateKeys) {
      const [ymd, dayName] = dateString.split(' ');
      const shortDay = dayName ? dayName.substring(0,3) : '';
      const dd = ymd ? ymd.split('-')[2] : '';
      const isSelected = dateString === currentDateKey;
      const { hasCls, hasActiveCls, dayClasses: capDay } = parseDayClasses(liveDailyCache[dateString], dateString);
      // Held class sessions so far (for the Attendance tab's "not marked" list)
      if (ymd <= todayYmd) {
        Object.values(capDay).forEach(d => {
          if (d.type !== 'class' || d.cancelled || d.hidden || !d.subject || !d.slot) return;
          if (ymd === todayYmd && d.timeInfo && d.timeInfo.eh * 60 + d.timeInfo.em > currentMins) return;
          (attSessions[d.subject.code] = attSessions[d.subject.code] || []).push({ y: ymd, id: `${ymd}_${d.slot}_${d.subject.code}` });
        });
      }
      
      capsulesHtml += `
      <div id="capsule-${dateString.replace(/\s/g, '-')}" 
           class="capsule ${isSelected ? 'selected' : ''} ${hasActiveCls ? 'has-class' : (hasCls ? 'has-cancelled' : '')}" 
           onclick="selectAgendaDate('${dateString}')">
          <span class="dow">${shortDay}</span>
          <span class="num">${dd}</span>
          <span class="dot-indicator"></span>
      </div>`;
  }
  capsulesHtml += `</div>`;
  window._attSessions = attSessions;

  // Roll Number Banner / Prompt for Attendance (iOS style)
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const reminderPref = localStorage.getItem('mbaplanner_reminder_30m');
  const isGranted = ('Notification' in window) && Notification.permission === 'granted';
  const isAlertActive = isGranted && reminderPref !== 'off';

  let websiteAlertBtn = '';
  if (!isPWA && 'Notification' in window) {
      websiteAlertBtn = `
      <button class="ios-seg-btn ${isAlertActive ? 'active-p' : ''}" onclick="toggle30mAlert()" style="padding:4px 10px; font-size:11px; margin-left:auto;">
          ${isAlertActive ? '🔔 30m Alerts ON' : '🔕 30m Alerts OFF'}
      </button>`;
  }

  const savedRoll = (localStorage.getItem('mbaplanner_roll_no') || '').trim();
  let rollBannerHtml = '';
  if (savedRoll) {
      let studentName = '';
      if (typeof CLASS_ATTENDANCE_DB !== 'undefined' && CLASS_ATTENDANCE_DB[savedRoll]) {
          studentName = CLASS_ATTENDANCE_DB[savedRoll].name;
      }
      rollBannerHtml = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 12px; margin-bottom:12px; background:var(--bg2); border-radius:12px; border:0.5px solid var(--bd); font-size:12px; gap:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
              <span>🎓</span>
              <span style="color:var(--tx2);">Roll:</span>
              <strong style="color:var(--tx);">${savedRoll}</strong>
              ${studentName ? `<span style="color:var(--tx3); font-size:11.5px;">· ${studentName}</span>` : ''}
              <button class="ios-seg-btn" onclick="changeAgendaRollNo()" style="padding:2px 8px; font-size:11px; color:var(--tx-info); font-weight:700;">Edit</button>
          </div>
          ${websiteAlertBtn}
      </div>`;
  } else {
      rollBannerHtml = `
      <div style="background:rgba(30,122,75,0.05); border:0.5px solid rgba(30,122,75,0.2); border-radius:14px; padding:12px 14px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:16px;">🎓</span>
                  <span style="font-size:13px; font-weight:700; color:var(--tx);">Set Roll Number for Attendance</span>
              </div>
              ${websiteAlertBtn}
          </div>
          <div style="font-size:11.5px; color:var(--tx2); margin-bottom:8px; line-height:1.4;">
              Enter your Roll No (e.g. <code>MS25A071</code>) to track your class-by-class attendance.
          </div>
          <div style="display:flex; gap:8px;">
              <input type="text" id="agenda-roll-input" class="cmp-input" placeholder="e.g. MS25A071" style="flex:1; text-transform:uppercase; font-weight:700; border-radius:8px; padding:6px 10px;" onkeydown="if(event.key==='Enter') saveAgendaRollNo()">
              <button class="cmp-btn" onclick="saveAgendaRollNo()" style="white-space:nowrap; padding:6px 14px; border-radius:8px;">Save</button>
          </div>
      </div>`;
  }

  // Live Island Widget (tracks today's real-time classes in Dynamic Island style)
  let ongoingClassFound = null;
  let nextClassFound = null;
  const todayKey = dateKeys.find(k => k.startsWith(todayYmd));
  if (todayKey) {
      const todaySlots = liveDailyCache[todayKey] || {};
      const { dayClasses: todayDayClasses } = parseDayClasses(todaySlots, todayKey);
      
      scheduleClassNotifications(todayDayClasses, todayYmd);

      const todayList = Object.values(todayDayClasses)
          .filter(d => !d.cancelled && !d.hidden && d.timeInfo)
          .sort((a, b) => (a.timeInfo.sh * 60 + a.timeInfo.sm) - (b.timeInfo.sh * 60 + b.timeInfo.sm));
      for (const bData of todayList) {
          const ti = bData.timeInfo;
          const isHappeningNow = currentMins >= ti.sh * 60 + ti.sm && currentMins < ti.eh * 60 + ti.em;
          const subjectName = bData.type === 'icrc' ? 'ICRC Placement Prep' : bData.subject.name;
          const room = bData.type === 'icrc' ? null : bData.subject.room;

          if (isHappeningNow) {
              ongoingClassFound = { name: subjectName, room, label: classTimeLabel(bData, todaySlots, SLOT_LABELS) };
          } else if (!nextClassFound) {
              const timeInfo = ti;
              if (timeInfo) {
                  const [y, m, d] = todayYmd.split('-');
                  const utcMidnight = new Date(Date.UTC(parseInt(y), parseInt(m)-1, parseInt(d)));
                  const classStartUTC = istToUTC(utcMidnight, timeInfo.sh, timeInfo.sm);
                  if (classStartUTC.getTime() > Date.now()) {
                      nextClassFound = { name: subjectName, room, timeMs: classStartUTC.getTime() };
                  }
              }
          }
      }
  }

  let liveIslandHtml = '';
  if (ongoingClassFound) {
      const activeSlotLabel = ongoingClassFound.label;
      liveIslandHtml = `
      <div class="ios-live-island">
          <div class="ios-island-left">
              <span class="ios-island-dot"></span>
              <span class="ios-island-badge">Now</span>
              <span class="ios-island-title">${ongoingClassFound.name}</span>
          </div>
          <span class="ios-island-loc">📍 ${ongoingClassFound.room ? `Rm ${ongoingClassFound.room} · ` : ''}<strong>${activeSlotLabel}</strong></span>
      </div>`;
  } else if (nextClassFound) {
      liveIslandHtml = `
      <div class="ios-live-island">
          <div class="ios-island-left">
              <span class="ios-island-dot" style="background:var(--tx-info); box-shadow:0 0 8px rgba(30,122,75,0.6);"></span>
              <span class="ios-island-badge up-next">Up Next</span>
              <span class="ios-island-title">${nextClassFound.name}</span>
          </div>
          <span id="pulse-next-countdown" class="ios-island-loc">📍 ${nextClassFound.room ? `Rm ${nextClassFound.room} · ` : ''}in ...</span>
      </div>`;
  } else if (todayKey && currentDateKey === todayKey) {
      liveIslandHtml = `
      <div class="ios-live-island" style="justify-content:center; padding:8px 12px;">
          <span style="font-size:12px; font-weight:600; color:var(--tx2);">🎉 No more classes scheduled for today!</span>
      </div>`;
  }

  // Render Selected Day's Card
  const dailySlots = liveDailyCache[currentDateKey] || {};
  let comment = dailySlots['Comments'] || '';
  const birthdays = dailySlots['Birthdays'];

  let isExam = false;
  let examText = '';
  if (comment) {
      isExam = (comment ? comment.toLowerCase() : '').includes('end term') || (comment ? comment.toLowerCase() : '').includes('exam') || (comment ? comment.toLowerCase() : '').includes('quiz');
  } else {
      for (const t of timeOrder) {
          const sData = dailySlots[t];
          if (sData) {
              const text = typeof sData === 'object' ? sData.text : String(sData);
              if ((text ? text.toLowerCase() : '').includes('end term') || (text ? text.toLowerCase() : '').includes('exam') || (text ? text.toLowerCase() : '').includes('quiz')) {
                  isExam = true;
                  examText = text;
                  break;
              }
          }
      }
      if (isExam) comment = examText;
  }

  const { dayClasses, hasCls } = parseDayClasses(dailySlots, currentDateKey);
  const [ymd, dayName] = currentDateKey ? currentDateKey.split(' ') : ['', ''];
  const isToday = ymd === todayYmd;
  const isTomorrow = ymd === tomorrowYmd;

  const finalBlocks = [];
  if (hasCls) {
      for (const t of timeOrder) {
          if (t === '12pm-1pm') {
              finalBlocks.push({ type: 'lunch', t });
              continue;
          }
          const slotClasses = Object.values(dayClasses).filter(d => d.slot === t);
          if (slotClasses.length) {
              slotClasses.forEach(d => finalBlocks.push({ type: 'class', t, data: d }));
          } else {
              const last = finalBlocks[finalBlocks.length - 1];
              const slotTi = ICS_TIME_MAP[t];
              if (last && last.type === 'free') {
                  last.end = t.split('-')[1];
                  last.endMins = slotTi.eh * 60 + slotTi.em;
              } else {
                  const block = { type: 'free', start: t.split('-')[0], end: t.split('-')[1], endMins: slotTi.eh * 60 + slotTi.em };
                  // A class that ran over (new time) eats into the following free time
                  const prevTi = last && last.type === 'class' && !last.data.cancelled && !last.data.hidden ? last.data.timeInfo : null;
                  const prevEnd = prevTi ? prevTi.eh * 60 + prevTi.em : 0;
                  if (prevEnd > slotTi.sh * 60 + slotTi.sm) {
                      block.startMins = prevEnd;
                      block.startLabel = fmtClock(Math.floor(prevEnd / 60), prevEnd % 60);
                  }
                  finalBlocks.push(block);
              }
          }
      }
  }

  let classAttMap = {};
  try {
      classAttMap = JSON.parse(localStorage.getItem('mbaplanner_class_attendance')) || {};
  } catch(e) {}

  let timelineEventsHtml = '';
  if (hasCls) {
      timelineEventsHtml += `<div class="ios-classes-list">`;
      for (const b of finalBlocks) {
          let isHappeningNow = isToday && currentSlot === b.t;
          
          if (b.type === 'lunch') {
              timelineEventsHtml += `
              <div class="ios-divider-break">
                  <span>🍽</span>
                  <span>Campus Lunch Break · <strong style="color:var(--tx); font-weight:700;">12:00 PM – 1:00 PM</strong></span>
              </div>`;
          } else if (b.type === 'free') {
              if (b.startMins && b.startMins >= b.endMins) continue;
              const freeStart = b.startLabel || (b.start||'').replace('am', ':00 AM').replace('pm', ':00 PM');
              const freeEnd = (b.end||'').replace('am', ':00 AM').replace('pm', ':00 PM');
              timelineEventsHtml += `
              <div class="ios-divider-break">
                  <span>☕</span>
                  <span>Free Time · <strong style="color:var(--tx); font-weight:700;">${freeStart} – ${freeEnd}</strong></span>
              </div>`;
          } else if (b.type === 'class') {
              const data = b.data;
              const isIcrc = data.type === 'icrc';

              if (data.hidden) {
                  timelineEventsHtml += `
                  <div class="ios-divider-break">
                      <span>🙈</span>
                      <span>${data.subject.name} · hidden for you</span>
                      <button class="ios-seg-btn" onclick="toggleHideClass('${ymd}_${data.slot}_${data.subject.code}')" style="padding:2px 8px; font-size:11px; margin-left:auto;">Show</button>
                  </div>`;
                  continue;
              }
              const cancelled = data.cancelled;
              const subjectName = isIcrc ? 'ICRC Placement Prep' : data.subject.name;
              const room = isIcrc ? null : data.subject.room;
              
              // In Q6: Behavioural lab (MS5529) & Business Models (MS6210) are the 2 Mandatory Core courses; everything else is an Elective
              const isCore = !isIcrc && Boolean(data.subject && data.subject.isCore);
              const domain = isIcrc ? 'Placement' : (data.subject.v || (isCore ? 'Core' : 'Elective'));
              const domainIcon = isCore ? '🔒' : (DOMAIN_ICONS[domain] || '📚');
              const domainColor = isCore ? 'var(--tx-info)' : (DCOL[domain] || 'var(--tx-info)');
              const domainLabel = isCore ? 'Core' : domain;

              // Live / finished state follows the class's (possibly updated) timing
              const ti = data.timeInfo;
              if (ti) isHappeningNow = isToday && currentMins >= ti.sh * 60 + ti.sm && currentMins < ti.eh * 60 + ti.em;
              const isDone = Boolean(isToday && !isHappeningNow && ti && currentMins >= ti.eh * 60 + ti.em);

              // Shared class updates (cancel / move / new time / note)
              const upd = data.update;
              const warnPill = label => `<span class="ios-pill" style="color:var(--tx-warn); background:var(--bg-warn); border-color:var(--bd-warn); font-weight:800;">${label}</span>`;
              let updatePillHtml = '';
              if (upd && upd.status === 'moved') updatePillHtml = warnPill('↪️ Moved');
              else if (data.movedIn) updatePillHtml = warnPill('↪️ Rescheduled');
              else if (data.double) updatePillHtml = warnPill('×2 Double class');
              else if (upd && upd.status === 'retimed') updatePillHtml = warnPill('⏱ New time');

              let subText = room && !cancelled ? `📍 Room ${room}` : (!cancelled ? '📍 Department' : (data.shiftedTo ? `🔄 ${data.shiftedTo}` : 'Cancelled in schedule'));
              if (upd && upd.status === 'moved') {
                  const toTi = upd.start ? hhmmToTimeInfo(upd.start, upd.end) : ICS_TIME_MAP[upd.toSlot];
                  subText = `↪️ Moved to ${fmtDayLabel(upd.toYmd)} · ${fmtClock(toTi.sh, toTi.sm)} – ${fmtClock(toTi.eh, toTi.em)}`;
              } else if (upd && upd.status === 'cancelled') {
                  subText = 'Cancelled';
              }
              if (data.movedIn) subText += ` · moved from ${fmtDayLabel(data.movedIn.ymd)}`;

              const updSrc = upd || data.movedIn;
              const updateInfoHtml = updSrc
                  ? `<div style="font-size:11px; color:var(--tx3); margin-bottom:6px;">${updSrc.note ? `📝 <span style="color:var(--tx2);">${escHtml(updSrc.note)}</span> — ` : 'Updated by '}${escHtml(updSrc.byName)} · ${timeAgo(updSrc.at)}</div>`
                  : '';
              const editBtnHtml = data.subject
                  ? `<button class="ios-seg-btn" onclick="openClassUpdateSheet('${ymd}','${data.slot}','${data.subject.code}')" title="Update this class (cancelled, moved, new time…)" style="padding:2px 8px; font-size:11px;">✏️</button>`
                  : '';

              // Attendance Row (only when class is not cancelled and has a valid academic subject)
              let attRowHtml = '';
              if (!cancelled && data.subject) {
                  const sessionId = `${ymd}_${b.t}_${data.subject.code}`;
                  const currentStatus = classAttMap[sessionId]; // 'P', 'A', or undefined
                  const attStatusLabel = currentStatus === 'P' 
                      ? '<span style="color:#34C759; font-weight:700;">✓ Present</span>' 
                      : (currentStatus === 'A' 
                          ? '<span style="color:#FF3B30; font-weight:700;">✕ Absent</span>' 
                          : '<span style="color:var(--tx3);">Not marked</span>');

                  const attCount = data.double ? 2 : 1;
                  attRowHtml = `
                  <div class="ios-class-bottom">
                      <div class="ios-att-status-text">
                          Attendance${data.double ? ' <span style="color:var(--tx-warn);">(×2)</span>' : ''}: ${attStatusLabel}
                      </div>
                      <div class="ios-segmented">
                          <button class="ios-seg-btn ${currentStatus === 'P' ? 'active-p' : ''}" 
                                  onclick="markClassAttendance('${ymd}', '${b.t}', '${data.subject.code}', 'P', ${attCount})" 
                                  title="Mark Present">
                              ✓ Present
                          </button>
                          <button class="ios-seg-btn ${currentStatus === 'A' ? 'active-a' : ''}" 
                                  onclick="markClassAttendance('${ymd}', '${b.t}', '${data.subject.code}', 'A', ${attCount})" 
                                  title="Mark Absent">
                              ✕ Absent
                          </button>
                      </div>
                  </div>`;
              }

              const formattedSlot = classTimeLabel(data, dailySlots, SLOT_LABELS);
              const timeBadgeHtml = `<span class="ios-time-badge">🕒 ${formattedSlot}</span>`;
              let statusPillHtml = '';
              if (isHappeningNow) {
                  statusPillHtml = `<span class="ios-now-pill"><span class="ios-island-dot"></span> LIVE NOW</span>`;
              } else if (isDone) {
                  statusPillHtml = `<span class="ios-done-pill">Finished</span>`;
              }

              let itemClass = 'ios-class-item';
              if (cancelled) itemClass += ' cancelled';
              if (isHappeningNow && !cancelled) itemClass += ' ongoing';

              timelineEventsHtml += `
              <div class="${itemClass}">
                  <div class="ios-class-top">
                      <div class="ios-class-time">
                          ${timeBadgeHtml}
                          ${statusPillHtml}
                      </div>
                      <div class="ios-class-meta">
                          ${updatePillHtml || (cancelled 
                              ? `<span class="ios-pill" style="color:#FF3B30; background:rgba(255,59,48,0.1); border-color:rgba(255,59,48,0.3); font-weight:800;">🚫 Cancelled</span>` 
                              : (b.data.isShifted ? warnPill('🔄 Shifted Class') : `<span class="ios-pill" style="color:${domainColor}; background:var(--bg);">${domainIcon} ${domainLabel}</span>`))
                          }
                          ${editBtnHtml}
                      </div>
                  </div>
                  <div class="ios-class-title" ${cancelled ? 'style="text-decoration:line-through; opacity:0.6;"' : ''}>
                      ${subjectName}
                  </div>
                  <div class="ios-class-sub">${subText}</div>
                  ${updateInfoHtml}
                  ${attRowHtml}
              </div>`;
          }
      }
      timelineEventsHtml += `</div>`;
  } else {
      timelineEventsHtml += `<div style="font-size:12.5px; color:var(--tx3); padding: 28px 0; text-align:center; border: 0.5px dashed var(--bd); border-radius: 14px; background: var(--bg2);">☕ No classes scheduled for this day. Enjoy your break!</div>`;
  }

  // Format Date Title
  let cleanDate = currentDateKey;
  try {
      const [yyyy, mm, dd] = ymd.split('-');
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      cleanDate = `${dayName}, ${monthNames[parseInt(mm, 10)-1]} ${parseInt(dd, 10)}`;
  } catch (e) {
      cleanDate = currentDateKey.replace(/-/g, ' '); 
  }
  
  let badgeLabel = '';
  if (isToday) badgeLabel = `<span class="ios-today-badge">Today</span>`;
  else if (isTomorrow) badgeLabel = `<span class="ios-today-badge" style="background:var(--bg3); color:var(--tx2);">Tomorrow</span>`;

  // Exam Banner
  let commentHtml = '';
  if (comment) {
      const badgeBg = isExam ? 'var(--bg-danger)' : 'var(--bg-warn)';
      const badgeBorder = isExam ? 'var(--bd-danger)' : 'var(--bd-warn)';
      const badgeColor = isExam ? 'var(--tx-danger)' : 'var(--tx-warn)';
      const icon = isExam ? '📝' : '⚠️';
      commentHtml = `<div style="font-size:12px; font-weight:700; color:${badgeColor}; margin-bottom:10px; background:${badgeBg}; padding:8px 12px; border-radius:10px; border:0.5px solid ${badgeBorder}; display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">${icon}</span>
          <span style="flex:1;">${comment}</span>
      </div>`;
  }

  // Birthday Banner
  let birthdayHtml = '';
  if (birthdays) {
      birthdayHtml = `<div class="agenda-birthday-card" style="margin-bottom:10px; border-radius:12px;">
          <span style="font-size:16px;">🎉</span>
          <span>Happy Birthday: <strong>${birthdays}</strong>!</span>
      </div>`;
  }

  // Day Navigation Row (Prev Day / Next Day)
  const currentIndex = dateKeys.indexOf(currentDateKey);
  const prevDateKey = currentIndex > 0 ? dateKeys[currentIndex - 1] : null;
  const nextDateKey = currentIndex < dateKeys.length - 1 ? dateKeys[currentIndex + 1] : null;

  const singleCardHtml = `
  <div class="ios-day-card" id="card-${currentDateKey.replace(/\s/g, '-')}" data-is-today="${isToday ? 'true' : 'false'}">
      <div class="ios-day-header">
          <button class="ios-nav-btn" ${prevDateKey ? `onclick="selectAgendaDate('${prevDateKey}')"` : 'disabled'} title="Previous Day">‹</button>
          <div class="ios-date-title">
              <span>${cleanDate}</span>
              ${badgeLabel}
          </div>
          <button class="ios-nav-btn" ${nextDateKey ? `onclick="selectAgendaDate('${nextDateKey}')"` : 'disabled'} title="Next Day">›</button>
      </div>
      ${commentHtml}
      ${birthdayHtml}
      ${timelineEventsHtml}
      ${typeof messMenuCardHtml === 'function' ? messMenuCardHtml(ymd) : ''}
  </div>`;

  const oldStrip = area.querySelector('.date-capsules');
  const keepScroll = oldStrip ? oldStrip.scrollLeft : null;
  area.innerHTML = `
    <div style="display:flex; justify-content:flex-end; margin-bottom:6px;"><button class="mm-today" onclick="agendaToday()">Today</button></div>
    ${capsulesHtml}
    ${liveIslandHtml}
    ${rollBannerHtml}
    ${singleCardHtml}
  `;

  // Countdown timer for next class
  if (nextClassFound) {
      const updateCountdown = () => {
          const cd = document.getElementById('pulse-next-countdown');
          if (!cd) return;
          const diffMin = Math.ceil((nextClassFound.timeMs - Date.now()) / 60000);
          if (diffMin <= 0) {
              renderDailySchedule();
          } else if (diffMin > 60) {
              cd.textContent = `📍 ${nextClassFound.room ? `Rm ${nextClassFound.room} · ` : ''}in ${Math.floor(diffMin/60)}h ${diffMin%60}m`;
          } else {
              cd.textContent = `📍 ${nextClassFound.room ? `Rm ${nextClassFound.room} · ` : ''}in ${diffMin} min`;
          }
      };
      updateCountdown();
      if (window._nextClassInterval) clearInterval(window._nextClassInterval);
      window._nextClassInterval = setInterval(updateCountdown, 30000);
  } else {
      if (window._nextClassInterval) clearInterval(window._nextClassInterval);
  }

  // Scroll the date strip: centre only on first load or when "Today" is pressed. Tapping a date keeps the
  // strip where it is; the arrows only scroll enough to keep the selected date in view.
  const strip = area.querySelector('.date-capsules');
  const cur = document.getElementById(`capsule-${currentDateKey.replace(/\s/g, '-')}`);
  if (strip && cur) {
      const delta = cur.getBoundingClientRect().left - strip.getBoundingClientRect().left;
      if (window._agendaCenter || keepScroll === null) {
          strip.scrollLeft += delta - (strip.clientWidth - cur.offsetWidth) / 2;
          window._agendaCenter = false;
      } else {
          strip.scrollLeft = keepScroll;
          const d = cur.getBoundingClientRect().left - strip.getBoundingClientRect().left;
          if (d < 0) strip.scrollLeft += d - 8;
          else if (d + cur.offsetWidth > strip.clientWidth) strip.scrollLeft += d + cur.offsetWidth - strip.clientWidth + 8;
      }
  }
}


// ---- Phone push for shared class updates (FCM) -------------------------
// Opt-in rides the existing alerts toggle. The token is stored per roll and
// device; Apps Script (scripts/notify.gs) sends the pushes. The 30-minute
// reminders above stay local and only fire while the app is alive.
function pushDeviceId() {
  let id = localStorage.getItem('mbaplanner_device_id');
  if (!id) { id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem('mbaplanner_device_id', id); }
  return id;
}

window.syncPush = async function() {
  try {
    if (typeof FCM_VAPID_KEY === 'undefined' || !FCM_VAPID_KEY) return;
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !fbDb) return;
    if (!firebase.messaging || !firebase.messaging.isSupported()) return;
    const roll = getActiveRollNo();
    if (!roll) return;
    const safeRoll = roll.replace(/[.#$[\]]/g, '_');
    const want = Notification.permission === 'granted' && localStorage.getItem('mbaplanner_reminder_30m') !== 'off';
    const sig = safeRoll + '|' + want;
    if (window._pushSig === sig) return;
    const ref = fbDb.ref(`push_tokens/${safeRoll}/${pushDeviceId()}`);
    if (!want) {
      window._pushSig = sig;
      const old = localStorage.getItem('mbaplanner_push_roll');
      if (old) fbDb.ref(`push_tokens/${old}/${pushDeviceId()}`).remove().catch(() => {});
      ref.remove().catch(() => {});
      fbDb.ref(`push_reminders/${safeRoll}`).remove().catch(() => {});
      window._reminderSig = '';
      localStorage.removeItem('mbaplanner_push_roll');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return;
    // Roll changed on this device: drop the token under the old roll.
    const prev = localStorage.getItem('mbaplanner_push_roll');
    if (prev && prev !== safeRoll) fbDb.ref(`push_tokens/${prev}/${pushDeviceId()}`).remove().catch(() => {});
    await ref.set({ token, at: Date.now(), prefs: pushPrefs() });
    localStorage.setItem('mbaplanner_push_roll', safeRoll);
    window._pushSig = sig;
    if (typeof currentView !== 'undefined' && currentView === 'daily') renderDailySchedule();
  } catch (e) {
    window._pushErr = String(e && e.message || e).slice(0, 160);
    console.warn('Push setup failed', e);
  }
};
setTimeout(() => { if (window.syncPush) window.syncPush(); }, 6000);

// Tapping a push opens the agenda on the changed date.
(function() {
  const go = ymd => { if (/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') && window.openAgendaDate) window.openAgendaDate(ymd); };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open-date') go(e.data.ymd); });
  }
  const q = new URLSearchParams(location.search).get('date');
  if (q) setTimeout(() => go(q), 1500);
})();

// Drawer "Test notification": shows the push set-up state on this device and
// fires a local notification through the service worker.
window.testNotification = async function() {
  const lines = [];
  try {
    lines.push('Permission: ' + (('Notification' in window) ? Notification.permission : 'unsupported'));
    lines.push('Home Screen app: ' + ((window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) ? 'yes' : 'no'));
    lines.push('Roll: ' + (getActiveRollNo() || 'not set'));
    lines.push('Push key set: ' + (typeof FCM_VAPID_KEY !== 'undefined' && FCM_VAPID_KEY ? 'yes' : 'no'));
    lines.push('Token saved for: ' + (localStorage.getItem('mbaplanner_push_roll') || 'none'));
    const reg = await navigator.serviceWorker.ready;
    lines.push('Worker: ' + (reg.active ? reg.active.state : 'none'));
    const sub = reg.pushManager ? await reg.pushManager.getSubscription() : null;
    lines.push('Push subscription: ' + (sub ? 'yes' : 'NO'));
    if (window._pushErr) lines.push('Last error: ' + window._pushErr);
    if (Notification.permission === 'granted') {
      await reg.showNotification('Test notification', { body: 'If you can see this, notifications work on this device.', icon: './icon-192.png' });
    }
  } catch (e) {
    lines.push('Error: ' + e.message);
  }
  alert(lines.join('\n'));
};


// Upcoming classes for server-sent "starts in 30 min" pushes. Written under
// push_reminders/{roll}; notify.gs reads it and also skips cancelled/moved.
window.syncPushReminders = function(data) {
  try {
    if (!fbDb || !/\|true$/.test(window._pushSig || '')) return;
    const roll = getActiveRollNo();
    if (!roll) return;
    const safeRoll = roll.replace(/[.#$[\]]/g, '_');
    const sig = safeRoll + JSON.stringify(data);
    if (window._reminderSig === sig) return;
    window._reminderSig = sig;
    const map = {};
    data.items.forEach(it => { map[`${it.y}_${it.s}_${it.c}`.replace(/[.#$[\]\/]/g, '_')] = it; });
    const payload = { at: Date.now(), subj: data.subj || [], abs: data.abs || {}, meals: data.meals || [] };
    if (Object.keys(map).length) payload.items = map;
    fbDb.ref(`push_reminders/${safeRoll}`).set(payload).catch(e => { window._reminderSig = ''; console.warn('Reminder sync failed', e); });
  } catch (e) { console.warn('Reminder sync error', e); }
};


// What this device gets. Stored on the token record so the server can respect it.
const PUSH_PREF_DEFAULTS = { chg: true, rem: true, morn: true, eve: false, att: true, sheet: true, meal: true, bc: true };
const PUSH_PREF_LABELS = [
  ['chg', 'Class updates', 'Cancelled, moved or retimed by classmates'],
  ['rem', '30-min class reminder', 'Before each class'],
  ['meal', 'Meal alerts', '15 min before breakfast, lunch, snacks, dinner'],
  ['morn', 'Morning summary', "Today's classes at about 7 AM"],
  ['eve', 'Evening preview', "Tomorrow's classes at about 9 PM"],
  ['att', 'Attendance', 'Reminder 15 min after class if not marked, and absence-limit warnings'],
  ['sheet', 'Timetable changes', 'When the official timetable changes'],
  ['bc', 'Announcements', 'Messages from the admin']
];
function pushPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('mbaplanner_push_prefs')) || {}; } catch (e) {}
  const out = {};
  Object.keys(PUSH_PREF_DEFAULTS).forEach(k => { out[k] = typeof saved[k] === 'boolean' ? saved[k] : PUSH_PREF_DEFAULTS[k]; });
  return out;
}
window.setPushPref = function(key, on) {
  const p = pushPrefs();
  p[key] = Boolean(on);
  try { localStorage.setItem('mbaplanner_push_prefs', JSON.stringify(p)); } catch (e) {}
  try {
    const safeRoll = localStorage.getItem('mbaplanner_push_roll');
    if (fbDb && safeRoll && /\|true$/.test(window._pushSig || '')) {
      fbDb.ref(`push_tokens/${safeRoll}/${pushDeviceId()}/prefs`).set(p).catch(() => {});
    }
  } catch (e) {}
};
window.renderPushPrefsHtml = function() {
  const p = pushPrefs();
  return PUSH_PREF_LABELS.map(([k, t, sub]) => `
        <div class="drawer-setting-row">
          <div class="drawer-setting-info">
            <span class="drawer-setting-title">${t}</span>
            <span class="drawer-setting-sub">${sub}</span>
          </div>
          <label class="ios-switch">
            <input type="checkbox" ${p[k] ? 'checked' : ''} onchange="setPushPref('${k}', this.checked)">
            <span class="ios-slider"></span>
          </label>
        </div>`).join('');
};


// ---- Admin tools (PIN protected) -----------------------------------------
// The entry only appears when the admin's own roll number is set on this
// device. The PIN is checked by the database rules, never by this file.
const ADMIN_ROLL = 'MS25A071';
function adminEntryVisible() { return getActiveRollNo() === ADMIN_ROLL; }
function adminPin() { try { return sessionStorage.getItem('mbaplanner_admin_pin') || ''; } catch (e) { return ''; } }

window.updateAdminEntry = function() {
  const show = adminEntryVisible();
  const hdr = document.getElementById('hdr-admin-btn');
  if (hdr) hdr.style.display = show ? 'inline-block' : 'none';
  const el = document.getElementById('drawer-admin');
  if (el) {
    el.innerHTML = show
      ? `<div class="drawer-setting-row" onclick="openAdminSheet()" style="cursor:pointer;"><div class="drawer-setting-info"><span class="drawer-setting-title">🔐 Admin</span><span class="drawer-setting-sub">Announcements and stats</span></div></div>`
      : '';
  }
};
window.renderDrawerAdmin = window.updateAdminEntry;
setInterval(() => window.updateAdminEntry(), 3000);
setTimeout(() => window.updateAdminEntry(), 1500);

function adminBox() {
  let box = document.getElementById('admin-sheet');
  if (!box) {
    box = document.createElement('div');
    box.id = 'admin-sheet';
    box.style.cssText = 'position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,.45); display:flex; align-items:flex-end; justify-content:center;';
    box.onclick = e => { if (e.target === box) box.remove(); };
    document.body.appendChild(box);
  }
  return box;
}
const ADMIN_CARD = 'background:var(--bg); color:var(--tx); width:100%; max-width:520px; border-radius:18px 18px 0 0; padding:18px 16px calc(18px + env(safe-area-inset-bottom)); box-shadow:0 -8px 30px rgba(0,0,0,.25);';

window.openAdminSheet = function() {
  if (!adminEntryVisible()) return;
  if (window.pwaCloseDrawer) pwaCloseDrawer();
  const box = adminBox();
  if (!adminPin()) {
    box.innerHTML = `<div style="${ADMIN_CARD}">
      <div style="font-size:16px; font-weight:700; margin-bottom:10px;">🔐 Enter admin PIN</div>
      <input id="admin-pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="4-digit PIN" style="width:100%; box-sizing:border-box; font-size:22px; letter-spacing:8px; text-align:center; padding:10px; border-radius:10px; border:.5px solid var(--bd); background:var(--bg2); color:var(--tx);" onkeydown="if(event.key==='Enter') adminUnlock()">
      <div id="admin-pin-msg" style="font-size:12px; color:var(--tx-danger); min-height:16px; margin:6px 0;"></div>
      <button class="cmp-btn" style="width:100%; padding:10px; border-radius:10px;" onclick="adminUnlock()">Unlock</button>
      <button class="ios-seg-btn" style="width:100%; margin-top:8px;" onclick="document.getElementById('admin-sheet').remove()">Cancel</button>
    </div>`;
    setTimeout(() => document.getElementById('admin-pin-input')?.focus(), 50);
    return;
  }
  adminPanel();
};

window.adminUnlock = function() {
  const msg = document.getElementById('admin-pin-msg');
  const pin = (document.getElementById('admin-pin-input').value || '').trim();
  if (Date.now() < (window._adminLockUntil || 0)) { msg.textContent = 'Too many tries. Wait a minute.'; return; }
  if (!/^\d{4}$/.test(pin)) { msg.textContent = 'Enter the 4-digit PIN.'; return; }
  const u = firebase.auth().currentUser;
  if (!u || !fbDb) { msg.textContent = 'Not connected yet. Try again in a moment.'; return; }
  msg.style.color = 'var(--tx2)'; msg.textContent = 'Checking...';
  const ref = fbDb.ref(`admin_ping/${u.uid}`);
  ref.set({ pin }).then(() => {
    ref.remove().catch(() => {});
    try { sessionStorage.setItem('mbaplanner_admin_pin', pin); } catch (e) {}
    window._adminFails = 0;
    adminPanel();
  }).catch(() => {
    window._adminFails = (window._adminFails || 0) + 1;
    if (window._adminFails >= 5) { window._adminLockUntil = Date.now() + 60000; window._adminFails = 0; }
    msg.style.color = 'var(--tx-danger)';
    msg.textContent = 'Wrong PIN.';
  });
};

window.adminLock = function() {
  try { sessionStorage.removeItem('mbaplanner_admin_pin'); } catch (e) {}
  document.getElementById('admin-sheet')?.remove();
};

function adminPanel() {
  const box = adminBox();
  box.innerHTML = `<div style="${ADMIN_CARD} max-height:90vh; overflow:auto;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div style="font-size:16px; font-weight:700;">🔐 Admin</div>
      <button class="ios-seg-btn" style="padding:4px 10px; font-size:11.5px;" onclick="adminLock()">Lock</button>
    </div>
    <div id="admin-stats" style="font-size:12.5px; color:var(--tx2); margin-bottom:12px;">Loading stats...</div>
    <div style="font-size:13px; font-weight:700; margin-bottom:6px;">📣 Announcement</div>
    <input id="ann-title" class="cmp-input" maxlength="80" placeholder="Title (short)" style="width:100%; box-sizing:border-box; margin-bottom:8px; border-radius:10px; padding:9px 11px;">
    <textarea id="ann-body" class="cmp-input" maxlength="240" rows="3" placeholder="Message" style="width:100%; box-sizing:border-box; border-radius:10px; padding:9px 11px; resize:none;"></textarea>
    <label style="display:flex; align-items:center; gap:8px; font-size:12.5px; margin:8px 0;"><input type="checkbox" id="ann-only-me"> Test: send only to me</label>
    <div style="font-size:11.5px; color:var(--tx2); margin-bottom:10px;">Goes to everyone with notifications on, within about 5 minutes. It can't be taken back.</div>
    <button class="cmp-btn" style="width:100%; padding:10px; border-radius:10px;" onclick="sendAnnouncement()">Send</button>
    <div id="ann-recent" style="margin-top:14px; font-size:12px; color:var(--tx2);"></div>
  </div>`;
  try {
    fbDb.ref('push_stats').once('value').then(snap => {
      const v = snap.val(), el = document.getElementById('admin-stats');
      if (!el) return;
      el.innerHTML = v ? `🔔 <b>${v.students}</b> students have notifications on (${v.devices} device${v.devices === 1 ? '' : 's'}). Updated ${new Date(v.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : 'No stats yet.';
    }).catch(() => {});
    fbDb.ref('announcements_log').orderByKey().limitToLast(5).once('value').then(snap => {
      const rows = [];
      snap.forEach(c => { const v = c.val() || {}; rows.unshift(`• ${escHtml(v.title || '')} — ${v.test ? 'test, ' : ''}sent to ${v.devices || 0} device(s), ${new Date(v.sentAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`); });
      const el = document.getElementById('ann-recent');
      if (el) el.innerHTML = rows.length ? '<b>Recent</b><br>' + rows.join('<br>') : '';
    }).catch(() => {});
  } catch (e) {}
}

window.sendAnnouncement = function() {
  const title = (document.getElementById('ann-title').value || '').trim();
  const body = (document.getElementById('ann-body').value || '').trim();
  const onlyMe = document.getElementById('ann-only-me').checked;
  if (!title || !body) { alert('Write a title and a message first.'); return; }
  if (!onlyMe && !confirm('Send this to every student?\n\n' + title + '\n' + body)) return;
  const rec = { title, body, at: firebase.database.ServerValue.TIMESTAMP, pin: adminPin() };
  if (onlyMe) rec.onlyMe = true;
  fbDb.ref('announcements').push(rec)
    .then(() => { document.getElementById('admin-sheet')?.remove(); alert(onlyMe ? 'Queued. It reaches your phone within about 5 minutes.' : 'Queued. Students get it within about 5 minutes.'); })
    .catch(() => { try { sessionStorage.removeItem('mbaplanner_admin_pin'); } catch (e) {} alert('Not allowed. The PIN may have changed. Unlock again.'); window.openAdminSheet(); });
};

// ---- Prompt students to install the app and turn notifications on ----------
function pushPromptKind() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
  const supported = 'Notification' in window && 'serviceWorker' in navigator;
  const on = supported && Notification.permission === 'granted' && localStorage.getItem('mbaplanner_reminder_30m') !== 'off';
  if (on) return null;
  if (isIOS && !standalone) return safari ? 'ios-safari' : 'ios-other';
  if (!supported) return null;
  return Notification.permission === 'denied' ? 'denied' : 'enable';
}

window.refreshPushPrompt = function() {
  const el = document.getElementById('push-prompt');
  if (!el) return;
  let until = 0;
  try { until = Number(localStorage.getItem('mbaplanner_push_prompt_until') || 0); } catch (e) {}
  const kind = pushPromptKind();
  if (!kind || Date.now() < until) { el.innerHTML = ''; return; }
  const box = 'background:var(--bg-info); color:var(--tx); border:.5px solid var(--bd-info); border-radius:12px; padding:12px 14px; margin:0 0 12px; font-size:13px; line-height:1.45;';
  const btn = 'background:var(--tx-info); color:#fff; border:none; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:700; cursor:pointer;';
  const later = '<button onclick="dismissPushPrompt()" style="background:none; border:none; color:var(--tx2); font-size:12px; cursor:pointer; padding:8px 6px;">Not now</button>';
  let h = '';
  if (kind === 'ios-safari') {
    h = `<b>📲 Get class alerts on your iPhone</b><br>Notifications only work once the app is on your Home Screen:<br>
      1. Tap the <b>Share</b> button (the square with an arrow) at the bottom of Safari<br>
      2. Tap <b>Add to Home Screen</b>, then <b>Add</b><br>
      3. Open the app from the <b>new icon</b> and tap <b>Turn on notifications</b><div style="margin-top:6px;">${later}</div>`;
  } else if (kind === 'ios-other') {
    h = `<b>📲 Open this in Safari to get alerts</b><br>iPhones only allow notifications for apps added from <b>Safari</b> (not Chrome). Open <b>q567.vercel.app</b> in Safari, tap Share → Add to Home Screen, then open it from the new icon.<div style="margin-top:6px;"><button style="${btn}" onclick="copyAppLink()">Copy link</button>${later}</div>`;
  } else if (kind === 'denied') {
    h = `<b>🔕 Notifications are blocked</b><br>Open your phone's <b>Settings → Notifications</b>, find this app (or your browser), and allow notifications. Then reopen the app.<div style="margin-top:6px;">${later}</div>`;
  } else {
    const install = (typeof _deferredInstallPrompt !== 'undefined' && _deferredInstallPrompt) ? `<button style="${btn} background:var(--bg); color:var(--tx-info); border:.5px solid var(--bd-info);" onclick="handleInstallClick()">Install app</button> ` : '';
    h = `<b>🔔 Turn on notifications</b><br>Get class changes, a reminder before each class, and meal alerts on your phone.<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; align-items:center;"><button style="${btn}" onclick="enableNotificationsFromPrompt()">Turn on notifications</button>${install}${later}</div>`;
  }
  el.innerHTML = `<div style="${box}">${h}</div>`;
};

window.dismissPushPrompt = function() {
  try { localStorage.setItem('mbaplanner_push_prompt_until', String(Date.now() + 2 * 86400000)); } catch (e) {}
  window.refreshPushPrompt();
};

window.copyAppLink = function() {
  const url = 'https://q567.vercel.app';
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => alert('Link copied. Paste it into Safari.'), () => prompt('Copy this link and open it in Safari:', url));
};

window.enableNotificationsFromPrompt = function() {
  if (!getActiveRollNo()) {
    alert('First enter your roll number (the box on the Agenda tab), then turn on notifications.');
    if (window.switchView) switchView('daily');
    return;
  }
  Notification.requestPermission().then(perm => {
    localStorage.setItem('mbaplanner_reminder_30m', perm === 'granted' ? 'on' : 'off');
    savePreferencesForRoll();
    if (window.updateDrawerSettingsUI) updateDrawerSettingsUI();
    window.refreshPushPrompt();
    if (typeof currentView !== 'undefined' && currentView === 'daily') renderDailySchedule();
  });
};

setTimeout(() => window.refreshPushPrompt(), 2500);
window.addEventListener('focus', () => window.refreshPushPrompt());
document.addEventListener('visibilitychange', () => { if (!document.hidden) window.refreshPushPrompt(); });
