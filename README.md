# Jellyfin TV Navigation

<p align="center">
  <strong>Remote-first D-pad navigation for Jellyfin Web</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Jellyfin-12.1-AA5CC3?logo=jellyfin&logoColor=white" alt="Jellyfin 12.1">
  <img src="https://img.shields.io/badge/Stable%20UI-Legacy%20%2F%20TV-00A4DC" alt="Legacy / TV UI">
  <img src="https://img.shields.io/badge/Status-Active%20Development-2ea44f" alt="Active development">
</p>

Jellyfin TV Navigation adds a TV-style focus system and D-pad navigation layer to **Jellyfin Web**. It is designed for living-room clients such as a Raspberry Pi or other Chromium-based TV endpoint where Jellyfin Web is controlled with a remote instead of a mouse.

> [!NOTE]
> This repository is a JavaScript frontend extension, not a standalone Jellyfin DLL plugin. The stable build is loaded through **JavaScript Injector**.

## Features

- Remote/D-pad navigation across Home, Movies, Shows, Search, Details, dialogs, and the player OSD
- Automatic focus when pages and supported popups open
- Home startup focus on **Media Bar Play** when Media Bar is installed
- TV-style grid navigation for native Movies/TV libraries
- SeerrFin discovery, provider/network grids, request flows, Back, tabs, and Load More
- Header, tabs, drawer, and on-screen search keyboard navigation
- Top-level tab Back protection: short Back/Escape stays within the current main section
- Parent-aware Back behavior from sub-areas and Details
- Long-press **Enter / OK** to refresh
- Long-press **Back / Escape** to return Home
- Single visible focus ring with a subtle animation only for large jumps
- Automatic context tracking to prevent stale or "ghost" selections

## Requirements

### Required

| Component | Requirement |
| --- | --- |
| **Jellyfin** | Jellyfin 12.1-era Web UI; stable support targets **Legacy / TV** layout |
| **Web-based client** | A client that actually renders Jellyfin Web, such as Chromium or a browser-based kiosk |
| **JavaScript Injector** | Required to load the navigation script into Jellyfin Web |

Install **JavaScript Injector** from:

- Repository: [n00bcodr/Jellyfin-JavaScript-Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector)
- Jellyfin 12 repository URL:

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/12/manifest.json
```

> [!IMPORTANT]
> The stable build currently targets Jellyfin's **Legacy / TV interface**. Modern UI support is being developed separately on `develop/modern-ui`.

### Optional integrations

These are **not required** for the core navigation layer.

| Integration | What this project supports |
| --- | --- |
| [SeerrFin](https://github.com/varunaditya-plus/SeerrFin) | Discovery tabs, cards, provider/network grids, request dialogs |
| [Media Bar](https://github.com/IAmParadox27/jellyfin-plugin-media-bar) | Home Media Bar controls and slide navigation |
| [Jellyfin Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced) | Supported Enhanced popup/request UI |
| [GlassFin](https://github.com/KBH-Reeper/GlassFin) | Tested theme; not required |
| [Home Screen Sections](https://github.com/IAmParadox27/jellyfin-plugin-home-sections) | Tested alongside the navigation layer; not required |

A separate companion integration for richer cross-instance media/request workflows is under development and will be documented when it is ready for public release.

**Jellyfin Helper, File Transformation, and other UI plugins are not required by Jellyfin TV Navigation itself.**

## Quick Start

1. In Jellyfin, open **Dashboard → Plugins → Repositories**.
2. Add the JavaScript Injector repository shown above.
3. Open **Catalog**, install **JavaScript Injector**, then restart Jellyfin.
4. Open **Dashboard → Plugins → JavaScript Injector** (or **JS Injector** in the sidebar).
5. Click **Add Script**.
6. Name it something like **Jellyfin TV Navigation**.
7. Copy the complete contents of [`src/jellyfin-tv-navigation.js`](src/jellyfin-tv-navigation.js) into the JavaScript Code field.
8. Enable the script and save.
9. Refresh/restart the Web client.
10. For the stable build, use Jellyfin's **Legacy** display mode.

Full instructions and verification steps are in [Installation](docs/INSTALLATION.md).

## Current Stable Build

Production file:

```text
src/jellyfin-tv-navigation.js
```

Build:

```text
2026.09.30-r12.18.1
```

The `main` branch is the known-good **Legacy / TV** release. Modern UI work stays on `develop/modern-ui` until it is ready to merge.

See:

- [Installation](docs/INSTALLATION.md)
- [Compatibility](docs/COMPATIBILITY.md)
- [Modern UI Roadmap](docs/MODERN_UI_ROADMAP.md)
- [Changelog](CHANGELOG.md)

## How navigation is organized

The script automatically detects the active Jellyfin surface and hands control to the appropriate navigation context.

```text
Jellyfin TV Navigation
├── Home + Media Bar
├── Header / tabs / drawer
├── Downloaded Movies + Shows libraries
├── Item details
├── Search + TV keyboard
├── Player / OSD + audio/subtitle/settings sheets
├── Native dialogs
├── SeerrFin
└── Optional supported plugin UI
```

You do not need to configure individual selectors or page mappings after installation.

## Client support

The script runs inside **Jellyfin Web**. It is intended for browser/webview clients where injected JavaScript executes.

Native clients that do not render Jellyfin Web are outside the scope of this project.

The original test environment is a Raspberry Pi 5 running Chromium, but the code is not Raspberry-Pi-specific and does not depend on HDMI-CEC.

## Media Bar

This project integrates with **Media Bar**, not Media Bar Enhanced.

Manual slide navigation uses Media Bar's own `window.slideshowPure.nextSlide()` and `prevSlide()` API.

A separate compatibility patch is included at:

```text
patches/media-bar-jellyfin12-autoplay-fix.patch
```

That patch is **not required for TV navigation**. It only addresses the Media Bar 3.0.0.0 / Jellyfin 12 autoplay issue encountered during development. If Media Bar has incorporated the upstream fix, use the official plugin release instead.

## Updating

When updating the script:

1. Replace the existing JavaScript Injector entry with the complete new contents of `src/jellyfin-tv-navigation.js`.
2. Keep only one enabled copy of Jellyfin TV Navigation.
3. Save the injector configuration.
4. Fully refresh or restart the Web client.
5. Verify the loaded version with:

```javascript
window.__JELLYFIN_TV_REMOTE__?.version
```

## Troubleshooting

If navigation does not appear:

- Confirm **JavaScript Injector** is installed, enabled, and Jellyfin was restarted after installation.
- Confirm the Jellyfin TV Navigation entry in JS Injector is enabled.
- Confirm the stable client is using the **Legacy / TV** UI.
- Make sure an old copy of the script is not also enabled.
- Open the browser console and run:

```javascript
window.__JELLYFIN_TV_REMOTE__?.state?.()
```

See [Installation → Troubleshooting](docs/INSTALLATION.md#troubleshooting) for more.

## Support and bug reports

If you find a navigation problem, open a [GitHub issue](https://github.com/isaacAmejia/jellyfin-tv-navigation/issues) and include:

- the Jellyfin version
- Legacy/TV or Modern UI
- the page where navigation failed
- which optional UI plugins/themes are installed
- what the D-pad did versus what you expected
- a screenshot or browser-console output when useful

For regressions, also include the value returned by:

```javascript
window.__JELLYFIN_TV_REMOTE__?.version
```

## Project status

**Active development.**

- `main`: stable Legacy / TV build
- `develop/modern-ui`: Modern UI development
- Older development revisions remain available through Git history

This is a community customization and is not affiliated with or endorsed by the Jellyfin project or the developers of the third-party integrations listed above.

## AI disclosure

This project was developed with OpenAI ChatGPT generating and revising the code and documentation under human direction and hands-on testing. See [AI Disclosure](docs/AI_DISCLOSURE.md) for the development history and limitations.

## License

No open-source license has currently been assigned to this repository. Unless a license is added, normal copyright rules apply.
