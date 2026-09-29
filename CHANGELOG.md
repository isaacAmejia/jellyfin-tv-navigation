# Changelog

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
