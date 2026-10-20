// Class-change push notifications. Lives in the MBA Timetable Sync project.
// Add trigger: notifyClassChanges, time-driven, every 5 minutes.
// Needs oauthScope https://www.googleapis.com/auth/firebase.messaging.
var NOTIFY_DB = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app';
var NOTIFY_PROJECT = 'q567mba';

function notifyClassChanges() {
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
