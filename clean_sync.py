import re

with open('app.js', 'r') as f:
    content = f.read()

target = """  // Time Since Logic
  let syncText = "Synced just now";
  if (window.lastSyncedTime) {
      const seconds = Math.floor((now - window.lastSyncedTime) / 1000);
      if (seconds > 60) {
          let m = Math.floor(seconds/60);
          syncText = `Synced ${m}m ago`;
          if (m > 60) syncText = `Synced ${Math.floor(m/60)}h ago`;
      }
  }
  if (window._isOfflineFallback) {
      syncText = `Showing last synced data from ${syncText.replace('Synced ', '')} — you're offline`;
  }"""

content = content.replace(target, "")

with open('app.js', 'w') as f:
    f.write(content)
