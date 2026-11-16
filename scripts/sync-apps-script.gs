function syncTimetableToFirebase() {
  var sheetId = '1M_3UxXdXSL3-hwWeuuX7Ahn2fd1pJX71ujcRqkvFGUE';
  var firebaseUrl = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app/schedule.json';
  
  // 1. Concurrency Lock: Prevent multiple scheduled triggers from colliding or hanging together
  var lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(15000)) { // wait up to 15s for prior execution to finish
      Logger.log("⚠️ Another sync execution is currently running. Skipping this trigger run.");
      return;
    }
  } catch(lockErr) {
    Logger.log("⚠️ Could not acquire script lock (" + lockErr.message + "). Proceeding cautiously.");
  }

  var startTime = Date.now();
  var MAX_RUNTIME_MS = 240000; // 4 minutes safety limit (well below Google's 6/30-minute hard kill)

  try {
    // 2. Resilient Sheet Opening with retry backoff
    var ss = null;
    for (var attempt = 1; attempt <= 3; attempt++) {
      try {
        ss = SpreadsheetApp.openById(sheetId);
        if (ss) break;
      } catch(e) {
        Logger.log("Attempt " + attempt + " failed to open sheet: " + e.message);
        if (attempt < 3) Utilities.sleep(1500 * attempt);
      }
    }
    
    if (!ss) {
      Logger.log("Error: Could not open the sheet after 3 attempts. Make sure you are logged in with your Uni ID.");
      return;
    }
    
    var timeCols = ['8am - 10am', '10am - 12pm', '12pm-1pm', '1pm-3pm', '3pm-5pm', '5pm-7pm'];
    
    // 3. Fetch existing Firebase data to preserve Admin Panel overrides
    var existingFirebaseData = { daily: {}, weekly: {} };
    try {
      var response = UrlFetchApp.fetch(firebaseUrl, {
        headers: firebaseAuthHeaders(),
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        var json = JSON.parse(response.getContentText());
        if (json) existingFirebaseData = json;
      } else {
        Logger.log("Firebase read status " + response.getResponseCode() + ". Proceeding with empty baseline.");
      }
    } catch(e) {
      Logger.log("Could not fetch existing Firebase data (" + e.message + "). Proceeding with full overwrite.");
    }
    
    // --- 4. PARSE DAILY AGENDA (Dynamic Quarter Discovery: Q7 Full, Q6 Full, or regex fallback) ---
    var dailySheet = ss.getSheetByName('Q7 Full') || ss.getSheetByName('Q6 Full');
    if (!dailySheet) {
      var allSheets = ss.getSheets();
      for (var s = 0; s < allSheets.length; s++) {
        var sName = allSheets[s].getName();
        if (/full/i.test(sName) || /daily/i.test(sName)) {
          dailySheet = allSheets[s];
          break;
        }
      }
    }
    if (!dailySheet) {
      Logger.log("Warning: No Daily/Full schedule sheet ('Q7 Full' or 'Q6 Full') found in spreadsheet.");
      return;
    }

    var dailyRange = dailySheet.getDataRange();
    var dailyValues = dailyRange.getValues();
    if (!dailyValues || dailyValues.length === 0) {
      Logger.log("Daily sheet has no data rows.");
      return;
    }

    // Safely capture strikethrough styling; guard against transient Google formatting RPC hiccups
    var dailyFontLines = null;
    try {
      dailyFontLines = dailyRange.getFontLines();
    } catch(fe) {
      Logger.log("Warning: Could not fetch daily font lines (transient formatting RPC glitch): " + fe.message);
    }

    var dailyHeaders = dailyValues[0];
    var dailyData = {};
    
    // Safely handle Merged Cells
    var mergeMap = [];
    try {
      var merges = dailyRange.getMergedRanges();
      for(var m=0; m<merges.length; m++) {
        if (Date.now() - startTime > 20000) {
          Logger.log("⚠️ Merged ranges parsing reached 20s guard. Breaking early to avoid RPC hang.");
          break;
        }
        var range = merges[m];
        var sRow = range.getRow() - 1;
        var sCol = range.getColumn() - 1;
        var val = (dailyValues[sRow] && dailyValues[sRow][sCol] !== undefined) ? dailyValues[sRow][sCol] : null;
        mergeMap.push({
          startRow: sRow,
          endRow: sRow + range.getNumRows() - 1,
          startCol: sCol,
          endCol: sCol + range.getNumColumns() - 1,
          value: val
        });
      }
    } catch(me) {
      Logger.log("Warning: Could not fetch merged ranges: " + me.message);
    }
    
    function getMergeValue(r, c) {
      for (var m = 0; m < mergeMap.length; m++) {
        if (r >= mergeMap[m].startRow && r <= mergeMap[m].endRow &&
            c >= mergeMap[m].startCol && c <= mergeMap[m].endCol) {
          return mergeMap[m].value;
        }
      }
      return null;
    }
    
    var dIdx = {}, cIdx = -1, bIdx = -1;
    for(var i=0; i<dailyHeaders.length; i++){
      var h = String(dailyHeaders[i]).trim();
      if(h === 'Comments') cIdx = i;
      if(h === 'Birthdays') bIdx = i;
      if(timeCols.indexOf(h) !== -1) dIdx[h] = i;
    }

    function normalizeSlotText(value) {
      return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }
    
    var lastRawDate = null;
    var lastDayStr = '';

    for(var r=1; r<dailyValues.length; r++){
      // Safety timeout guard: terminate cleanly before trigger limit
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        Logger.log("⚠️ Daily parse reached maximum safety execution duration. Breaking early.");
        break;
      }

      var row = dailyValues[r];
      var rawDate = row[0];
      var dayStr = String(row[1]).trim();
      
      // Backfill Date if in merged range or continuation row
      if (!rawDate || String(rawDate).trim() === '') {
        var mergedValDate = getMergeValue(r, 0);
        if (mergedValDate !== null) {
          rawDate = mergedValDate;
        } else if (lastRawDate) {
          rawDate = lastRawDate;
        }
      } else {
        lastRawDate = rawDate;
      }

      // Backfill Day if in merged range or continuation row
      if (!dayStr) {
        var mergedValDay = getMergeValue(r, 1);
        if (mergedValDay !== null) {
          dayStr = String(mergedValDay).trim();
        } else if (lastDayStr) {
          dayStr = lastDayStr;
        }
      } else {
        lastDayStr = dayStr;
      }

      if(!rawDate) {
        continue;
      }
      
      var dateKey = "";
      if (Object.prototype.toString.call(rawDate) === '[object Date]') {
        dateKey = Utilities.formatDate(rawDate, "Asia/Kolkata", "yyyy-MM-dd"); 
      } else {
        dateKey = String(rawDate).trim();
      }
      
      if(!dateKey || dateKey.toLowerCase() === 'nan' || dateKey === 'Day' || dateKey === 'Date') {
        continue;
      }
      
      var finalKey = dateKey + " " + dayStr;
      var slots = {};
      var fbDay = (existingFirebaseData.daily && existingFirebaseData.daily[finalKey]) ? existingFirebaseData.daily[finalKey] : {};
      
      // Preserve custom times if any
      if (fbDay.customTimes) {
          slots.customTimes = fbDay.customTimes;
      }
      
      for(var i=0; i<timeCols.length; i++){
        var tc = timeCols[i];
        var normTc = tc.replace(' - ', '-').replace(' ', '');
        
        var fbSlot = fbDay[normTc];
        var val = dIdx[tc] !== undefined ? String(row[dIdx[tc]]).trim() : '';
        var hasSheetValue = val && val.toLowerCase() !== 'nan';
        var isProtected = false;
        if (fbSlot) {
            if (Array.isArray(fbSlot)) {
                var existingText = fbSlot.map(function(entry) {
                  return typeof entry === 'object' && entry ? (entry.text || '') : String(entry);
                }).join(' / ');
                var hasExplicitOverride = fbSlot.some(function(entry) {
                  return typeof entry === 'object' && entry &&
                    (entry.manuallyEdited || entry.isShifted || entry.shiftedTo);
                });
                isProtected = hasExplicitOverride ||
                  (hasSheetValue && normalizeSlotText(existingText) === normalizeSlotText(val));
            } else if (typeof fbSlot === 'object') {
                isProtected = fbSlot.manuallyEdited || fbSlot.isShifted || fbSlot.shiftedTo;
            }
        }
        
        if (isProtected) {
            slots[normTc] = fbSlot;
        } else {
          if(hasSheetValue) {
            var isStrikethrough = (dailyFontLines && dailyFontLines[r] && dIdx[tc] !== undefined) ?
              (dailyFontLines[r][dIdx[tc]] === 'line-through') : false;
            slots[normTc] = { text: val, strike: isStrikethrough };
          }
        }
      }
      
      // Carry over any Admin Panel slots that Excel doesn't even have columns for, or that Excel left empty but are protected
      for (var k in fbDay) {
          if (k !== 'Comments' && k !== 'Birthdays' && k !== 'customTimes' && k !== 'manuallyEditedComments' && !slots[k]) {
              if (Array.isArray(fbDay[k]) || (typeof fbDay[k] === 'object' && (fbDay[k].manuallyEdited || fbDay[k].isShifted || fbDay[k].shiftedTo))) {
                  slots[k] = fbDay[k];
              }
          }
      }
      
      if(cIdx !== -1) {
        var comment = String(row[cIdx]).trim();
        if (!comment) {
          var mergedValComment = getMergeValue(r, cIdx);
          if (mergedValComment !== null) comment = String(mergedValComment).trim();
        }
        
        if (fbDay.manuallyEditedComments && fbDay['Comments']) {
            slots['Comments'] = fbDay['Comments'];
            slots.manuallyEditedComments = true;
        } else if (comment && comment.toLowerCase() !== 'nan') {
            slots['Comments'] = comment;
        }
      } else if (fbDay.manuallyEditedComments && fbDay['Comments']) {
          slots['Comments'] = fbDay['Comments'];
          slots.manuallyEditedComments = true;
      }
      
      if(bIdx !== -1) {
        var birthday = String(row[bIdx]).trim();
        if(birthday && birthday.toLowerCase() !== 'nan') slots['Birthdays'] = birthday;
      } else if (fbDay['Birthdays']) {
          slots['Birthdays'] = fbDay['Birthdays'];
      }
      
      if(Object.keys(slots).length > 0) {
        dailyData[finalKey] = slots;
      }
    }
    
    // Carry over any manually edited days from Firebase that might not even exist in the Excel sheet
    if (existingFirebaseData.daily) {
        for (var dk in existingFirebaseData.daily) {
            if (existingFirebaseData.daily[dk].manuallyEdited && !dailyData[dk]) {
                dailyData[dk] = existingFirebaseData.daily[dk];
            }
        }
    }
    
    // --- 5. PARSE WEEKLY SCHEDULE (Dynamic Quarter Discovery: Q7 Weekly, Q6 Weekly, or regex fallback) ---
    var weeklySheet = ss.getSheetByName('Q7 Weekly') || ss.getSheetByName('Q6 Weekly');
    if (!weeklySheet) {
      var allSheetsWeekly = ss.getSheets();
      for (var sw = 0; sw < allSheetsWeekly.length; sw++) {
        var swName = allSheetsWeekly[sw].getName();
        if (/weekly/i.test(swName)) {
          weeklySheet = allSheetsWeekly[sw];
          break;
        }
      }
    }
    var weeklyData = {};
    if (weeklySheet) {
      var weeklyRange = weeklySheet.getDataRange();
      var weeklyValues = weeklyRange.getValues();
      var weeklyFontLines = null;
      try {
        weeklyFontLines = weeklyRange.getFontLines();
      } catch(wfe) {
        Logger.log("Warning: Could not fetch weekly font lines: " + wfe.message);
      }
      var wHeaders = weeklyValues[0];
      
      var wIdx = {}, wDayIdx = 0;
      for(var i=0; i<wHeaders.length; i++){
        var h = String(wHeaders[i]).trim();
        if(h === 'Day') wDayIdx = i;
        if(timeCols.indexOf(h) !== -1) wIdx[h] = i;
      }
      
      var currentDay = null;
      for(var r=1; r<weeklyValues.length; r++){
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          Logger.log("⚠️ Weekly parse reached maximum safety execution duration. Breaking early.");
          break;
        }

        var row = weeklyValues[r];
        var dayVal = String(row[wDayIdx]).trim();
        
        if(dayVal && dayVal.toLowerCase() !== 'nan') {
          currentDay = dayVal;
          weeklyData[currentDay] = {};
        }
        if(!currentDay) continue;
        
        for(var i=0; i<timeCols.length; i++){
          var tc = timeCols[i];
          if(wIdx[tc] !== undefined){
            var val = String(row[wIdx[tc]]).trim();
            if(val && val.toLowerCase() !== 'nan' && !/^[A-Z]{2}$/.test(val)) {
              var isStrikethrough = (weeklyFontLines && weeklyFontLines[r] && wIdx[tc] !== undefined) ?
                (weeklyFontLines[r][wIdx[tc]] === 'line-through') : false;
              var normTc = tc.replace(' - ', '-').replace(' ', '');
              
              var entry = { text: val, strike: isStrikethrough };
              
              if(weeklyData[currentDay][normTc]) {
                if(!Array.isArray(weeklyData[currentDay][normTc])) {
                  weeklyData[currentDay][normTc] = [weeklyData[currentDay][normTc]];
                }
                weeklyData[currentDay][normTc].push(entry);
              } else {
                weeklyData[currentDay][normTc] = entry;
              }
            }
          }
        }
      }
    }
    
    // Tell students whose classes changed in the sheet (never lets a notify bug break the sync)
    try {
      notifySheetChanges_(existingFirebaseData.daily, dailyData);
    } catch (e) {
      Logger.log('Sheet-change notify failed: ' + e.message);
    }

    // --- 6. PUSH TO FIREBASE WITH RETRY ---
    var payload = { daily: dailyData, weekly: weeklyData, lastSynced: new Date().toISOString() };
    if (existingFirebaseData.exams) payload.exams = existingFirebaseData.exams;
    var options = {
      method: 'put',
      contentType: 'application/json',
      headers: firebaseAuthHeaders(),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    var pushSuccess = false;
    for (var pAttempt = 1; pAttempt <= 3; pAttempt++) {
      try {
        var putRes = UrlFetchApp.fetch(firebaseUrl, options);
        var pCode = putRes.getResponseCode();
        if (pCode >= 200 && pCode < 300) {
          Logger.log("✅ Successfully synced 1:1 sheet replica to Firebase!");
          pushSuccess = true;
          // Record sync telemetry to /sync_health
          try {
            var healthUrl = firebaseUrl.replace('/schedule.json', '/sync_health.json');
            UrlFetchApp.fetch(healthUrl, {
              method: 'put',
              contentType: 'application/json',
              headers: firebaseAuthHeaders(),
              payload: JSON.stringify({
                status: 'healthy',
                lastSuccess: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                dailyDays: Object.keys(dailyData).length,
                weeklyDays: Object.keys(weeklyData).length,
                dailySheetUsed: dailySheet.getName(),
                weeklySheetUsed: weeklySheet ? weeklySheet.getName() : null
              }),
              muteHttpExceptions: true
            });
          } catch(he) {}
          break;
        } else {
          Logger.log("Firebase PUT attempt " + pAttempt + " returned status " + pCode + ": " + putRes.getContentText().slice(0, 200));
        }
      } catch(pe) {
        Logger.log("❌ Firebase PUT attempt " + pAttempt + " error: " + pe.message);
      }
      if (pAttempt < 3) Utilities.sleep(1500 * pAttempt);
    }
  } catch(fatalError) {
    Logger.log("❌ Fatal error in syncTimetableToFirebase: " + fatalError.message + "\nStack: " + fatalError.stack);
    try {
      var healthUrlErr = firebaseUrl.replace('/schedule.json', '/sync_health.json');
      UrlFetchApp.fetch(healthUrlErr, {
        method: 'patch',
        contentType: 'application/json',
        headers: firebaseAuthHeaders(),
        payload: JSON.stringify({
          status: 'error',
          lastError: fatalError.message,
          lastFailedAt: new Date().toISOString()
        }),
        muteHttpExceptions: true
      });
    } catch(he) {}
  } finally {
    try {
      lock.releaseLock();
    } catch(e) {}
  }
}

// The database rules block anonymous writes to the schedule. Authenticating
// with this script owner's Google token bypasses the rules, so the sync keeps
// working. The owner needs access to the Firebase project.
function firebaseAuthHeaders() {
  try {
    var token = ScriptApp.getOAuthToken();
    return { Authorization: 'Bearer ' + token };
  } catch(e) {
    Logger.log("Warning: Could not get OAuth token: " + e.message);
    return {};
  }
}
