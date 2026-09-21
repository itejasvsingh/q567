import re

with open('index.html', 'r') as f:
    content = f.read()

# Reorder tabs
tabs_orig = """<div class="view-tabs">
  <button class="view-tab on" id="vtab-plan" onclick="switchView('plan')">📋 My Planner</button>
  <button class="view-tab" id="vtab-daily" onclick="switchView('daily')">📅 Daily Agenda</button>
  <button class="view-tab" id="vtab-master" onclick="switchView('master')">🗓️ Weekly Schedule</button>
  <button class="view-tab" id="vtab-att" onclick="switchView('att')">✅ Attendance</button>
  <button class="view-tab" id="vtab-compare" onclick="switchView('compare')">👥 Compare with Friends</button>
  <button class="view-tab" id="vtab-mess" onclick="switchView('mess')">🍽 Mess Menu</button>
</div>"""

tabs_new = """<div class="view-tabs">
  <button class="view-tab on" id="vtab-daily" onclick="switchView('daily')">📅 Daily Agenda</button>
  <button class="view-tab" id="vtab-plan" onclick="switchView('plan')">📋 My Planner</button>
  <button class="view-tab" id="vtab-master" onclick="switchView('master')">🗓️ Weekly Schedule</button>
  <button class="view-tab" id="vtab-att" onclick="switchView('att')">✅ Attendance</button>
  <button class="view-tab" id="vtab-compare" onclick="switchView('compare')">👥 Compare with Friends</button>
  <button class="view-tab" id="vtab-mess" onclick="switchView('mess')">🍽 Mess Menu</button>
</div>"""
content = content.replace(tabs_orig, tabs_new)

# Reorder views
views_orig = """<div id="view-plan"></div>
<div id="view-compare" style="display:none"></div>
<div id="view-mess" style="display:none"></div>
<div id="view-att" style="display:none"></div>
<div id="view-daily" style="display:none"></div>
<div id="view-master" style="display:none"></div>"""

views_new = """<div id="view-daily"></div>
<div id="view-plan" style="display:none"></div>
<div id="view-compare" style="display:none"></div>
<div id="view-mess" style="display:none"></div>
<div id="view-att" style="display:none"></div>
<div id="view-master" style="display:none"></div>"""
content = content.replace(views_orig, views_new)

with open('index.html', 'w') as f:
    f.write(content)
