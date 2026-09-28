function syncQ5AttendanceToFirebase() {
  var sheetId = '1LRJ3gEMlh_pAaaKoCp9MA9eZBHZ6UjPT_FJ7PpJFoQI'; 
  var firebaseUrl = 'https://q567mba-default-rtdb.asia-southeast1.firebasedatabase.app/q5_attendance.json';
  
  try {
    var ss = SpreadsheetApp.openById(sheetId);
  } catch(e) {
    Logger.log("Error: Could not open the sheet. Make sure you have the right ID.");
    return;
  }
  
  var sheets = ss.getSheets();
  var outputDb = {}; // { roll: { name: "", attendance: { MS5760: { p, a, t, pct } } } }
  
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var sheetName = sheet.getName();
    
    // Extract course code from sheet name (e.g. "MS5760-VC" -> "MS5760")
    var codeMatch = sheetName.match(/^([A-Z0-9]{4,8})/);
    if (!codeMatch) continue; // Skip sheets that don't look like course tabs
    var courseCode = codeMatch[1];
    
    var data = sheet.getDataRange().getValues();
    
    var rollIdx = -1;
    var nameIdx = -1;
    var headerRowIdx = -1;
    
    // Find header row (must contain "username" or "roll no")
    for (var r = 0; r < Math.min(15, data.length); r++) {
      var row = data[r];
      for (var c = 0; c < row.length; c++) {
        var cell = String(row[c]).toLowerCase().trim();
        if (cell === 'username' || cell === 'roll no' || cell === 'rollno' || cell === 'roll number' || cell === 'student id') {
          rollIdx = c;
          headerRowIdx = r;
        } else if (cell === 'surname' || cell === 'name' || cell === 'student name') {
          nameIdx = c;
        }
      }
      if (headerRowIdx !== -1) break;
    }
    
    if (headerRowIdx === -1) {
      Logger.log("Warning: Could not find Roll/Username column in sheet: " + sheetName);
      continue; 
    }
    
    // Process student rows
    for (var r = headerRowIdx + 1; r < data.length; r++) {
      var row = data[r];
      var roll = String(row[rollIdx]).trim().toUpperCase();
      if (!roll || roll.length < 5) continue; // Skip empty/invalid rolls
      
      var name = nameIdx !== -1 ? String(row[nameIdx]).trim() : '';
      
      var pCount = 0;
      var aCount = 0;
      
      // Count P and A in all columns for this student
      for (var c = 0; c < row.length; c++) {
        var val = String(row[c]).trim().toUpperCase();
        if (val === 'P') pCount++;
        else if (val === 'A') aCount++;
      }
      
      var total = pCount + aCount;
      if (total > 0) {
        var pct = Math.round((pCount / total) * 100);
        
        if (!outputDb[roll]) {
          outputDb[roll] = { name: name, attendance: {} };
        } else if (!outputDb[roll].name && name) {
          outputDb[roll].name = name;
        }
        
        outputDb[roll].attendance[courseCode] = {
          p: pCount,
          a: aCount,
          t: total,
          pct: pct
        };
      }
    }
  }
  
  // Push to Firebase
  var options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(outputDb)
  };
  
  try {
    UrlFetchApp.fetch(firebaseUrl, options);
    Logger.log("✅ Successfully synced all Q5 Attendance sheets to Firebase! Count: " + Object.keys(outputDb).length + " students.");
  } catch(e) {
    Logger.log("❌ Firebase Error: " + e.message);
  }
}
