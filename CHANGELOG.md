# Changelog

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
