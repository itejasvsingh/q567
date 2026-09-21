import re

with open('app.js', 'r') as f:
    content = f.read()

target_comment = """          const badgeBg = isExam ? 'var(--bg-warn)' : 'var(--bg-warn)';
          const badgeBorder = isExam ? '#f87171' : 'var(--bd-warn)';
          const badgeColor = isExam ? '#991b1b' : 'var(--tx-warn)';"""
replacement_comment = """          const badgeBg = isExam ? 'var(--bg-danger)' : 'var(--bg-warn)';
          const badgeBorder = isExam ? 'var(--bd-danger)' : 'var(--bd-warn)';
          const badgeColor = isExam ? 'var(--tx-danger)' : 'var(--tx-warn)';"""
content = content.replace(target_comment, replacement_comment)

target_bday = """          dailyHtml += `<div style="font-size:12px; font-weight:700; color:#d946ef; margin-bottom:8px; background:#fdf4ff; border:.5px solid #f0abfc; padding:6px 10px; border-radius:6px;">🎉 Happy Birthday: ${birthdays}!</div>`;"""
replacement_bday = """          dailyHtml += `<div style="font-size:12px; font-weight:700; color:var(--tx-pink); margin-bottom:8px; background:var(--bg-pink); border:.5px solid var(--bd-pink); padding:6px 10px; border-radius:6px;">🎉 Happy Birthday: ${birthdays}!</div>`;"""
content = content.replace(target_bday, replacement_bday)

with open('app.js', 'w') as f:
    f.write(content)
