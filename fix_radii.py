import re

with open('app.js', 'r') as f:
    content = f.read()

# 1. Add back the Q6 banner with 8px radius and .5px border
pager_block = """  let fullHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        ${pagerHtml}
    </div>
    <div onclick="window.refreshLiveSchedule(this)" style="font-size:10px; color:var(--tx3); text-align:right; margin-bottom:10px; cursor:pointer; font-weight:600;">🔄 ${syncText}</div>
  `;"""

new_pager_block = """  let fullHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        ${pagerHtml}
    </div>
    <div onclick="window.refreshLiveSchedule(this)" style="font-size:10px; color:var(--tx3); text-align:right; margin-bottom:10px; cursor:pointer; font-weight:600;">🔄 ${syncText}</div>
    
    <div style="margin-bottom: 20px; border-radius: 8px; border: .5px solid var(--bd-info); background: var(--bg-info); padding: 15px; display: flex; align-items: center; gap: 15px;">
        <div style="font-size: 24px;">🎉</div>
        <div>
            <div style="font-size: 13px; font-weight: 700; color: var(--tx-info);">Q6 Term Begins Sept 24th</div>
            <div style="font-size: 11px; color: var(--tx-info); opacity: 0.85; margin-top: 2px;">Your daily schedule will commence on Thursday, September 24, 2026.</div>
        </div>
    </div>
  `;"""
content = content.replace(pager_block, new_pager_block)

# 2. Fix the Today Card border width (Container Tier: 12px, .5px solid)
target_cardStyle = "const cardStyle = isToday ? 'background:var(--bg2); border:1.5px solid var(--bd-info); box-shadow: 0 4px 12px rgba(0,0,0,0.05);' : 'background:var(--bg); border:.5px solid var(--bd); box-shadow: 0 2px 4px rgba(0,0,0,0.02);';"
new_cardStyle = "const cardStyle = isToday ? 'background:var(--bg2); border:.5px solid var(--bd-info); box-shadow: 0 4px 12px rgba(0,0,0,0.05);' : 'background:var(--bg); border:.5px solid var(--bd); box-shadow: 0 2px 4px rgba(0,0,0,0.02);';"
content = content.replace(target_cardStyle, new_cardStyle)

# 3. Fix Room Badge radius (Badge Tier: 6px, .5px solid)
target_room_badge = "border-radius:4px; border:.5px solid var(--bd-warn);"
new_room_badge = "border-radius:6px; border:.5px solid var(--bd-warn);"
content = content.replace(target_room_badge, new_room_badge)

with open('app.js', 'w') as f:
    f.write(content)
