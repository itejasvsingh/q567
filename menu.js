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

  const state = { mess: 'north', diet: 'veg', week: null, day: null };

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
  // Monday of the next time `week` runs (this week if it's the current one).
  function nextStart(week, from) {
    const cur = weekOn(from);
    const ahead = (WEEKS.indexOf(week) - WEEKS.indexOf(cur) + 4) % 4;
    return addDays(mondayOf(from), ahead * 7);
  }

  function dietsFor(mess) { return Object.keys(window.MESS_MENU.data[mess] || {}); }
  function ensureValid() {
    if (!window.MESS_MENU.data[state.mess]) state.mess = 'north';
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

  window.renderMenu = function () {
    const root = document.getElementById('menu-root');
    if (!root || !window.MESS_MENU) return;
    ensureValid();
    const now = nowIST();
    const currentWeek = weekOn(now);
    if (!state.week) state.week = currentWeek;
    const viewingCurrent = state.week === currentWeek;
    const todayIdx = (now.getDay() + 6) % 7;
    if (state.day === null) state.day = todayIdx;

    const diets = dietsFor(state.mess);
    const menu = window.MESS_MENU.data[state.mess][state.diet][state.week];
    const start = nextStart(state.week, now);
    const dayDates = DAYS.map((_, i) => addDays(start, i));
    const rangeText = viewingCurrent ? `This week · ${fmt(start)} – ${fmt(addDays(start, 6))}` : `Next runs ${fmt(start)} – ${fmt(addDays(start, 6))}`;

    const messBtns = Object.keys(MESS_LABELS).filter(k => window.MESS_MENU.data[k]).map(k =>
      `<button class="ios-seg-btn${state.mess === k ? ' active-p' : ''}" onclick="menuSet('mess','${k}')">${MESS_LABELS[k]}</button>`).join('');
    const dietChips = diets.length > 1 ? diets.map(d =>
      `<button class="chip${state.diet === d ? ' on' : ''}" onclick="menuSet('diet','${d}')">${DIET_LABELS[d]}</button>`).join('') : '';
    const weekChips = WEEKS.map(w =>
      `<button class="chip mm-week${state.week === w ? ' on' : ''}" onclick="menuSet('week','${w}')">Week ${w}${w === currentWeek ? '<i class="mm-dot" title="This week"></i>' : ''}</button>`).join('');
    const caps = DAYS.map((d, i) => {
      const isToday = viewingCurrent && i === todayIdx;
      return `<div class="capsule${state.day === i ? ' selected' : ''}" onclick="menuSet('day',${i})">
        <span class="dow">${d.slice(0, 3).toUpperCase()}</span><span class="num">${dayDates[i].getDate()}</span>
        <span class="dot-indicator" style="opacity:${isToday ? 1 : 0}"></span></div>`;
    }).join('');

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
      <div class="chip-row mm-row">${weekChips}</div>
      <div class="mm-range">${rangeText}${viewingCurrent ? '' : ' · <a href="#" onclick="menuToday();return false">back to this week</a>'}</div>
      <div class="date-capsules">${caps}</div>
      <div class="mm-day-title">${DAYS[state.day][0].toUpperCase() + DAYS[state.day].slice(1)}, ${fmt(dayDates[state.day])}${viewingCurrent && state.day === todayIdx ? ' <span class="mm-pill">Today</span>' : ''}</div>
      ${dayCard(menu, DAYS[state.day], viewingCurrent && state.day === todayIdx, now)}
      <div class="mm-foot">Source: official IITM mess menu PDFs 2026-27. Weeks repeat A → B → C → D.</div>`;
    // keep the selected day in view in the horizontal strip
    const strip = root.querySelector('.date-capsules'), sel = strip && strip.querySelector('.selected');
    if (strip && sel) strip.scrollLeft = sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2;
  };

  window.menuSet = function (k, v) {
    state[k] = v;
    if (k === 'mess') { state.diet = state.diet; ensureValid(); }
    if (k === 'mess' || k === 'diet') savePref();
    renderMenu();
  };
  window.menuToday = function () {
    state.week = null; state.day = null;
    renderMenu();
  };

  loadPref();
})();
