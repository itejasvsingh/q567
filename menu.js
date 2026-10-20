// Mess menu tab. Data lives in mess-menu.js (window.MESS_MENU); this file only renders it.
(function () {
  const WEEKS = ['A', 'B', 'C', 'D'];
  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const MEALS = [
    { key: 'breakfast', label: 'Breakfast', icon: '🌅', time: '7:00 – 9:30 AM', from: 7, to: 9.5 },
    { key: 'lunch', label: 'Lunch', icon: '🍛', time: '12:00 – 2:30 PM', from: 12, to: 14.5 },
    { key: 'snacks', label: 'Snacks', icon: '☕', time: '4:30 – 5:30 PM', from: 16.5, to: 17.5 },
    { key: 'dinner', label: 'Dinner', icon: '🌙', time: '7:00 – 9:30 PM', from: 19, to: 21.5 }
  ];
  const MESS_LABELS = { north: 'North', south: 'South', unified: 'Unified', protein: 'Protein' };
  const DIET_LABELS = { veg: 'Veg', nonveg: 'Non-Veg', pureveg: 'Pure Veg', all: '' };
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

  // Main dishes worth calling out at lunch and dinner: dal, sabzi/curry items, and rice mains (biryani, khichdi, pulao, fried rice).
  const SWEET = /halwa|kheer|payasam|jalebi|custard|cake|jam\b|kesari|jamun|tukda|meetha|meeta|pak\b|lassi|ice cream|rasgulla|gajar/i;
  const BREAD = /puri\b|poori|bhature|kulcha|paratha|parotta|luchi|naan/i;
  const DAL = /\bdal\b|dhal|dalma|kadhi|pappu|\bpapu\b/i;
  const RICEY = /biryani|pulao|pulav|khichdi|kichidi|fried rice|\bbath\b/i;
  const STRONG = /curry|sabzi|sabji|kofta|koftha|bhurji|dalna|kurma|korma|stew|roast|gravy|tikka|mughalai|mughlai|butter masala|chole|rajma|chicken|mutton|fish|paneer/i;
  const STAPLE = /rice|roti|phulka|chapa?th?i|paratha|parotta|puri\b|poori|dosa|idli|idly|upma|poha|milk|juice|curd|raita|salad|pickle|papad|fryums|fruit|egg\b|oats|cornflakes|chutney|sambar|sambhar|rasam|lassi|rusk|biscuit|samosa|puff|vada|bonda|chaat|popcorn|water|drink|bhature|kulcha|thoviyal|pachadi|podi|salan|salna|sherva|boondi/i;
  const LOOSE = /masala|\bfry\b|\bdry\b|poriyal|kootu|aloo|gobi|bhindi|baingan|baigan|brinjal|cabbage|beans|peas|matar|mutter|karela|palak|mushroom|soya|manchurian|bhaji|saag|tindly|tinde|pumpkin|gourd|lauki|methi|chokha|bharta|kuzhambu|pakora|pakoda|chana|channa|kadai|mix(ed)? veg|saturated|cauliflower|capsicum|spinach|carrot/i;
  function dishKind(item) {
    if (SWEET.test(item)) return 'sweet';
    if (DAL.test(item)) return 'dal';
    if (RICEY.test(item)) return 'rice';
    if (/thoviyal|chutney|pachadi|podi\b/i.test(item)) return null;
    if (/chole bhature/i.test(item)) return 'sabzi';
    if (BREAD.test(item)) return 'bread';
    if (STRONG.test(item)) return 'sabzi';
    if (STAPLE.test(item)) return null;
    return LOOSE.test(item) ? 'sabzi' : null;
  }
  // Breakfast: the egg/oats choice and the hot dish (kachori, dosa, idli, poha...) - not jam, chutney or sprouts.
  const EGGCHOICE = /egg|omelet/i;
  const CEREAL = /^(oats|cornflakes|corn flakes|chocos|cornfalkes)$/i;
  const HOT = /kachori|dosa|adai|idli|idly|idiappam|idiyappam|upma|poha|paratha|parotta|puri\b|poori|pongal|uthappam|utthappam|uttapam|uthapam|utthapam|pesarattu|khichdi|khichidi|kichdi|kichidi|bhath|pav bhaji|vada|bonda|punugulu|puttu|chilla|pulihora|kurma|dalia|luchi|natu rava|rava\b|aloo|sabji|sabzi|curry|masala|stew|cutlet|bhurji|burji|soya chunks|pakwaan/i;
  function breakfastKind(item) {
    if (EGGCHOICE.test(item)) return 'egg';
    return HOT.test(item) ? 'hot' : null;
  }
  // "Fried Egg/Oats/Chocos" -> the egg is the news; oats/chocos/cornflakes are always there, so they go to "Also served".
  function breakfastSplit(items) {
    const out = [], cereals = [], jams = [];
    items.forEach(it => {
      if (/\bjam\b/i.test(it)) { jams.push(it); return; }
      const tokens = it.split('/').map(t => t.trim()).filter(Boolean);
      if (!tokens.some(t => EGGCHOICE.test(t) || CEREAL.test(t))) { out.push(it); return; }
      const eggs = tokens.filter(t => EGGCHOICE.test(t));
      tokens.filter(t => CEREAL.test(t)).forEach(t => { if (!cereals.some(c => c.toLowerCase() === t.toLowerCase())) cereals.push(t); });
      if (eggs.length) out.push(eggs.join(' / '));
      tokens.filter(t => !EGGCHOICE.test(t) && !CEREAL.test(t)).forEach(t => out.push(t));
    });
    return { items: out, cereals, jams };
  }
  const kindFor = (item, mealKey) => mealKey === 'breakfast' ? breakfastKind(item) : mealKey === 'snacks' ? 'snack' : dishKind(item);
  const KIND_LABEL = { dal: 'Dal', sabzi: 'Sabzi', rice: 'Rice dish', egg: 'Egg', hot: 'Hot dish', sweet: 'Sweet', bread: 'Puri / Bread', snack: 'Snack' };
  const keyDishes = (items, mealKey) => items.filter(i => kindFor(i, mealKey));
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
    const h = now.getHours() + now.getMinutes() / 60;
    const live = MEALS.find(m => h >= m.from && h < m.to);
    const upNext = live ? null : MEALS.find(m => m.from > h);
    return MEALS.map(m => {
      let items = (menu.menu[dayKey] || {})[m.key] || [];
      let common = (menu.common[m.key] || []).filter(Boolean);
      // Breakfast: egg stays in the list; jam and the always-there cereals move to "Also served"
      // (a generic "Jam" in the common line is replaced by the specific jam).
      if (m.key === 'breakfast') {
        const sp = breakfastSplit(items);
        items = sp.items;
        if (sp.jams.length) {
          const name = sp.jams.join(' / ');
          common = common.some(c => /\bJam\b/.test(c)) ? common.map(c => c.replace(/\bJam\b/, name)) : [...common, name];
        }
        if (sp.cereals.length) common = [...common, sp.cereals.join(' / ')];
      }
      const isLive = isToday && live && live.key === m.key;
      const isNext = isToday && upNext && upNext.key === m.key;
      return `
      <div class="mm-meal${isLive || isNext ? ' mm-next' : ''}">
        <div class="mm-meal-head">
          <span class="mm-meal-title"><span>${m.icon}</span>${m.label}<span class="mm-time">${m.time}</span></span>
          ${isLive ? '<span class="mm-pill">Now</span>' : isNext ? '<span class="mm-pill">Up next</span>' : ''}
        </div>
        <ul class="mm-items">${items.length ? items.map(i => {
          const k = kindFor(i, m.key);
          return k ? `<li class="mm-k mm-k-${k}">${esc(i)}<span class="mm-tag">${KIND_LABEL[k]}</span></li>` : `<li>${esc(i)}</li>`;
        }).join('') : '<li class="mm-none">Not listed</li>'}</ul>
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
    const now = nowIST(), h = now.getHours() + now.getMinutes() / 60;
    const live = k === ymd(now) ? MEALS.find(m => h >= m.from && h < m.to) : null;
    const rows = MEALS.map(m => {
      let items = (menu.menu[dayKeyOf(d)] || {})[m.key] || [];
      let plain = '';
      if (m.key === 'breakfast') { const sp = breakfastSplit(items); items = sp.items.concat(sp.jams); plain = sp.cereals.join(' / '); }
      return items.length ? `<div class="mm-ag-row${live && live.key === m.key ? ' mm-ag-live' : ''}"><b>${m.icon} ${m.label} <i>${m.time}</i>${live && live.key === m.key ? ' <em class="mm-pill">Now</em>' : ''}</b><span>${items.map(i => kindFor(i, m.key) ? `<strong class="mm-ag-k">${esc(i)}</strong>` : esc(i)).join(' · ')}${plain ? ' · ' + esc(plain) : ''}</span></div>` : '';
    }).join('');
    // always-visible line: dal + sabzi of the lunch/dinner that is on or coming next (both meals on other days)
    const isToday = k === ymd(now);
    const KEYMEALS = MEALS;
    const meals = (isToday ? [live && KEYMEALS.includes(live) ? live : KEYMEALS.find(m => m.from > h)] : KEYMEALS).filter(Boolean);
    const keyLine = meals.map(m => {
      const raw = (menu.menu[dayKeyOf(d)] || {})[m.key] || [];
      const kd = keyDishes(m.key === 'breakfast' ? breakfastSplit(raw).items : raw, m.key);
      return kd.length ? `<span class="mm-ag-key"><b>${m.icon} ${isToday && live && live.key === m.key ? m.label + ' now' : (isToday && m.key === 'dinner' ? 'Tonight' : m.label)}:</b> ${kd.map(esc).join(' · ')}</span>` : '';
    }).join('');
    return `<details class="mm-agenda"${window._mmAgendaOpen ? ' open' : ''} ontoggle="window._mmAgendaOpen=this.open">
      <summary>🥘 Mess menu · ${MESS_LABELS[state.mess]}${DIET_LABELS[state.diet] ? ' ' + DIET_LABELS[state.diet] : ''} · Week ${weekOn(d)}${live ? ` <em class="mm-pill">${live.label} now</em>` : ''}${keyLine ? `<span class="mm-ag-keys">${keyLine}</span>` : ''}</summary>
      ${rows}
      <a class="mm-ag-link" href="#" onclick="openMenuOn('${k}');return false">Open full menu →</a>
    </details>`;
  };

  // Short highlights for the push meal alerts: key dishes only, never the whole menu.
  // Returns [{t: start ms, k: label, i: icon, m: 'dish · dish'}] for one date, or [] if no mess is chosen.
  window.mealAlertsFor = function (k) {
    if (!window.MESS_MENU) return [];
    ensureValid();
    if (!hasPref()) return [];
    const d = parseYmd(k), menu = menuFor(d);
    if (!menu) return [];
    const out = [];
    MEALS.forEach(m => {
      const raw = (menu.menu[dayKeyOf(d)] || {})[m.key] || [];
      let dishes = m.key === 'breakfast' ? keyDishes(breakfastSplit(raw).items, m.key)
        : m.key === 'snacks' ? raw.slice(0, 3)
        : keyDishes(raw, m.key);
      dishes = dishes.map(x => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4);
      if (!dishes.length) return;
      const [y, mo, da] = k.split('-').map(Number);
      const startMins = Math.round(m.from * 60);
      out.push({ t: Date.UTC(y, mo - 1, da) + (startMins - 330) * 60000, k: m.label, i: m.icon, m: dishes.join(' · ').slice(0, 140) });
    });
    return out;
  };

  loadPref();
})();
