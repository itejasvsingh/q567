import re

with open('app.js', 'r') as f:
    content = f.read()

# Extract from 'let todaysClasses = {};' up to '// Parse "2026-09-24 Thursday"'
start_idx = content.find('let todaysClasses = {};')
end_idx = content.find('// Parse "2026-09-24 Thursday"')

if start_idx == -1 or end_idx == -1:
    print("Could not find blocks")
else:
    target = content[start_idx:end_idx]
    
    replacement = """let todaysClasses = {};
      let hasClasses = false;

      for (const t of timeOrder) {
          if (t === '12pm-1pm') continue;
          
          const slotData = dailySlots[t];
          if (!slotData) continue;

          const classStr = typeof slotData === 'object' ? slotData.text : String(slotData);
          const isStrikethrough = typeof slotData === 'object' ? slotData.strike : false;
          const cancelled = isStrikethrough || classStr.includes('~') || classStr.toLowerCase().includes('cancel') || classStr.includes('<s>') || classStr.includes('<strike>');

          if (classStr.toUpperCase().includes('ICRC')) {
              todaysClasses[t] = { type: 'icrc', cancelled: cancelled };
              hasClasses = true;
              continue;
          }

          const classesInCell = classStr.split('/').map(c => c.trim());
          for (const s of activeSubjects) {
              const acronym = excelAcronyms[s.code];
              if (classesInCell.includes(s.code) || (acronym && classesInCell.includes(acronym)) || classesInCell.includes(s.name)) {
                  todaysClasses[t] = { type: 'class', subject: s, cancelled: cancelled, rawStr: classStr };
                  hasClasses = true;
                  break;
              }
          }
      }

      // Pass 2: Render the full timeline for the day
      if (hasClasses) {
          for (const t of timeOrder) {
              if (t === '12pm-1pm') {
                  dailyHtml += `<div class="lc" style="min-height:30px; margin-bottom:6px; font-weight:600; color:var(--tx3); text-align:center; font-size:11px;">🍽 Lunch Break (12pm - 1pm)</div>`;
                  continue;
              }

              if (todaysClasses[t]) {
                  const cancelled = todaysClasses[t].cancelled;
                  const strikeStyle = cancelled ? 'text-decoration: line-through; opacity: 0.7;' : '';
                  const bgStyle = cancelled ? 'background:var(--bg-warn); border:.5px solid var(--bd-warn);' : 'background:var(--bg-info); border:.5px solid var(--bd-info);';
                  const txColor = cancelled ? 'var(--tx-warn)' : 'var(--tx-info)';

                  if (todaysClasses[t].type === 'icrc') {
                      dailyHtml += `
                      <div style="display:flex; justify-content:flex-start; align-items:center; padding:10px; ${bgStyle} border-radius:8px; margin-bottom:6px;">
                          <div style="width: 75px; font-size:11px; font-weight:700; color:${txColor};">${t}</div>
                          <div style="font-size:13px; font-weight:700; color:${txColor}; ${strikeStyle}">🏢 ICRC</div>
                      </div>`;
                  } else {
                      const subjectDetails = todaysClasses[t].subject;
                      dailyHtml += `
                      <div style="display:flex; justify-content:flex-start; align-items:center; padding:10px; ${bgStyle} border-radius:8px; margin-bottom:6px;">
                          <div style="width: 75px; font-size:11px; font-weight:700; color:${txColor}; opacity: 0.8;">${t}</div>
                          <div style="flex:1;">
                              <div style="font-size:13px; font-weight:700; color:${txColor}; ${strikeStyle}">${subjectDetails.name}</div>
                          </div>
                          ${subjectDetails.room && !cancelled ? `<div style="font-size:10px; font-weight:700; color:var(--tx-warn); background:var(--bg-warn); padding:3px 6px; border-radius:4px; border:.5px solid var(--bd-warn);">📍 ${subjectDetails.room}</div>` : ''}
                      </div>`;
                  }
              } else {
                  dailyHtml += `
                  <div style="display:flex; justify-content:flex-start; align-items:center; padding:10px; border:.5px dashed var(--bd); background:var(--bg2); border-radius:8px; margin-bottom:6px; opacity: 0.6;">
                      <div style="width: 75px; font-size:11px; font-weight:600; color:var(--tx3);">${t}</div>
                      <div style="font-size:12px; font-weight:600; color:var(--tx3);">☕ Free Slot</div>
                  </div>`;
              }
          }
      } else {
          dailyHtml += `<div style="font-size:12px; color:var(--tx3); padding: 12px 0; text-align:center; border: .5px dashed var(--bd); border-radius: 8px; background: var(--bg2);">☕ No classes today.</div>`;
      }

      """
    
    content = content.replace(target, replacement)
    with open('app.js', 'w') as f:
        f.write(content)
