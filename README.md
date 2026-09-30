# JellyNav

**JellyNav adds TV remote and D-pad navigation to Jellyfin Web, including Raspberry Pi and other living-room browser or webview setups.** It makes Jellyfin easier to control from a couch by adding predictable focus, remote-friendly Back behavior, and player controls without replacing Jellyfin or requiring a custom client.

Trying to **control Jellyfin with a TV remote**, add **D-pad navigation**, or use **Jellyfin Web on a Raspberry Pi TV**? See [Jellyfin TV remote and D-pad navigation](docs/JELLYFIN_TV_REMOTE.md).

> **Part of JellyPi** — a larger collection of independent Jellyfin projects built around a smoother living-room experience. JellyNav works on its own and also integrates with other JellyPi projects such as [JellyMark](https://github.com/isaacAmejia/jellymark).

## What it does

- Navigate Jellyfin with a D-pad or TV remote
- Move through Home, libraries, Details, Search, dialogs, and the player
- Start Details on **Play / Resume**
- Navigate subtitle, audio, and settings popups in the player
- Short **Back / Escape** returns to the current section instead of unexpectedly jumping away
- Hold **Back / Escape** for about 900 ms to return Home
- Hold **Enter / OK** for about 900 ms to refresh Jellyfin
- Automatically follows Jellyfin's SPA page changes and restores focus
- Optimized to avoid rebuilding navigation state on every keypress

JellyNav is designed for **Jellyfin Web** running in a browser or webview, including dedicated TV endpoints such as a Raspberry Pi running Chromium.

## Install

JellyNav is a JavaScript frontend enhancement. The easiest way to load it is with [Jellyfin JavaScript Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector).

1. Install **JavaScript Injector** in Jellyfin.
2. Open **Dashboard → Plugins → JavaScript Injector**.
3. Add a new script named **JellyNav**.
4. Copy the full contents of [`src/jellyfin-tv-navigation.js`](src/jellyfin-tv-navigation.js).
5. Paste it into the JavaScript Code field, enable it, and save.
6. Reload Jellyfin Web.

For Jellyfin 12, the JavaScript Injector repository is:

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/12/manifest.json
```

The current stable release targets Jellyfin's **Legacy / TV** interface.

For a more detailed walkthrough, see [Installation](docs/INSTALLATION.md).

## Remote controls

| Remote action | JellyNav behavior |
| --- | --- |
| D-pad | Move between visible controls and media |
| Enter / OK | Activate the current selection |
| Back / Escape | Return to the parent area for the current section |
| Hold Enter / OK | Refresh Jellyfin |
| Hold Back / Escape | Universal Home |

When focus is already on a top-level tab such as **Home**, **Movies**, **Shows**, or **Requests**, a short Back press does nothing. This prevents accidental navigation away from the section you are already using.

## Optional integrations

JellyNav does **not** require these projects, but it knows how to work with them when installed.

| Project | Integration |
| --- | --- |
| [JellyMark](https://github.com/isaacAmejia/jellymark) | Full TV navigation for the Watchlist UI, including Watchlist tabs, filters, Series Progress, history, statistics, and dialogs |
| [SeerrFin](https://github.com/varunaditya-plus/SeerrFin) | Discovery tabs, media rows, provider/network grids, requests, Back, and Load More |
| [Media Bar](https://github.com/IAmParadox27/jellyfin-plugin-media-bar) | Remote navigation for the Home Media Bar and slideshow controls |
| [Jellyfin Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced) | Supported request/info UI and Enhanced pause-screen handling |
| [GlassFin](https://github.com/KBH-Reeper/GlassFin) | Tested theme; not required |
| [Home Screen Sections](https://github.com/IAmParadox27/jellyfin-plugin-home-sections) | Tested alongside JellyNav; not required |

### JellyMark

JellyMark is a **separate project**. Neither project depends on the other.

If both are installed, JellyNav automatically recognizes JellyMark's Watchlist interface and provides TV navigation for it. JellyMark remains responsible for its own Watchlist data and optional sync service; JellyNav only handles navigation.

## Current release

```text
2026.09.30-r12.19-jellymark-compatibility
```

The stable `main` branch targets Jellyfin 12.1-era **Legacy / TV** UI. Modern UI work remains separate until it is ready for the same level of hands-on testing.

You can verify the loaded version in the browser console:

```javascript
window.__JELLYFIN_TV_REMOTE__?.version
```

For diagnostics:

```javascript
window.__JELLYFIN_TV_REMOTE__?.state?.()
```

## Updating

Open your existing **JellyNav** JavaScript Injector entry, replace its contents with the newest [`src/jellyfin-tv-navigation.js`](src/jellyfin-tv-navigation.js), save, and reload Jellyfin Web.

Keep only **one enabled copy** of JellyNav.

## Compatibility

JellyNav currently targets clients that actually render Jellyfin Web. Native clients that do not run injected Jellyfin Web JavaScript are outside the scope of this project.

See [Compatibility](docs/COMPATIBILITY.md) for the full matrix and [Modern UI Roadmap](docs/MODERN_UI_ROADMAP.md) for future layout work.

## Troubleshooting

If JellyNav does not load:

- confirm JavaScript Injector is enabled
- confirm the complete script was pasted
- make sure only one JellyNav/navigation script is enabled
- fully reload the Web client
- confirm the client is using the supported Legacy / TV layout

If a page or popup navigates incorrectly, open an issue in this repository with the Jellyfin version, page involved, optional UI plugins/themes installed, and what the remote did versus what you expected.

## JellyPi

JellyNav is one part of **JellyPi**, a broader set of independent Jellyfin tools aimed at making a self-hosted TV setup feel more cohesive.

The projects are intentionally modular: install only the parts you want. JellyNav focuses on **TV navigation**; projects such as JellyMark solve different problems and simply cooperate when installed together.

## Project status

**Active development.**

- `main`: stable Legacy / TV build
- `develop/modern-ui`: Modern UI development
- older revisions remain available in Git history

JellyNav is a community customization and is not affiliated with or endorsed by Jellyfin or the third-party projects listed above.

## AI disclosure

JellyNav was developed with OpenAI ChatGPT generating and revising code and documentation under human direction and hands-on testing. See [AI Disclosure](docs/AI_DISCLOSURE.md).

## License

No open-source license has currently been assigned to this repository. Unless a license is added, normal copyright rules apply.
