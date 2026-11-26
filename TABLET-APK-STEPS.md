# Kingdom Life Study: Tablet APK (Galaxy Tab 4 and other old Android)

## What this is
A separate APK of the study app for old tablets (Android 4.4 and up).
GitHub Actions builds it from the live web app (kingdom-life-study), so
you never edit anything here when the app changes. Just rebuild.

- Everything is inside the APK: books, Strong's, topic studies, handouts,
  devotionals, and the full WEB Bible text. No internet needed.
- Your notes, highlights and installed books stay on the tablet between updates.
- App id is com.kingdomlifeministry.studytab, so it sits alongside the
  regular study app on phones without replacing it.

## One-time setup (on the PC, in PowerShell)
The build file lives in .github/workflows, and your Termux token cannot push
that folder (no workflow scope), so do this first push from the PC.

1. On github.com, create a new repository named `kingdom-life-tab`.
   Make it **Private** (the signing key is inside). Do not add a README.

2. Unzip kingdom-life-tab.zip into Downloads, then:

```powershell
cd $HOME\Downloads\kingdom-life-tab
git init -b main
git add .
git commit -m "Tablet APK for old Android"
git remote add origin https://github.com/michaelpeccia/kingdom-life-tab.git
git push -u origin main
```

3. The push starts the build. Open the repo > **Actions** tab and wait for the
   green check (about 5 minutes).

4. Open the repo's **Releases** (right side of the repo page) and download
   `KingdomLifeStudy-Tablet-1.N.apk`.

## Put it on the tablet
The tablet may not be able to open GitHub itself (same security certificate
problem that stops the web app), so download the APK on the PC or phone, then:

- USB: plug the tablet into the PC and copy the APK into its Download folder, or
- Bluetooth: send it from your phone to the tablet.

On the tablet:
1. Settings > Security > turn on **Unknown sources**.
2. Open the APK with the file manager and tap Install.

## Getting updates onto the tablet
- It rebuilds by itself every Sunday night with whatever is live on the web app.
- To rebuild right away: repo > Actions > **Build tablet APK** > **Run workflow**.
- Install the new APK over the old one. Do not uninstall first, or you lose
  notes and highlights.

## What works offline vs. needs internet
Offline: Library, Bible Study books, Read the Bible (tap Install once; it
installs from inside the app), Further Study, Prayers & Deliverance,
Testimonies, Devotionals, Armor of Elohim, Lexicon, search, notes,
highlights, bookmarks. Handout PDFs open in the tablet's PDF viewer
(install one if it says so).

Needs internet, may not work on Android 4.4: Kingdom Ask, Bible audio,
Midrash Topic Vote, YouTube, Facebook links. Old Android does not trust some
newer website security certificates, so these depend on the site.

## If the build fails
Open the red run in Actions, tap the failed step, and send me a screenshot
of the error.

## How it works (for later)
- `legacy/build.mjs` copies the live site and converts it for old WebViews:
  JavaScript down to ES5 with polyfills, CSS grid/gap/inset rewritten,
  and theme colors (Light/Sepia/Dark) and text size filled in at runtime by
  `legacy/runtime/vars.js`. Newer tablets automatically get the normal styles.
- `android/` is a small WebView app that serves the bundled files as
  https://app.kingdom-life-ministry.com, so storage and links behave like the site.
- To test the old-browser look on the PC, open the built site with `?legacy=1`.

## Pushing a fix (PC, PowerShell)
After files in this folder change, send them up and GitHub rebuilds the APK:

```powershell
cd $HOME\Downloads\kingdom-life-tab
git add .
git commit -m "Describe the fix here"
git push
```

Then wait for the green check in Actions, download the new APK from Releases,
and install it over the old one.

## Seeing errors on the tablet
- If something breaks, a red box at the bottom of the screen shows the error.
  Take a photo of it and send it to me.
- For more detail: plug the tablet into the PC by USB (USB debugging on),
  open Chrome on the PC, go to chrome://inspect, and click "inspect" under
  Kingdom Life Study to see its console.
