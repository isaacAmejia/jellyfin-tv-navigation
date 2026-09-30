# Jellyfin TV Remote and D-Pad Navigation with JellyNav

JellyNav is a Jellyfin Web enhancement for people who want to **control Jellyfin with a TV remote or D-pad** instead of a mouse. It is designed for living-room browser and webview setups, including **Jellyfin on a Raspberry Pi connected to a TV**.

## TV remote navigation for Jellyfin Web

JellyNav adds predictable focus and directional navigation across Jellyfin Web, including:

- Home and media libraries
- movie and series Details pages
- Search
- dialogs and popups
- subtitle, audio, and settings menus
- Jellyfin's media player

Enter / OK activates the current selection. Back / Escape follows remote-friendly navigation rules, while long-press actions provide Universal Home and refresh behavior.

## Raspberry Pi Jellyfin TV setups

JellyNav can be used with Jellyfin Web running in a browser or webview on a Raspberry Pi. It does not require a custom Jellyfin client; it enhances the Jellyfin Web interface that is already being rendered.

The specific physical remote can vary. JellyNav handles the navigation behavior once the remote or input layer produces the expected directional, select, and back events.

See the main [JellyNav installation instructions](../README.md#install).

## Optional integrations

JellyNav also recognizes several Jellyfin Web customizations, including JellyMark, SeerrFin, Media Bar, Jellyfin Enhanced, GlassFin, and Home Screen Sections.

For a personal Jellyfin Watchlist with optional cross-server synchronization, see [JellyMark](https://github.com/isaacAmejia/jellymark).

## Scope

JellyNav targets clients that actually render Jellyfin Web and can load the injected JavaScript. Native clients that do not render Jellyfin Web are outside its scope.
