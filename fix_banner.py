import re

with open('app.js', 'r') as f:
    content = f.read()

target = """      const comment = dailySlots['Comments'];
      const birthdays = dailySlots['Birthdays'];
      
      if (comment) {
          let isExam = comment.toLowerCase().includes('end term') || comment.toLowerCase().includes('exam') || comment.toLowerCase().includes('quiz');
          
          if (!isExam) {
              for (const t of timeOrder) {
                  const sData = dailySlots[t];
                  if (sData) {
                      const text = typeof sData === 'object' ? sData.text : String(sData);
                      if (text.toLowerCase().includes('end term') || text.toLowerCase().includes('exam')) {
                          isExam = true;
                          break;
                      }
                  }
              }
          }
          const badgeBg = isExam ? 'var(--bg-danger)' : 'var(--bg-warn)';
          const badgeBorder = isExam ? 'var(--bd-danger)' : 'var(--bd-warn)';
          const badgeColor = isExam ? 'var(--tx-danger)' : 'var(--tx-warn)';
          const icon = isExam ? '📝' : '⚠️';

          dailyHtml += `<div style="font-size:12px; font-weight:700; color:${badgeColor}; margin-bottom:8px; background:${badgeBg}; padding:8px 12px; border-radius:6px; border:.5px solid ${badgeBorder}; display:flex; align-items:center; gap:8px;">
              <span style="font-size:14px;">${icon}</span> ${comment}
          </div>`;
      }"""

new_code = """      let comment = dailySlots['Comments'] || '';
      const birthdays = dailySlots['Birthdays'];
      
      let isExam = false;
      let examText = '';
      
      if (comment) {
          isExam = comment.toLowerCase().includes('end term') || comment.toLowerCase().includes('exam') || comment.toLowerCase().includes('quiz');
      }
      
      for (const t of timeOrder) {
          const sData = dailySlots[t];
          if (sData) {
              const text = typeof sData === 'object' ? sData.text : String(sData);
              if (text.toLowerCase().includes('end term') || text.toLowerCase().includes('exam')) {
                  isExam = true;
                  examText = text;
                  break;
              }
          }
      }
      
      if (isExam && !comment) {
          comment = examText;
      }
      
      if (comment) {
          const badgeBg = isExam ? 'var(--bg-danger)' : 'var(--bg-warn)';
          const badgeBorder = isExam ? 'var(--bd-danger)' : 'var(--bd-warn)';
          const badgeColor = isExam ? 'var(--tx-danger)' : 'var(--tx-warn)';
          const icon = isExam ? '📝' : '⚠️';

          dailyHtml += `<div style="font-size:12px; font-weight:700; color:${badgeColor}; margin-bottom:8px; background:${badgeBg}; padding:8px 12px; border-radius:6px; border:.5px solid ${badgeBorder}; display:flex; align-items:center; gap:8px;">
              <span style="font-size:14px;">${icon}</span> ${comment}
          </div>`;
      }"""

content = content.replace(target, new_code)

with open('app.js', 'w') as f:
    f.write(content)
