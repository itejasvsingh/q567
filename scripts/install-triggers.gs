// Run installTriggers() ONCE from the Apps Script editor.
// It makes both syncs run by themselves every hour. Safe to re-run: old triggers are replaced.
function installTriggers() {
  var fns = ['syncTimetableToFirebase', 'syncQ5AttendanceToFirebase'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (fns.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  fns.forEach(function (fn) {
    ScriptApp.newTrigger(fn).timeBased().everyHours(1).create();
  });
  Logger.log('Hourly triggers installed for: ' + fns.join(', '));
}
