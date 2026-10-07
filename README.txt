BBCOR COMMAND CENTER — CURRENT DEPLOYMENT

Live site:
https://robmorris74.github.io/bbcor-command-center/

GitHub Pages publishes main / root. All five entrypoints (index.html,
properties.html, expenses.html, buyers.html, rentals.html) load app-v4.js.
Keep their supporting files together:
- app-v4.js, styles.css, firebase-config.js
- buyers.js, buyer-core.js, expenses.js, rentals.js, rental-core.js
- manifest.webmanifest, icon.svg
- data/buyer-prospects.json, data/buyer-discovery.json

CACHE RETIREMENT
There is no active service worker or offline app-shell cache. Do not restore
sw.js, app.js, or app-v3.js. The entrypoints retain worker unregistration and
Cache Storage cleanup to migrate returning browsers. The manifest and iPhone
Home Screen presentation remain; an internet connection is required.

Deleting the worker does not itself remove a worker already installed in a
browser. If an old cached page persists, close all BBCOR tabs/Home Screen app
windows, clear this site's browser data, then reopen the live URL and sign in.
A version query string alone does not guarantee a fresh page. Normal browser
and GitHub Pages HTTP caching still applies; this is not a cache-proof build.

UPDATES AND CHECKS
Keep the existing Firebase configuration and rules. Do not create a replacement
Firebase project for an update. Run these checks before publishing:
  node --test tests/*.test.cjs
  python -m unittest discover -s tests -p 'test_*.py'

The deployment-contract workflow checks pushes and pull requests. After a main
update, wait for the GitHub Pages build and deployment to succeed; confirm each
workspace loads app-v4.js and authentication works with an existing account.
Buyer research remains subject to review and the strict outbound-contact hold.
See DEPLOYMENT_GUIDE.txt for setup, migration and deployment details, and
BUYER_PIPELINE.md for the source refresh workflow.
