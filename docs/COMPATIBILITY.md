# Compatibility

## Tested environment

This project was developed around a dedicated Raspberry Pi TV endpoint using Jellyfin Web in Chromium.

The final environment included:

- Raspberry Pi 5
- Debian 13
- Chromium / Jellyfin Web
- Wayland / labwc
- Jellyfin 12-era Web UI
- GlassFin
- Jellyfin Helper
- SeerrFin
- Custom Home Screen Sections
- Media Bar 3.0.0.0 during development

The script is not tied to HDMI-CEC itself. CEC power/control services on the Raspberry Pi are separate from this JavaScript navigation layer.

## Supported UI areas in the final build

The final build contains dedicated handling for:

- Jellyfin Home
- Jellyfin header controls and tabs
- Native Movies / TV library pages
- Item details pages
- Search
- Jellyfin player OSD
- Jellyfin native dialogs/action sheets
- Main navigation drawer
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

The script contains selectors for the exact UI structures encountered during development. A Jellyfin update, theme update, or plugin update can rename or restructure those elements.

Compatibility with untested themes/plugins is not guaranteed.

## Known design choices

- Nearby focus moves are immediate.
- A focus arrival animation is used only for large jumps (240 px or more).
- Only one custom focus ring is used; the final design intentionally avoids cloned focus rectangles.
- Newly mounted pages and overlays are automatically re-evaluated so focus should not remain visible in an inactive background context.
- Media Bar autoplay remains owned by Media Bar itself.
