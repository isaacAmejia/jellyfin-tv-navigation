# Jellyfin TV Navigation

A custom TV-style D-pad navigation layer for Jellyfin Web, developed for a Raspberry Pi / Chromium living-room client.

> [!IMPORTANT]
> **AI disclosure:** This entire project was built using AI. All code and documentation in this repository were generated and iteratively developed with OpenAI ChatGPT under human direction, testing, and validation. See [AI Disclosure](docs/AI_DISCLOSURE.md) for details.

## What it does

Jellyfin TV Navigation adds remote-friendly spatial navigation and visible focus handling to Jellyfin Web without modifying Jellyfin's core source code.

The final build includes:

- D-pad navigation across Home rows and cards
- TV-style navigation for Jellyfin detail pages
- Automatic focus when pages, dialogs, drawers, and supported popups open
- Native Jellyfin library navigation for Movies and TV
- Header and tab navigation
- Search navigation with an on-screen keyboard
- Player/OSD navigation
- SeerrFin discovery and request-flow navigation
- Jellyfin Enhanced popup support used by this installation
- Media Bar navigation using the plugin's native `window.slideshowPure` API
- Long-press Enter/OK to refresh
- Long-press Back/Escape to return Home
- A single-ring focus system with a subtle arrival effect only for large focus jumps
- Automatic context tracking to prevent stale or "ghost" selections behind a newly opened page or popup

## Final version

The production script is:

```text
src/jellyfin-tv-navigation.js
```

Internal build identifier:

```text
2026.09.29-r12.12-auto-context-focus
```

This is the current stable build for the Legacy/TV interface described in [Compatibility](docs/COMPATIBILITY.md). Development continues, with Jellyfin 12 Modern UI support tracked separately in [Modern UI Roadmap](docs/MODERN_UI_ROADMAP.md).

## Repository layout

```text
.
├── src/
│   └── jellyfin-tv-navigation.js
├── patches/
│   └── media-bar-jellyfin12-autoplay-fix.patch
├── docs/
│   ├── AI_DISCLOSURE.md
│   ├── COMPATIBILITY.md
│   ├── INSTALLATION.md
│   └── MODERN_UI_ROADMAP.md
├── CHANGELOG.md
└── README.md
```

The older r12.x development builds are intentionally not kept in the working tree. They remain available through the repository's Git history.

## Installation

This script is intended to be loaded into Jellyfin Web through a JavaScript injection mechanism. See [Installation](docs/INSTALLATION.md) for the recommended deployment and verification process.

## Media Bar note

The navigation script integrates with **Media Bar** through its native `window.slideshowPure.nextSlide()` and `prevSlide()` functions.

A separate patch is included under `patches/` for the Media Bar 3.0.0.0 / Jellyfin 12 autoplay-timer issue encountered during development. That patch is independent of the TV navigation script and should only be used when the affected Media Bar build actually needs it.

## Scope

This is a personal/community customization, not an official Jellyfin client, Jellyfin plugin, or Jellyfin project. It was built and tested against one specific Jellyfin Web setup and may require changes for other themes, plugins, Jellyfin versions, or DOM layouts.

## Project status

**Active development.**

`main` contains the current stable Legacy/TV build. New compatibility work is developed separately and should not replace the stable script until it has been tested against the target Jellyfin layout.

Current priority: **Jellyfin 12 Modern UI support** while preserving the existing Legacy/TV behavior.

## License

No open-source license has been assigned to this repository. Unless the repository owner adds one, normal copyright rules apply.
