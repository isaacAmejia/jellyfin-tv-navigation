# Installation

This guide installs the stable Jellyfin TV Navigation script into **Jellyfin 12** using **JavaScript Injector**.

## Before you start

You need:

- Jellyfin 12.1-era Web UI
- A browser/webview client that runs Jellyfin Web
- The stable **Legacy / TV** interface
- **JavaScript Injector** by n00bcodr

You do **not** need SeerrFin, Media Bar, Jellyfin Enhanced, GlassFin, Jellyfin Helper, File Transformation, or Home Screen Sections unless you separately want those features.

## 1. Install JavaScript Injector

JavaScript Injector is the required loader for this project.

Repository:

[https://github.com/n00bcodr/Jellyfin-JavaScript-Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector)

For Jellyfin 12, add this plugin repository:

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/12/manifest.json
```

In Jellyfin:

1. Open **Dashboard → Plugins → Repositories**.
2. Add a repository such as **JavaScript Injector**.
3. Paste the Jellyfin 12 repository URL above.
4. Save.
5. Open **Catalog**.
6. Find **JavaScript Injector** and install it.
7. **Restart the Jellyfin server.**

## 2. Add Jellyfin TV Navigation

1. Open **Dashboard → Plugins → JavaScript Injector**.
   - Depending on the installed version, it may also appear as **JS Injector** in the dashboard sidebar.
2. Click **Add Script**.
3. Set the name to:

```text
Jellyfin TV Navigation
```

4. Open the production source file:

[`src/jellyfin-tv-navigation.js`](../src/jellyfin-tv-navigation.js)

5. Copy the **entire file** into JavaScript Injector's **JavaScript Code** field.
6. Make sure the entry is **Enabled**.
7. Save.

Do not wrap the source in another `<script>` tag and do not run multiple copies of Jellyfin TV Navigation at the same time.

## 3. Use the stable Jellyfin layout

The current stable release targets Jellyfin's **Legacy / TV** interface.

On the Web client that will use the navigation script, select **Legacy** as the Jellyfin display mode.

Modern UI support is still under development and should not be treated as stable yet.

## 4. Reload the client

After saving the script:

1. Fully refresh Jellyfin Web.
2. For a dedicated Chromium/kiosk endpoint, restart the page or browser process.
3. The navigation layer should claim focus automatically without needing the first mouse click.

## Verify the installation

Open the browser developer console and run:

```javascript
window.__JELLYFIN_TV_REMOTE__?.version
```

The stable build should report:

```text
2026.09.30-r12.12.1-home-seerr-maintenance
```

For more diagnostic information:

```javascript
window.__JELLYFIN_TV_REMOTE__?.state?.()
```

If either expression returns `undefined`, JavaScript Injector is not currently loading the script into that Web client.

## Basic remote test

After installation, confirm:

1. **Home** starts with a visible selection.
2. If Media Bar is installed, initial Home focus lands on **Media Bar Play**.
3. D-pad navigation moves through Home rows and cards.
4. **Up** can reach the Jellyfin/SeerrFin header tabs where supported.
5. Movies and TV library pages can be navigated without a mouse.
6. Opening Details places initial focus on **Play / Resume**.
7. Dialogs and supported plugin popups take focus automatically.
8. SeerrFin provider/network grids start on the first item and can reach **Back** and **Load More**.
9. Player/OSD controls respond to the D-pad.
10. Holding **Enter / OK** for about 900 ms refreshes the page.
11. Holding **Back / Escape** for about 900 ms returns to Home.

## Optional integrations

### SeerrFin

No additional navigation configuration is required.

If SeerrFin is installed, Jellyfin TV Navigation detects supported SeerrFin UI automatically, including:

- Movies / TV Shows / Requests tabs
- discovery rows
- provider/network grids
- item cards
- request/info popups
- grid Back
- Load More

Project: [varunaditya-plus/SeerrFin](https://github.com/varunaditya-plus/SeerrFin)

### Media Bar

Media Bar is optional.

When present, Jellyfin TV Navigation detects it automatically and uses the plugin's native slideshow API for manual previous/next navigation.

Project: [IAmParadox27/jellyfin-plugin-media-bar](https://github.com/IAmParadox27/jellyfin-plugin-media-bar)

The patch in `patches/media-bar-jellyfin12-autoplay-fix.patch` is only for the separate autoplay issue seen with an affected Media Bar build. **Do not apply it just to install Jellyfin TV Navigation.**

### Jellyfin Enhanced

Jellyfin Enhanced is optional. Supported popup/request elements are detected when present.

Project: [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced)

### Themes and Home Screen plugins

GlassFin and Home Screen Sections were part of the original test setup, but neither is required for the navigation script.

## Updating

To update Jellyfin TV Navigation:

1. Open the existing **Jellyfin TV Navigation** entry in JavaScript Injector.
2. Replace its contents with the complete current `src/jellyfin-tv-navigation.js` file.
3. Save.
4. Fully refresh/restart the Web client.
5. Run:

```javascript
window.__JELLYFIN_TV_REMOTE__?.version
```

Do not create a second enabled entry for a newer release. Replace the existing script.

## Removing

To remove Jellyfin TV Navigation:

1. Disable or delete the **Jellyfin TV Navigation** entry in JavaScript Injector.
2. Refresh the client.

Removing the navigation entry does not require uninstalling JavaScript Injector if you use it for other scripts.

## Troubleshooting

### `window.__JELLYFIN_TV_REMOTE__` is undefined

Check:

- JavaScript Injector is installed.
- Jellyfin was restarted after installing JavaScript Injector.
- The Jellyfin TV Navigation script entry is enabled.
- The complete source file was pasted without truncation.
- The client was fully refreshed after saving.

### Navigation loads but does not match the page

The stable build is for **Legacy / TV**. Confirm the client is not using Jellyfin's Modern UI.

### Home loads with no selection

First confirm the current version reports:

```text
2026.09.30-r12.12.1-home-seerr-maintenance
```

This maintenance build specifically adds Home startup focus settling.

### Details starts on Back instead of Play / Resume

Confirm the same r12.12.1 build is loaded. It explicitly prioritizes Jellyfin's visible Play/Resume control when a Details page opens.

### A selection remains behind a popup

Confirm only one copy of Jellyfin TV Navigation is enabled. The stable build re-evaluates the active context when new overlays mount.

### Two focus rings or inconsistent movement

This usually means more than one navigation script revision is being injected. Keep only one enabled **Jellyfin TV Navigation** entry.

### SeerrFin provider/network page does not navigate

Confirm the stable r12.12.1 build is installed. These full-grid pages were added in the maintenance release.

### Media Bar does not autoplay

Media Bar autoplay is not controlled by Jellyfin TV Navigation. See the separate compatibility patch and [Compatibility](COMPATIBILITY.md#media-bar).

## Security note

JavaScript Injector executes custom JavaScript inside Jellyfin Web. Only install scripts you trust and review changes before replacing your known-good build.
