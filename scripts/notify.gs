// Class-change push notifications. Lives in the MBA Timetable Sync project.
// Add trigger: notifyClassChanges, time-driven, every 5 minutes.
// Needs oauthScope https://www.googleapis.com/auth/firebase.messaging.
var NOTIFY_DB = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app';
var NOTIFY_PROJECT = 'q567mba';

function notifyClassChanges() {
  try { notifyUpcomingClasses_(); } catch (e) { Logger.log('Reminder error: ' + e.message); }
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('lastNotifiedAt') || 0);
  var now = Date.now();
  if (!last) { props.setProperty('lastNotifiedAt', String(now)); return; } // first run: skip old changes

  var changes = dbGet_('/schedule_changes') || {};
  var today = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var fresh = [], newest = last;
  Object.keys(changes).forEach(function (ymd) {
    if (ymd < today) return;
    Object.keys(changes[ymd] || {}).forEach(function (k) {
      var c = changes[ymd][k];
      if (c && c.at > last) { fresh.push(c); if (c.at > newest) newest = c.at; }
    });
  });
  if (!fresh.length) return;

  var tokens = dbGet_('/push_tokens') || {};
  var prefs = {};
  Object.keys(tokens).forEach(function (roll) {
    prefs[roll] = { selections: dbGet_('/roll_preferences/' + roll + '/selections') };
  });
  var sends = [], owners = [];
  fresh.forEach(function (c) {
    var msg = describeChange_(c);
    Object.keys(tokens).forEach(function (roll) {
      if (roll === safeRoll_(c.byRoll)) return; // don't notify the poster
      if (!takesCourse_(prefs[roll], c.code)) return;
      Object.keys(tokens[roll]).forEach(function (dev) {
        sends.push(fcmRequest_(tokens[roll][dev].token, msg, c));
        owners.push(roll + '/' + dev);
      });
    });
  });
  sendAndPrune_(sends, owners);
  props.setProperty('lastNotifiedAt', String(newest));
}

// Run once by hand: pushes a test message to every device registered under
// YOUR roll number (edit MY_ROLL).
function sendTestPush() {
  var MY_ROLL = 'REPLACE_WITH_YOUR_ROLL';
  var tokens = dbGet_('/push_tokens/' + safeRoll_(MY_ROLL)) || {};
  var sends = [], owners = [];
  Object.keys(tokens).forEach(function (dev) {
    sends.push(fcmRequest_(tokens[dev].token, { title: 'Test push', body: 'Phone notifications are working.' }, {}));
    owners.push(MY_ROLL + '/' + dev);
  });
  Logger.log('Sending to ' + sends.length + ' device(s)');
  sendAndPrune_(sends, owners);
}

// "Starts in N min" pushes. The app writes each student's next classes to
// push_reminders/{roll}; here we send once per class when it is <= 31 min away.
function notifyUpcomingClasses_() {
  var props = PropertiesService.getScriptProperties();
  var sent = JSON.parse(props.getProperty('sentReminders') || '{}');
  var now = Date.now();
  var tokens = dbGet_('/push_tokens') || {};
  var rolls = Object.keys(tokens);
  if (!rolls.length) return;
  var changes = dbGet_('/schedule_changes') || {};
  var sends = [], owners = [], marks = [];
  rolls.forEach(function (roll) {
    var items = dbGet_('/push_reminders/' + roll + '/items') || {};
    Object.keys(items).forEach(function (id) {
      var it = items[id];
      var t = it.t;
      var ch = (changes[it.y] || {})[it.s + '_' + it.c];
      if (ch && (ch.status === 'cancelled' || ch.status === 'moved')) return;
      if (ch && ch.status === 'retimed' && ch.start) t = istMs_(it.y, ch.start);
      var mins = (t - now) / 60000;
      if (mins <= 0 || mins > 31) return;
      var key = roll + '|' + id;
      if (sent[key]) return;
      var msg = {
        title: it.n + ' starts in ' + Math.max(1, Math.round(mins)) + ' min',
        body: it.r ? 'Room ' + it.r : 'Open the app for details'
      };
      Object.keys(tokens[roll]).forEach(function (dev) {
        sends.push(fcmRequest_(tokens[roll][dev].token, msg, { ymd: it.y, code: 'r_' + it.s + '_' + it.c }));
        owners.push(roll + '/' + dev);
      });
      marks.push(key);
      sent[key] = t;
    });
  });
  sendAndPrune_(sends, owners);
  Object.keys(sent).forEach(function (k) { if (sent[k] < now - 86400000) delete sent[k]; });
  props.setProperty('sentReminders', JSON.stringify(sent));
}

function istMs_(ymd, hhmm) {
  var p = ymd.split('-'), h = hhmm.split(':');
  return Date.UTC(+p[0], +p[1] - 1, +p[2], +h[0], +h[1]) - 330 * 60000;
}

function takesCourse_(pref, code) {
  var sel = pref && pref.selections;
  if (!sel) return false;
  return ['Q5', 'Q6', 'Q7'].some(function (q) { return sel[q] && sel[q][code]; });
}

function describeChange_(c) {
  var when = c.ymd;
  var what = {
    cancelled: 'cancelled',
    moved: 'moved to ' + (c.toYmd || '?') + (c.toSlot ? ' (' + c.toSlot + ')' : ''),
    retimed: 'new time ' + (c.start || '') + '–' + (c.end || ''),
    note: c.note ? 'note: ' + c.note : 'update'
  }[c.status] || 'updated';
  if (c.double) what += ' · double class';
  return { title: c.code + ' on ' + when, body: what };
}

function fcmRequest_(token, msg, c) {
  return {
    url: 'https://fcm.googleapis.com/v1/projects/' + NOTIFY_PROJECT + '/messages:send',
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
    payload: JSON.stringify({ message: { token: token, data: {
      title: msg.title, body: msg.body, ymd: c.ymd || '', tag: (c.ymd || '') + '_' + (c.code || '')
    } } })
  };
}

function sendAndPrune_(reqs, owners) {
  if (!reqs.length) return;
  var res = UrlFetchApp.fetchAll(reqs);
  res.forEach(function (r, i) {
    var code = r.getResponseCode();
    if (code === 404 || code === 400 && /UNREGISTERED|INVALID_ARGUMENT/.test(r.getContentText())) {
      UrlFetchApp.fetch(NOTIFY_DB + '/push_tokens/' + owners[i] + '.json', { method: 'delete', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    } else if (code >= 300) {
      Logger.log('FCM ' + code + ' for ' + owners[i] + ': ' + r.getContentText());
    }
  });
}

function dbGet_(path) {
  var r = UrlFetchApp.fetch(NOTIFY_DB + path + '.json', { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  return JSON.parse(r.getContentText());
}

function safeRoll_(roll) { return String(roll || '').trim().toUpperCase().replace(/[.#$\[\]]/g, '_'); }
