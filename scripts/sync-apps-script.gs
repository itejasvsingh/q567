function syncTimetableToFirebase() {
  var sheetId = '1FyiqG6ArbYoEtmZWPnXjfwnjNNm1CO89pfz2WV2_bYY';
  var firebaseUrl = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app/schedule.json';
  
  try {
    var ss = SpreadsheetApp.openById(sheetId);
  } catch(e) {
    Logger.log("Error: Could not open the sheet. Make sure you are logged in with your Uni ID.");
    return;
  }
  
  var timeCols = ['8am - 10am', '10am - 12pm', '12pm-1pm', '1pm-3pm', '3pm-5pm', '5pm-7pm'];
  
  // --- 1. PARSE DAILY AGENDA (Sheet 'Q6 Full') ---
  var dailySheet = ss.getSheetByName('Q6 Full');
  var dailyRange = dailySheet.getDataRange();
  var dailyValues = dailyRange.getValues();
  var dailyFontLines = dailyRange.getFontLines(); // Captures strikethrough styling
  var dailyHeaders = dailyValues[0];
  var dailyData = {};
  
  // Handle Merged Cells
  var merges = dailyRange.getMergedRanges();
  var mergeMap = [];
  for(var m=0; m<merges.length; m++) {
    var range = merges[m];
    mergeMap.push({
      startRow: range.getRow() - 1,
      endRow: range.getRow() - 1 + range.getNumRows() - 1,
      startCol: range.getColumn() - 1,
      endCol: range.getColumn() - 1 + range.getNumColumns() - 1,
      value: dailyValues[range.getRow() - 1][range.getColumn() - 1]
    });
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
  
  for(var r=1; r<dailyValues.length; r++){
    var row = dailyValues[r];
    var rawDate = row[0];
    var dayStr = String(row[1]).trim();
    
    // Backfill Date if in merged range
    if (!rawDate || String(rawDate).trim() === '') {
      var mergedValDate = getMergeValue(r, 0);
      if (mergedValDate !== null) {
        rawDate = mergedValDate;
        Logger.log("Row " + (r+1) + ": Backfilled missing Date from merged range.");
      }
    }

    // Backfill Day if in merged range
    if (!dayStr) {
      var mergedValDay = getMergeValue(r, 1);
      if (mergedValDay !== null) {
        dayStr = String(mergedValDay).trim();
        Logger.log("Row " + (r+1) + ": Backfilled missing Day from merged range.");
      }
    }

    if(!rawDate) {
      Logger.log("Row " + (r+1) + " Skipped: rawDate is empty. Raw row values -> Date: [" + row[0] + "], Day: [" + row[1] + "]");
      continue;
    }
    
    var dateKey = "";
    if (Object.prototype.toString.call(rawDate) === '[object Date]') {
      dateKey = Utilities.formatDate(rawDate, "Asia/Kolkata", "yyyy-MM-dd"); 
    } else {
      dateKey = String(rawDate).trim();
    }
    
    if(!dateKey || dateKey.toLowerCase() === 'nan' || dateKey === 'Day' || dateKey === 'Date') {
      Logger.log("Row " + (r+1) + " Skipped: Invalid dateKey. rawDate: [" + rawDate + "], dateKey: [" + dateKey + "]");
      continue;
    }
    
    var finalKey = dateKey + " " + dayStr;
    var slots = {};
    
    for(var i=0; i<timeCols.length; i++){
      var tc = timeCols[i];
      if(dIdx[tc] !== undefined){
        var val = String(row[dIdx[tc]]).trim();
        if(val && val.toLowerCase() !== 'nan') {
          var isStrikethrough = dailyFontLines[r][dIdx[tc]] === 'line-through';
          var normTc = tc.replace(' - ', '-').replace(' ', '');
          
          slots[normTc] = {
            text: val,
            strike: isStrikethrough
          };
        }
      }
    }
    
    if(cIdx !== -1) {
      var comment = String(row[cIdx]).trim();
      
      // Backfill Comment if in merged range
      if (!comment) {
        var mergedValComment = getMergeValue(r, cIdx);
        if (mergedValComment !== null) {
          comment = String(mergedValComment).trim();
          Logger.log("Row " + (r+1) + ": Backfilled missing Comment from merged range.");
        }
      }
      
      if(comment && comment.toLowerCase() !== 'nan') slots['Comments'] = comment;
    }
    
    if(bIdx !== -1) {
      var birthday = String(row[bIdx]).trim();
      if(birthday && birthday.toLowerCase() !== 'nan') slots['Birthdays'] = birthday;
    }
    
    if(Object.keys(slots).length > 0) {
      dailyData[finalKey] = slots;
    } else {
      Logger.log("Row " + (r+1) + " Skipped: Zero populated slots/comments/birthdays.");
    }
  }
  
  // --- 2. PARSE WEEKLY SCHEDULE (Sheet 'Q6 Weekly') ---
  var weeklySheet = ss.getSheetByName('Q6 Weekly');
  var weeklyRange = weeklySheet.getDataRange();
  var weeklyValues = weeklyRange.getValues();
  var weeklyFontLines = weeklyRange.getFontLines();
  var wHeaders = weeklyValues[0];
  var weeklyData = {};
  
  var wIdx = {}, wDayIdx = 0;
  for(var i=0; i<wHeaders.length; i++){
    var h = String(wHeaders[i]).trim();
    if(h === 'Day') wDayIdx = i;
    if(timeCols.indexOf(h) !== -1) wIdx[h] = i;
  }
  
  var currentDay = null;
  for(var r=1; r<weeklyValues.length; r++){
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
          var isStrikethrough = weeklyFontLines[r][wIdx[tc]] === 'line-through';
          var normTc = tc.replace(' - ', '-').replace(' ', '');
          
          let entry = { text: val, strike: isStrikethrough };
          
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
  
  // --- 3. PUSH TO FIREBASE ---
  var payload = { daily: dailyData, weekly: weeklyData };
  var options = { method: 'put', contentType: 'application/json', payload: JSON.stringify(payload) };
  
  try {
    UrlFetchApp.fetch(firebaseUrl, options);
    Logger.log("✅ Successfully synced 1:1 sheet replica to Firebase!");
  } catch(e) {
    Logger.log("❌ Firebase Error: " + e.message);
  }
}
