# Jellyfin 12 Modern UI Roadmap

## Goal

Add first-class Jellyfin Web 12.1 Modern UI navigation without regressing the existing Legacy/TV implementation.

The project will use a shared navigation core with layout-specific adapters rather than forcing one set of DOM selectors onto both interfaces.

## Architecture direction

```text
Navigation Core
├── input / long-press handling
├── focus ring
├── spatial navigation
├── route + DOM context observation
└── lifecycle cleanup

Jellyfin adapters
├── Legacy / TV
│   ├── header + tabs
│   ├── drawer
│   ├── libraries
│   └── legacy-specific controls
└── Modern
    ├── MUI app toolbar
    ├── MUI library toolbar
    ├── permanent / mobile drawer
    └── MUI menus + popovers

Shared Jellyfin surfaces
├── Home content
├── Details content
├── cards / items containers
├── Search where structures overlap
└── legacy video OSD embedded by Modern

Optional integrations
├── SeerrFin
├── Media Bar
└── Jellyfin Enhanced
```

## Source findings from Jellyfin Web 12.1

Modern support is smaller than a full rewrite because Jellyfin currently reuses several legacy surfaces:

- `src/apps/modern/routes/home.tsx` loads the legacy `hometab` and `favorites` controllers.
- Modern `details` is registered as a legacy route using `itemDetails/index`.
- `src/apps/modern/routes/video/index.tsx` renders a Modern/MUI OSD header around the legacy playback/video view.
- Modern library `ItemsView` still renders Jellyfin `ItemsContainer` and the existing card builder.
- Modern replaces the main navigation/header and library toolbar with MUI components.

## Development rules

1. Keep `main` usable as the known-good Legacy/TV release.
2. Develop Modern support on a separate branch until it passes hands-on testing.
3. Prefer semantic selectors and stable Jellyfin classes/attributes over generated CSS selectors.
4. Do not depend on hashed/generated MUI class names.
5. Optional plugin integrations must remain optional.
6. Every new context must automatically claim focus when it becomes active.
7. A background context must never retain a visible ghost selection behind an active overlay.
8. Preserve the single-ring far-jump animation behavior.
9. Validate syntax and fetch committed files back from GitHub before testing.
10. Modern fixes must not change established Legacy behavior unless explicitly required.

## Modern implementation phases

### Phase 1 — Layout detection and app toolbar

- Detect the Modern app from stable page structure.
- Navigate visible MUI app-toolbar buttons and links.
- Preserve Legacy header handling unchanged.

### Phase 2 — Modern libraries

- Recognize the Modern library toolbar.
- Navigate library view menu, Play All, Shuffle, Queue, Filter, Sort, view settings, and pagination controls when present.
- Reuse the existing card/grid engine because Modern still renders Jellyfin cards inside `.itemsContainer`.

### Phase 3 — Drawer and overlays

- Support Modern permanent desktop drawer navigation.
- Support Modern mobile drawer navigation.
- Treat MUI menus/popovers as active navigation contexts.
- Restore the correct underlying context after an overlay closes.

### Phase 4 — Shared-surface verification

Verify that existing handlers still behave correctly when reached through Modern:

- Home
- Details
- Search
- Player OSD
- native dialogs
- plugin integrations that are actually available in Modern

### Phase 5 — Regression suite

Test both layouts before merging:

- Legacy desktop
- TV layout
- Modern desktop
- Modern narrow/mobile layout
- stock Jellyfin without optional integrations
- primary customized installation

## Merge criteria

Modern support should not replace the stable build until:

- no syntax/runtime errors are observed,
- core navigation works without mouse input,
- page/popup focus handoff is immediate,
- library toolbar + grid navigation is complete,
- Back/Home behavior is consistent,
- Legacy/TV regression tests pass,
- optional integrations remain non-blocking when absent.
