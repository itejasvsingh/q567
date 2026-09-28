function syncQ5AttendanceToFirebase() {
  // 1. Setup your Sheet ID and Firebase URL
  var sheetId = 'YOUR_Q5_ATTENDANCE_SHEET_ID_HERE'; // Extract from the Google Sheet URL
  var firebaseUrl = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app/q5_attendance.json';
  
  try {
    var ss = SpreadsheetApp.openById(sheetId);
  } catch(e) {
    Logger.log("Error: Could not open the sheet. Make sure you have the right ID.");
    return;
  }
  
  // 2. Parse the Active Sheet
  var sheet = ss.getActiveSheet(); // or ss.getSheetByName('Sheet1')
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  
  var headers = data[0];
  var rollIdx = -1;
  var nameIdx = -1;
  var subjectCols = {}; // { index: "COURSE_CODE" }
  
  // Find Roll and Name columns, and treat the rest as subjects
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (!h) continue;
    
    var hLower = h.toLowerCase();
    if (hLower.indexOf('roll') !== -1 || hLower === 'id') {
      rollIdx = i;
    } else if (hLower.indexOf('name') !== -1 || hLower === 'student') {
      nameIdx = i;
    } else if (/^[A-Z0-9-]{4,10}$/.test(h)) {
      // Looks like a course code (e.g., MS5760, CORE-LAW)
      subjectCols[i] = h.toUpperCase();
    }
  }
  
  if (rollIdx === -1) {
    Logger.log("Error: Could not find a 'Roll Number' column in the header row.");
    return;
  }
  
  var outputDb = {};
  
  // 3. Process each student row
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var roll = String(row[rollIdx]).trim().toUpperCase();
    if (!roll) continue;
    
    var name = nameIdx !== -1 ? String(row[nameIdx]).trim() : '';
    
    var studentAtt = {};
    
    for (var colIdx in subjectCols) {
      var courseCode = subjectCols[colIdx];
      var cellVal = String(row[colIdx]).trim();
      
      if (!cellVal || cellVal === '-' || cellVal.toLowerCase() === 'na') continue;
      
      // Parse formats like: "10", "10/12", "10 / 12", "83%", "10 (83%)"
      var attended = 0;
      var total = 0;
      
      var slashMatch = cellVal.match(/(\d+)\s*\/\s*(\d+)/);
      if (slashMatch) {
        attended = parseInt(slashMatch[1], 10);
        total = parseInt(slashMatch[2], 10);
      } else {
        // Just a number? Assume it's the attended classes, default total to 14
        var numMatch = cellVal.match(/^(\d+)$/);
        if (numMatch) {
          attended = parseInt(numMatch[1], 10);
          total = 14; 
        }
      }
      
      if (total > 0) {
        var absent = total - attended;
        var pct = Math.round((attended / total) * 100);
        
        studentAtt[courseCode] = {
          p: attended,
          a: absent < 0 ? 0 : absent,
          t: total,
          pct: pct
        };
      }
    }
    
    if (Object.keys(studentAtt).length > 0) {
      outputDb[roll] = {
        name: name,
        attendance: studentAtt
      };
    }
  }
  
  // 4. Push to Firebase
  var options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(outputDb)
  };
  
  try {
    UrlFetchApp.fetch(firebaseUrl, options);
    Logger.log("✅ Successfully synced Q5 Attendance to Firebase! Count: " + Object.keys(outputDb).length + " students.");
  } catch(e) {
    Logger.log("❌ Firebase Error: " + e.message);
  }
}
