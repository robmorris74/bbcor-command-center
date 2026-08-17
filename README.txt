BBCOR PROPERTY COMMAND CENTER - FINAL GITHUB DEPLOYMENT PACKAGE

This package is already configured for the Firebase project:
  BBCOR COMMAND CENTER
  Project ID: bbcor-command-cent

Firebase services already prepared:
- Email/Password Authentication
- Realtime Database
- BBCOR role-based Realtime Database security rules
- Initial Admin user profile

GITHUB PAGES DEPLOYMENT
Upload the CONTENTS of this folder to the root of a new GitHub repository.
Recommended repository name: bbcor-command-center

Required files at the repository root:
- index.html
- app.js
- styles.css
- firebase-config.js
- manifest.webmanifest
- icon.svg
- sw.js

Before login testing, add your GitHub Pages hostname to Firebase Authentication > Settings > Authorized domains.
For the current GitHub account this will normally be:
  robmorris74.github.io

Do not upload passwords, service-account keys, or private credentials to GitHub.
The Firebase web configuration in firebase-config.js is a public project identifier and is protected by Authentication + Database Rules.
