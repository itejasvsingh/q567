// Mess menu tab. Data lives in mess-menu.js (window.MESS_MENU); this file only renders it.
(function () {
  const WEEKS = ['A', 'B', 'C', 'D'];
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const MEALS = [
    { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
    { key: 'lunch', label: 'Lunch', icon: '🍛' },
    { key: 'snacks', label: 'Snacks', icon: '☕' },
    { key: 'dinner', label: 'Dinner', icon: '🌙' }
  ];
  const MESS_LABELS = { north: 'North', south: 'South', unified: 'Unified', protein: 'Protein' };
  const DIET_LABELS = { veg: 'Veg', nonveg: 'Non-Veg', pureveg: 'Pure Veg', all: '' };
  // Rough end of each meal (hour, 24h), used only to highlight what's next today.
  const MEAL_ENDS = { breakfast: 10.5, lunch: 15, snacks: 18.5, dinner: 22.5 };
  const PREF_KEY = 'mbaplanner_mess_pref';

  const state = { mess: null, diet: null, date: null, draftMess: null };

  function loadPref() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY));
      if (p && MESS_LABELS[p.mess]) { state.mess = p.mess; state.diet = p.diet; }
    } catch (e) {}
  }
  function savePref() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ mess: state.mess, diet: state.diet })); } catch (e) {}
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  function nowIST() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })); }
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  // Which week letter is running on a given date, from the anchor in mess-menu.js.
  function weekOn(date) {
    const a = window.MESS_MENU.anchor;
    const [y, m, d] = a.monday.split('-').map(Number);
    const weeks = Math.round((mondayOf(date) - new Date(y, m - 1, d)) / (7 * 864e5));
    return WEEKS[(((WEEKS.indexOf(a.week) + weeks) % 4) + 4) % 4];
  }
  function dietsFor(mess) { return Object.keys(window.MESS_MENU.data[mess] || {}); }
  const hasPref = () => Boolean(state.mess && window.MESS_MENU.data[state.mess]);
  function ensureValid() {
    if (!hasPref()) return;
    const diets = dietsFor(state.mess);
    if (!diets.includes(state.diet)) state.diet = diets.includes('veg') ? 'veg' : diets[0];
  }

  function dayCard(menu, dayKey, isToday, now) {
    const cur = MEALS.find(m => now.getHours() + now.getMinutes() / 60 < MEAL_ENDS[m.key]) || null;
    return MEALS.map(m => {
      const items = (menu.menu[dayKey] || {})[m.key] || [];
      const common = (menu.common[m.key] || []).filter(Boolean);
      const isNext = isToday && cur && cur.key === m.key;
      return `
      <div class="mm-meal${isNext ? ' mm-next' : ''}">
        <div class="mm-meal-head">
          <span class="mm-meal-title"><span>${m.icon}</span>${m.label}</span>
          ${isNext ? '<span class="mm-pill">Up next</span>' : ''}
        </div>
        <ul class="mm-items">${items.length ? items.map(i => `<li>${esc(i)}</li>`).join('') : '<li class="mm-none">Not listed</li>'}</ul>
        ${common.length ? `<div class="mm-common"><b>Also served:</b> ${esc(common.join(' · '))}</div>` : ''}
      </div>`;
    }).join('');
  }

  const dayKeyOf = d => DAYS[(d.getDay() + 6) % 7];
  const parseYmd = t => { const [y, m, d] = t.split('-').map(Number); return new Date(y, m - 1, d); };
  const menuFor = d => !hasPref() ? null : (((window.MESS_MENU.data[state.mess] || {})[state.diet] || {})[weekOn(d)]) || null;

  // First-run choice, shared by the Menu tab and the Daily Agenda. Nothing is shown until a mess is picked.
  function pickerHtml() {
    const m = state.draftMess, data = window.MESS_MENU.data;
    if (!m) {
      return `<div class="mm-pick-t">Which mess do you eat at?</div><div class="mm-pick-row">${Object.keys(MESS_LABELS).filter(k => data[k]).map(k =>
        `<button class="chip" onclick="pickMess('${k}')">${MESS_LABELS[k]}</button>`).join('')}</div>`;
    }
    return `<div class="mm-pick-t">${MESS_LABELS[m]} mess: which menu?</div><div class="mm-pick-row">${dietsFor(m).map(d =>
      `<button class="chip" onclick="pickDiet('${d}')">${DIET_LABELS[d]}</button>`).join('')}<button class="chip" onclick="pickMess(null)">‹ Back</button></div>`;
  }
  function refreshAll() { renderMenu(true); if (typeof renderDailySchedule === 'function') renderDailySchedule(); }
  window.pickMess = function (k) {
    state.draftMess = null;
    if (k) {
      const diets = dietsFor(k);
      if (diets.length === 1) { state.mess = k; state.diet = diets[0]; savePref(); }
      else state.draftMess = k;
    }
    refreshAll();
  };
  window.pickDiet = function (d) { state.mess = state.draftMess; state.diet = d; state.draftMess = null; savePref(); refreshAll(); };

  window.renderMenu = function (center) {
    const root = document.getElementById('menu-root');
    if (!root || !window.MESS_MENU) return;
    ensureValid();
    if (!hasPref()) {
      root.innerHTML = `<div class="mm-top"><div><h2 class="mm-h">🥘 Mess menu</h2><div class="mm-sub">IIT Madras</div></div></div><div class="mm-pick">${pickerHtml()}</div>`;
      return;
    }
    const now = nowIST();
    const today = ymd(now);
    if (!state.date) { state.date = today; center = true; }
    const sel = parseYmd(state.date);
    const week = weekOn(sel);
    const isToday = state.date === today;
    const menu = menuFor(sel);

    // one long strip: 2 weeks back to 10 weeks ahead, week letter shown on each Monday
    const first = addDays(mondayOf(now), -14);
    const caps = Array.from({ length: 13 * 7 }, (_, i) => {
      const d = addDays(first, i), k = ymd(d), mon = i % 7 === 0;
      return `<div class="capsule${k === state.date ? ' selected' : ''}" onclick="menuSet('date','${k}')">
        <span class="dow">${dayKeyOf(d).slice(0, 3).toUpperCase()}</span><span class="num">${d.getDate()}</span>
        <span class="mm-wk">${mon ? 'Wk ' + weekOn(d) : (d.getDate() === 1 ? d.toLocaleDateString('en-GB', { month: 'short' }) : '')}</span>
        <span class="dot-indicator" style="opacity:${k === today ? 1 : 0}"></span></div>`;
    }).join('');

    const diets = dietsFor(state.mess);
    const messBtns = Object.keys(MESS_LABELS).filter(k => window.MESS_MENU.data[k]).map(k =>
      `<button class="ios-seg-btn${state.mess === k ? ' active-p' : ''}" onclick="menuSet('mess','${k}')">${MESS_LABELS[k]}</button>`).join('');
    const dietChips = diets.length > 1 ? diets.map(d =>
      `<button class="chip${state.diet === d ? ' on' : ''}" onclick="menuSet('diet','${d}')">${DIET_LABELS[d]}</button>`).join('') : '';

    const oldStrip = root.querySelector('.date-capsules'), keep = oldStrip ? oldStrip.scrollLeft : 0;
    root.innerHTML = `
      <div class="mm-top">
        <div>
          <h2 class="mm-h">🥘 Mess menu</h2>
          <div class="mm-sub">IIT Madras · ${MESS_LABELS[state.mess]}${DIET_LABELS[state.diet] ? ' · ' + DIET_LABELS[state.diet] : ''}</div>
        </div>
        <button class="mm-today" onclick="menuToday()">Today</button>
      </div>
      <div class="ios-segmented mm-seg">${messBtns}</div>
      ${dietChips ? `<div class="chip-row mm-row">${dietChips}</div>` : ''}
      <div class="date-capsules">${caps}</div>
      <div class="mm-day-title">${dayKeyOf(sel)[0].toUpperCase() + dayKeyOf(sel).slice(1)}, ${fmt(sel)} <span class="mm-pill">Week ${week}</span>${isToday ? ' <span class="mm-pill">Today</span>' : ''}</div>
      ${menu ? dayCard(menu, dayKeyOf(sel), isToday, now) : '<div class="mm-none">No menu for this day.</div>'}
      <div class="mm-foot">Source: official IITM mess menu PDFs 2026-27. Weeks repeat A → B → C → D.</div>`;
    const strip = root.querySelector('.date-capsules'), cur = strip.querySelector('.selected');
    strip.scrollLeft = center && cur ? cur.offsetLeft - (strip.clientWidth - cur.offsetWidth) / 2 : keep;
  };

  window.menuSet = function (k, v) {
    state[k] = v;
    if (k === 'mess') ensureValid();
    if (k === 'mess' || k === 'diet') { savePref(); if (typeof renderDailySchedule === 'function') renderDailySchedule(); }
    renderMenu();
  };
  window.menuToday = function () { state.date = null; renderMenu(true); };
  // used by the Agenda's "Open full menu" link
  window.openMenuOn = function (k) { state.date = k; switchView('menu'); renderMenu(true); };

  // Compact collapsible card for one day, shown inside the Daily Agenda.
  window.messMenuCardHtml = function (k) {
    if (!window.MESS_MENU) return '';
    ensureValid();
    if (!hasPref()) return `<div class="mm-agenda mm-pick"><div class="mm-ag-h">🥘 Mess menu</div>${pickerHtml()}</div>`;
    const d = parseYmd(k), menu = menuFor(d);
    if (!menu) return '';
    const rows = MEALS.map(m => {
      const items = (menu.menu[dayKeyOf(d)] || {})[m.key] || [];
      return items.length ? `<div class="mm-ag-row"><b>${m.icon} ${m.label}</b><span>${items.map(esc).join(' · ')}</span></div>` : '';
    }).join('');
    return `<details class="mm-agenda"${window._mmAgendaOpen ? ' open' : ''} ontoggle="window._mmAgendaOpen=this.open">
      <summary>🥘 Mess menu · ${MESS_LABELS[state.mess]}${DIET_LABELS[state.diet] ? ' ' + DIET_LABELS[state.diet] : ''} · Week ${weekOn(d)}</summary>
      ${rows}
      <a class="mm-ag-link" href="#" onclick="openMenuOn('${k}');return false">Open full menu →</a>
    </details>`;
  };

  loadPref();
})();
