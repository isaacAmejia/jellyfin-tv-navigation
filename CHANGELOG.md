# Changelog

## Release — r12.18.1

Internal version: `2026.09.30-r12.18.1`

Major Legacy/TV navigation and performance release.

- Promotes the optimized staging navigation architecture to `main`.
- Short Back/Escape is now parent-aware:
  - top-level Home / Movies / Shows / Requests tabs do nothing on short Back
  - sub-areas return to their owning main tab or parent area
  - downloaded Movies and Shows libraries are treated as Home subsections and return Home
  - Details opened from a main section restore that section instead of relying on stale browser history
- Main-tab focus now resolves from the actually active Jellyfin tab before falling back to remembered ancestry, preventing stale selection highlights after switching between tabs.
- Long-press behavior remains unchanged:
  - hold Enter / OK for 900 ms to refresh
  - hold Back / Escape for 900 ms for Universal Home
- Player behavior includes:
  - hidden-OSD Enter pause/resume behavior
  - player ActionSheet navigation for subtitles, audio, and settings
  - Jellyfin Enhanced pause-screen recovery
  - startup shielding so the previous page is not exposed while the player mounts
- Details now prefer visible Play / Resume on entry and restore that selection after returning from playback.
- Universal Home was hardened for late SPA mounts and same-route plugin states.
- Native downloaded-library navigation, SeerrFin grids, Home, Details, player controls, dialogs, and headers received broad performance optimization.
- Repeated layout work was reduced by caching element geometry during visual sorting.
- Duplicate DOM scans and header/card rebuilds were removed where possible.
- Native-library navigation models now rebuild only when their DOM changes instead of on every D-pad press.
- The public build intentionally excludes unreleased companion-integration code. A separate companion integration is planned and will be documented when ready.

## Maintenance — r12.12.2

Internal version: `2026.09.30-r12.12.2-seerr-grid-navigation`

Legacy/TV SeerrFin grid correction.

- SeerrFin provider/network browse grids now start on the **first real card** once asynchronous card loading completes instead of preserving the temporary Back selection from the empty grid shell.
- D-pad movement in these grids now scrolls the **actual Jellyfin page** to keep the selected card and Load More button visible.
- Moving back to grid/header chrome scrolls the page back to the top.
- Universal Home (hold Back/Escape) now closes an active same-page SeerrFin grid through SeerrFin's own Back control before continuing the normal Home action.
- This maintenance pass was applied to the stable Legacy/TV branch only; Modern UI development remains separate.

## Maintenance — r12.12.1

Internal version: `2026.09.30-r12.12.1-home-seerr-maintenance`

Stable maintenance update on top of the accepted r12.12 architecture.

- Home now prefers Media Bar **Play** as its startup/return selection and retries while Media Bar mounts.
- Home keeps a temporary visible fallback selection instead of loading with no focus.
- A real D-pad input cancels the Home startup retry so late plugin rendering cannot steal focus.
- SeerrFin full-grid/provider pages now automatically claim the first poster and include the grid Back button, top tabs, all loaded cards, and Load More in D-pad navigation.
- Details explicitly prefer Jellyfin's visible `.mainDetailButtons .btnPlay` Play/Resume control on entry.
- The same fixes were carried to the Modern development branch.

## Final — r12.12

Internal version: `2026.09.29-r12.12-auto-context-focus`

Final accepted build.

Highlights:

- Automatically re-resolves navigation context when Jellyfin mounts new UI.
- Prevents stale/ghost focus from remaining visible behind newly opened overlays.
- Native Jellyfin dialogs now claim navigation focus automatically.
- Restores the underlying context when supported overlays close.
- Preserves the single-ring far-jump focus animation from r12.11.
- Preserves native Media Bar `window.slideshowPure` integration.

## r12.11

- Replaced multi-layer focus handoff effects with one real focus ring.
- Large jumps use a short opacity/glow arrival.
- Nearby navigation remains immediate.
- Removed cloned/scaled focus rectangles that could fight Jellyfin scrolling/layout.

## r12.10

- Limited the stronger focus effect to far-distance navigation.
- Superseded by the simpler r12.11 focus architecture.

## r12.9

- Experimented with a stronger focus pop/overshoot.
- Rejected because applying the effect too broadly made ordinary navigation feel busy.

## r12.8

- Removed obsolete Media Bar Enhanced assumptions.
- Integrated with the actual Media Bar plugin through `window.slideshowPure`.
- Preserved fixes for late Home rows and native library initial focus.

## r12.7

- Experimented with source/destination focus handoff animation.
- Later replaced by the single-ring design.

## r12.6

- Improved Home row settling after Media Bar navigation.
- Improved initial Movies/TV library focus.
- Included an earlier focus-transition experiment.

## r12.5 and earlier

Development builds that established the core navigation model, detail-page behavior, SeerrFin handling, native library navigation, player controls, and long-press remote actions.

Older source revisions remain available in Git history rather than the final working tree.
