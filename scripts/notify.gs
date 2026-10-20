// Phone push notifications. Lives in the MBA Timetable Sync project.
// One trigger drives everything: notifyClassChanges, time-driven, every 5 minutes.
// Needs oauthScope https://www.googleapis.com/auth/firebase.messaging.
//
// Features (each student can switch them off in the app):
//   chg    class updates posted by classmates
//   rem    "starts in N min" class reminder
//   meal   meal alert 15 min before breakfast / lunch / snacks / dinner
//   morn   morning summary (about 7 AM)
//   eve    evening preview of tomorrow (about 9 PM)
//   att    mark-attendance reminder 15 min after a class ends (only if not marked) + absence-limit warning
//   sheet  official timetable changed (called from the sync, see notifySheetChanges_)
//   bc     announcement from you (sendBroadcast)
//
// To see every kind of notification on your own phone: run previewAllNotifications.

var NOTIFY_DB = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app';
var NOTIFY_PROJECT = 'q567mba';
var MY_ROLL = 'MS25A071';          // used by the test* and preview functions
var PREF_DEFAULTS = { chg: true, rem: true, meal: true, morn: true, eve: false, att: true, sheet: true, bc: true };
var ABSENCE_LIMIT = 2;

// ---------------------------------------------------------------- main tick
function notifyClassChanges() {
  try { notifyFromSheet_(); } catch (e) { Logger.log('Announce failed: ' + e.message); }
  var props = PropertiesService.getScriptProperties();
  var now = Date.now();
  var ist = istNow_(now);
  var ctx = { now: now, ist: ist, tokens: null, reminders: null, changes: null, onlyRoll: null, force: false };

  ctx.tokens = dbGet_('/push_tokens') || {};
  if (!Object.keys(ctx.tokens).length) return;
  ctx.changes = dbGet_('/schedule_changes', 'orderBy="$key"&startAt="' + ist.ymd + '"') || {};

  var steps = [
    function () { writePushStats_(ctx, props); },
    function () { notifyAnnouncements_(ctx, props); },
    function () { notifyClassUpdates_(ctx, props); },
    function () { if (needReminders_(ctx)) { notifyRemindersAndMeals_(ctx); notifyAttendance_(ctx); } },
    function () { notifyDaySummary_(ctx, props, 'morn'); },
    function () { notifyDaySummary_(ctx, props, 'eve'); }
  ];
  steps.forEach(function (fn) {
    try { fn(); } catch (e) { Logger.log('Notify step failed: ' + e.message); }
  });
}

// ------------------------------------------------------------ class updates
function notifyClassUpdates_(ctx, props) {
  var last = Number(props.getProperty('lastNotifiedAt') || 0);
  if (!last) { props.setProperty('lastNotifiedAt', String(ctx.now)); return; } // first run: skip old changes
  var fresh = [], newest = last;
  Object.keys(ctx.changes).forEach(function (ymd) {
    if (ymd < ctx.ist.ymd) return;
    Object.keys(ctx.changes[ymd] || {}).forEach(function (k) {
      var c = ctx.changes[ymd][k];
      if (c && c.at > last) { fresh.push(c); if (c.at > newest) newest = c.at; }
    });
  });
  if (!fresh.length) return;
  props.setProperty('lastNotifiedAt', String(newest)); // before sending: a failed send must not resend to everyone
  var reminders = getReminders_(ctx);
  var out = [];
  fresh.forEach(function (c) {
    var msg = describeChange_(c);
    Object.keys(ctx.tokens).forEach(function (roll) {
      if (roll === safeRoll_(c.byRoll)) return; // don't notify the poster
      if (!takesCourse_(reminders[roll], c.code)) return;
      addSends_(out, ctx, roll, 'chg', msg, { ymd: c.ymd, tag: 'chg_' + c.ymd + '_' + c.code });
    });
  });
  sendAll_(out);
}

// ------------------------------------------- class reminders and meal alerts
// The reminder data is the big read, so only fetch it when something could be due.
function needReminders_(ctx) {
  if (ctx.force) return true;
  var m = ctx.ist.mins;
  var starts = [8 * 60, 10 * 60, 13 * 60, 15 * 60, 17 * 60];            // class slots
  var meals = [7 * 60, 12 * 60, 16 * 60 + 30, 19 * 60];                  // meal starts
  var ends = [10 * 60, 12 * 60, 15 * 60, 17 * 60, 19 * 60];              // class ends (attendance reminder)
  var hit = false;
  starts.forEach(function (s) { if (m >= s - 32 && m <= s) hit = true; });
  ends.forEach(function (e) { if (m >= e + 14 && m <= e + 46) hit = true; });
  meals.forEach(function (s) { if (m >= s - 17 && m <= s) hit = true; });
  // retimed / moved classes can start at odd times
  Object.keys(ctx.changes[ctx.ist.ymd] || {}).forEach(function (k) {
    var c = ctx.changes[ctx.ist.ymd][k];
    if (c && c.start) { var s = hhmm_(c.start); if (m >= s - 32 && m <= s) hit = true; }
    if (c && c.end) { var e2 = hhmm_(c.end); if (m >= e2 + 14 && m <= e2 + 46) hit = true; }
  });
  Object.keys(ctx.changes).forEach(function (ymd) {
    Object.keys(ctx.changes[ymd] || {}).forEach(function (k) {
      var c = ctx.changes[ymd][k];
      if (c && c.status === 'moved' && c.toYmd === ctx.ist.ymd && c.start) { var s = hhmm_(c.start); if (m >= s - 32 && m <= s) hit = true; }
    });
  });
  return hit;
}

function notifyRemindersAndMeals_(ctx) {
  var cache = CacheService.getScriptCache();
  var reminders = getReminders_(ctx);
  var out = [];
  var seen = cache.getAll(['sentRem', 'sentMeal']);
  var sentRem = JSON.parse(seen.sentRem || '{}'), sentMeal = JSON.parse(seen.sentMeal || '{}');
  Object.keys(ctx.tokens).forEach(function (roll) {
    if (ctx.onlyRoll && roll !== ctx.onlyRoll) return;
    var r = reminders[roll];
    if (!r) return;
    Object.keys(r.items || {}).forEach(function (id) {
      var it = r.items[id];
      if (it.x) return;
      var t = effectiveStart_(it, ctx);
      if (t === null) return;
      var mins = (t - ctx.now) / 60000;
      if (mins <= 0 || (!ctx.force && mins > 31)) return;
      var key = roll + '|' + id;
      if (!ctx.force && sentRem[key]) return;
      var before = out.length;
      addSends_(out, ctx, roll, 'rem', {
        title: it.n + ' starts in ' + Math.max(1, Math.round(mins)) + ' min',
        body: it.r ? 'Room ' + it.r : 'Open the app for details'
      }, { ymd: it.y, tag: 'rem_' + id });
      if (out.length > before) sentRem[key] = t;
    });
    (r.meals || []).forEach(function (ml) {
      var mins = (ml.t - ctx.now) / 60000;
      if (mins <= 0 || (!ctx.force && mins > 16)) return;
      var key = roll + '|' + ml.t;
      if (!ctx.force && sentMeal[key]) return;
      var before = out.length;
      addSends_(out, ctx, roll, 'meal', {
        title: ml.i + ' ' + ml.k + ' in ' + Math.max(1, Math.round(mins)) + ' min',
        body: ml.m
      }, { ymd: ctx.ist.ymd, tag: 'meal_' + ml.t });
      if (out.length > before) sentMeal[key] = ml.t;
    });
  });
  if (!ctx.force) {
    cache.putAll({ sentRem: JSON.stringify(prune_(sentRem, ctx.now)), sentMeal: JSON.stringify(prune_(sentMeal, ctx.now)) }, 21600);
  }
  sendAll_(out);
}

function effectiveStart_(it, ctx) {
  var ch = (ctx.changes[it.y] || {})[it.s + '_' + it.c];
  if (ch && (ch.status === 'cancelled' || ch.status === 'moved')) return null;
  if (ch && ch.status === 'retimed' && ch.start) return istMs_(it.y, ch.start);
  return it.t;
}

// ------------------------------------------------- morning / evening summary
function notifyDaySummary_(ctx, props, kind) {
  var win = kind === 'morn' ? [7 * 60, 7 * 60 + 25] : [21 * 60, 21 * 60 + 25];
  if (!ctx.force) {
    if (ctx.ist.mins < win[0] || ctx.ist.mins > win[1]) return;
    var markKey = 'sum_' + kind;
    if (props.getProperty(markKey) === ctx.ist.ymd) return;
    props.setProperty(markKey, ctx.ist.ymd); // marker first: a half-failed run never resends to everyone
  }
  var day = kind === 'morn' ? ctx.ist.ymd : addDaysYmd_(ctx.ist.ymd, 1);
  var reminders = getReminders_(ctx);
  var out = [];
  Object.keys(ctx.tokens).forEach(function (roll) {
    if (ctx.onlyRoll && roll !== ctx.onlyRoll) return;
    var r = reminders[roll];
    if (!r || !r.items || ctx.now - r.at > 3 * 86400000) return; // stale device: no classes is not the same as unknown
    var list = Object.keys(r.items).map(function (id) { return r.items[id]; })
      .filter(function (it) { return it.y === day; })
      .sort(function (a, b) { return a.t - b.t; });
    var live = [], cancelled = [], warn = [];
    list.forEach(function (it) {
      var ch = (ctx.changes[it.y] || {})[it.s + '_' + it.c];
      var dead = it.x || (ch && (ch.status === 'cancelled' || ch.status === 'moved'));
      if (dead) { cancelled.push(it.n); return; }
      var t = effectiveStart_(it, ctx) || it.t;
      live.push(clock_(t) + ' ' + it.n + (it.r ? ' (' + it.r + ')' : ''));
      if (kind === 'morn' && it.c !== 'ICRC' && ((r.abs || {})[it.c] || 0) >= ABSENCE_LIMIT) warn.push(it.n);
    });
    if (!live.length && !cancelled.length) return;
    var body = live.join(' · ');
    if (cancelled.length) body += (body ? ' · ' : '') + '❌ ' + cancelled.join(', ') + ' cancelled';
    if (warn.length) body += ' · ⚠️ ' + warn.join(', ') + ': at absence limit, do not miss';
    var title = (kind === 'morn' ? 'Today' : 'Tomorrow') + ': ' + live.length + ' class' + (live.length === 1 ? '' : 'es');
    addSends_(out, ctx, roll, kind, { title: title, body: body.slice(0, 220) }, { ymd: day, tag: kind + '_' + day });
  });
  sendAll_(out);
}

// ------------------------------------------------------ attendance reminder
// 15 minutes after a class ends, if it is still not marked in the app, ask the
// student to mark it. Marked classes (checked live in Firebase) get nothing.
function notifyAttendance_(ctx) {
  var reminders = getReminders_(ctx);
  var cache = CacheService.getScriptCache();
  var seen = cache.getAll(['sentAtt']);
  var sentAtt = JSON.parse(seen.sentAtt || '{}');
  var due = [];
  Object.keys(ctx.tokens).forEach(function (roll) {
    if (ctx.onlyRoll && roll !== ctx.onlyRoll) return;
    var r = reminders[roll];
    if (!r || !r.items || ctx.now - r.at > 3 * 86400000) return;
    Object.keys(r.items).forEach(function (id) {
      var it = r.items[id];
      if (it.y !== ctx.ist.ymd || it.x || it.c === 'ICRC' || it.m) return;
      var ch = (ctx.changes[it.y] || {})[it.s + '_' + it.c];
      if (ch && (ch.status === 'cancelled' || ch.status === 'moved')) return;
      var end = effectiveEnd_(it, ctx);
      var since = (ctx.now - end) / 60000;
      if (since < (ctx.force ? 0 : 15) || (!ctx.force && since > 45)) return;
      var key = roll + '|' + id;
      if (!ctx.force && sentAtt[key]) return;
      due.push({ roll: roll, it: it, key: key, end: end, sid: (it.y + '_' + it.s + '_' + it.c).replace(/[.#$\[\]]/g, '_') });
    });
  });
  if (!due.length) return;
  // the attendance the student has really saved, read fresh (the list above can be a few minutes old)
  var rolls = {};
  due.forEach(function (d) { rolls[d.roll] = 1; });
  var names = Object.keys(rolls);
  var res = UrlFetchApp.fetchAll(names.map(function (rl) {
    return { url: NOTIFY_DB + '/q6_attendance/' + rl + '.json', headers: authHeader_(), muteHttpExceptions: true };
  }));
  var saved = {};
  names.forEach(function (rl, i) { try { saved[rl] = JSON.parse(res[i].getContentText()) || {}; } catch (e) { saved[rl] = {}; } });
  var out = [];
  due.forEach(function (d) {
    if (saved[d.roll][d.sid]) return; // already marked P or A
    var before = out.length;
    addSends_(out, ctx, d.roll, 'att', {
      title: 'Mark attendance: ' + d.it.n,
      body: 'Class has ended. Tap to mark Present or Absent in the app.'
    }, { ymd: d.it.y, tag: 'att_' + d.key });
    if (out.length > before) sentAtt[d.key] = d.end;
  });
  if (!ctx.force) cache.putAll({ sentAtt: JSON.stringify(prune_(sentAtt, ctx.now)) }, 21600);
  sendAll_(out);
}

function effectiveEnd_(it, ctx) {
  var ch = (ctx.changes[it.y] || {})[it.s + '_' + it.c];
  if (ch && ch.status === 'retimed' && ch.end) return istMs_(it.y, ch.end);
  return it.e || (it.t + 2 * 3600000);
}

// ------------------------------------------- official timetable changed (sheet)
// Called by syncTimetableToFirebase just before it writes (see Code.gs hook).
function notifySheetChanges_(oldDaily, newDaily) {
  var ist = istNow_(Date.now());
  if (!oldDaily || !Object.keys(oldDaily).length) return; // failed fetch looks like "everything is new"
  var limit = addDaysYmd_(ist.ymd, 7);
  var changes = [];
  Object.keys(newDaily).forEach(function (key) {
    var ymd = key.slice(0, 10);
    if (ymd < ist.ymd || ymd > limit) return;
    var o = normDay_(oldDaily[key]), n = normDay_(newDaily[key]);
    var slots = {};
    Object.keys(o).concat(Object.keys(n)).forEach(function (s) { slots[s] = 1; });
    Object.keys(slots).forEach(function (s) {
      if ((o[s] || '') !== (n[s] || '')) changes.push({ ymd: ymd, slot: s, from: o[s] || '', to: n[s] || '' });
    });
  });
  if (!changes.length) return;
  var ctx = { now: Date.now(), ist: ist, tokens: dbGet_('/push_tokens') || {}, reminders: null, changes: {}, onlyRoll: null, force: false };
  var reminders = getReminders_(ctx);
  var out = [];
  Object.keys(ctx.tokens).forEach(function (roll) {
    var subj = (reminders[roll] || {}).subj;
    var mine = changes.length > 10 ? changes : changes.filter(function (c) {
      return matchesSubj_(c.from, subj) || matchesSubj_(c.to, subj);
    });
    if (!mine.length) return;
    var body = changes.length > 10 ? 'The timetable has several changes. Open the app to check.'
      : mine.slice(0, 3).map(function (c) { return shortDate_(c.ymd) + ' ' + c.slot + ': ' + (c.from || 'free') + ' → ' + (c.to || 'free'); }).join(' · ')
        + (mine.length > 3 ? ' +' + (mine.length - 3) + ' more' : '');
    addSends_(out, ctx, roll, 'sheet', { title: 'Timetable updated', body: body.slice(0, 220) }, { ymd: mine[0].ymd, tag: 'sheet_' + ist.ymd });
  });
  sendAll_(out);
}

// {slot: "text (cancelled)"} for one day, ignoring key order and non-slot fields.
function normDay_(day) {
  var out = {};
  Object.keys(day || {}).forEach(function (s) {
    if (s === 'Birthdays' || s === 'Comments') return;
    var v = day[s];
    var arr = Array.isArray(v) ? v : [v];
    var parts = arr.map(function (e) {
      if (e && typeof e === 'object') return String(e.text || '').trim() + (e.strike ? ' (cancelled)' : '');
      return String(e || '').trim();
    }).filter(Boolean);
    if (parts.length) out[s] = parts.join(' / ');
  });
  return out;
}

function matchesSubj_(text, subj) {
  if (!text || !subj) return false;
  var cell = String(text).replace(/\(cancelled\)/g, '').split('/').map(function (c) { return c.trim().toLowerCase(); });
  return subj.some(function (s) {
    var names = [s.c, s.a, s.n].filter(Boolean).map(function (x) { return String(x).toLowerCase(); });
    return cell.some(function (c) { return names.indexOf(c) !== -1; });
  });
}

// -------------------------------------------------------------- announcements
// EASY WAY: use the "Announce" tab in the timetable Google Sheet (run
// setupAnnounceSheet once to create it). Type a title and message, then type
// TEST (only you get it) or SEND (everyone). It goes out within 5 minutes.
// Everyone with push on and "Announcements" enabled receives it.
var ANNOUNCE_SHEET_ID = '1FyiqG6ArbYoEtmZWPnXjfwnjNNm1CO89pfz2WV2_bYY';

function setupAnnounceSheet() {
  var ss = SpreadsheetApp.openById(ANNOUNCE_SHEET_ID);
  var sh = ss.getSheetByName('Announce') || ss.insertSheet('Announce');
  sh.getRange('A1:A3').setValues([['Title'], ['Message'], ['Send (type TEST or SEND)']]).setFontWeight('bold');
  sh.getRange('A5').setValue('How: fill Title and Message, type TEST in B3 to preview on your own phone, then type SEND to send to everyone. It goes out within 5 minutes and B3 shows what happened.');
  sh.setColumnWidth(1, 190);
  sh.setColumnWidth(2, 480);
  sh.getRange('B1:B3').setBackground('#fff8e1');
  sh.getRange('B2').setWrap(true);
  Logger.log('Announce tab is ready.');
}

function notifyFromSheet_() {
  var sh = SpreadsheetApp.openById(ANNOUNCE_SHEET_ID).getSheetByName('Announce');
  if (!sh) return;
  var v = sh.getRange('B1:B3').getValues();
  var title = String(v[0][0]).trim(), body = String(v[1][0]).trim(), cmd = String(v[2][0]).trim().toUpperCase();
  if (cmd !== 'SEND' && cmd !== 'TEST') return;
  if (!title || !body) { sh.getRange('B3').setValue('Fill in Title and Message first, then type SEND again'); return; }
  sh.getRange('B3').setValue('Sending...'); // so a slow run is never picked up twice
  var n = broadcast_(cmd === 'TEST' ? MY_ROLL : null, title, body);
  var when = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'd MMM, h:mm a');
  sh.getRange('B3').setValue((cmd === 'TEST' ? 'TEST' : 'SENT') + ' ' + when + ' to ' + n + ' device(s). Type ' + (cmd === 'TEST' ? 'SEND to send to everyone' : 'SEND again to resend'));
}

// IN-APP WAY: the admin (you) types an announcement in the app (PIN protected).
// The app saves it under /announcements; this sends it, logs it, and removes it.
function notifyAnnouncements_(ctx, props) {
  var data = dbGet_('/announcements') || {};
  var last = props.getProperty('lastAnnounceKey') || '';
  var fresh = Object.keys(data).sort().filter(function (k) { return k > last; });
  if (!fresh.length) return;
  props.setProperty('lastAnnounceKey', fresh[fresh.length - 1]); // before sending: never send twice
  fresh.forEach(function (k) {
    var a = data[k] || {};
    if (a.title && a.body) {
      var title = String(a.title).slice(0, 80), body = String(a.body).slice(0, 240);
      var n = broadcast_(a.onlyMe ? MY_ROLL : null, title, body);
      UrlFetchApp.fetch(NOTIFY_DB + '/announcements_log/' + k + '.json', { method: 'put', contentType: 'application/json', headers: authHeader_(), payload: JSON.stringify({ title: title, body: body, sentAt: Date.now(), devices: n, test: !!a.onlyMe }), muteHttpExceptions: true });
    }
    UrlFetchApp.fetch(NOTIFY_DB + '/announcements/' + k + '.json', { method: 'delete', headers: authHeader_(), muteHttpExceptions: true }); // also drops the stored PIN
  });
}

// Numbers shown in the admin panel (rebuilt about every 30 minutes).
function writePushStats_(ctx, props) {
  if (ctx.now - Number(props.getProperty('statsAt') || 0) < 25 * 60000) return;
  props.setProperty('statsAt', String(ctx.now));
  var users = dbGet_('/app_users') || {};
  var day = 86400000, u = { devices: 0, rolls: {}, active24h: 0, active7d: 0, pwa: 0, notif: 0, ios: 0, android: 0, desktop: 0, pwaIos: 0, pwaAndroid: 0, newToday: 0 };
  Object.keys(users).forEach(function (k) {
    var x = users[k]; u.devices++;
    if (x.roll) u.rolls[x.roll] = 1;
    if (ctx.now - x.seen < day) u.active24h++;
    if (ctx.now - x.seen < 7 * day) u.active7d++;
    if (x.first && ctx.now - x.first < day) u.newToday++;
    if (x.pwa) { u.pwa++; if (x.ua === 'ios') u.pwaIos++; if (x.ua === 'android') u.pwaAndroid++; }
    if (x.notif) u.notif++;
    if (u[x.ua] !== undefined) u[x.ua]++;
  });
  var devices = 0, students = 0, prefs = { chg: 0, rem: 0, meal: 0, morn: 0, eve: 0, att: 0, sheet: 0, bc: 0 };
  Object.keys(ctx.tokens).forEach(function (r) {
    var devs = ctx.tokens[r] || {}, n = Object.keys(devs).length;
    if (!n) return;
    students++; devices += n;
    Object.keys(devs).forEach(function (d) { Object.keys(prefs).forEach(function (k) { if (wants_(devs[d], k)) prefs[k]++; }); });
  });
  var log = JSON.parse(props.getProperty('pushLog') || '{}');
  var today = ctx.ist.ymd, sentToday = 0, sentWeek = 0, byKind = {};
  Object.keys(log).forEach(function (d) {
    var n = 0; Object.keys(log[d]).forEach(function (k) { n += log[d][k]; if (d === today) byKind[k] = log[d][k]; });
    if (d === today) sentToday = n;
    if (d >= addDaysYmd_(today, -6)) sentWeek += n;
  });
  var stats = {
    at: ctx.now,
    students: students, devices: devices, prefs: prefs,
    users: { devices: u.devices, students: Object.keys(u.rolls).length, active24h: u.active24h, active7d: u.active7d, newToday: u.newToday, pwa: u.pwa, pwaIos: u.pwaIos, pwaAndroid: u.pwaAndroid, notif: u.notif, ios: u.ios, android: u.android, desktop: u.desktop },
    sent: { today: sentToday, week: sentWeek, total: Number(props.getProperty('pushTotal') || 0), byKind: byKind }
  };
  UrlFetchApp.fetch(NOTIFY_DB + '/push_stats.json', { method: 'put', contentType: 'application/json', headers: authHeader_(), payload: JSON.stringify(stats), muteHttpExceptions: true });
}

// Adds delivered pushes to the running counts (previews and tests are not counted).
function countSent_(kinds) {
  var names = Object.keys(kinds);
  if (!names.length) return;
  var props = PropertiesService.getScriptProperties();
  var today = istNow_(Date.now()).ymd;
  var log = JSON.parse(props.getProperty('pushLog') || '{}'), total = Number(props.getProperty('pushTotal') || 0);
  log[today] = log[today] || {};
  names.forEach(function (k) { log[today][k] = (log[today][k] || 0) + kinds[k]; total += kinds[k]; });
  Object.keys(log).forEach(function (d) { if (d < addDaysYmd_(today, -14)) delete log[d]; });
  props.setProperty('pushLog', JSON.stringify(log));
  props.setProperty('pushTotal', String(total));
}

// Old way (edit these two lines, then Run): still works.
var BROADCAST_TITLE = 'Announcement';
var BROADCAST_BODY = 'Write your message here';
function sendBroadcast() { broadcast_(null, BROADCAST_TITLE, BROADCAST_BODY); }
function testBroadcast() { broadcast_(MY_ROLL, BROADCAST_TITLE, BROADCAST_BODY); }

function broadcast_(onlyRoll, title, body) {
  var ctx = baseCtx_(onlyRoll, true);
  var out = [];
  Object.keys(ctx.tokens).forEach(function (roll) {
    if (onlyRoll && roll !== safeRoll_(onlyRoll)) return;
    addSends_(out, ctx, roll, onlyRoll ? null : 'bc', { title: title, body: body }, { ymd: '', tag: 'bc_' + ctx.now });
  });
  Logger.log('Broadcast to ' + out.length + ' device(s)');
  sendAll_(out);
  return out.length;
}

// ------------------------------------------------------------- previews/tests
// Run this once: sends one sample of EVERY notification type to your phone,
// a few seconds apart, so you can see exactly how each one looks.
// The text is sample text, not your real classes. Replaces nothing in the app.
function previewAllNotifications() {
  var ctx = baseCtx_(MY_ROLL, true);
  var roll = safeRoll_(MY_ROLL);
  var today = ctx.ist.ymd;
  var samples = [
    ['Test push', 'Phone notifications are working.', 'pv_test'],
    ['MS5529 on ' + today, 'cancelled', 'pv_chg'],
    ['Corporate Hedging Strategies starts in 30 min', 'Room 204', 'pv_rem'],
    ['🍛 Lunch in 15 min', 'Dal Makhani · Mixed Veg curry · Vegetable Biryani · Gulab Jamun', 'pv_meal'],
    ['Today: 3 classes', '8:00am Design Thinking (Room 204) · 1:00pm Behavioural Lab (Room 110) · 3:00pm Strategic Sourcing (Room 301) · ⚠️ Strategic Sourcing: at absence limit, do not miss', 'pv_morn'],
    ['Tomorrow: 2 classes', '10:00am Brand Management (Room 105) · 3:00pm AI for Management (Room 301) · ❌ Strategic Marketing cancelled', 'pv_eve'],
    ['Mark attendance: Design Thinking', 'Class has ended. Tap to mark Present or Absent in the app.', 'pv_att'],
    ['Timetable updated', '22 Oct 10am-12pm: Brand Management → cancelled', 'pv_sheet'],
    ['Announcement', 'Guest lecture moved to Room 5 at 4 PM today', 'pv_bc']
  ];
  samples.forEach(function (s, i) {
    var out = [];
    addSends_(out, ctx, roll, null, { title: s[0], body: s[1] }, { ymd: today, tag: s[2] });
    Logger.log((i + 1) + '. ' + s[0] + ' -> ' + out.length + ' device(s)');
    sendAll_(out);
    if (i < samples.length - 1) Utilities.sleep(4000);
  });
}

// Real-data versions: ignore the time window and send only to MY_ROLL.
function sendTestPush() { var c = baseCtx_(MY_ROLL, true), o = []; addSends_(o, c, safeRoll_(MY_ROLL), null, { title: 'Test push', body: 'Phone notifications are working.' }, { ymd: '', tag: 'test' }); Logger.log('Sending to ' + o.length + ' device(s)'); sendAll_(o); }
function testMorning() { notifyDaySummary_(baseCtx_(MY_ROLL, true), null, 'morn'); }
function testEvening() { notifyDaySummary_(baseCtx_(MY_ROLL, true), null, 'eve'); }
function testAttendance() { notifyAttendance_(baseCtx_(MY_ROLL, true)); } // classes of today that already ended and are not marked
function testRemindersAndMeals() { notifyRemindersAndMeals_(baseCtx_(MY_ROLL, true)); } // anything still upcoming today

// ------------------------------------------------------------------- helpers
function baseCtx_(onlyRoll, force) {
  var now = Date.now(), ist = istNow_(now);
  return {
    now: now, ist: ist, force: !!force, onlyRoll: onlyRoll ? safeRoll_(onlyRoll) : null,
    tokens: dbGet_('/push_tokens') || {}, reminders: null,
    changes: dbGet_('/schedule_changes', 'orderBy="$key"&startAt="' + ist.ymd + '"') || {}
  };
}

function getReminders_(ctx) {
  if (!ctx.reminders) ctx.reminders = dbGet_('/push_reminders') || {};
  return ctx.reminders;
}

function wants_(dev, key) {
  if (!key) return true;
  var p = dev.prefs || {};
  return typeof p[key] === 'boolean' ? p[key] : PREF_DEFAULTS[key];
}

function addSends_(out, ctx, roll, key, msg, extra) {
  var devs = ctx.tokens[roll] || {};
  Object.keys(devs).forEach(function (dev) {
    if (!wants_(devs[dev], key)) return;
    out.push({ owner: roll + '/' + dev, kind: String((extra && extra.tag) || 'x').split('_')[0], req: fcmRequest_(devs[dev].token, msg, extra || {}) });
  });
}

function sendAll_(out) {
  if (!out.length) return;
  for (var i = 0; i < out.length; i += 50) {
    var chunk = out.slice(i, i + 50);
    var res = UrlFetchApp.fetchAll(chunk.map(function (o) { return o.req; }));
    var kinds = {};
    res.forEach(function (r, j) {
      var code = r.getResponseCode();
      var text = r.getContentText();
      if (code < 300 && chunk[j].kind !== 'pv' && chunk[j].kind !== 'test') kinds[chunk[j].kind] = (kinds[chunk[j].kind] || 0) + 1;
      if (code === 404 || (code === 400 && /UNREGISTERED|INVALID_ARGUMENT/.test(text))) {
        UrlFetchApp.fetch(NOTIFY_DB + '/push_tokens/' + chunk[j].owner + '.json', { method: 'delete', headers: authHeader_(), muteHttpExceptions: true });
      } else if (code >= 300) {
        Logger.log('FCM ' + code + ' for ' + chunk[j].owner + ': ' + text);
      }
    });
    countSent_(kinds);
  }
}

function fcmRequest_(token, msg, extra) {
  return {
    url: 'https://fcm.googleapis.com/v1/projects/' + NOTIFY_PROJECT + '/messages:send',
    method: 'post',
    contentType: 'application/json',
    headers: authHeader_(),
    muteHttpExceptions: true,
    payload: JSON.stringify({ message: { token: token, data: {
      title: msg.title, body: msg.body, ymd: extra.ymd || '', tag: extra.tag || ''
    } } })
  };
}

function takesCourse_(r, code) {
  return !!(r && r.subj && r.subj.some(function (s) { return s.c === code; }));
}

function describeChange_(c) {
  var what = {
    cancelled: 'cancelled',
    moved: 'moved to ' + (c.toYmd || '?') + (c.toSlot ? ' (' + c.toSlot + ')' : ''),
    retimed: 'new time ' + (c.start || '') + '–' + (c.end || ''),
    note: c.note ? 'note: ' + c.note : 'update'
  }[c.status] || 'updated';
  if (c.double) what += ' · double class';
  return { title: c.code + ' on ' + c.ymd, body: what };
}

function dbGet_(path, query) {
  var url = NOTIFY_DB + path + '.json' + (query ? '?' + query.replace(/"/g, '%22').replace(/\$/g, '%24') : '');
  var r = UrlFetchApp.fetch(url, { headers: authHeader_(), muteHttpExceptions: true });
  return JSON.parse(r.getContentText());
}

function authHeader_() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }; }
function safeRoll_(roll) { return String(roll || '').trim().toUpperCase().replace(/[.#$\[\]]/g, '_'); }

function istNow_(now) {
  var d = new Date(now + 330 * 60000);
  var ymd = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  return { ymd: ymd, mins: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function istMs_(ymd, hhmm) {
  var p = ymd.split('-'), h = hhmm.split(':');
  return Date.UTC(+p[0], +p[1] - 1, +p[2], +h[0], +h[1]) - 330 * 60000;
}
function hhmm_(s) { var h = s.split(':'); return +h[0] * 60 + +h[1]; }
function addDaysYmd_(ymd, n) {
  var p = ymd.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
function clock_(ms) {
  var d = new Date(ms + 330 * 60000), h = d.getUTCHours(), m = d.getUTCMinutes();
  return (h % 12 || 12) + ':' + ('0' + m).slice(-2) + (h >= 12 ? 'pm' : 'am');
}
function shortDate_(ymd) {
  var p = ymd.split('-');
  return +p[2] + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1];
}
function prune_(obj, now) {
  Object.keys(obj).forEach(function (k) { if (obj[k] < now - 3 * 3600000) delete obj[k]; });
  return obj;
}
