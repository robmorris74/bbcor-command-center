BBCOR CACHE-PROOF DEPLOYMENT

Upload/replace these files in the root of the GitHub repository:
- index.html
- app-v3.js
- firebase-config.js
- styles.css
- manifest.webmanifest
- icon.svg

IMPORTANT:
Delete the old sw.js from GitHub if it is still there.
You do NOT need app.js anymore; index.html now loads app-v3.js.

Then open:
https://robmorris74.github.io/bbcor-command-center/?v=3

This build bypasses the old cached app.js completely and will display the exact
Firebase profile/database error if login still cannot authorize the user.
