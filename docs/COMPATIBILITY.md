# Compatibility

## At a glance

| Component | Status | Notes |
| --- | --- | --- |
| Jellyfin Web 12.1 — Legacy | **Supported** | Primary stable target |
| Jellyfin Web 12.1 — TV layout | **Supported target** | Shares the Legacy application model |
| Jellyfin Web 12.1 — Modern | **In development** | Work continues on `develop/modern-ui` |
| Chromium / browser kiosk | **Supported target** | Original deployment model |
| Native non-Web clients | **Not supported** | Injected JavaScript must actually run in Jellyfin Web |
| JavaScript Injector | **Required** | Loads this project into Jellyfin Web |
| SeerrFin | Optional integration | Supported when installed |
| Media Bar | Optional integration | Supported when installed |
| Jellyfin Enhanced | Optional integration | Supported popup/request elements |
| GlassFin | Optional | Tested, not required |
| Home Screen Sections | Optional | Tested, not required |
| JellyMark | Optional integration | TV navigation for the independent JellyMark Watchlist UI |

## Required dependency

### JavaScript Injector

JellyNav is distributed as frontend JavaScript rather than a Jellyfin DLL, so it needs a loader.

The supported installation method is:

[n00bcodr/Jellyfin-JavaScript-Injector](https://github.com/n00bcodr/Jellyfin-JavaScript-Injector)

For Jellyfin 12:

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/12/manifest.json
```

No other third-party plugin is required for core navigation.

## Stable UI support

The current stable build is:

```text
2026.09.30-r12.19-jellymark-compatibility
```

It targets Jellyfin 12.1-era **Legacy / TV UI**.

Dedicated handling exists for:

- Home
- Media Bar when installed
- Legacy header and tabs
- main navigation drawer
- Movies / TV libraries
- item Details
- Search
- player OSD
- Jellyfin dialogs/action sheets
- SeerrFin discovery and request UI
- SeerrFin provider/network full-grid pages
- supported Jellyfin Enhanced popup/request UI

## Modern UI

Modern is not currently part of the stable release.

Jellyfin 12's Modern application reuses some Legacy surfaces but replaces important navigation areas with React/MUI components. Development is isolated on `develop/modern-ui` so changes cannot regress the stable Legacy/TV build.

See [Modern UI Roadmap](MODERN_UI_ROADMAP.md).

## Optional integrations

### SeerrFin

Supported automatically when present:

- top discovery tabs
- Movie/TV discovery rows
- Requests UI
- info/request popups
- provider/network grids
- first-item grid entry
- grid Back
- Load More

Project: [varunaditya-plus/SeerrFin](https://github.com/varunaditya-plus/SeerrFin)

### Media Bar

This project supports **Media Bar**, not Media Bar Enhanced.

When Media Bar is installed:

- Home startup prefers Media Bar Play
- remote left/right slide changes use Media Bar's `window.slideshowPure` API
- Media Bar retains ownership of its autoplay lifecycle

Project: [IAmParadox27/jellyfin-plugin-media-bar](https://github.com/IAmParadox27/jellyfin-plugin-media-bar)

The included Media Bar patch is a separate compatibility fix for an upstream autoplay issue encountered with Media Bar 3.0.0.0 on Jellyfin 12. It is **not a dependency**.

### Jellyfin Enhanced

Supported request/info UI is detected when Jellyfin Enhanced is present. Jellyfin Enhanced itself is not required.

Project: [n00bcodr/Jellyfin-Enhanced](https://github.com/n00bcodr/Jellyfin-Enhanced)

### JellyMark

[JellyMark](https://github.com/isaacAmejia/jellymark) is a separate JellyPi project. Neither project requires the other. When both are installed, JellyNav automatically recognizes JellyMark's Watchlist interface, including its tabs, filters, Series Progress, history, statistics, and dialogs.

### Themes

The stable build was tested with GlassFin, but core navigation primarily targets Jellyfin's own DOM structures.

Themes can still change geometry, visibility, or timing enough to expose compatibility issues.

## Original test environment

The project was developed primarily with:

- Raspberry Pi 5
- Debian 13
- Chromium / Jellyfin Web
- Wayland / labwc
- Jellyfin 12.1-era Legacy/TV Web UI
- JavaScript Injector
- GlassFin
- SeerrFin
- Media Bar
- Jellyfin Enhanced / related UI integrations during development
- Custom Home Screen Sections

Those components describe the test environment, not the dependency list.

The script does **not** depend on HDMI-CEC. CEC power/control services are separate from this JavaScript navigation layer.

## Design notes

- Nearby focus moves are immediate.
- Large jumps can use a short single-ring arrival animation.
- Background pages should not retain a visible "ghost" focus when a higher-priority context opens.
- Home uses a temporary fallback focus while waiting for Media Bar, then prefers Media Bar Play if it mounts before the user starts navigating.
- Optional integration selectors are designed to remain inactive when their corresponding plugin is absent.
