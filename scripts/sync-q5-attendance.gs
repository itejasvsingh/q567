function syncQ5AttendanceToFirebase() {
  // 1. Setup your Sheet ID and Firebase URL
  var sheetId = '1LRJ3gEMlh_pAaaKoCp9MA9eZBHZ6UjPT_FJ7PpJFoQI'; // Extract from the Google Sheet URL
  var firebaseUrl = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app/q5_attendance.json';
  
  try {
    var ss = SpreadsheetApp.openById(sheetId);
  } catch(e) {
    Logger.log("Error: Could not open the sheet. Make sure you have the right ID.");
    return;
  }
  
  // 2. Parse the Active Sheet
  var sheet = ss.getActiveSheet(); 
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  
  var headers = null;
  var headerRowIdx = -1;
  var rollIdx = -1;
  var nameIdx = -1;
  var subjectCols = {}; // { index: "COURSE_CODE" }
  
  // Scan the first 10 rows to find the actual header row (it's often not row 1!)
  for (var r = 0; r < Math.min(10, data.length); r++) {
    var row = data[r];
    for (var c = 0; c < row.length; c++) {
      var cellVal = String(row[c]).toLowerCase();
      if (cellVal.indexOf('roll') !== -1 || cellVal === 'id' || cellVal.indexOf('student id') !== -1) {
        headers = row;
        headerRowIdx = r;
        break;
      }
    }
    if (headers) break; // Found the header row!
  }
  
  if (!headers) {
    Logger.log("Error: Could not find a 'Roll Number' column anywhere in the first 10 rows.");
    return;
  }
  
  // Find Roll, Name, and Course columns within the identified header row
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (!h) continue;
    
    var hLower = h.toLowerCase();
    if (hLower.indexOf('roll') !== -1 || hLower === 'id' || hLower.indexOf('student id') !== -1) {
      rollIdx = i;
    } else if (hLower.indexOf('name') !== -1 || hLower === 'student') {
      nameIdx = i;
    } else if (/^[A-Z0-9-]{4,10}$/.test(h)) {
      subjectCols[i] = h.toUpperCase();
    }
  }
  
  var outputDb = {};
  
  // 3. Process each student row (starting right after the header row)
  for (var r = headerRowIdx + 1; r < data.length; r++) {
    var row = data[r];
    var roll = String(row[rollIdx]).trim().toUpperCase();
    if (!roll) continue; // Skip empty rows
    
    var name = nameIdx !== -1 ? String(row[nameIdx]).trim() : '';
    var studentAtt = {};
    
    for (var colIdx in subjectCols) {
      var courseCode = subjectCols[colIdx];
      var cellVal = String(row[colIdx]).trim();
      
      if (!cellVal || cellVal === '-' || cellVal.toLowerCase() === 'na') continue;
      
      var attended = 0;
      var total = 0;
      
      var slashMatch = cellVal.match(/(\d+)\s*\/\s*(\d+)/);
      if (slashMatch) {
        attended = parseInt(slashMatch[1], 10);
        total = parseInt(slashMatch[2], 10);
      } else {
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
