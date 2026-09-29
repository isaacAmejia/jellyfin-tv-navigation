# Compatibility

## Current support policy

The current stable script targets **Jellyfin Web 12.1 Legacy/TV UI**.

Jellyfin 12 makes the Modern layout the default on desktop and mobile, while TV devices continue to use the legacy application. The stable r12.12 script should therefore be described as a Legacy/TV build rather than as universal Jellyfin 12 support.

| Environment | Status |
| --- | --- |
| Jellyfin Web 12.1 — Legacy desktop | Primary supported target |
| Jellyfin Web 12.1 — TV layout | Expected high compatibility; shares the legacy app |
| Jellyfin Web 12.1 — Modern desktop/mobile | Development target; not yet stable |
| GlassFin on Legacy | Tested |
| Stock theme on Legacy | Core selectors are native Jellyfin; expected to work, but not the primary hands-on test environment |
| SeerrFin absent | Supported; SeerrFin handlers remain inactive |
| Media Bar absent | Supported; Media Bar handlers remain inactive |
| Jellyfin Enhanced absent | Supported; Enhanced handlers remain inactive |

## Tested environment

The stable build was developed around a dedicated Raspberry Pi TV endpoint using Jellyfin Web in Chromium.

The primary environment included:

- Raspberry Pi 5
- Debian 13
- Chromium / Jellyfin Web
- Wayland / labwc
- Jellyfin 12.1-era Legacy/TV Web UI
- GlassFin
- Jellyfin Helper
- SeerrFin
- Custom Home Screen Sections
- Media Bar 3.0.0.0 during development

The script is not tied to HDMI-CEC itself. CEC power/control services on the Raspberry Pi are separate from this JavaScript navigation layer.

## Why much of r12.12 works on stock Legacy Jellyfin

The stable implementation intentionally relies on native Jellyfin structures for its core navigation. Jellyfin 12.1 still uses the relevant legacy structures for:

- Home rows and cards
- Item details
- Movies / TV library content
- Search
- Player OSD
- Native dialogs/action sheets
- Legacy navigation drawer

Important native structures used by the script include:

```text
#indexPage
#itemDetailPage
.mainDetailButtons
#similarCollapsible
.homeSectionsContainer
.itemsContainer
.card
.navMenuOption
#searchPage
#videoOsdPage
.videoOsdBottom
```

Third-party integrations are layered on top of that core behavior and generally no-op when their matching DOM is absent.

## Modern UI status

Modern support is the next development target.

Source review of Jellyfin Web 12.1 shows that Modern is not a completely separate implementation:

- Modern Home still loads Jellyfin's legacy Home controllers.
- Modern item Details is routed through the legacy `itemDetails` controller/view.
- Modern video playback combines a new MUI header with the legacy video OSD.
- Modern libraries use new React/MUI app and library toolbars while retaining native `.itemsContainer` content and Jellyfin cards.

That means the main Modern compatibility work is concentrated around:

1. App-toolbar navigation.
2. Modern library toolbar controls.
3. Modern permanent/mobile drawers.
4. MUI menus/popovers/dialogs.
5. Layout detection and context handoff.

The stable Legacy/TV implementation should not be replaced while this work is being developed. See [Modern UI Roadmap](MODERN_UI_ROADMAP.md).

## Supported UI areas in the stable build

The stable build contains dedicated handling for:

- Jellyfin Home
- Jellyfin Legacy header controls and tabs
- Native Movies / TV library pages
- Item details pages
- Search
- Jellyfin player OSD
- Jellyfin native dialogs/action sheets
- Legacy main navigation drawer
- SeerrFin discovery pages
- SeerrFin information/request popups
- The Jellyfin Enhanced UI elements used by the tested installation
- Media Bar controls

## Media Bar

This project integrates with **Media Bar**, not Media Bar Enhanced.

Manual Media Bar slide navigation uses the plugin's exposed `window.slideshowPure` interface. The navigation project does not implement its own Media Bar autoplay timer.

During development, Media Bar 3.0.0.0 on Jellyfin 12 exhibited an upstream autoplay initialization issue. The included patch removes the timer-nulling line that prevented the plugin's existing timer from being restarted. Keep that patch separate from the navigation script.

If a newer Media Bar release includes the upstream fix, use the official release instead of manually patching the DLL.

## Themes and plugins

The core Legacy navigation is based primarily on Jellyfin's own DOM. Theme and plugin updates can still alter geometry, visibility, timing, or add new competing controls.

Compatibility with untested themes/plugins is not guaranteed.

## Known design choices

- Nearby focus moves are immediate.
- A focus arrival animation is used only for large jumps (240 px or more).
- Only one custom focus ring is used; the stable design intentionally avoids cloned focus rectangles.
- Newly mounted pages and overlays are automatically re-evaluated so focus should not remain visible in an inactive background context.
- Media Bar autoplay remains owned by Media Bar itself.
