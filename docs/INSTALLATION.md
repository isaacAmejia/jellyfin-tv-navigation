# Installation

## Overview

The production file is:

```text
src/jellyfin-tv-navigation.js
```

It is designed to run in the Jellyfin Web page through a JavaScript injection mechanism. The exact injector can vary; the important requirement is that the script executes after Jellyfin Web is available and remains active across Jellyfin's single-page-app navigation.

## Recommended deployment

1. Open `src/jellyfin-tv-navigation.js`.
2. Copy the complete file without modifying or truncating it.
3. Add it to the JavaScript injection mechanism used by the Jellyfin Web installation.
4. Reload Jellyfin Web completely.
5. If the client is a dedicated Chromium kiosk/TV endpoint, restart the page or browser process so no previous injected build remains in memory.

Do not load multiple revisions of the navigation script at the same time. The script contains cleanup logic for a previous instance, but a single production copy is the intended configuration.

## Verification

Open the browser developer console and run:

```javascript
window.__JELLYFIN_TV_REMOTE__?.state?.()
```

The returned object should report the version:

```text
2026.09.29-r12.12-auto-context-focus
```

You can also inspect:

```javascript
window.__JELLYFIN_TV_REMOTE__?.version
```

## Basic functional test

After installation, verify these behaviors:

1. Home loads with a visible selection without requiring a mouse click.
2. D-pad navigation moves between Home cards and rows.
3. Opening an item details page causes focus to move to the new page automatically.
4. Opening a supported popup/dialog clears the background selection and places focus in the new UI automatically.
5. Closing the popup/dialog returns navigation to the underlying context.
6. Movies and TV libraries begin at the active top tab as designed.
7. SeerrFin pages and supported request dialogs can be navigated by D-pad.
8. Media Bar left/right navigation changes slides.
9. Long-press Enter/OK for about 900 ms refreshes the client.
10. Long-press Back/Escape for about 900 ms returns to Home.

## Troubleshooting

### A selection remains behind a new page or popup

First confirm that the installed script reports the final r12.12 build. Older revisions did not automatically claim every newly mounted UI context.

### D-pad does nothing after an update

Jellyfin, a theme, or a plugin may have changed the DOM selectors the script relies on. Check the browser console for errors and confirm that `window.__JELLYFIN_TV_REMOTE__` exists.

### Two focus rings or inconsistent movement

Confirm that only one copy of the script is being injected. Remove older injected revisions and perform a full client reload.

### Media Bar does not autoplay

That is separate from navigation. See the patch under `patches/media-bar-jellyfin12-autoplay-fix.patch` and the compatibility notes before applying it. Do not add autoplay workarounds to the navigation script.

## Updating

The final script is intended to remain stable. If a future Jellyfin/plugin update breaks navigation, preserve the current file as the known-good baseline and make the smallest compatibility change necessary.
