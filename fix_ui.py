import re

with open('app.js', 'r') as f:
    content = f.read()

# 1. Change default view
content = content.replace("let currentView='plan';", "let currentView='daily';")

# 2. Remove sync button
# The HTML is: `<div onclick="window.refreshLiveSchedule(this)" style="font-size:10px; color:var(--tx3); text-align:right; margin-bottom:10px; cursor:pointer; font-weight:600; padding:6px;">🔄 ${syncText}</div>`
sync_btn = '<div onclick="window.refreshLiveSchedule(this)" style="font-size:10px; color:var(--tx3); text-align:right; margin-bottom:10px; cursor:pointer; font-weight:600; padding:6px;">🔄 ${syncText}</div>'
content = content.replace(sync_btn, "")

# 3. Increase border/margin for day cards
# The HTML is: `<div id="card-${dateString.replace(/\s/g, '-')}" data-is-today="${isToday ? 'true' : 'false'}" style="border-radius:12px; padding:14px; margin-bottom:14px; scroll-margin-top: 80px; ${cardStyle}">`
# I should change margin-bottom to 30px, and change cardStyle border from .5px to 1px.
target_card_style = "const cardStyle = isToday ? 'background:var(--bg2); border:.5px solid var(--bd-info); box-shadow: 0 4px 12px rgba(0,0,0,0.05);' : 'background:var(--bg); border:.5px solid var(--bd); box-shadow: 0 2px 4px rgba(0,0,0,0.02);';"
new_card_style = "const cardStyle = isToday ? 'background:var(--bg2); border:1px solid var(--bd-info); box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-bottom: 30px;' : 'background:var(--bg); border:1px solid var(--bd2); box-shadow: 0 4px 10px rgba(0,0,0,0.04); margin-bottom: 30px;';"
content = content.replace(target_card_style, new_card_style)

# The HTML string also has margin-bottom:14px which we can remove because we added it to cardStyle
target_div = """<div id="card-${dateString.replace(/\\s/g, '-')}" data-is-today="${isToday ? 'true' : 'false'}" style="border-radius:12px; padding:14px; margin-bottom:14px; scroll-margin-top: 80px; ${cardStyle}">"""
new_div = """<div id="card-${dateString.replace(/\\s/g, '-')}" data-is-today="${isToday ? 'true' : 'false'}" style="border-radius:12px; padding:14px; scroll-margin-top: 80px; ${cardStyle}">"""
content = content.replace(target_div, new_div)

with open('app.js', 'w') as f:
    f.write(content)
