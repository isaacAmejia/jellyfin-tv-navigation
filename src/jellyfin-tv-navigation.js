(() => {
  'use strict';

  const VERSION = '2026.09.30-r12.19-jellymark-compatibility';
  const LONG_PRESS_REFRESH_MS = 900;
  const LONG_PRESS_HOME_MS = 900;

  try {
    window.__JF_LIBRARY_TEST_CLEANUP__?.();
  } catch (e) {
    console.warn('[JellyNav] Previous cleanup failed:', e);
  }

  try {
    window.__JELLYFIN_TV_REMOTE__?.cleanup?.();
  } catch (e) {
    console.warn('[JellyNav] Previous remote cleanup failed:', e);
  }

  // ============================================================
  // STATE
  // ============================================================

  let rows = [];
  let rowIndex = 0;
  let cardIndex = 0;

  let zone = 'library';
  let mediaControlIndex = 0;

  let headerTargets = [];
  let headerIndex = 0;

  let focusRing = null;
  let injectedStyle = null;
  let playerLaunchShield = null;
  let playerLaunchShieldTimer = null;

  let globalObserver = null;
  let mediaObserver = null;
  let mediaObserverRoot = null;

  let playerObserver = null;
  let playerObserverRoot = null;

  let rebuildTimer = null;
  let contextRefreshTimer = null;
  let mediaBarTimer = null;
  let playerWakeTimer = null;
  let observerMaintenanceTimer = null;
  let postHeaderTimer = null;

  let lastLocationKey = location.href;

  let extContext = null;
  let extRoot = null;
  let extTargets = [];
  let extIndex = 0;

  let selectMode = null;
  let detailFocusRoot = null;
  let detailPrimaryPending = true;
  let detailObserver = null;
  let detailObserverRoot = null;
  let pauseScreenObserver = null;
  let pauseScreenObserverRoot = null;

  let playerLane = 'bottom';
  let playerBottomIndex = 0;
  let playerTopIndex = 0;

  let keyboardRoot = null;
  let keyboardInput = null;
  let keyboardRow = 0;
  let keyboardColumn = 0;

  let enterHeld = false;
  let enterLongTriggered = false;
  let enterLongTimer = null;

  let backHeld = false;
  let backLongTriggered = false;
  let backLongTimer = null;

  let focusRevealToken = 0;
  let focusArrivalAnimation = null;
  let lastFocusMetrics = null;

  let homeRowSettleToken = 0;
  let homeMediaSettleToken = 0;
  let universalHomeToken = 0;
  let universalHomeTimer = null;
  let backFocusRestoreToken = 0;

  let watchlistRow = 0;
  let watchlistCol = 0;
  let watchlistPendingRestore = null;
  let watchlistActionFocus = null;
  let watchlistRowsCacheRoot = null;
  let watchlistRowsCache = [];
  let watchlistRowsDirty = true;
  let parentMainTabKey = 'home';

  // Native Jellyfin library / drawer state
  let drawerStyle = null;
  let drawerIndex = 0;

  let nativeLibraryRoot = null;
  let nativeLibraryDirty = true;
  let nativeLibraryRows = [];
  let nativeLibraryRow = 0;
  let nativeLibraryCol = 0;
  let nativeLibraryControlsCache = [];
  let nativeLibraryControlIndex = 0;
  let nativeAlphaTargetsCache = [];
  let nativeAlphaIndex = 0;
  let nativeAlphaReturnRow = 0;
  let nativeAlphaReturnCol = 0;
  let nativeSectionTitleTarget = null;
  let nativeSectionReturnRow = 0;

  // ============================================================
  // GENERIC HELPERS
  // ============================================================

  function visible(el) {
    if (
      !el ||
      !(el instanceof Element) ||
      !el.isConnected
    ) {
      return false;
    }

    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0 &&
      rect.width > 2 &&
      rect.height > 2
    );
  }

  function uniqueVisible(elements) {
    const seen = new Set();

    return (elements || []).filter(el => {
      if (
        !el ||
        seen.has(el) ||
        !visible(el)
      ) {
        return false;
      }

      seen.add(el);

      return true;
    });
  }

  function consume(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  function click(el) {
    if (
      !el ||
      !el.isConnected
    ) {
      return false;
    }

    try {
      el.focus?.({
        preventScroll: true
      });
    } catch (_) {
      try {
        el.focus?.();
      } catch (_) {}
    }

    try {
      el.click();

      return true;
    } catch (error) {
      console.warn(
        '[JellyNav] Click failed:',
        error
      );

      return false;
    }
  }

  function removePlayerLaunchShield() {
    clearTimeout(
      playerLaunchShieldTimer
    );

    playerLaunchShieldTimer =
      null;

    playerLaunchShield
      ?.remove();

    playerLaunchShield =
      null;
  }

  function showPlayerLaunchShield() {
    hideFocus();

    if (
      !playerLaunchShield ||
      !playerLaunchShield.isConnected
    ) {
      playerLaunchShield =
        document.createElement(
          'div'
        );

      playerLaunchShield.id =
        '__jf_tv_player_launch_shield__';

      Object.assign(
        playerLaunchShield.style,
        {
          position:
            'fixed',
          inset:
            '0',
          background:
            '#000',
          zIndex:
            '999',
          pointerEvents:
            'none'
        }
      );

      document.body.appendChild(
        playerLaunchShield
      );
    }

    clearTimeout(
      playerLaunchShieldTimer
    );

    const settle =
      attempt => {
        const playerContainer =
          document.querySelector(
            '.videoPlayerContainer.videoPlayerContainer-onTop'
          );

        /*
         * Jellyfin's fullscreen HTML player uses z-index 1000. The launch
         * shield sits at 999, so once that player layer is established it
         * safely covers the old page and the temporary shield can disappear.
         */
        if (
          playerContainer &&
          playerContainer.isConnected
        ) {
          removePlayerLaunchShield();

          return;
        }

        if (
          attempt < 80 &&
          (
            /#\/video(?:$|\?)/.test(
              location.hash
            ) ||
            document.querySelector(
              '#videoOsdPage,.videoPlayerContainer'
            )
          )
        ) {
          playerLaunchShieldTimer =
            setTimeout(
              () =>
                settle(
                  attempt + 1
                ),
              100
            );

          return;
        }

        /*
         * If playback never mounts or the user backs out during startup,
         * never leave a black layer stranded over Jellyfin.
         */
        removePlayerLaunchShield();
      };

    playerLaunchShieldTimer =
      setTimeout(
        () =>
          settle(0),
        50
      );
  }

  function sortVisual(
    elements
  ) {
    const list =
      [...(
        elements ||
        []
      )];

    if (
      list.length <
      2
    ) {
      return list;
    }

    const metrics =
      new Map();

    for (const el of list) {
      metrics.set(
        el,
        el.getBoundingClientRect()
      );
    }

    return list.sort(
      (
        a,
        b
      ) => {
        const ar =
          metrics.get(a);

        const br =
          metrics.get(b);

        const tolerance =
          Math.max(
            24,
            Math.min(
              ar.height,
              br.height
            ) * 0.45
          );

        if (
          Math.abs(
            ar.top -
            br.top
          ) <=
          tolerance
        ) {
          return (
            ar.left -
            br.left
          );
        }

        return (
          ar.top -
          br.top
        );
      }
    );
  }

  function textOf(el) {
    return [
      el?.className,
      el?.getAttribute?.('title'),
      el?.getAttribute?.('aria-label'),
      el?.innerText,
      el?.textContent
    ]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ============================================================
  // LONG HOLD OK = REFRESH
  // ============================================================

  function refreshJellyfin() {
    hideFocus();

    window.location.reload();
  }

  function startEnterHold(event) {
    if (
      event.repeat ||
      enterHeld
    ) {
      consume(event);

      return;
    }

    consume(event);

    enterHeld = true;
    enterLongTriggered = false;

    clearTimeout(
      enterLongTimer
    );

    enterLongTimer =
      setTimeout(
        () => {
          if (!enterHeld) {
            return;
          }

          enterLongTriggered = true;

          refreshJellyfin();
        },
        LONG_PRESS_REFRESH_MS
      );
  }

  function makeSyntheticEnterEvent() {
    return {
      key: 'Enter',

      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      repeat: false,

      target:
        document.activeElement ||
        document.body,

      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {}
    };
  }

  function finishEnterHold(event) {
    if (!enterHeld) {
      return;
    }

    consume(event);

    clearTimeout(
      enterLongTimer
    );

    const wasLong =
      enterLongTriggered;

    enterHeld = false;
    enterLongTriggered = false;

    if (!wasLong) {
      handleNavigationKeyDown(
        makeSyntheticEnterEvent()
      );
    }
  }


  function isBackKey(key) {
    return [
      'Escape',
      'BrowserBack',
      'GoBack'
    ].includes(
      key
    );
  }

  function visibleHomeTabButton() {
    // SeerrFin can reorder tabs. The Home panel identifies its real index.
    const panel = document.querySelector('#homeTab');
    const index = panel?.getAttribute('data-index');
    const tabs = [
      ...document.querySelectorAll(
        '.emby-tab-button'
      )
    ].filter(
      el => {
        if (
          !visible(el) ||
          el.hasAttribute(
            'data-seerrfin-tab'
          )
        ) {
          return false;
        }

        const rect =
          el.getBoundingClientRect();

        return (
          rect.top >=
            -5 &&
          rect.top <
            135
        );
      }
    );
    return tabs.find(el => index != null && el.getAttribute('data-index') === index) ||
      tabs.find(el => /^home$/i.test((el.textContent || el.getAttribute('aria-label') || '').trim())) ||
      tabs.find(el => index == null && el.getAttribute('data-index') === '0') || null;
  }

  function settleUniversalHome() {
    const token = ++universalHomeToken;
    clearTimeout(universalHomeTimer);
    clearTimeout(rebuildTimer);
    clearTimeout(contextRefreshTimer);
    clearTimeout(postHeaderTimer);
    clearTimeout(playerWakeTimer);
    homeMediaSettleToken++;
    homeRowSettleToken++;
    if (keyboardRoot) closeKeyboard();
    resetTransientNavigationState('route-reset');
    clearNativeLibraryState();

    let navigated = false;
    const closing = new WeakSet();
    const retry = attempt => {
      if (token !== universalHomeToken) return;
      universalHomeTimer = null;
      const later = () => {
        if (attempt < 50) {
          universalHomeTimer = setTimeout(() => retry(attempt + 1), 120);
        }
      };
      // Close one layer at a time through its owner, before changing routes.
      const watchlist =
        watchlistLayer();

      if (watchlist) {
        if (!closing.has(watchlist.root)) {
          closing.add(
            watchlist.root
          );

          closeWatchlistLayer(
            watchlist
          );
        }

        later();
        return;
      }

      const overlay = playerActionSheet() || nativeDialog() || requestFormRoot() ||
        seerrInfoModal() || enhancedInfoModal();
      if (overlay) {
        if (!closing.has(overlay)) {
          closing.add(overlay);
          if (!closeModal(overlay) && !closePlayerActionSheet(overlay)) {
            const command = new CustomEvent('command', {
              detail: { command: 'back' }, bubbles: true, cancelable: true
            });
            if (overlay.dispatchEvent(command) && overlay.getAttribute('data-history') === 'true') {
              window.history.back();
            }
          }
        }
        later();
        return;
      }
      const pauseScreen = enhancedPauseScreen();
      if (pauseScreen) dismissEnhancedPauseScreen(pauseScreen);
      if (drawerOpen()) {
        const drawer = mainDrawer();
        if (drawer && !closing.has(drawer)) {
          closing.add(drawer);
          closeDrawer();
        }
        later();
        return;
      }
      const player = playerPage();
      if (!navigated && player) {
        if (!closing.has(player)) {
          closing.add(player);
          exitPlayer(false);
        }
        later();
        return;
      }
      if (!navigated) {
        navigated = true;
        // Drop plugin deep links even when already on a Home route.
        if (location.hash !== '#/home') location.hash = '#/home';
      } else if (location.hash !== '#/home') {
        // A deliberate route change after Home began cancels late focus work.
        universalHomeToken++;
        return;
      }

      const homePanel = document.querySelector('#homeTab');
      const homePage = homePanel?.closest('.page') || document.querySelector('#indexPage');
      if (!homePage || !visible(homePage)) {
        later();
        return;
      }
      const tab = visibleHomeTabButton();
      if (tab && (seerrPageRoot() || seerrGridRoot() ||
        !tab.classList.contains('emby-tab-button-active'))) {
        const gridBack = seerrGridRoot()?.querySelector('[data-grid-nav="back"]');
        if (gridBack && visible(gridBack) && !closing.has(gridBack)) {
          closing.add(gridBack);
          click(gridBack);
        }
        if (!closing.has(tab)) {
          closing.add(tab);
          click(tab);
        }
      }
      if ((homePanel && !visible(homePanel)) || detailRoot() || searchPageRoot() ||
        nativeLibraryPageRoot() || seerrPageRoot() || seerrGridRoot()) {
        later();
        return;
      }
      rebuildHeaderTargets();
      rebuildRows();
      if (!getMediaControls().length && !rows.length && !headerTargets.length) {
        later();
        return;
      }
      // Readiness is based on the mounted Home DOM, rather than which stale
      // context happened to claim the route during its transition.
      resetTransientNavigationState('route-reset');
      clearNativeLibraryState();
      disconnectPlayerObserver();
      beginHomePreferredFocus();
      maintainScopedObservers();
    };
    retry(0);
  }

  function goUniversalHome() {
    hideFocus();
    removePlayerLaunchShield();
    settleUniversalHome();
  }

  function startBackHold(event) {
    if (
      event.repeat ||
      backHeld
    ) {
      consume(event);

      return;
    }

    consume(event);

    backHeld = true;
    backLongTriggered = false;

    clearTimeout(
      backLongTimer
    );

    backLongTimer =
      setTimeout(
        () => {
          if (!backHeld) {
            return;
          }

          backLongTriggered = true;

          goUniversalHome();
        },
        LONG_PRESS_HOME_MS
      );
  }

  function makeSyntheticBackEvent(
    key
  ) {
    return {
      key:
        key ||
        'Escape',

      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      repeat: false,

      target:
        document.activeElement ||
        document.body,

      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {}
    };
  }

  function finishBackHold(
    event
  ) {
    if (!backHeld) {
      return;
    }

    consume(event);

    clearTimeout(
      backLongTimer
    );

    const wasLong =
      backLongTriggered;

    const key =
      event.key;

    backHeld = false;
    backLongTriggered = false;

    if (!wasLong) {
      handleNavigationKeyDown(
        makeSyntheticBackEvent(
          key
        )
      );
    }
  }

  // ============================================================
  // STYLES
  // ============================================================

  function installStyles() {
    if (
      injectedStyle?.isConnected
    ) {
      return;
    }

    injectedStyle =
      document.createElement(
        'style'
      );

    injectedStyle.id =
      '__jf_tv_remote_styles__';

    injectedStyle.textContent = `
      #__jf_tv_keyboard__ {
        position: fixed;
        inset: 0;
        z-index: 2147483645;

        display: flex;
        align-items: flex-end;
        justify-content: center;

        padding: 2.2rem;

        background:
          linear-gradient(
            to bottom,
            rgba(0,0,0,.25),
            rgba(0,0,0,.88)
          );

        box-sizing: border-box;
      }

      #__jf_tv_keyboard__ .jfTvKeyboardPanel {
        width: min(1050px, 94vw);

        padding:
          1.4rem
          1.6rem
          1.6rem;

        background:
          rgba(20,20,20,.98);

        border-radius: 18px;

        box-shadow:
          0
          20px
          60px
          rgba(0,0,0,.7);

        box-sizing: border-box;
      }

      #__jf_tv_keyboard__ .jfTvKeyboardPreview {
        min-height: 58px;
        margin-bottom: 1rem;

        padding:
          .8rem
          1rem;

        display: flex;
        align-items: center;

        overflow: hidden;

        font-size: 1.45rem;

        color: #fff;

        background:
          rgba(255,255,255,.08);

        border-radius: 10px;

        box-sizing: border-box;

        white-space: nowrap;
        text-overflow: ellipsis;
      }

      #__jf_tv_keyboard__ .jfTvKeyboardRow {
        display: flex;
        justify-content: center;

        gap: .55rem;
        margin: .55rem 0;
      }

      #__jf_tv_keyboard__ button {
        min-width: 66px;
        height: 56px;

        padding: 0 .8rem;

        border: 0;
        border-radius: 9px;

        background:
          rgba(255,255,255,.12);

        color: #fff;

        font-size: 1.15rem;
        font-weight: 600;
      }

      #__jf_tv_keyboard__ button[data-wide="true"] {
        min-width: 145px;
      }

      #__jf_tv_keyboard__ button[data-space="true"] {
        flex: 1 1 auto;
        max-width: 470px;
      }

      #jws3-overlay .jws3-progress-row {
        border-radius: 12px;
      }

      #jws3-overlay .jfTvWatchlistActionFocus {
        outline: 3px solid rgba(255,255,255,.98) !important;
        outline-offset: 2px;
        border-radius: 9px;
      }
    `;

    document.head.appendChild(
      injectedStyle
    );
  }

  function installDrawerStyles() {
    if (drawerStyle?.isConnected) {
      return;
    }

    drawerStyle =
      document.createElement('style');

    drawerStyle.id =
      '__jf_tv_drawer_styles__';

    drawerStyle.textContent = `
      /* JellyPi TV drawer: keep only Media libraries + Dashboard. */
      .mainDrawer .mainDrawer-scrollContainer
      > *:not(.libraryMenuOptions):not(.adminMenuOptions) {
        display: none !important;
      }

      .mainDrawer .adminMenuOptions
      > .navMenuOption:not([data-itemid="dashboard"]):not(.lnkManageServer[href="#/dashboard"]) {
        display: none !important;
      }
    `;

    document.head.appendChild(
      drawerStyle
    );
  }

  // ============================================================
  // FOCUS RING
  // ============================================================

  function createFocusRing() {
    if (
      focusRing?.isConnected
    ) {
      return;
    }

    focusRing =
      document.createElement(
        'div'
      );

    focusRing.id =
      '__jf_library_focus_ring__';

    Object.assign(
      focusRing.style,
      {
        position:
          'fixed',

        /*
         * IMPORTANT:
         *
         * The ring is moved with translate3d(), so its origin
         * must explicitly be viewport coordinate 0,0.
         */
        left:
          '0px',

        top:
          '0px',

        zIndex:
          '2147483647',

        pointerEvents:
          'none',

        border:
          '3px solid rgba(255,255,255,.98)',

        borderRadius:
          '10px',

        boxSizing:
          'border-box',

        display:
          'none',

        opacity:
          '0',

        boxShadow:
          '0 0 0 1px rgba(0,0,0,.55),' +
          '0 0 12px rgba(255,255,255,.22)',

        transition:
          'opacity .085s ease',

        willChange:
          'opacity'
      }
    );

    document.body.appendChild(
      focusRing
    );
  }

  function hideFocus() {
    focusRevealToken += 1;

    if (watchlistActionFocus) {
      watchlistActionFocus.classList.remove(
        'jfTvWatchlistActionFocus'
      );
      watchlistActionFocus = null;
    }

    if (focusArrivalAnimation) {
      try {
        focusArrivalAnimation.cancel();
      } catch (_) {}

      focusArrivalAnimation =
        null;
    }

    lastFocusMetrics =
      null;

    if (focusRing) {
      focusRing.style.opacity =
        '0';

      focusRing.style.display =
        'none';
    }
  }

  function focusMetrics(el) {
    const rect =
      el.getBoundingClientRect();

    const isCard =
      !!el.closest(
        '.card'
      ) ||
      el.classList.contains(
        'cardImageContainer'
      ) ||
      !!el.closest(
        '.cardImageContainer'
      );

    const isListMedia =
      !!el.closest(
        '.listItem[data-type="Episode"]'
      );

    const expand =
      isCard
        ? 4
        :
      isListMedia
        ? 3
        :
          2;

    const computed =
      getComputedStyle(el);

    const rawRadius =
      parseFloat(
        computed.borderTopLeftRadius
      ) ||
      0;

    const radius =
      Math.max(
        rawRadius +
          (
            isCard
              ? 6
              : 3
          ),

        isCard
          ? 9
          : 6
      );

    return {
      left:
        rect.left -
        expand,

      top:
        rect.top -
        expand,

      width:
        rect.width +
        expand * 2,

      height:
        rect.height +
        expand * 2,

      radius
    };
  }

  function focusDistance(
    fromMetrics,
    toMetrics
  ) {
    if (
      !fromMetrics ||
      !toMetrics
    ) {
      return 0;
    }

    const fromX =
      fromMetrics.left +
      fromMetrics.width / 2;

    const fromY =
      fromMetrics.top +
      fromMetrics.height / 2;

    const toX =
      toMetrics.left +
      toMetrics.width / 2;

    const toY =
      toMetrics.top +
      toMetrics.height / 2;

    return Math.hypot(
      toX - fromX,
      toY - fromY
    );
  }

  function shouldAnimateFarFocus(
    fromMetrics,
    toMetrics
  ) {
    if (
      !fromMetrics ||
      !toMetrics ||
      window.matchMedia?.(
        '(prefers-reduced-motion: reduce)'
      )?.matches
    ) {
      return false;
    }

    return (
      focusDistance(
        fromMetrics,
        toMetrics
      ) >= 240
    );
  }

  function animateFarFocusArrival(
    token
  ) {
    if (
      !focusRing ||
      token !== focusRevealToken
    ) {
      return;
    }

    if (focusArrivalAnimation) {
      try {
        focusArrivalAnimation.cancel();
      } catch (_) {}

      focusArrivalAnimation =
        null;
    }

    /*
     * Far-jump animation affects only opacity and glow. The real ring
     * is already at its final geometry, so there are no cloned boxes,
     * scaling outlines, or moving geometry to fight Jellyfin scrolling.
     */
    focusRing.style.opacity =
      '1';

    const animation =
      focusRing.animate(
        [
          {
            opacity:
              0,

            boxShadow:
              '0 0 0 1px rgba(0,0,0,.55),' +
              '0 0 28px rgba(255,255,255,.50)'
          },
          {
            opacity:
              1,

            boxShadow:
              '0 0 0 1px rgba(0,0,0,.55),' +
              '0 0 12px rgba(255,255,255,.22)'
          }
        ],
        {
          duration:
            180,

          easing:
            'cubic-bezier(.16,1,.3,1)'
        }
      );

    focusArrivalAnimation =
      animation;

    animation.onfinish =
      () => {
        if (
          focusArrivalAnimation ===
          animation
        ) {
          focusArrivalAnimation =
            null;
        }
      };

    animation.oncancel =
      () => {
        if (
          focusArrivalAnimation ===
          animation
        ) {
          focusArrivalAnimation =
            null;
        }
      };
  }

  function showFocusElement(el) {
    if (
      !el ||
      !visible(el)
    ) {
      hideFocus();

      return;
    }

    createFocusRing();

    const token =
      ++focusRevealToken;

    const previousMetrics =
      lastFocusMetrics
        ? {
          left:
            lastFocusMetrics.left,

          top:
            lastFocusMetrics.top,

          width:
            lastFocusMetrics.width,

          height:
            lastFocusMetrics.height,

          radius:
            lastFocusMetrics.radius
        }
        : null;

    /*
     * Wait for Jellyfin's immediate navigation/scroll work, then measure
     * once. Nearby moves simply relocate the real ring. Far jumps place
     * that same ring at the destination while hidden and give it one
     * short arrival glow. There are no temporary focus rectangles.
     */
    focusRing.style.display =
      'block';

    requestAnimationFrame(
      () => {
        requestAnimationFrame(
          () => {
            if (
              token !== focusRevealToken ||
              !el.isConnected ||
              !visible(el)
            ) {
              return;
            }

            const metrics =
              focusMetrics(el);

            const animateArrival =
              shouldAnimateFarFocus(
                previousMetrics,
                metrics
              );

            if (focusArrivalAnimation) {
              try {
                focusArrivalAnimation.cancel();
              } catch (_) {}

              focusArrivalAnimation =
                null;
            }

            if (animateArrival) {
              focusRing.style.opacity =
                '0';
            }

            focusRing.style.width =
              `${Math.round(
                metrics.width
              )}px`;

            focusRing.style.height =
              `${Math.round(
                metrics.height
              )}px`;

            focusRing.style.borderRadius =
              `${Math.round(
                metrics.radius
              )}px`;

            focusRing.style.transform =
              `translate3d(${Math.round(
                metrics.left
              )}px, ${Math.round(
                metrics.top
              )}px, 0)`;

            lastFocusMetrics = {
              left:
                metrics.left,

              top:
                metrics.top,

              width:
                metrics.width,

              height:
                metrics.height,

              radius:
                metrics.radius
            };

            if (animateArrival) {
              animateFarFocusArrival(
                token
              );
            } else {
              focusRing.style.opacity =
                '1';
            }
          }
        );
      }
    );
  }

  function showFocus(card) {
    if (!card) {
      return;
    }

    showFocusElement(
      card.querySelector(
        '.cardImageContainer'
      ) ||
      card
    );
  }

  // ============================================================
  // SCROLLING
  // ============================================================

  function nearestScrollableAncestor(
    el,
    root
  ) {
    let node =
      el?.parentElement;

    while (
      node &&
      node !==
        root?.parentElement
    ) {
      const style =
        getComputedStyle(node);

      if (
        node.scrollHeight >
          node.clientHeight +
          2 &&
        (
          style.overflowY ===
            'auto' ||
          style.overflowY ===
            'scroll'
        )
      ) {
        return node;
      }

      if (
        node === root
      ) {
        break;
      }

      node =
        node.parentElement;
    }

    return null;
  }

  function scrollModalTarget(
    el,
    root
  ) {
    if (
      !el ||
      !root
    ) {
      return;
    }

    let scroller =
      nearestScrollableAncestor(
        el,
        root
      );

    if (!scroller) {
      scroller = [
        root.querySelector?.(
          '.modal-container'
        ),

        root.querySelector?.(
          '.modal-content'
        ),

        root.querySelector?.(
          '.bst-modal-content'
        ),

        root.querySelector?.(
          '.bst-popout-content'
        ),

        root
      ]
        .filter(Boolean)
        .find(
          candidate =>
            candidate.scrollHeight >
            candidate.clientHeight +
            2
        );
    }

    if (!scroller) {
      return;
    }

    const elementRect =
      el.getBoundingClientRect();

    const scrollerRect =
      scroller.getBoundingClientRect();

    const padding =
      55;

    if (
      elementRect.top <
      scrollerRect.top +
        padding
    ) {
      scroller.scrollTop +=
        elementRect.top -
        (
          scrollerRect.top +
          padding
        );
    } else if (
      elementRect.bottom >
      scrollerRect.bottom -
        padding
    ) {
      scroller.scrollTop +=
        elementRect.bottom -
        (
          scrollerRect.bottom -
          padding
        );
    }
  }

  function scrollSeerrGridTarget(
    el,
    root
  ) {
    if (
      !el ||
      !root
    ) {
      return;
    }

    const isTopChrome =
      el.matches(
        '[data-grid-nav="back"],' +
        '.emby-tab-button,' +
        '.mainDrawerButton,' +
        '.headerHomeButton,' +
        '.headerBackButton,' +
        '.headerSearchButton'
      );

    if (
      isTopChrome
    ) {
      let node =
        root.parentElement;

      while (
        node &&
        node !==
          document.body
      ) {
        if (
          node.scrollHeight >
          node.clientHeight +
          2
        ) {
          node.scrollTop =
            0;
        }

        node =
          node.parentElement;
      }

      if (
        document.scrollingElement
      ) {
        document.scrollingElement
          .scrollTop =
          0;
      }

      document.documentElement
        .scrollTop =
        0;

      document.body
        .scrollTop =
        0;

      return;
    }

    /*
     * Unlike a popup, a SeerrFin browse grid lives in the normal Jellyfin
     * page. Let the browser reveal the selected card/Load More through the
     * page's real scrolling ancestors instead of limiting the search to
     * descendants of the grid root.
     */
    const rect =
      el.getBoundingClientRect();

    if (
      rect.top >=
        125 &&
      rect.bottom <=
        innerHeight -
        90
    ) {
      return;
    }

    try {
      el.scrollIntoView({
        behavior:
          'auto',

        block:
          'center',

        inline:
          'nearest'
      });
    } catch (_) {
      el.scrollIntoView(
        false
      );
    }
  }

  function scrollDetailTarget(el) {
    if (!el) {
      return;
    }

    if (
      el.matches(
        '.headerBackButton,' +
        '.headerHomeButton,' +
        '.mainDrawerButton,' +
        '.headerSearchButton,' +
        '.headerCastButton,' +
        '.headerUserButton,' +
        '.headerUserButtonRound,' +
        '.emby-tab-button'
      ) ||
      /^back$/i.test(
        el.getAttribute(
          'aria-label'
        ) ||
        ''
      )
    ) {
      if (
        document.scrollingElement
      ) {
        document.scrollingElement
          .scrollTop =
          0;
      }

      document.documentElement
        .scrollTop =
        0;

      document.body
        .scrollTop =
        0;

      detailRoot()?.scrollTo?.({
        top:
          0,

        behavior:
          'auto'
      });

      return;
    }

    const rect =
      el.getBoundingClientRect();

    if (
      rect.top >=
        120 &&
      rect.bottom <=
        innerHeight -
        110
    ) {
      return;
    }

    try {
      el.scrollIntoView({
        behavior:
          'auto',

        block:
          'center',

        inline:
          'nearest'
      });
    } catch (_) {
      el.scrollIntoView(
        false
      );
    }
  }

  function scrollSearchToTop(
    input,
    root = null
  ) {
    if (!input) {
      return;
    }

    const page =
      root ||
      input.closest(
        '.page'
      ) ||
      document.body;

    let node =
      input.parentElement;

    while (node) {
      if (
        node.scrollHeight >
        node.clientHeight +
        2
      ) {
        node.scrollTop =
          0;
      }

      if (
        node === page ||
        node ===
          document.body
      ) {
        break;
      }

      node =
        node.parentElement;
    }

    if (
      page &&
      'scrollTop' in page
    ) {
      page.scrollTop =
        0;
    }

    if (
      document.scrollingElement
    ) {
      document.scrollingElement
        .scrollTop =
        0;
    }

    document.documentElement
      .scrollTop =
      0;

    document.body
      .scrollTop =
      0;

    requestAnimationFrame(
      () => {
        try {
          input.scrollIntoView({
            behavior:
              'auto',

            block:
              'start',

            inline:
              'nearest'
          });
        } catch (_) {}

        requestAnimationFrame(
          () => {
            showFocusElement(
              input
            );
          }
        );
      }
    );
  }

  // ============================================================
  // HEADER
  // ============================================================

  function isAllowedHeaderControl(
    el
  ) {
    if (!el) {
      return false;
    }

    if (
      el.matches(
        '.mainDrawerButton,' +
        '.headerHomeButton,' +
        '.headerBackButton,' +
        '.headerCastButton,' +
        '.headerSearchButton,' +
        '.headerUserButton,' +
        '.headerUserButtonRound,' +
        '.emby-tab-button'
      )
    ) {
      return true;
    }

    const aria =
      (
        el.getAttribute(
          'aria-label'
        ) ||
        ''
      ).trim();

    const title =
      (
        el.getAttribute(
          'title'
        ) ||
        ''
      ).trim();

    return (
      /^back$/i.test(
        aria
      ) ||
      /^back$/i.test(
        title
      )
    );
  }

  function mainTabKey(
    target
  ) {
    if (!target) {
      return null;
    }

    if (
      target.id ===
        'jws3-home-tab'
    ) {
      return 'watchlist';
    }

    const label =
      (
        target.textContent ||
        target.getAttribute?.(
          'aria-label'
        ) ||
        ''
      )
        .replace(
          /\s+/g,
          ' '
        )
        .trim()
        .toLowerCase();

    return [
      'home',
      'movies',
      'shows',
      'requests'
    ].includes(
      label
    )
      ? label
      : null;
  }

  function activeMainTabKey() {
    rebuildHeaderTargets();

    const active =
      headerTargets.find(
        target =>
          mainTabKey(
            target
          ) &&
          (
            target.classList.contains(
              'emby-tab-button-active'
            ) ||
            target.getAttribute(
              'aria-selected'
            ) ===
              'true'
          )
      );

    return (
      mainTabKey(
        active
      ) ||
      null
    );
  }

  function currentMainTabKey() {
    return (
      activeMainTabKey() ||
      parentMainTabKey
    );
  }

  function rememberParentMainTab(
    target
  ) {
    const key =
      mainTabKey(
        target
      );

    if (key) {
      parentMainTabKey =
        key;
    }

    return key;
  }

  function mainTabTarget(
    key =
      parentMainTabKey
  ) {
    rebuildHeaderTargets();

    return (
      headerTargets.find(
        target =>
          mainTabKey(
            target
          ) === key
      ) ||
      null
    );
  }

  function focusMainTab(
    key =
      parentMainTabKey,
    activate =
      false
  ) {
    const target =
      mainTabTarget(
        key
      );

    if (!target) {
      return false;
    }

    const resolvedKey =
      mainTabKey(
        target
      );

    if (resolvedKey) {
      parentMainTabKey =
        resolvedKey;
    }

    const index =
      headerTargets.indexOf(
        target
      );

    if (index >= 0) {
      headerIndex =
        index;
    }

    zone =
      'header';

    if (activate) {
      click(
        target
      );

      settleAfterHeaderActivation(
        target
      );
    }

    showFocusElement(
      target
    );

    return true;
  }

  function rebuildHeaderTargets() {
    const metrics =
      new Map();

    const candidates = [
      ...document.querySelectorAll(
        '.mainDrawerButton,' +
        '.headerHomeButton,' +
        '.headerBackButton,' +
        '.emby-tab-button,' +
        '.headerCastButton,' +
        '.headerSearchButton,' +
        '.headerUserButton,' +
        '.headerUserButtonRound,' +
        'button[aria-label="Back" i],' +
        'button[title="Back" i]'
      )
    ].filter(
      el => {
        if (
          !visible(el) ||
          !isAllowedHeaderControl(
            el
          )
        ) {
          return false;
        }

        const rect =
          el.getBoundingClientRect();

        if (
          rect.top <
            -5 ||
          rect.top >=
            135
        ) {
          return false;
        }

        metrics.set(
          el,
          rect
        );

        return true;
      }
    );

    headerTargets =
      candidates.sort(
        (
          a,
          b
        ) =>
          metrics.get(a).left -
          metrics.get(b).left
      );

    if (
      !headerTargets.length
    ) {
      headerIndex =
        0;

      return;
    }

    headerIndex =
      Math.max(
        0,
        Math.min(
          headerIndex,
          headerTargets.length -
          1
        )
      );
  }

  function findActiveHeaderIndex(
    rebuild = true
  ) {
    if (rebuild) {
      rebuildHeaderTargets();
    }

    const activeIndex =
      headerTargets.findIndex(
        el =>
          el.classList
            .contains(
              'emby-tab-button-active'
            ) ||
          el.getAttribute(
            'aria-selected'
          ) ===
            'true'
      );

    return (
      activeIndex >=
      0
        ? activeIndex
        : 0
    );
  }

  function enterHeader(
    preferActive = true
  ) {
    rebuildHeaderTargets();

    if (
      !headerTargets.length
    ) {
      return false;
    }

    if (
      preferActive
    ) {
      headerIndex =
        findActiveHeaderIndex(
          false
        );
    }

    zone =
      'header';

    showFocusElement(
      headerTargets[
        headerIndex
      ]
    );

    return true;
  }

  function moveHeader(
    direction
  ) {
    rebuildHeaderTargets();

    if (
      !headerTargets.length
    ) {
      return;
    }

    headerIndex =
      direction ===
      'left'
        ?
          Math.max(
            0,
            headerIndex -
            1
          )
        :
          Math.min(
            headerTargets.length -
            1,
            headerIndex +
            1
          );

    showFocusElement(
      headerTargets[
        headerIndex
      ]
    );
  }

  function resetTransientNavigationState(
    nextZone = 'route-reset'
  ) {
    zone =
      nextZone;

    extContext =
      null;

    extRoot =
      null;

    extTargets =
      [];

    extIndex =
      0;

    selectMode =
      null;

    rows =
      [];

    rowIndex =
      0;

    cardIndex =
      0;

    mediaControlIndex =
      0;

    homeMediaSettleToken++;
    homeRowSettleToken++;
    detailFocusRoot = null;
    detailPrimaryPending = true;
    hideFocus();
  }

  function settleAfterHeaderActivation(
    target
  ) {
    clearTimeout(
      postHeaderTimer
    );

    postHeaderTimer =
      setTimeout(
        () => {
          /*
           * A tab activation is a same-route content change in both
           * Jellyfin libraries and SeerrFin. Keep the selection on the
           * newly active tab. Content is entered only when Down is pressed.
           */
          if (
            target?.id ===
              'jws3-home-tab'
          ) {
            const settleWatchlist =
              () => {
                const layer =
                  watchlistLayer();

                if (layer) {
                  enterWatchlistLayer(
                    layer,
                    target
                  );
                } else {
                  scheduleContextRefresh(
                    80
                  );
                }
              };

            settleWatchlist();

            setTimeout(
              settleWatchlist,
              80
            );

            maintainScopedObservers();

            return;
          }

          if (
            target?.matches(
              '.emby-tab-button'
            )
          ) {
            rows = [];
            rowIndex = 0;
            cardIndex = 0;

            extContext = null;
            extRoot = null;
            extTargets = [];
            extIndex = 0;

            clearNativeLibraryState();

            rebuildHeaderTargets();
            headerIndex =
              findActiveHeaderIndex();
            zone = 'header';

            const active =
              headerTargets[
                headerIndex
              ];

            rememberParentMainTab(
              active
            );

            if (active) {
              showFocusElement(
                active
              );
            }

            maintainScopedObservers();
            return;
          }

          /* Opening the hamburger is also a same-route state change. */
          if (
            target?.matches(
              '.mainDrawerButton'
            )
          ) {
            resolveContext();
            return;
          }

          if (
            !keyboardRoot &&
            !requestFormRoot() &&
            !seerrInfoModal() &&
            !enhancedInfoModal()
          ) {
            resolveContext();
          }
        },
        160
      );
  }

  function activateHeader() {
    const target =
      headerTargets[
        headerIndex
      ];

    if (!target) {
      return;
    }

    rememberParentMainTab(
      target
    );

    click(
      target
    );

    settleAfterHeaderActivation(
      target
    );
  }

  function headerDownDestination() {
    if (
      !headerTargets[
        headerIndex
      ]
    ) {
      return;
    }

    const search =
      searchPageRoot();

    if (search) {
      const input =
        searchInput();

      if (input) {
        zone =
          'search';

        scrollSearchToTop(
          input,
          search
        );

        return;
      }
    }

    const seerr =
      seerrPageRoot();

    if (seerr) {
      const activeKey =
        activeMainTabKey();

      if (
        activeKey &&
        activeKey !==
          'watchlist'
      ) {
        parentMainTabKey =
          activeKey;
      }
      /* Always enter the newly activated SeerrFin tab at row 0/card 0. */
      rowIndex = 0;
      cardIndex = 0;
      enterSeerrDiscovery();
      return;
    }

    const nativeLibrary =
      nativeLibraryPageRoot();

    if (nativeLibrary) {
      enterNativeLibrary(
        nativeLibrary,
        true
      );
      return;
    }

    if (
      getMediaControls()
        .length
    ) {
      enterMediaBar(
        false
      );

      return;
    }

    rebuildRows();

    if (
      rows.length
    ) {
      zone =
        'library';

      selectRow(
        0,
        0
      );
    }
  }

  // ============================================================
  // ROWS / CAROUSELS

  // ============================================================

  function buildRowsWithin(
    root = document
  ) {
    return [
      ...root.querySelectorAll(
        '.itemsContainer.scrollSlider'
      )
    ]
      .map(
        container => ({
          container,

          scroller:
            container.closest(
              '.emby-scroller'
            ),

          section:
            container.closest(
              '.verticalSection'
            ),

          cards: [
            ...container.children
          ].filter(
            card =>
              card.classList
                .contains(
                  'card'
                ) &&
              visible(card)
          )
        })
      )
      .filter(
        row =>
          row.cards.length &&
          visible(
            row.container
          )
      );
  }

  function rebuildRows() {
    rows =
      buildRowsWithin(
        document
      );

    if (
      !rows.length
    ) {
      rowIndex =
        0;

      cardIndex =
        0;

      return;
    }

    rowIndex =
      Math.max(
        0,
        Math.min(
          rowIndex,
          rows.length -
          1
        )
      );

    cardIndex =
      Math.max(
        0,
        Math.min(
          cardIndex,
          rows[
            rowIndex
          ].cards.length -
          1
        )
      );
  }

  function getVerticalScrollerForRow(
    row
  ) {
    if (!row) {
      return (
        document.scrollingElement
      );
    }

    const home =
      row.container.closest(
        '.homeSectionsContainer'
      );

    if (
      home &&
      home.scrollHeight >
        home.clientHeight
    ) {
      return home;
    }

    let node =
      row.container
        .parentElement;

    while (
      node &&
      node !==
        document.body
    ) {
      const style =
        getComputedStyle(node);

      if (
        node.scrollHeight >
          node.clientHeight &&
        (
          style.overflowY ===
            'auto' ||
          style.overflowY ===
            'scroll'
        )
      ) {
        return node;
      }

      node =
        node.parentElement;
    }

    return (
      document.scrollingElement
    );
  }

  function ensureRowVisible(
    row
  ) {
    if (!row) {
      return;
    }

    const scroller =
      getVerticalScrollerForRow(
        row
      );

    if (!scroller) {
      return;
    }

    const rowRect =
      row.container
        .getBoundingClientRect();

    const scrollerRect =
      scroller ===
      document.scrollingElement
        ?
          {
            top:
              0,

            bottom:
              innerHeight
          }
        :
          scroller
            .getBoundingClientRect();

    const padding =
      90;

    if (
      rowRect.top <
      scrollerRect.top +
      padding
    ) {
      scroller.scrollTop +=
        rowRect.top -
        (
          scrollerRect.top +
          padding
        );
    }

    if (
      rowRect.bottom >
      scrollerRect.bottom -
      padding
    ) {
      scroller.scrollTop +=
        rowRect.bottom -
        (
          scrollerRect.bottom -
          padding
        );
    }
  }

  function getRowControls(
    row
  ) {
    return {
      left:
        row?.section
          ?.querySelector(
            'button[data-direction="left"]'
          ) ||
        null,

      right:
        row?.section
          ?.querySelector(
            'button[data-direction="right"]'
          ) ||
        null
    };
  }

  function cardVisibleInRow(
    row,
    card
  ) {
    const viewport =
      row?.scroller ||
      row?.container;

    if (
      !viewport ||
      !card
    ) {
      return false;
    }

    const viewportRect =
      viewport
        .getBoundingClientRect();

    const cardRect =
      card
        .getBoundingClientRect();

    return (
      cardRect.left >=
      viewportRect.left +
      40 &&
      cardRect.right <=
      viewportRect.right -
      40
    );
  }

  function pageRow(
    row,
    direction
  ) {
    const button =
      getRowControls(
        row
      )[direction];

    if (
      !button ||
      button.disabled
    ) {
      return false;
    }

    button.click();

    return true;
  }

  function moveCardHorizontal(
    direction
  ) {
    const row =
      rows[
        rowIndex
      ];

    if (!row) {
      return;
    }

    const nextIndex =
      cardIndex +
      (
        direction ===
        'right'
          ? 1
          : -1
      );

    if (
      nextIndex <
      0 ||
      nextIndex >=
      row.cards.length
    ) {
      return;
    }

    const card =
      row.cards[
        nextIndex
      ];

    if (
      cardVisibleInRow(
        row,
        card
      )
    ) {
      cardIndex =
        nextIndex;

      showFocus(
        card
      );

      return;
    }

    if (
      !pageRow(
        row,
        direction
      )
    ) {
      return;
    }

    setTimeout(
      () => {
        cardIndex =
          nextIndex;

        const live =
          rows[
            rowIndex
          ]?.cards[
            cardIndex
          ];

        if (live) {
          showFocus(
            live
          );
        }
      },
      450
    );
  }

  function selectRow(
    newRow,
    newCard
  ) {
    if (
      !rows.length
    ) {
      return;
    }

    rowIndex =
      Math.max(
        0,
        Math.min(
          newRow,
          rows.length -
          1
        )
      );

    const row =
      rows[
        rowIndex
      ];

    if (
      !row?.cards.length
    ) {
      return;
    }

    cardIndex =
      Math.max(
        0,
        Math.min(
          newCard,
          row.cards.length -
          1
        )
      );

    ensureRowVisible(
      row
    );

    showFocus(
      row.cards[
        cardIndex
      ]
    );
  }

  function activateCurrentCard() {
    const card =
      rows[
        rowIndex
      ]?.cards[
        cardIndex
      ];

    if (!card) {
      return;
    }

    click(
      card.querySelector(
        '.cardImageContainer[href],' +
        'a[href],' +
        '.cardImageContainer'
      ) ||
      card
    );
  }

  // ============================================================
  // MEDIA BAR
  // ============================================================

  function getActiveMediaSlide() {
    return document.querySelector(
      '.slide.active'
    );
  }

  function getMediaBar() {
    const slide =
      getActiveMediaSlide();

    if (
      !slide ||
      !visible(
        slide
      )
    ) {
      return null;
    }

    return {
      play:
        slide.querySelector(
          'button.play-button'
        ),

      info:
        slide.querySelector(
          'button.detail-button'
        ),

      favorite:
        slide.querySelector(
          'button.favorite-button'
        ),

      previous:
        document.querySelector(
          '#slides-container .left-arrow'
        ) ||
        document.querySelector(
          '.left-arrow'
        ),

      next:
        document.querySelector(
          '#slides-container .right-arrow'
        ) ||
        document.querySelector(
          '.right-arrow'
        )
    };
  }

  function getMediaControls() {
    const media =
      getMediaBar();

    return media
      ?
        [
          media.play,
          media.info,
          media.favorite,
          media.previous,
          media.next
        ].filter(
          Boolean
        )
      :
        [];
  }

  function showMediaControlFocus() {
    const controls =
      getMediaControls();

    if (
      !controls.length
    ) {
      hideFocus();

      return;
    }

    mediaControlIndex =
      Math.max(
        0,
        Math.min(
          mediaControlIndex,
          controls.length -
          1
        )
      );

    const target =
      controls[
        mediaControlIndex
      ];

    /*
     * Media Bar owns its slideshow lifecycle. Our remote
     * navigation only paints a visual focus ring; it must not leave
     * browser focus inside the bar because plugin/browser focus
     * handlers may treat that as an active interaction and suspend
     * timed rotation.
     */
    const active =
      document.activeElement;

    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      active.closest?.(
        '#slides-container'
      )
    ) {
      try {
        active.blur();
      } catch (_) {}
    }

    showFocusElement(
      target
    );
  }

  function scrollEverythingToTop() {
    const home =
      document.querySelector(
        '.homeSectionsContainer'
      );

    if (home) {
      home.scrollTop =
        0;
    }

    if (
      document.scrollingElement
    ) {
      document.scrollingElement
        .scrollTop =
        0;
    }

    document.documentElement
      .scrollTop =
      0;

    document.body
      .scrollTop =
      0;
  }

  function enterMediaBar(
    preserve = false
  ) {
    if (
      !getMediaControls()
        .length
    ) {
      return false;
    }

    zone =
      'media';

    if (!preserve) {
      mediaControlIndex =
        0;
    }

    scrollEverythingToTop();

    clearTimeout(
      mediaBarTimer
    );

    mediaBarTimer =
      setTimeout(
        () => {
          if (
            zone ===
            'media'
          ) {
            showMediaControlFocus();
          }
        },
        100
      );

    return true;
  }

  function mediaBarNext() {
    const media =
      getMediaBar();

    if (
      !media?.next ||
      !media.next.isConnected
    ) {
      return;
    }

    /*
     * Media Bar exports its own navigation API as window.slideshowPure.
     * Use that native path when available so manual TV navigation and
     * Media Bar's own slideshow lifecycle stay in the same code path.
     * The real arrow click remains a compatibility fallback.
     */
    if (
      typeof window
        .slideshowPure
        ?.nextSlide ===
      'function'
    ) {
      window
        .slideshowPure
        .nextSlide();
    } else {
      media.next.click();
    }

    clearTimeout(
      mediaBarTimer
    );

    mediaBarTimer =
      setTimeout(
        () => {
          if (
            zone ===
            'media'
          ) {
            showMediaControlFocus();
          }
        },
        350
      );
  }

  function mediaBarPrevious() {
    const media =
      getMediaBar();

    if (
      !media?.previous ||
      !media.previous.isConnected
    ) {
      return;
    }

    if (
      typeof window
        .slideshowPure
        ?.prevSlide ===
      'function'
    ) {
      window
        .slideshowPure
        .prevSlide();
    } else {
      media.previous.click();
    }

    clearTimeout(
      mediaBarTimer
    );

    mediaBarTimer =
      setTimeout(
        () => {
          if (
            zone ===
            'media'
          ) {
            showMediaControlFocus();
          }
        },
        350
      );
  }

  function activateMediaControl() {
    const media =
      getMediaBar();

    if (!media) {
      return;
    }

    switch (
      mediaControlIndex
    ) {
      case 0:
        showPlayerLaunchShield();

        media.play
          ?.click();
        break;

      case 1:
        media.info
          ?.click();
        break;

      case 2:
        media.favorite
          ?.click();
        break;

      case 3:
        mediaBarPrevious();
        break;

      case 4:
        mediaBarNext();
        break;
    }
  }

  // ============================================================
  // SPATIAL NAVIGATION
  // ============================================================

  function spatialNext(
    direction,
    targets,
    index
  ) {
    const from =
      targets[
        index
      ];

    if (!from) {
      return -1;
    }

    const fromRect =
      from.getBoundingClientRect();

    const fromX =
      fromRect.left +
      fromRect.width /
      2;

    const fromY =
      fromRect.top +
      fromRect.height /
      2;

    let best =
      -1;

    let bestScore =
      Infinity;

    targets.forEach(
      (
        target,
        targetIndex
      ) => {
        if (
          targetIndex ===
          index ||
          !visible(
            target
          )
        ) {
          return;
        }

        const targetRect =
          target.getBoundingClientRect();

        const targetX =
          targetRect.left +
          targetRect.width /
          2;

        const targetY =
          targetRect.top +
          targetRect.height /
          2;

        const dx =
          targetX -
          fromX;

        const dy =
          targetY -
          fromY;

        const primary =
          direction ===
          'left'
            ? -dx
            :
          direction ===
          'right'
            ? dx
            :
          direction ===
          'up'
            ? -dy
            :
              dy;

        if (
          primary <=
          4
        ) {
          return;
        }

        const secondary =
          (
            direction ===
            'left' ||
            direction ===
            'right'
          )
            ?
              Math.abs(
                dy
              )
            :
              Math.abs(
                dx
              );

        let score =
          primary +
          secondary *
          0.6;

        const overlap =
          (
            direction ===
            'left' ||
            direction ===
            'right'
          )
            ?
              Math.min(
                fromRect.bottom,
                targetRect.bottom
              ) -
              Math.max(
                fromRect.top,
                targetRect.top
              )
            :
              Math.min(
                fromRect.right,
                targetRect.right
              ) -
              Math.max(
                fromRect.left,
                targetRect.left
              );

        if (
          overlap >
          0
        ) {
          score -=
            Math.min(
              secondary,
              300
            ) *
            0.4;
        }

        if (
          score <
          bestScore
        ) {
          bestScore =
            score;

          best =
            targetIndex;
        }
      }
    );

    return best;
  }

  function setExt(
    context,
    root,
    targets,
    preferred = null,
    forcePreferred = false
  ) {
    const previous =
      !forcePreferred &&
      extContext ===
      context && extRoot === root
        ?
          extTargets[
            extIndex
          ]
        :
          null;

    extContext =
      context;

    extRoot =
      root;

    extTargets =
      uniqueVisible(
        targets
      );

    if (
      !extTargets.length
    ) {
      extIndex =
        0;

      hideFocus();

      return false;
    }

    let index =
      previous
        ?
          extTargets.indexOf(
            previous
          )
        :
          -1;

    if (
      index <
      0 &&
      preferred
    ) {
      index =
        extTargets.indexOf(
          preferred
        );
    }

    extIndex =
      index >=
      0
        ? index
        : 0;

    const target =
      extTargets[
        extIndex
      ];

    if (
      context ===
      'detail'
    ) {
      scrollDetailTarget(
        target
      );
    } else if (
      context ===
      'seerr-grid'
    ) {
      scrollSeerrGridTarget(
        target,
        root
      );
    } else {
      scrollModalTarget(
        target,
        root
      );
    }

    requestAnimationFrame(
      () => {
        showFocusElement(
          target
        );
      }
    );

    return true;
  }

  function extTargetsStillValid(
    root
  ) {
    return (
      extRoot ===
      root &&
      extTargets.length >
      0 &&
      extTargets.every(
        el =>
          el?.isConnected &&
          visible(
            el
          )
      )
    );
  }

  function moveExt(
    direction
  ) {
    const next =
      spatialNext(
        direction,
        extTargets,
        extIndex
      );

    if (
      next <
      0
    ) {
      return false;
    }

    extIndex =
      next;

    const target =
      extTargets[
        extIndex
      ];

    if (
      extContext ===
      'detail'
    ) {
      scrollDetailTarget(
        target
      );
    } else if (
      extContext ===
      'seerr-grid'
    ) {
      scrollSeerrGridTarget(
        target,
        extRoot
      );
    } else {
      scrollModalTarget(
        target,
        extRoot
      );
    }

    requestAnimationFrame(
      () => {
        showFocusElement(
          target
        );
      }
    );

    return true;
  }

  // ============================================================
  // SEERRFIN
  // ============================================================

  function seerrInfoModal() {
    return [
      ...document.querySelectorAll(
        '.bst-popout-wrapper'
      )
    ].find(
      visible
    ) || null;
  }

  function seerrActionTargets(
    root
  ) {
    return root
      ?
        sortVisual(
          uniqueVisible([
            ...root.querySelectorAll(
              'button:not([disabled])'
            )
          ])
        )
      :
        [];
  }

  function seerrPageRoot() {
    for (
      const selector of
      [
        '.seerrfin-movies-sections',
        '.seerrfin-tv-sections',
        '.seerrfin-requests-sections',
        '.seerrfin-search-sections'
      ]
    ) {
      const found = [
        ...document.querySelectorAll(
          selector
        )
      ].find(
        visible
      );

      if (found) {
        return found;
      }
    }

    return [
      ...document.querySelectorAll(
        '.tabContent.is-active,' +
        '.pageTabContent.is-active'
      )
    ].find(
      el =>
        visible(
          el
        ) &&
        el.querySelector(
          '.seerrfin-poster-section,' +
          '.seerrfin-carousel-section,' +
          '[class*="seerrfin-"]'
        )
    ) || null;
  }

  function seerrGridRoot() {
    return [
      ...document.querySelectorAll(
        '[data-seerrfin-grid-view]'
      )
    ].find(
      visible
    ) || null;
  }

  function seerrGridCards(
    root
  ) {
    return root
      ?
        sortVisual(
          uniqueVisible([
            ...root.querySelectorAll(
              '.itemsContainer > .card,' +
              '[data-seerrfin-native-card="true"]'
            )
          ])
        )
      :
        [];
  }

  function seerrGridTargets(
    root,
    cards = null
  ) {
    rebuildHeaderTargets();

    cards =
      cards ||
      seerrGridCards(
        root
      );

    const back =
      root?.querySelector(
        '[data-grid-nav="back"]'
      );

    const loadMore =
      root?.querySelector(
        '[data-seerrfin-loadmore] button:not([disabled])'
      );

    return uniqueVisible([
      ...headerTargets,
      back,
      ...cards,
      loadMore
    ]);
  }

  function enterSeerrGrid(
    root
  ) {
    if (!root) {
      return false;
    }

    const cards =
      seerrGridCards(
        root
      );

    const targets =
      seerrGridTargets(
        root,
        cards
      );

    if (!targets.length) {
      return false;
    }

    zone =
      'seerr-grid';

    /*
     * The grid shell appears before SeerrFin's async cards. If Back was
     * temporarily selected while the shell was empty, do not preserve that
     * placeholder selection once the first real card arrives.
     */
    if (
      cards.length
    ) {
      extContext =
        null;

      extRoot =
        null;

      extTargets =
        [];

      extIndex =
        0;
    }

    return setExt(
      'seerr-grid',
      root,
      targets,
      cards[0] ||
      root.querySelector(
        '[data-grid-nav="back"]'
      ) ||
      targets[0]
    );
  }

  function enterSeerrDiscovery() {
    const grid =
      seerrGridRoot();

    if (grid) {
      return enterSeerrGrid(
        grid
      );
    }

    const root =
      seerrPageRoot();

    if (!root) {
      return false;
    }

    const found =
      buildRowsWithin(
        root
      );

    if (
      !found.length
    ) {
      return false;
    }

    rows =
      found;

    rowIndex =
      Math.max(
        0,
        Math.min(
          rowIndex,
          rows.length -
          1
        )
      );

    cardIndex =
      Math.max(
        0,
        Math.min(
          cardIndex,
          rows[
            rowIndex
          ].cards.length -
          1
        )
      );

    zone =
      'seerr-library';

    ensureRowVisible(
      rows[
        rowIndex
      ]
    );

    showFocus(
      rows[
        rowIndex
      ].cards[
        cardIndex
      ]
    );

    return true;
  }

  // ============================================================
  // WATCHLIST UI INTEGRATION
  // ============================================================

  function watchlistLayer() {
    const dialog = [
      ...document.querySelectorAll(
        '.jws3-dialog'
      )
    ].find(
      visible
    );

    if (dialog) {
      return {
        type:
          'watchlist-dialog',

        root:
          dialog
      };
    }

    const overlay =
      document.getElementById(
        'jws3-overlay'
      );

    if (
      overlay &&
      !overlay.hidden &&
      visible(
        overlay
      )
    ) {
      return {
        type:
          'watchlist',

        root:
          overlay
      };
    }

    return null;
  }

  function watchlistHeaderRow() {
    return uniqueVisible([
      ...document.querySelectorAll(
        '.skinHeader .headerTabs .emby-tab-button,' +
        '.headerTabs .emby-tab-button'
      )
    ]);
  }

  function watchlistInteractive(root, selector) {
    if (!root) return [];

    return uniqueVisible([
      ...root.querySelectorAll(selector)
    ]).filter(
      el =>
        !el.matches('.jws3-card-remove') &&
        !el.closest('[hidden],[aria-hidden="true"]')
    );
  }

  function watchlistVisualRows(elements) {
    const metrics =
      new Map();

    for (const el of elements) {
      metrics.set(
        el,
        el.getBoundingClientRect()
      );
    }

    const sorted =
      [...elements].sort(
        (left, right) => {
          const a =
            metrics.get(left);

          const b =
            metrics.get(right);

          const tolerance =
            Math.max(
              24,
              Math.min(
                a.height,
                b.height
              ) * 0.45
            );

          return (
            Math.abs(
              a.top -
              b.top
            ) <= tolerance
          )
            ? a.left - b.left
            : a.top - b.top;
        }
      );

    const rows = [];

    for (const el of sorted) {
      const rect =
        metrics.get(el);

      const center =
        rect.top +
        rect.height / 2;

      let row =
        rows.find(
          entry =>
            Math.abs(
              entry.center -
              center
            ) <=
            Math.max(
              28,
              Math.min(
                rect.height,
                entry.height
              ) * 0.45
            )
        );

      if (!row) {
        row = {
          center,
          height:
            rect.height,
          items: []
        };

        rows.push(
          row
        );
      }

      row.items.push(
        el
      );

      row.height =
        Math.max(
          row.height,
          rect.height
        );
    }

    return rows
      .sort(
        (left, right) =>
          left.center -
          right.center
      )
      .map(
        row =>
          row.items.sort(
            (left, right) =>
              metrics.get(left).left -
              metrics.get(right).left
          )
      );
  }

  function watchlistRows(layer) {
    const root = layer?.root;
    if (!root) return [];

    if (layer.type === 'watchlist-dialog') {
      return watchlistVisualRows(
        watchlistInteractive(
          root,
          'button:not([disabled]),' +
          'input:not([type="hidden"]):not([disabled]),' +
          'select:not([disabled]),' +
          'textarea:not([disabled])'
        )
      );
    }

    if (
      !watchlistRowsDirty &&
      watchlistRowsCacheRoot ===
        root &&
      root.isConnected
    ) {
      return watchlistRowsCache;
    }

    const rows = [];

    const header = watchlistHeaderRow();
    if (header.length) rows.push(header);

    const sections = watchlistInteractive(root,'.jws3-tabs .jws3-tab');
    if (sections.length) rows.push(sections);

    const shell = root.querySelector('.jws3-shell') || root;

    for (const child of shell.children) {
      if (child.matches?.('.jws3-head')) continue;

      if (
        child.matches?.(
          '.jws3-toolbar,' +
          '.jws3-tools,' +
          '.jws3-chips,' +
          '.jws3-stats-nav'
        )
      ) {
        const controls = watchlistInteractive(
          child,
          'button:not([disabled]),' +
          'input:not([type="hidden"]):not([disabled]),' +
          'select:not([disabled]),' +
          'textarea:not([disabled])'
        );

        if (controls.length) rows.push(controls);
      }
    }

    const progressRows =
      watchlistInteractive(
        root,
        '.jws3-progress-row'
      );

    if (progressRows.length) {
      rows.push(
        ...watchlistVisualRows(
          progressRows
        )
      );
    } else {
      const content =
        watchlistInteractive(
          root,
          '.jws3-card-open'
        );

      rows.push(
        ...watchlistVisualRows(
          content
        )
      );
    }
    watchlistRowsCache =
      rows.filter(
        row =>
          row.length
      );

    watchlistRowsCacheRoot =
      root;

    watchlistRowsDirty =
      false;

    return watchlistRowsCache;
  }

  function flattenWatchlistRows(rows) {
    return rows.flat();
  }

  function watchlistPositionForTarget(rows, target) {
    if (!target) return null;

    for (let row = 0; row < rows.length; row++) {
      const col = rows[row].indexOf(target);
      if (col >= 0) return { row, col };
    }

    return null;
  }

  function watchlistTargetKey(target) {
    if (!target) return null;

    return {
      id: target.id || null,
      section: target.dataset?.section || null,
      aria: target.getAttribute?.('aria-label') || null,
      title: target.getAttribute?.('title') || null,
      text: (target.textContent || '').replace(/\s+/g,' ').trim(),
      tag: target.tagName,

      progressTitle:
        target.matches?.(
          '.jws3-progress-row'
        )
          ? (
              target.querySelector(
                '.jws3-progress-info h3'
              )?.textContent ||
              ''
            ).trim()
          : null
    };
  }

  function findWatchlistTargetByKey(rows, key) {
    if (!key) return null;
    const targets = flattenWatchlistRows(rows);

    return (
      targets.find(el => key.id && el.id === key.id) ||
      targets.find(el => key.section && el.dataset?.section === key.section) ||
      targets.find(el => key.aria && el.getAttribute?.('aria-label') === key.aria) ||
      targets.find(el => key.title && el.getAttribute?.('title') === key.title) ||
      targets.find(el =>
        key.progressTitle &&
        el.matches?.(
          '.jws3-progress-row'
        ) &&
        (
          el.querySelector(
            '.jws3-progress-info h3'
          )?.textContent ||
          ''
        ).trim() ===
          key.progressTitle
      ) ||
      targets.find(el =>
        key.text &&
        el.tagName === key.tag &&
        (el.textContent || '').replace(/\s+/g,' ').trim() === key.text
      ) ||
      null
    );
  }

  function watchlistTargets(root) {
    const layer = watchlistLayer();
    if (!layer || layer.root !== root) return [];
    return flattenWatchlistRows(watchlistRows(layer));
  }

  function watchlistVisualTarget(target) {
    if (!target) return null;

    if (
      target.matches(
        '.jws3-progress-row'
      )
    ) {
      return target;
    }

    if (target.matches('.jws3-card-open')) {
      return target.querySelector('.jws3-poster') || target;
    }

    return target;
  }

  function showWatchlistFocus(
    rows = null,
    layer = null
  ) {
    layer =
      layer ||
      watchlistLayer();

    if (!layer) {
      hideFocus();
      return;
    }

    rows =
      rows ||
      watchlistRows(
        layer
      );
    if (!rows.length) {
      hideFocus();
      return;
    }

    watchlistRow = Math.max(0,Math.min(watchlistRow,rows.length-1));
    watchlistCol = Math.max(0,Math.min(watchlistCol,rows[watchlistRow].length-1));

    const target = rows[watchlistRow][watchlistCol];

    extContext = layer.type;
    extRoot = layer.root;
    extTargets = flattenWatchlistRows(rows);
    extIndex = extTargets.indexOf(target);

    if (!target) {
      hideFocus();
      return;
    }

    scrollModalTarget(target,layer.root);

    try {
      target.focus?.({preventScroll:true});
    } catch (_) {
      try { target.focus?.(); } catch (_) {}
    }

    if (watchlistActionFocus) {
      watchlistActionFocus.classList.remove(
        'jfTvWatchlistActionFocus'
      );
      watchlistActionFocus = null;
    }

    if (
      target.matches?.(
        '.jws3-progress-row'
      )
    ) {
      const action =
        target.querySelector(
          '.jws3-progress-info button:not([disabled])'
        );

      if (action) {
        action.classList.add(
          'jfTvWatchlistActionFocus'
        );
        watchlistActionFocus =
          action;
      }
    }

    showFocusElement(
      watchlistVisualTarget(
        target
      )
    );
  }

  function enterWatchlistLayer(layer, preferred = null) {
    const rows = watchlistRows(layer);

    zone = layer?.type || 'watchlist';
    extContext = layer?.type || 'watchlist';
    extRoot = layer?.root || null;
    extTargets = flattenWatchlistRows(rows);

    if (!rows.length) {
      watchlistRow = 0;
      watchlistCol = 0;
      extIndex = 0;
      hideFocus();
      return false;
    }

    let target = preferred;

    if (watchlistPendingRestore) {
      target = findWatchlistTargetByKey(rows,watchlistPendingRestore.key) || target;

      if (!target) {
        watchlistRow = Math.min(watchlistPendingRestore.row,rows.length-1);
        watchlistCol = Math.min(watchlistPendingRestore.col,rows[watchlistRow].length-1);
      }

      watchlistPendingRestore = null;
    }

    if (!target) {
      const active = document.activeElement;

      if (
        active instanceof Element &&
        (layer.root.contains(active) || active.id === 'jws3-home-tab')
      ) {
        target = active;
      }
    }

    if (!target) {
      target =
        rows.flat().find(el => el.matches?.('.jws3-tab[aria-pressed="true"]')) ||
        rows[0][0];
    }

    const position = watchlistPositionForTarget(rows,target);

    if (position) {
      watchlistRow = position.row;
      watchlistCol = position.col;
    }

    showWatchlistFocus(
      rows,
      layer
    );

    return true;
  }

  function restoreAfterWatchlistClose() {
    watchlistPendingRestore = null;

    setTimeout(() => {
      const layer = watchlistLayer();

      if (layer) {
        enterWatchlistLayer(layer);
        return;
      }

      resetTransientNavigationState('route-reset');

      const active = document.activeElement;

      if (
        active instanceof Element &&
        active.matches('.emby-tab-button') &&
        visible(active)
      ) {
        rebuildHeaderTargets();
        const index = headerTargets.indexOf(active);

        if (index >= 0) {
          headerIndex = index;
          zone = 'header';
          showFocusElement(active);
          return;
        }
      }

      resolveContext();
    },80);
  }

  function closeWatchlistLayer(layer) {
    const root = layer?.root;
    if (!root) return false;

    if (
      layer.type === 'watchlist-dialog' &&
      typeof root.jwsClose === 'function'
    ) {
      root.jwsClose();
      restoreAfterWatchlistClose();
      return true;
    }

    const close = [
      ...root.querySelectorAll(
        '.btnClose,' +
        '[aria-label="Back to Jellyfin"]'
      )
    ].find(visible);

    if (close) {
      click(close);
      restoreAfterWatchlistClose();
      return true;
    }

    return false;
  }

  function activateWatchlistTarget(target) {
    if (!target) return false;

    if (
      target.matches?.(
        '.jws3-progress-row'
      )
    ) {
      watchlistPendingRestore = {
        row: watchlistRow,
        col: watchlistCol,
        key:
          watchlistTargetKey(
            target
          )
      };

      const action =
        target.querySelector(
          '.jws3-progress-info button:not([disabled])'
        );

      return action
        ? click(
            action
          )
        : false;
    }

    if (target instanceof HTMLSelectElement) {
      return enterSelectMode(target,target);
    }

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      openKeyboard(target);
      return true;
    }

    const label = (
      target.getAttribute?.('aria-label') ||
      target.textContent ||
      ''
    ).trim();

    const isRefresh = /refresh/i.test(label) || label === '↻';

    if (!isRefresh) {
      watchlistPendingRestore = {
        row: watchlistRow,
        col: watchlistCol,
        key: watchlistTargetKey(target)
      };
    } else {
      watchlistPendingRestore = null;
    }

    const activated = click(target);

    setTimeout(() => {
      const layer = watchlistLayer();

      if (layer) {
        enterWatchlistLayer(layer);
      } else {
        restoreAfterWatchlistClose();
      }
    },90);

    return activated;
  }

  function handleWatchlist(event, layer) {
    if (['Escape','BrowserBack','GoBack'].includes(event.key)) {
      consume(
        event
      );

      if (
        layer.type ===
          'watchlist-dialog'
      ) {
        closeWatchlistLayer(
          layer
        );

        setTimeout(
          () =>
            focusMainTab(
              'watchlist',
              false
            ),
          90
        );

        return true;
      }

      const rows =
        watchlistRows(
          layer
        );

      const current =
        rows[
          Math.max(
            0,
            Math.min(
              watchlistRow,
              rows.length - 1
            )
          )
        ]?.[
          Math.max(
            0,
            watchlistCol
          )
        ];

      if (
        current?.id ===
          'jws3-home-tab'
      ) {
        return true;
      }

      focusMainTab(
        'watchlist',
        false
      );

      const headerRow =
        rows.findIndex(
          row =>
            row.some(
              target =>
                target.id ===
                  'jws3-home-tab'
            )
        );

      if (
        headerRow >= 0
      ) {
        watchlistRow =
          headerRow;

        watchlistCol =
          Math.max(
            0,
            rows[
              headerRow
            ].findIndex(
              target =>
                target.id ===
                  'jws3-home-tab'
            )
          );
      }

      return true;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(event.key)
    ) {
      return false;
    }

    consume(event);

    const rows = watchlistRows(layer);

    if (!rows.length) {
      hideFocus();
      return true;
    }

    watchlistRow = Math.max(0,Math.min(watchlistRow,rows.length-1));
    watchlistCol = Math.max(0,Math.min(watchlistCol,rows[watchlistRow].length-1));

    if (event.key === 'ArrowLeft') {
      watchlistCol = Math.max(0,watchlistCol-1);
    } else if (event.key === 'ArrowRight') {
      watchlistCol = Math.min(rows[watchlistRow].length-1,watchlistCol+1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const current =
        rows[
          watchlistRow
        ][
          watchlistCol
        ];

      /*
       * The Watchlist main tab is part of Jellyfin's header, outside the
       * overlay DOM. Make the TV handoff deterministic: Down always enters
       * the Watchlist section-tab row, selecting its active section.
       */
      if (
        event.key ===
          'ArrowDown' &&
        current?.id ===
          'jws3-home-tab'
      ) {
        const sectionRow =
          rows.findIndex(
            row =>
              row.some(
                target =>
                  target.matches?.(
                    '.jws3-tab'
                  )
              )
          );

        if (sectionRow >= 0) {
          watchlistRow =
            sectionRow;

          const activeCol =
            rows[
              sectionRow
            ].findIndex(
              target =>
                target.getAttribute?.(
                  'aria-pressed'
                ) ===
                  'true'
            );

          watchlistCol =
            activeCol >= 0
              ? activeCol
              : 0;
        }
      } else {
        const rect =
          current?.getBoundingClientRect();

        const currentX =
          rect
            ? rect.left +
              rect.width / 2
            : 0;

        const nextRow =
          event.key ===
            'ArrowUp'
            ? watchlistRow - 1
            : watchlistRow + 1;

        if (
          nextRow >= 0 &&
          nextRow < rows.length
        ) {
          watchlistRow =
            nextRow;

          let bestCol =
            0;

          let bestDistance =
            Infinity;

          const targetMetrics =
            rows[
              watchlistRow
            ].map(
              target => ({
                target,
                rect:
                  target.getBoundingClientRect()
              })
            );

          targetMetrics.forEach(
            (
              entry,
              index
            ) => {
              const x =
                entry.rect.left +
                entry.rect.width / 2;

              const distance =
                Math.abs(
                  x -
                  currentX
                );

              if (
                distance <
                bestDistance
              ) {
                bestDistance =
                  distance;

                bestCol =
                  index;
              }
            }
          );

          watchlistCol =
            bestCol;
        }
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      return activateWatchlistTarget(rows[watchlistRow][watchlistCol]);
    }

    showWatchlistFocus(
      rows,
      layer
    );

    return true;
  }

  // ============================================================
  // JELLYFIN ENHANCED
  // ============================================================

  function enhancedInfoModal() {
    return [
      ...document.querySelectorAll(
        '.je-more-info-modal.active'
      )
    ].find(
      visible
    ) || null;
  }

  function enhancedPrimaryTargets(
    root
  ) {
    if (!root) {
      return [];
    }

    const request =
      root.querySelector(
        '.jellyseerr-request-button:not([disabled]),' +
        '.jellyseerr-button-request:not([disabled])'
      );

    const refresh = [
      ...root.querySelectorAll(
        'button,' +
        '[role="button"]'
      )
    ].find(
      el =>
        visible(
          el
        ) &&
        /refresh|reload/i.test(
          textOf(
            el
          )
        )
    );

    const close =
      root.querySelector(
        '.modal-close,' +
        '[aria-label="Close"],' +
        '[title="Close"]'
      );

    return uniqueVisible([
      request,
      refresh,
      close
    ]);
  }

  // ============================================================
  // REQUEST FORMS
  // ============================================================

  function looksLikeRequestForm(
    root
  ) {
    if (
      !root ||
      !visible(
        root
      )
    ) {
      return false;
    }

    const field =
      root.querySelector(
        '.bst-season-option,' +
        '.bst-season-checkbox,' +
        '.bst-quality-option,' +
        '.bst-quality-continue,' +
        'select,' +
        '[role="combobox"],' +
        'input[type="checkbox"],' +
        'input[type="radio"],' +
        '[class*="root-folder" i],' +
        '[class*="quality-profile" i]'
      );

    return (
      !!field &&
      /request|season|quality|root folder|destination|server/i
        .test(
          root.innerText ||
          ''
        )
    );
  }

  function requestFormRoot() {
    const seerr = [
      ...document.querySelectorAll(
        '.bst-quality-wrapper'
      )
    ].filter(
      visible
    );

    if (
      seerr.length
    ) {
      return seerr[
        seerr.length -
        1
      ];
    }

    const candidates = [
      ...document.querySelectorAll(
        '[role="dialog"],' +
        '.modal-overlay,' +
        '.modal-container,' +
        '.formDialog,' +
        '.dialog,' +
        '[class*="request-modal" i],' +
        '[class*="advanced-request" i],' +
        '[class*="request-dialog" i]'
      )
    ].filter(
      el =>
        visible(
          el
        ) &&
        looksLikeRequestForm(
          el
        )
    );

    if (
      !candidates.length
    ) {
      return null;
    }

    candidates.sort(
      (
        a,
        b
      ) => {
        const ar =
          a.getBoundingClientRect();

        const br =
          b.getBoundingClientRect();

        return (
          ar.width *
          ar.height
        ) -
        (
          br.width *
          br.height
        );
      }
    );

    return candidates[0];
  }

  function associatedLabel(
    input,
    root
  ) {
    if (!input) {
      return null;
    }

    if (
      input.id
    ) {
      try {
        const label =
          root.querySelector(
            `label[for="${CSS.escape(
              input.id
            )}"]`
          );

        if (
          label &&
          visible(
            label
          )
        ) {
          return label;
        }
      } catch (_) {}
    }

    const wrapped =
      input.closest(
        'label'
      );

    return (
      wrapped &&
      visible(
        wrapped
      )
        ? wrapped
        : null
    );
  }

  function findFormFieldByLabel(
    root,
    regex
  ) {
    for (
      const label of
      root.querySelectorAll(
        'label,' +
        '.fieldDescription,' +
        '.inputLabel,' +
        '[class*="label" i]'
      )
    ) {
      const text =
        (
          label.innerText ||
          label.textContent ||
          ''
        )
          .replace(
            /\s+/g,
            ' '
          )
          .trim();

      if (
        !regex.test(
          text
        )
      ) {
        continue;
      }

      if (
        label.htmlFor
      ) {
        try {
          const control =
            root.querySelector(
              `#${CSS.escape(
                label.htmlFor
              )}`
            );

          if (
            control &&
            visible(
              control
            )
          ) {
            return control;
          }
        } catch (_) {}
      }

      const inside =
        label.querySelector(
          'select,' +
          '[role="combobox"],' +
          'button,' +
          'input'
        );

      if (
        inside &&
        visible(
          inside
        )
      ) {
        return inside;
      }

      const nearby =
        label.parentElement
          ?.querySelector(
            'select,' +
            '[role="combobox"],' +
            'button:not([disabled]),' +
            'input'
          );

      if (
        nearby &&
        visible(
          nearby
        )
      ) {
        return nearby;
      }
    }

    return null;
  }

  const requestServerField =
    root =>
      findFormFieldByLabel(
        root,
        /destination\s*server/i
      ) ||
      findFormFieldByLabel(
        root,
        /^server$/i
      );

  const requestQualityField =
    root =>
      findFormFieldByLabel(
        root,
        /quality\s*profile/i
      );

  const requestRootField =
    root =>
      findFormFieldByLabel(
        root,
        /root\s*folder/i
      );

  function requestFormTargets(
    root
  ) {
    const result =
      [];

    const add =
      el => {
        if (
          el &&
          visible(
            el
          ) &&
          !result.includes(
            el
          )
        ) {
          result.push(
            el
          );
        }
      };

    root
      .querySelectorAll(
        '.bst-season-option'
      )
      .forEach(
        add
      );

    root
      .querySelectorAll(
        '.bst-quality-option'
      )
      .forEach(
        add
      );

    root
      .querySelectorAll(
        '.bst-quality-continue'
      )
      .forEach(
        add
      );

    add(
      requestServerField(
        root
      )
    );

    add(
      requestRootField(
        root
      )
    );

    add(
      requestQualityField(
        root
      )
    );

    root
      .querySelectorAll(
        'select:not([disabled]),' +
        '[role="combobox"]'
      )
      .forEach(
        add
      );

    root
      .querySelectorAll(
        'input[type="checkbox"]:not([disabled]),' +
        'input[type="radio"]:not([disabled])'
      )
      .forEach(
        input => {
          add(
            associatedLabel(
              input,
              root
            ) ||
            input
          );
        }
      );

    root
      .querySelectorAll(
        'button:not([disabled]),' +
        '[role="button"],' +
        '[role="option"],' +
        '[tabindex]:not([tabindex="-1"])'
      )
      .forEach(
        el => {
          if (
            el.closest(
              '.bst-season-option'
            ) ||
            el.classList
              .contains(
                'bst-quality-option'
              )
          ) {
            return;
          }

          add(
            el
          );
        }
      );

    return sortVisual(
      uniqueVisible(
        result
      )
    );
  }

  function exactRequestHorizontalTarget(
    direction,
    root
  ) {
    const current =
      extTargets[
        extIndex
      ];

    if (!current) {
      return null;
    }

    const server =
      requestServerField(
        root
      );

    const quality =
      requestQualityField(
        root
      );

    if (
      !server ||
      !quality
    ) {
      return null;
    }

    if (
      direction ===
      'right' &&
      (
        current ===
        server ||
        server.contains?.(
          current
        ) ||
        current.contains?.(
          server
        )
      )
    ) {
      return quality;
    }

    if (
      direction ===
      'left' &&
      (
        current ===
        quality ||
        quality.contains?.(
          current
        ) ||
        current.contains?.(
          quality
        )
      )
    ) {
      return server;
    }

    return null;
  }

  function moveRequest(
    direction,
    root
  ) {
    let next =
      -1;

    if (
      direction ===
      'left' ||
      direction ===
      'right'
    ) {
      const exact =
        exactRequestHorizontalTarget(
          direction,
          root
        );

      next =
        exact
          ?
            extTargets.indexOf(
              exact
            )
          :
            -1;

      if (
        next <
        0
      ) {
        return false;
      }
    } else {
      next =
        spatialNext(
          direction,
          extTargets,
          extIndex
        );
    }

    if (
      next <
      0
    ) {
      return false;
    }

    extIndex =
      next;

    const target =
      extTargets[
        extIndex
      ];

    scrollModalTarget(
      target,
      extRoot
    );

    requestAnimationFrame(
      () => {
        showFocusElement(
          target
        );
      }
    );

    return true;
  }

  function underlyingControl(
    target
  ) {
    if (!target) {
      return null;
    }

    if (
      target.matches(
        'select,input'
      )
    ) {
      return target;
    }

    if (
      target.matches(
        '.bst-season-option'
      )
    ) {
      return (
        target.querySelector(
          '.bst-season-checkbox,' +
          'input[type="checkbox"],' +
          'input[type="radio"]'
        ) ||
        target
      );
    }

    if (
      target.matches(
        'label'
      )
    ) {
      return (
        target.querySelector(
          'input,select'
        ) ||
        target
      );
    }

    return (
      target.querySelector?.(
        'select,' +
        'input[type="checkbox"],' +
        'input[type="radio"]'
      ) ||
      target
    );
  }

  function dispatchValueEvents(
    control
  ) {
    try {
      control.dispatchEvent(
        new Event(
          'input',
          {
            bubbles:
              true
          }
        )
      );
    } catch (_) {}

    try {
      control.dispatchEvent(
        new Event(
          'change',
          {
            bubbles:
              true
          }
        )
      );
    } catch (_) {}
  }

  function enterSelectMode(
    select,
    visualTarget
  ) {
    if (
      !select ||
      select.tagName !==
      'SELECT'
    ) {
      return false;
    }

    selectMode = {
      select,

      visualTarget:
        visualTarget ||
        select,

      originalIndex:
        select.selectedIndex
    };

    showFocusElement(
      visualTarget ||
      select
    );

    return true;
  }

  function handleSelectMode(
    event
  ) {
    const select =
      selectMode?.select;

    if (
      !select ||
      !select.isConnected
    ) {
      selectMode =
        null;

      return false;
    }

    if (
      [
        'ArrowUp',
        'ArrowLeft',
        'ArrowDown',
        'ArrowRight'
      ].includes(
        event.key
      )
    ) {
      consume(
        event
      );

      const delta =
        (
          event.key ===
          'ArrowUp' ||
          event.key ===
          'ArrowLeft'
        )
          ? -1
          : 1;

      let next =
        select.selectedIndex;

      do {
        next +=
          delta;
      } while (
        next >=
        0 &&
        next <
        select.options.length &&
        select.options[
          next
        ].disabled
      );

      if (
        next >=
        0 &&
        next <
        select.options.length
      ) {
        select.selectedIndex =
          next;

        dispatchValueEvents(
          select
        );
      }

      showFocusElement(
        selectMode
          .visualTarget ||
        select
      );

      return true;
    }

    if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      consume(
        event
      );

      dispatchValueEvents(
        select
      );

      selectMode =
        null;

      return true;
    }

    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      consume(
        event
      );

      select.selectedIndex =
        selectMode
          .originalIndex;

      dispatchValueEvents(
        select
      );

      selectMode =
        null;

      return true;
    }

    return false;
  }

  function activateRequestTarget() {
    const target =
      extTargets[
        extIndex
      ];

    if (!target) {
      return false;
    }

    const control =
      underlyingControl(
        target
      );

    if (
      control?.tagName ===
      'SELECT'
    ) {
      return enterSelectMode(
        control,
        target
      );
    }

    if (
      control?.matches?.(
        'input[type="checkbox"],' +
        'input[type="radio"]'
      )
    ) {
      if (
        target !==
        control
      ) {
        return click(
          target
        );
      }

      control.checked =
        !control.checked;

      dispatchValueEvents(
        control
      );

      return true;
    }

    return click(
      target
    );
  }

  function closeModal(
    root
  ) {
    const close =
      root?.querySelector(
        '.bst-quality-close,' +
        '.bst-modal-close,' +
        '.modal-close,' +
        '.btnClose,' +
        '.btnCancel,' +
        '[aria-label="Close"],' +
        '[title="Close"]'
      );

    return (
      close
        ? click(
            close
          )
        : false
    );
  }

  // ============================================================
  // DETAILS
  // ============================================================

  function detailRoot() {
    return [
      ...document.querySelectorAll(
        '#itemDetailPage'
      )
    ].find(
      visible
    ) || null;
  }

  function detailActions(
    root
  ) {
    return sortVisual(
      uniqueVisible([
        ...root.querySelectorAll(
          '.mainDetailButtons button,' +
          '.mainDetailButtons a'
        ),

        ...root.querySelectorAll(
          '.je-series-request-more-btn'
        )
      ])
    );
  }

  function detailMedia(
    root
  ) {
    return uniqueVisible([
      ...root.querySelectorAll(
        '#childrenCollapsible .card[data-type],' +
        '#listChildrenCollapsible .listItem[data-type="Episode"],' +
        '.moreFromSeasonSection .card[data-type="Episode"],' +
        '.nextUpSection .card[data-type],' +
        '#similarCollapsible .card[data-type],' +
        '.detailVerticalSection .card[data-type],' +
        '.jellyseerr-details-section .jellyseerr-card'
      )
    ]).filter(
      el =>
        !el.closest(
          '#castCollapsible,' +
          '#guestCastCollapsible'
        )
    );
  }

  function detailSimilarCards(
    root
  ) {
    return sortVisual(
      uniqueVisible([
        ...root.querySelectorAll(
          '#similarCollapsible .card[data-type]'
        )
      ])
    );
  }

  function selectFreshDetailTarget(
    root,
    selector
  ) {
    extContext =
      'detail';

    extRoot =
      root;

    extTargets =
      uniqueVisible(
        buildDetailTargets(
          root
        )
      );

    const index =
      extTargets.findIndex(
        selector
      );

    if (
      index < 0
    ) {
      return false;
    }

    extIndex =
      index;

    const target =
      extTargets[
        extIndex
      ];

    scrollDetailTarget(
      target
    );

    requestAnimationFrame(
      () => {
        showFocusElement(
          target
        );
      }
    );

    return true;
  }

  function buildDetailTargets(
    root
  ) {
    rebuildHeaderTargets();

    return [
      ...headerTargets,
      ...detailActions(
        root
      ),
      ...detailMedia(
        root
      )
    ];
  }

  function detailActivationTarget(
    target
  ) {
    if (!target) {
      return null;
    }

    if (
      target.matches(
        'button,' +
        'a[href],' +
        '[role="button"]'
      )
    ) {
      return target;
    }

    return (
      target.querySelector(
        '.cardImageContainer[href],' +
        'a.itemAction[href],' +
        'a[data-action="link"][href],' +
        '.cardImageContainer,' +
        'button.itemAction,' +
        'a[href]'
      ) ||
      target
    );
  }

  function detailPrimaryAction(root) {
    // DOM order does not guarantee that Resume precedes Play.
    for (const selector of [
      '.mainDetailButtons [data-action="resume"],.mainDetailButtons .btnResume',
      '.mainDetailButtons .btnPlay,.mainDetailButtons [data-action="play"]'
    ]) {
      const action = [...root.querySelectorAll(selector)].find(el =>
        visible(el) && !el.matches('[disabled],[aria-disabled="true"]')
      );
      if (action) return action;
    }
    return null;
  }


  function enterDetail(
    root,
    forcePreferred = true
  ) {
    zone =
      'detail';

    const targets =
      buildDetailTargets(
        root
      );

    const primary = detailPrimaryAction(root);

    return setExt(
      'detail', root, targets,
      primary || detailActions(root)[0] || targets[0],
      forcePreferred
    );
  }

  // ============================================================
  // SEARCH
  // ============================================================

  function searchInput() {
    return [
      ...document.querySelectorAll(
        'input[type="search"],' +
        '.searchFields input,' +
        'input.searchInput,' +
        'input.txtSearch,' +
        'input[placeholder*="Search" i],' +
        'input[aria-label*="Search" i]'
      )
    ].find(
      visible
    ) ||
    null;
  }

  function searchPageRoot() {
    const input =
      searchInput();

    if (!input) {
      return null;
    }

    const hash =
      location.hash
        .toLowerCase();

    if (
      hash.includes(
        'search'
      )
    ) {
      return (
        input.closest(
          '.page'
        ) ||
        document.body
      );
    }

    const rect =
      input.getBoundingClientRect();

    return (
      rect.width >
      250
        ?
          (
            input.closest(
              '.page'
            ) ||
            document.body
          )
        :
          null
    );
  }

  function searchRows(
    root
  ) {
    return buildRowsWithin(
      root
    );
  }

  function setSearchInputValue(
    input,
    value
  ) {
    if (!input) {
      return;
    }

    const descriptor =
      Object
        .getOwnPropertyDescriptor(
          HTMLInputElement
            .prototype,
          'value'
        );

    if (
      descriptor?.set
    ) {
      descriptor.set.call(
        input,
        value
      );
    } else {
      input.value =
        value;
    }

    input.dispatchEvent(
      new Event(
        'input',
        {
          bubbles:
            true
        }
      )
    );

    input.dispatchEvent(
      new Event(
        'change',
        {
          bubbles:
            true
        }
      )
    );
  }

  function submitSearch(
    input
  ) {
    if (!input) {
      return;
    }

    input.focus();

    for (
      const type of
      [
        'keydown',
        'keyup'
      ]
    ) {
      input.dispatchEvent(
        new KeyboardEvent(
          type,
          {
            key:
              'Enter',

            code:
              'Enter',

            keyCode:
              13,

            which:
              13,

            bubbles:
              true,

            cancelable:
              true
          }
        )
      );
    }

    try {
      input.closest(
        'form'
      )?.requestSubmit?.();
    } catch (_) {}

    input.blur();
  }

  const KEYBOARD_LAYOUT = [
    [
      'Q',
      'W',
      'E',
      'R',
      'T',
      'Y',
      'U',
      'I',
      'O',
      'P'
    ],

    [
      'A',
      'S',
      'D',
      'F',
      'G',
      'H',
      'J',
      'K',
      'L'
    ],

    [
      'Z',
      'X',
      'C',
      'V',
      'B',
      'N',
      'M',
      '⌫'
    ],

    [
      'CLEAR',
      'SPACE',
      'SEARCH'
    ]
  ];

  function keyboardButton(
    row,
    column
  ) {
    return (
      keyboardRoot?.querySelector(
        `[data-row="${row}"][data-column="${column}"]`
      ) ||
      null
    );
  }

  function updateKeyboardPreview() {
    const preview =
      keyboardRoot
        ?.querySelector(
          '.jfTvKeyboardPreview'
        );

    if (preview) {
      preview.textContent =
        keyboardInput?.value ||
        'Search';
    }
  }

  function showKeyboardFocus() {
    const button =
      keyboardButton(
        keyboardRow,
        keyboardColumn
      );

    if (button) {
      showFocusElement(
        button
      );
    }
  }

  function closeKeyboard(
    submit = false
  ) {
    const input =
      keyboardInput;

    keyboardRoot
      ?.remove();

    keyboardRoot =
      null;

    keyboardInput =
      null;

    keyboardRow =
      0;

    keyboardColumn =
      0;

    const watchlistInput =
      input?.closest?.(
        '#jws3-overlay,' +
        '.jws3-dialog'
      );

    if (
      submit &&
      input
    ) {
      if (watchlistInput) {
        dispatchValueEvents(
          input
        );
      } else {
        submitSearch(
          input
        );
      }
    }

    setTimeout(
      () => {
        if (
          input &&
          watchlistInput &&
          visible(
            input
          )
        ) {
          const layer =
            watchlistLayer();

          if (layer) {
            enterWatchlistLayer(
              layer,
              input
            );

            return;
          }
        }

        if (
          input &&
          visible(
            input
          )
        ) {
          zone =
            'search';

          scrollSearchToTop(
            input,
            searchPageRoot()
          );
        } else {
          resolveContext();
        }
      },
      50
    );
  }

  function applyKeyboardKey(
    key
  ) {
    const input =
      keyboardInput;

    if (!input) {
      return;
    }

    if (
      key ===
      'SEARCH'
    ) {
      closeKeyboard(
        true
      );

      return;
    }

    if (
      key ===
      'CLEAR'
    ) {
      setSearchInputValue(
        input,
        ''
      );

      updateKeyboardPreview();

      return;
    }

    if (
      key ===
      'SPACE'
    ) {
      setSearchInputValue(
        input,
        `${input.value} `
      );

      updateKeyboardPreview();

      return;
    }

    if (
      key ===
      '⌫'
    ) {
      const characters =
        Array.from(
          input.value
        );

      characters.pop();

      setSearchInputValue(
        input,
        characters.join('')
      );

      updateKeyboardPreview();

      return;
    }

    setSearchInputValue(
      input,
      `${input.value}${key.toLowerCase()}`
    );

    updateKeyboardPreview();
  }

  function openKeyboard(
    input
  ) {
    if (
      !input ||
      keyboardRoot
    ) {
      return;
    }

    keyboardInput =
      input;

    keyboardRoot =
      document.createElement(
        'div'
      );

    keyboardRoot.id =
      '__jf_tv_keyboard__';

    const panel =
      document.createElement(
        'div'
      );

    panel.className =
      'jfTvKeyboardPanel';

    const preview =
      document.createElement(
        'div'
      );

    preview.className =
      'jfTvKeyboardPreview';

    preview.textContent =
      input.value ||
      'Search';

    panel.appendChild(
      preview
    );

    KEYBOARD_LAYOUT.forEach(
      (
        items,
        rowNumber
      ) => {
        const row =
          document.createElement(
            'div'
          );

        row.className =
          'jfTvKeyboardRow';

        items.forEach(
          (
            key,
            columnNumber
          ) => {
            const button =
              document.createElement(
                'button'
              );

            button.type =
              'button';

            button.textContent =
              key;

            button.dataset.key =
              key;

            button.dataset.row =
              String(
                rowNumber
              );

            button.dataset.column =
              String(
                columnNumber
              );

            if (
              [
                'CLEAR',
                'SEARCH'
              ].includes(
                key
              )
            ) {
              button.dataset.wide =
                'true';
            }

            if (
              key ===
              'SPACE'
            ) {
              button.dataset.space =
                'true';
            }

            button.addEventListener(
              'click',
              () => {
                applyKeyboardKey(
                  key
                );
              }
            );

            row.appendChild(
              button
            );
          }
        );

        panel.appendChild(
          row
        );
      }
    );

    keyboardRoot.appendChild(
      panel
    );

    document.body.appendChild(
      keyboardRoot
    );

    keyboardRow =
      0;

    keyboardColumn =
      0;

    zone =
      'keyboard';

    showKeyboardFocus();
  }

  function moveKeyboard(
    direction
  ) {
    if (!keyboardRoot) {
      return;
    }

    const currentRow =
      KEYBOARD_LAYOUT[
        keyboardRow
      ];

    if (
      direction ===
      'left'
    ) {
      keyboardColumn =
        Math.max(
          0,
          keyboardColumn -
          1
        );
    } else if (
      direction ===
      'right'
    ) {
      keyboardColumn =
        Math.min(
          currentRow.length -
          1,
          keyboardColumn +
          1
        );
    } else if (
      direction ===
      'up' &&
      keyboardRow >
      0
    ) {
      const relative =
        currentRow.length >
        1
          ?
            keyboardColumn /
            (
              currentRow.length -
              1
            )
          :
            0;

      keyboardRow--;

      keyboardColumn =
        Math.round(
          relative *
          (
            KEYBOARD_LAYOUT[
              keyboardRow
            ].length -
            1
          )
        );
    } else if (
      direction ===
      'down' &&
      keyboardRow <
      KEYBOARD_LAYOUT.length -
      1
    ) {
      const relative =
        currentRow.length >
        1
          ?
            keyboardColumn /
            (
              currentRow.length -
              1
            )
          :
            0;

      keyboardRow++;

      keyboardColumn =
        Math.round(
          relative *
          (
            KEYBOARD_LAYOUT[
              keyboardRow
            ].length -
            1
          )
        );
    }

    showKeyboardFocus();
  }

  function handleKeyboard(
    event
  ) {
    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      consume(
        event
      );

      closeKeyboard(
        false
      );

      return true;
    }

    if (
      event.key ===
      'ArrowLeft'
    ) {
      consume(
        event
      );

      moveKeyboard(
        'left'
      );

      return true;
    }

    if (
      event.key ===
      'ArrowRight'
    ) {
      consume(
        event
      );

      moveKeyboard(
        'right'
      );

      return true;
    }

    if (
      event.key ===
      'ArrowUp'
    ) {
      consume(
        event
      );

      moveKeyboard(
        'up'
      );

      return true;
    }

    if (
      event.key ===
      'ArrowDown'
    ) {
      consume(
        event
      );

      moveKeyboard(
        'down'
      );

      return true;
    }

    if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      consume(
        event
      );

      const button =
        keyboardButton(
          keyboardRow,
          keyboardColumn
        );

      if (button) {
        applyKeyboardKey(
          button.dataset
            .key
        );
      }

      return true;
    }

    return false;
  }

  function handleSearch(
    event,
    root
  ) {
    const input =
      searchInput();

    if (!input) {
      return false;
    }

    if (
      zone ===
      'header'
    ) {
      return handleHeader(
        event
      );
    }

    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      rebuildHeaderTargets();

      const back =
        headerTargets.find(
          el =>
            el.classList
              .contains(
                'headerBackButton'
              ) ||
            /^back$/i.test(
              el.getAttribute(
                'aria-label'
              ) ||
              ''
            ) ||
            /^back$/i.test(
              el.getAttribute(
                'title'
              ) ||
              ''
            )
        );

      if (back) {
        consume(
          event
        );

        click(
          back
        );

        settleAfterHeaderActivation(
          back
        );

        return true;
      }

      return false;
    }

    if (
      zone ===
      'search-results'
    ) {
      rows =
        searchRows(
          root
        );

      if (
        !rows.length
      ) {
        zone =
          'search';

        scrollSearchToTop(
          input,
          root
        );

        return true;
      }

      if (
        event.key ===
        'ArrowLeft'
      ) {
        consume(
          event
        );

        moveCardHorizontal(
          'left'
        );

        return true;
      }

      if (
        event.key ===
        'ArrowRight'
      ) {
        consume(
          event
        );

        moveCardHorizontal(
          'right'
        );

        return true;
      }

      if (
        event.key ===
        'ArrowUp'
      ) {
        consume(
          event
        );

        if (
          rowIndex ===
          0
        ) {
          zone =
            'search';

          scrollSearchToTop(
            input,
            root
          );
        } else {
          selectRow(
            rowIndex -
            1,

            Math.min(
              cardIndex,

              rows[
                rowIndex -
                1
              ].cards.length -
              1
            )
          );
        }

        return true;
      }

      if (
        event.key ===
        'ArrowDown'
      ) {
        consume(
          event
        );

        if (
          rowIndex <
          rows.length -
          1
        ) {
          selectRow(
            rowIndex +
            1,

            Math.min(
              cardIndex,

              rows[
                rowIndex +
                1
              ].cards.length -
              1
            )
          );
        }

        return true;
      }

      if (
        event.key ===
        'Enter' ||
        event.key ===
        ' '
      ) {
        consume(
          event
        );

        activateCurrentCard();

        return true;
      }

      return false;
    }

    if (
      event.key ===
      'ArrowUp'
    ) {
      consume(
        event
      );

      scrollSearchToTop(
        input,
        root
      );

      enterHeader(
        false
      );

      const backIndex =
        headerTargets.findIndex(
          el =>
            el.classList
              .contains(
                'headerBackButton'
              ) ||
            /^back$/i.test(
              el.getAttribute(
                'aria-label'
              ) ||
              ''
            ) ||
            /^back$/i.test(
              el.getAttribute(
                'title'
              ) ||
              ''
            )
        );

      if (
        backIndex >=
        0
      ) {
        headerIndex =
          backIndex;

        showFocusElement(
          headerTargets[
            headerIndex
          ]
        );
      }

      return true;
    }

    if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      consume(
        event
      );

      zone =
        'search';

      openKeyboard(
        input
      );

      return true;
    }

    if (
      event.key ===
      'ArrowDown'
    ) {
      const foundRows =
        searchRows(
          root
        );

      if (
        foundRows.length
      ) {
        consume(
          event
        );

        rows =
          foundRows;

        rowIndex =
          0;

        cardIndex =
          0;

        zone =
          'search-results';

        selectRow(
          0,
          0
        );

        return true;
      }
    }

    return false;
  }

  // ============================================================
  // PLAYER
  // ============================================================

  function playerPage() {
    const onVideoRoute = /#\/video(?:$|\?)/.test(location.hash);
    if (location.hash.startsWith('#/home')) return null;
    const page = document.querySelector('#videoOsdPage');
    if (page?.isConnected && (onVideoRoute ||
      (visible(page) && activeVisiblePage() === page))) return page;
    const video = document.querySelector('video.htmlvideoplayer,video');
    if (video?.isConnected && onVideoRoute) {
      return page || video.closest('.page') || document.body;
    }
    return null;
  }

  function enhancedPauseScreen() {
    const overlay = document.querySelector('#pause-screen-overlay');
    return overlay?.getAttribute('aria-hidden') === 'false' && visible(overlay)
      ? overlay : null;
  }

  function activePlayerVideo(page) {
    return uniqueVisible([
      ...document.querySelectorAll('.videoPlayerContainer video,video.htmlvideoplayer'),
      ...page.querySelectorAll('video')
    ])[0] || null;
  }

  function dismissEnhancedPauseScreen(root, dismissed = true) {
    const instance = window.JellyfinEnhanced?.pauseScreenInstance;
    if (instance?.overlay === root && typeof instance.hideOverlay === 'function') {
      instance.hideOverlay(dismissed);
      return true;
    }
    return click(root?.querySelector('#pause-screen-close-btn'));
  }

  function togglePlayerPlayback(page, resumeOnly = false) {
    const video = activePlayerVideo(page);
    if (!video || video.ended) return false;
    hideFocus();
    if (!video.paused && !resumeOnly) {
      video.pause();
      scheduleContextRefresh(80);
    } else if (video.paused) {
      // Use the same media API as Enhanced's own Enter handler. Jellyfin
      // still receives pause/play events and reports playback state normally.
      try {
        Promise.resolve(video.play()).then(() => {
          const overlay = enhancedPauseScreen();
          if (overlay) dismissEnhancedPauseScreen(overlay, false);
          scheduleContextRefresh(80);
        }).catch(error => console.warn('[JellyNav] Resume failed:', error));
      } catch (error) {
        console.warn('[JellyNav] Resume failed:', error);
      }
    } else {
      // A play event may already have resumed the video before key release.
      const overlay = enhancedPauseScreen();
      if (overlay) dismissEnhancedPauseScreen(overlay, false);
      scheduleContextRefresh(80);
    }
    return true;
  }

  function handleEnhancedPauseScreen(event, root) {
    if (!['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Escape', 'BrowserBack', 'GoBack'].includes(event.key)) return false;
    consume(event);
    const page = playerPage();
    if (event.key === 'Enter' || event.key === ' ') {
      if (page) togglePlayerPlayback(page, true);
    } else {
      // Dismiss through Enhanced so its timer and focus trap are released.
      // The video remains paused; Back dismisses this screen before exit.
      dismissEnhancedPauseScreen(root);
      keepPlayerOsdAlive();
      scheduleContextRefresh(80);
    }
    return true;
  }

  function playerBottomElement(
    page
  ) {
    return (
      page?.querySelector(
        '.videoOsdBottom-maincontrols'
      ) ||
      page?.querySelector(
        '.videoOsdBottom'
      ) ||
      null
    );
  }

  function nativePlayerOsdCommand(
    command = 'info'
  ) {
    try {
      window.dispatchEvent(
        new CustomEvent(
          'command',
          {
            detail: {
              command
            },

            bubbles:
              true,

            cancelable:
              true,

            composed:
              true
          }
        )
      );

      return true;
    } catch (error) {
      console.warn(
        '[JellyNav] Native Jellyfin OSD command failed:',
        error
      );

      return false;
    }
  }

  function playerSleeping(
    page
  ) {
    if (!page) {
      return false;
    }

    const bottom =
      playerBottomElement(
        page
      );

    if (!bottom) {
      return true;
    }

    if (
      bottom.classList
        .contains(
          'hide'
        ) ||
      bottom.classList
        .contains(
          'videoOsdBottom-hidden'
        )
    ) {
      return true;
    }

    const rect =
      bottom.getBoundingClientRect();

    const style =
      getComputedStyle(
        bottom
      );

    return (
      style.display ===
      'none' ||
      style.visibility ===
      'hidden' ||
      Number(
        style.opacity ||
        1
      ) ===
      0 ||
      rect.width <=
      2 ||
      rect.height <=
      2
    );
  }

  function playerBottomControls(
    page
  ) {
    const controls =
      uniqueVisible([
        ...(
          page ||
          document
        ).querySelectorAll(
          '.videoOsdBottom button:not([disabled]),' +
          '.osdControls button:not([disabled])'
        )
      ]);

    const left =
      new Map(
        controls.map(
          control => [
            control,
            control.getBoundingClientRect()
              .left
          ]
        )
      );

    return controls.sort(
      (a, b) =>
        left.get(a) -
        left.get(b)
    );
  }

  function playerTopControls(
    page
  ) {
    const controls =
      uniqueVisible([
        ...page.querySelectorAll(
          '.osdHeader button:not([disabled])'
        )
      ]);

    const left =
      new Map(
        controls.map(
          control => [
            control,
            control.getBoundingClientRect()
              .left
          ]
        )
      );

    return controls.sort(
      (a, b) =>
        left.get(a) -
        left.get(b)
    );
  }

  function playerSlider(
    page
  ) {
    const slider =
      page?.querySelector(
        '.osdPositionSlider'
      );

    return (
      slider &&
      visible(
        slider
      )
        ? slider
        : null
    );
  }

  function findPlayerPauseIndex(
    controls
  ) {
    return controls.findIndex(
      button =>
        button.matches(
          '.btnPause,' +
          '.btnPlay'
        ) ||
        /^(pause|play)$/i
          .test(
            button.getAttribute(
              'aria-label'
            ) ||
            ''
          ) ||
        /^(pause|play)(\s|\()/i
          .test(
            button.getAttribute(
              'title'
            ) ||
            ''
          )
    );
  }

  function wakePlayer(
    page
  ) {
    hideFocus();

    nativePlayerOsdCommand(
      'select'
    );

    clearTimeout(
      playerWakeTimer
    );

    playerWakeTimer =
      setTimeout(
        () => {
          const live =
            playerPage();

          if (!live) {
            return;
          }

          ensurePlayerObserver(
            live
          );

          if (
            playerSleeping(
              live
            )
          ) {
            nativePlayerOsdCommand(
              'select'
            );
          }

          requestAnimationFrame(
            () => {
              const controls =
                playerBottomControls(
                  live
                );

              const pauseIndex =
                findPlayerPauseIndex(
                  controls
                );

              playerBottomIndex =
                pauseIndex >=
                0
                  ? pauseIndex
                  : 0;

              playerLane =
                'bottom';

              showPlayerFocus();
            }
          );
        },
        40
      );
  }

  function keepPlayerOsdAlive() {
    nativePlayerOsdCommand(
      'info'
    );
  }

  function showPlayerFocus() {
    const page =
      playerPage();

    if (
      !page ||
      playerSleeping(
        page
      )
    ) {
      hideFocus();

      return;
    }

    if (
      playerLane ===
      'progress'
    ) {
      const slider =
        playerSlider(
          page
        );

      showFocusElement(
        slider?.closest(
          '.sliderContainer'
        ) ||
        slider
      );

      return;
    }

    const controls =
      playerLane ===
      'top'
        ?
          playerTopControls(
            page
          )
        :
          playerBottomControls(
            page
          );

    if (
      !controls.length
    ) {
      hideFocus();

      return;
    }

    if (
      playerLane ===
      'top'
    ) {
      playerTopIndex =
        Math.max(
          0,
          Math.min(
            playerTopIndex,
            controls.length -
            1
          )
        );

      showFocusElement(
        controls[
          playerTopIndex
        ]
      );
    } else {
      playerBottomIndex =
        Math.max(
          0,
          Math.min(
            playerBottomIndex,
            controls.length -
            1
          )
        );

      showFocusElement(
        controls[
          playerBottomIndex
        ]
      );
    }
  }

  function enterPlayer(
    page
  ) {
    /*
     * The outgoing Details/Home DOM can remain visible underneath Jellyfin's
     * player while the video is still loading. Hide our previous navigation
     * ring immediately on player entry; only the player's own OSD may reveal
     * focus again once its controls are actually visible.
     */
    hideFocus();

    zone =
      'player';

    ensurePlayerObserver(
      page
    );

    if (
      playerSleeping(
        page
      )
    ) {
      hideFocus();

      return true;
    }

    const controls =
      playerBottomControls(
        page
      );

    const pauseIndex =
      findPlayerPauseIndex(
        controls
      );

    playerBottomIndex =
      pauseIndex >=
      0
        ? pauseIndex
        : 0;

    playerLane =
      'bottom';

    showPlayerFocus();

    return true;
  }

  function seekPlayer(
    direction
  ) {
    const page =
      playerPage();

    if (!page) {
      return false;
    }

    keepPlayerOsdAlive();

    const button =
      direction ===
      'left'
        ?
          page.querySelector(
            '.btnRewind'
          )
        :
          page.querySelector(
            '.btnFastForward'
          );

    if (
      button &&
      visible(
        button
      )
    ) {
      return click(
        button
      );
    }

    const video = [
      ...document.querySelectorAll(
        'video.htmlvideoplayer,' +
        'video'
      )
    ].find(
      visible
    );

    if (
      !video ||
      !Number.isFinite(
        video.duration
      )
    ) {
      return false;
    }

    video.currentTime =
      Math.max(
        0,
        Math.min(
          video.duration,

          video.currentTime +
          (
            direction ===
            'left'
              ? -10
              : 10
          )
        )
      );

    return true;
  }

  function restoreFocusAfterBackNavigation(
    departingRoot
  ) {
    const token =
      ++backFocusRestoreToken;

    const settle =
      attempt => {
        if (
          token !==
          backFocusRestoreToken
        ) {
          return;
        }

        if (
          departingRoot &&
          departingRoot.isConnected &&
          visible(
            departingRoot
          )
        ) {
          if (attempt < 20) {
            setTimeout(
              () =>
                settle(
                  attempt + 1
                ),
              100
            );
          }

          return;
        }

        const details =
          detailRoot();

        if (details) {
          resetTransientNavigationState(
            'route-reset'
          );

          detailFocusRoot =
            details;

          detailPrimaryPending =
            true;

          enterDetail(
            details,
            true
          );

          detailPrimaryPending =
            false;

          maintainScopedObservers();

          return;
        }

        if (
          (
            !location.hash ||
            location.hash.startsWith(
              '#/home'
            )
          ) &&
          !playerPage() &&
          !searchPageRoot() &&
          !nativeLibraryPageRoot() &&
          !drawerOpen()
        ) {
          resetTransientNavigationState(
            'route-reset'
          );

          beginHomePreferredFocus();
          maintainScopedObservers();

          return;
        }

        const context =
          resolveContext();

        if (
          context.type !==
            'player' &&
          context.root !==
            departingRoot
        ) {
          maintainScopedObservers();

          return;
        }

        if (attempt < 20) {
          setTimeout(
            () =>
              settle(
                attempt + 1
              ),
            100
          );
        }
      };

    setTimeout(
      () =>
        settle(0),
      60
    );
  }

  function restoreParentMainTabAfterBackNavigation(
    departingRoot
  ) {
    const token =
      ++backFocusRestoreToken;

    const settle =
      attempt => {
        if (
          token !==
          backFocusRestoreToken
        ) {
          return;
        }

        if (
          departingRoot &&
          departingRoot.isConnected &&
          visible(
            departingRoot
          )
        ) {
          if (
            attempt <
            20
          ) {
            setTimeout(
              () =>
                settle(
                  attempt + 1
                ),
              100
            );
          }

          return;
        }

        if (
          focusMainTab(
            parentMainTabKey,
            true
          )
        ) {
          maintainScopedObservers();

          return;
        }

        if (
          attempt <
          20
        ) {
          setTimeout(
            () =>
              settle(
                attempt + 1
              ),
            100
          );
        }
      };

    setTimeout(
      () =>
        settle(0),
      60
    );
  }

  function exitPlayer(
    restoreFocus = true
  ) {
    const departingRoot =
      playerPage();

    removePlayerLaunchShield();

    clearTimeout(
      playerWakeTimer
    );

    disconnectPlayerObserver();

    hideFocus();

    const back =
      document.querySelector(
        '#videoOsdPage .headerBackButton,' +
        '#videoOsdPage button[aria-label="Back"],' +
        '#videoOsdPage button[title="Back"],' +
        '.headerBackButton'
      );

    if (
      back &&
      back.isConnected
    ) {
      click(
        back
      );

      if (restoreFocus) {
        restoreFocusAfterBackNavigation(
          departingRoot
        );
      }

      return true;
    }

    window.history.back();

    if (restoreFocus) {
      restoreFocusAfterBackNavigation(
        departingRoot
      );
    }

    return true;
  }

  // ============================================================
  // DRAWER
  // ============================================================

  function mainDrawer() {
    return document.querySelector(
      '.mainDrawer'
    );
  }

  function drawerOpen() {
    const root =
      mainDrawer();

    if (!root || !visible(root)) {
      return false;
    }

    const rect =
      root.getBoundingClientRect();

    /*
     * Closed Jellyfin drawers remain rendered off-screen. In the
     * captured Jellyfin 12 DOM the closed drawer ended at x=-16.
     * Requiring a meaningful portion inside the viewport avoids
     * treating that off-screen drawer as open.
     */
    return (
      rect.right > 60 &&
      rect.left < innerWidth &&
      rect.bottom > 60
    );
  }

  function drawerTargets() {
    const root =
      mainDrawer();

    if (!root) {
      return [];
    }

    return sortVisual(
      uniqueVisible([
        ...root.querySelectorAll(
          '.libraryMenuOptions .navMenuOption,' +
          '.adminMenuOptions .navMenuOption[data-itemid="dashboard"],' +
          '.adminMenuOptions .lnkManageServer[href="#/dashboard"]'
        )
      ]).filter(
        el =>
          !el.matches(
            '[disabled],[aria-disabled="true"]'
          )
      )
    );
  }

  function enterDrawer(
    preferSelected = true
  ) {
    const targets =
      drawerTargets();

    if (!targets.length) {
      return false;
    }

    if (preferSelected) {
      const selected =
        targets.findIndex(
          el =>
            el.classList.contains(
              'navMenuOption-selected'
            ) ||
            el.getAttribute(
              'aria-current'
            ) === 'page'
        );

      if (selected >= 0) {
        drawerIndex = selected;
      }
    }

    drawerIndex =
      Math.max(
        0,
        Math.min(
          drawerIndex,
          targets.length - 1
        )
      );

    zone = 'drawer';

    const target =
      targets[
        drawerIndex
      ];

    target.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto'
    });

    requestAnimationFrame(
      () =>
        showFocusElement(
          target
        )
    );

    return true;
  }

  function closeDrawer() {
    const button =
      document.querySelector(
        '.mainDrawerButton'
      );

    if (button) {
      click(button);
      return true;
    }

    return false;
  }

  function handleDrawer(
    event
  ) {
    if (
      ![
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Enter',
        ' ',
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(event);

    const targets =
      drawerTargets();

    if (!targets.length) {
      return true;
    }

    drawerIndex =
      Math.max(
        0,
        Math.min(
          drawerIndex,
          targets.length - 1
        )
      );

    if (
      event.key === 'Escape' ||
      event.key === 'BrowserBack' ||
      event.key === 'GoBack' ||
      event.key === 'ArrowLeft'
    ) {
      closeDrawer();
      setTimeout(
        resolveContext,
        120
      );
      return true;
    }

    if (event.key === 'ArrowUp') {
      drawerIndex =
        Math.max(
          0,
          drawerIndex - 1
        );
    } else if (
      event.key === 'ArrowDown'
    ) {
      drawerIndex =
        Math.min(
          targets.length - 1,
          drawerIndex + 1
        );
    } else if (
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      click(
        targets[
          drawerIndex
        ]
      );

      setTimeout(
        () => {
          resetTransientNavigationState(
            'route-reset'
          );
          clearNativeLibraryState();
          resolveContext();
        },
        180
      );

      return true;
    }

    const target =
      targets[
        drawerIndex
      ];

    target.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto'
    });

    requestAnimationFrame(
      () =>
        showFocusElement(
          target
        )
    );

    return true;
  }

  // ============================================================
  // NATIVE JELLYFIN LIBRARIES
  // ============================================================

  function activeVisiblePage() {
    const pages =
      document.querySelectorAll(
        '.page'
      );

    for (
      let index =
        pages.length - 1;
      index >= 0;
      index--
    ) {
      if (
        visible(
          pages[
            index
          ]
        )
      ) {
        return pages[
          index
        ];
      }
    }

    return null;
  }

  function nativeLibraryPageRoot() {
    if (drawerOpen()) {
      return null;
    }

    const page =
      activeVisiblePage();

    if (!page) {
      return null;
    }

    if (
      page.matches(
        '#indexPage,' +
        '#itemDetailPage,' +
        '.itemDetailPage,' +
        '.searchPage,' +
        '.videoOsdPage'
      )
    ) {
      return null;
    }

    const hash =
      location.hash
        .toLowerCase();

    const routeLooksLikeLibrary =
      hash.startsWith('#/movies') ||
      hash.startsWith('#/tv') ||
      hash.includes('collectiontype=movies') ||
      hash.includes('collectiontype=tvshows');

    if (
      routeLooksLikeLibrary &&
      page.classList.contains(
        'libraryPage'
      )
    ) {
      return page;
    }

    if (
      page.classList.contains(
        'collectionEditorPage'
      ) &&
      page.classList.contains(
        'libraryPage'
      )
    ) {
      return page;
    }

    return null;
  }

  function nativeLibraryContent(
    root
  ) {
    if (!root) {
      return null;
    }

    return [
      ...root.querySelectorAll(
        '.pageTabContent'
      )
    ].find(
      visible
    ) || root;
  }

  function nativeActiveTabIndex() {
    const active = [
      ...document.querySelectorAll(
        '.emby-tab-button.emby-tab-button-active,' +
        '.emby-tab-button[aria-selected="true"]'
      )
    ].find(
      el => {
        if (!visible(el)) {
          return false;
        }

        const rect =
          el.getBoundingClientRect();

        return (
          rect.top >= -5 &&
          rect.top < 135
        );
      }
    );

    const value =
      Number(
        active?.dataset?.index
      );

    return Number.isFinite(value)
      ? value
      : 0;
  }

  function nativeLibraryCards(
    root
  ) {
    const content =
      nativeLibraryContent(
        root
      );

    if (!content) {
      return [];
    }

    return uniqueVisible([
      ...content.querySelectorAll(
        '.itemsContainer > .card,' +
        '.verticalSection > .card,' +
        '.listItem[data-type]'
      )
    ]).filter(
      el =>
        !el.closest(
          '#castCollapsible,' +
          '#guestCastCollapsible'
        )
    );
  }

  function nativeSectionTitle(
    section,
    container
  ) {
    if (!section) {
      return null;
    }

    const direct =
      section.querySelector(
        '.sectionTitleTextButton,' +
        '.sectionTitle a[href],' +
        '.sectionTitle button,' +
        'a.sectionTitleTextButton[href]'
      );

    if (
      direct &&
      visible(direct)
    ) {
      return direct;
    }

    const containerTop =
      container
        ?.getBoundingClientRect()
        .top ?? Infinity;

    return [
      ...section.querySelectorAll(
        'a[href],button:not([disabled])'
      )
    ].find(
      el => {
        if (
          !visible(el) ||
          el.closest('.card')
        ) {
          return false;
        }

        return (
          el.getBoundingClientRect()
            .bottom <=
          containerTop + 30
        );
      }
    ) || null;
  }

  function buildNativeLibraryRows(
    root
  ) {
    const cards =
      nativeLibraryCards(
        root
      );

    if (!cards.length) {
      return [];
    }

    const bySection =
      new Map();

    for (const card of cards) {
      const container =
        card.closest(
          '.itemsContainer'
        ) ||
        card.parentElement;

      const section =
        card.closest(
          '.verticalSection'
        ) ||
        container;

      const key =
        section ||
        container ||
        root;

      if (!bySection.has(key)) {
        bySection.set(
          key,
          {
            section,
            container,
            cards: []
          }
        );
      }

      bySection.get(key)
        .cards.push(card);
    }

    const result = [];

    for (
      const group of
      bySection.values()
    ) {
      const sorted =
        sortVisual(
          group.cards
        );

      const visualRows = [];

      for (const card of sorted) {
        const rect =
          card.getBoundingClientRect();

        const centerY =
          rect.top +
          rect.height / 2;

        let row =
          visualRows.find(
            candidate =>
              Math.abs(
                candidate.centerY -
                centerY
              ) <
              Math.max(
                55,
                rect.height * 0.28
              )
          );

        if (!row) {
          row = {
            centerY,
            cards: []
          };

          visualRows.push(row);
        }

        row.cards.push(card);
        row.centerY =
          row.cards.reduce(
            (sum, item) => {
              const r =
                item.getBoundingClientRect();

              return sum +
                r.top +
                r.height / 2;
            },
            0
          ) /
          row.cards.length;
      }

      visualRows.sort(
        (a, b) =>
          a.centerY -
          b.centerY
      );

      const title =
        nativeSectionTitle(
          group.section,
          group.container
        );

      visualRows.forEach(
        (row, index) => {
          row.cards.sort(
            (a, b) =>
              a.getBoundingClientRect()
                .left -
              b.getBoundingClientRect()
                .left
          );

          result.push({
            container:
              group.container,
            section:
              group.section,
            title:
              index === 0
                ? title
                : null,
            cards:
              row.cards,
            centerY:
              row.centerY
          });
        }
      );
    }

    return result.sort(
      (a, b) =>
        a.centerY -
        b.centerY
    );
  }

  function nativeLibraryControls(
    root
  ) {
    const content =
      nativeLibraryContent(
        root
      );

    if (!content) {
      return [];
    }

    const firstCard =
      nativeLibraryCards(
        root
      )[0];

    const firstCardTop =
      firstCard
        ?.getBoundingClientRect()
        .top ?? Infinity;

    const controls =
      uniqueVisible([
        ...content.querySelectorAll(
          '.btnPreviousPage,' +
          '.btnNextPage,' +
          '.btnPlayAll,' +
          '.btnShuffle,' +
          '.btnSelectView,' +
          '.btnSort,' +
          '.btnFilter,' +
          '.listPaging button,' +
          '.paging button,' +
          'select:not([disabled])'
        )
      ]).filter(
        el =>
          !el.disabled &&
          el.getAttribute(
            'aria-disabled'
          ) !== 'true' &&
          !el.classList.contains(
            'alphaPickerButton'
          ) &&
          !el.closest(
            '.card'
          ) &&
          el.getBoundingClientRect()
            .top <
          firstCardTop
      );

    return sortVisual(
      controls
    );
  }

  function nativeAlphaTargets(
    root
  ) {
    const content =
      nativeLibraryContent(
        root
      );

    if (!content) {
      return [];
    }

    const targets =
      uniqueVisible([
        ...content.querySelectorAll(
          '.alphaPickerButton'
        )
      ]).filter(
        el =>
          !el.disabled &&
          el.getAttribute(
            'aria-disabled'
          ) !== 'true'
      );

    const top =
      new Map(
        targets.map(
          target => [
            target,
            target.getBoundingClientRect()
              .top
          ]
        )
      );

    return targets.sort(
      (a, b) =>
        top.get(a) -
        top.get(b)
    );
  }

  function clearNativeLibraryState() {
    nativeLibraryRoot = null;
    nativeLibraryDirty = true;
    nativeLibraryRows = [];
    nativeLibraryRow = 0;
    nativeLibraryCol = 0;
    nativeLibraryControlsCache = [];
    nativeLibraryControlIndex = 0;
    nativeAlphaTargetsCache = [];
    nativeAlphaIndex = 0;
    nativeAlphaReturnRow = 0;
    nativeAlphaReturnCol = 0;
    nativeSectionTitleTarget = null;
    nativeSectionReturnRow = 0;
  }

  function refreshNativeLibraryState(
    root
  ) {
    nativeLibraryRoot = root;
    nativeLibraryRows =
      buildNativeLibraryRows(
        root
      );
    nativeLibraryControlsCache =
      nativeLibraryControls(
        root
      );
    nativeAlphaTargetsCache =
      nativeAlphaTargets(
        root
      );

    if (nativeLibraryRows.length) {
      nativeLibraryRow =
        Math.max(
          0,
          Math.min(
            nativeLibraryRow,
            nativeLibraryRows.length - 1
          )
        );

      const cards =
        nativeLibraryRows[
          nativeLibraryRow
        ].cards;

      nativeLibraryCol =
        Math.max(
          0,
          Math.min(
            nativeLibraryCol,
            cards.length - 1
          )
        );
    } else {
      nativeLibraryRow = 0;
      nativeLibraryCol = 0;
    }

    nativeLibraryControlIndex =
      Math.max(
        0,
        Math.min(
          nativeLibraryControlIndex,
          Math.max(
            0,
            nativeLibraryControlsCache.length - 1
          )
        )
      );

    nativeAlphaIndex =
      Math.max(
        0,
        Math.min(
          nativeAlphaIndex,
          Math.max(
            0,
            nativeAlphaTargetsCache.length - 1
          )
        )
      );

    nativeLibraryDirty =
      false;
  }

  function scrollNativeTarget(
    target
  ) {
    if (!target) {
      return;
    }

    const rect =
      target.getBoundingClientRect();

    if (
      rect.top >= 115 &&
      rect.bottom <=
        innerHeight - 70
    ) {
      return;
    }

    try {
      target.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest'
      });
    } catch (_) {
      target.scrollIntoView(false);
    }
  }

  function showNativeCardFocus() {
    const card =
      nativeLibraryRows[
        nativeLibraryRow
      ]?.cards[
        nativeLibraryCol
      ];

    if (!card) {
      hideFocus();
      return;
    }

    scrollNativeTarget(card);

    requestAnimationFrame(
      () =>
        requestAnimationFrame(
          () =>
            showFocus(card)
        )
    );
  }

  function setNativeGridPosition(
    row,
    col
  ) {
    if (!nativeLibraryRows.length) {
      return false;
    }

    nativeLibraryRow =
      Math.max(
        0,
        Math.min(
          row,
          nativeLibraryRows.length - 1
        )
      );

    const cards =
      nativeLibraryRows[
        nativeLibraryRow
      ].cards;

    if (!cards.length) {
      return false;
    }

    nativeLibraryCol =
      Math.max(
        0,
        Math.min(
          col,
          cards.length - 1
        )
      );

    zone = 'native-grid';
    nativeSectionTitleTarget = null;
    showNativeCardFocus();
    return true;
  }

  function showNativeControlFocus() {
    const target =
      nativeLibraryControlsCache[
        nativeLibraryControlIndex
      ];

    if (!target) {
      hideFocus();
      return;
    }

    scrollNativeTarget(target);
    requestAnimationFrame(
      () =>
        showFocusElement(
          target
        )
    );
  }

  function enterNativeControls() {
    if (!nativeLibraryControlsCache.length) {
      return false;
    }

    nativeLibraryControlIndex =
      Math.max(
        0,
        Math.min(
          nativeLibraryControlIndex,
          nativeLibraryControlsCache.length - 1
        )
      );

    zone = 'native-controls';
    showNativeControlFocus();
    return true;
  }

  function showNativeAlphaFocus() {
    const target =
      nativeAlphaTargetsCache[
        nativeAlphaIndex
      ];

    if (!target) {
      hideFocus();
      return;
    }

    showFocusElement(target);
  }

  function enterNativeAlpha() {
    if (!nativeAlphaTargetsCache.length) {
      return false;
    }

    nativeAlphaReturnRow =
      nativeLibraryRow;
    nativeAlphaReturnCol =
      nativeLibraryCol;

    const card =
      nativeLibraryRows[
        nativeLibraryRow
      ]?.cards[
        nativeLibraryCol
      ];

    if (card) {
      const cardY =
        card.getBoundingClientRect()
          .top +
        card.getBoundingClientRect()
          .height / 2;

      let best = 0;
      let bestDistance = Infinity;

      nativeAlphaTargetsCache.forEach(
        (target, index) => {
          const rect =
            target.getBoundingClientRect();

          const distance =
            Math.abs(
              rect.top +
              rect.height / 2 -
              cardY
            );

          if (distance < bestDistance) {
            bestDistance = distance;
            best = index;
          }
        }
      );

      nativeAlphaIndex = best;
    }

    zone = 'native-alpha';
    showNativeAlphaFocus();
    return true;
  }

  function closestNativeRowToViewport() {
    if (!nativeLibraryRows.length) {
      return 0;
    }

    const targetY =
      innerHeight * 0.52;

    let best =
      nativeAlphaReturnRow;
    let bestDistance =
      Infinity;

    nativeLibraryRows.forEach(
      (row, index) => {
        const card =
          row.cards[0];

        if (!card) {
          return;
        }

        const rect =
          card.getBoundingClientRect();

        const distance =
          Math.abs(
            rect.top +
            rect.height / 2 -
            targetY
          );

        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      }
    );

    return best;
  }

  function enterNativeSectionTitle(
    rowIndexValue
  ) {
    const row =
      nativeLibraryRows[
        rowIndexValue
      ];

    if (!row?.title) {
      return false;
    }

    nativeSectionReturnRow =
      rowIndexValue;
    nativeSectionTitleTarget =
      row.title;
    zone =
      'native-section-title';

    scrollNativeTarget(
      nativeSectionTitleTarget
    );

    requestAnimationFrame(
      () =>
        showFocusElement(
          nativeSectionTitleTarget
        )
    );

    return true;
  }

  function activateNativeCard() {
    const card =
      nativeLibraryRows[
        nativeLibraryRow
      ]?.cards[
        nativeLibraryCol
      ];

    if (!card) {
      return false;
    }

    return click(
      card.querySelector(
        '.cardImageContainer.itemAction,' +
        '.cardContent.itemAction,' +
        'a.itemAction[href],' +
        'a[href],' +
        'button.itemAction'
      ) ||
      card
    );
  }

  function enterNativeLibrary(
    root,
    fromHeader = false
  ) {
    clearNativeLibraryState();
    refreshNativeLibraryState(root);

    if (
      fromHeader &&
      nativeLibraryControlsCache.length
    ) {
      nativeLibraryControlIndex = 0;
      return enterNativeControls();
    }

    if (nativeLibraryRows.length) {
      nativeLibraryRow = 0;
      nativeLibraryCol = 0;
      return setNativeGridPosition(
        0,
        0
      );
    }

    if (nativeLibraryControlsCache.length) {
      nativeLibraryControlIndex = 0;
      return enterNativeControls();
    }

    return enterHeader(true);
  }

  function handleNativeLibrary(
    event,
    root
  ) {
    if (
      isBackKey(
        event.key
      )
    ) {
      consume(
        event
      );

      parentMainTabKey =
        'home';

      goUniversalHome();

      return true;
    }

    if (zone === 'header') {
      return handleHeader(event);
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' ',
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(event);

    if (
      nativeLibraryDirty ||
      nativeLibraryRoot !==
        root ||
      !nativeLibraryRoot
        ?.isConnected
    ) {
      refreshNativeLibraryState(
        root
      );
    }

    if (zone === 'native-controls') {
      if (!nativeLibraryControlsCache.length) {
        return enterNativeLibrary(
          root,
          false
        );
      }

      if (event.key === 'ArrowLeft') {
        nativeLibraryControlIndex =
          Math.max(
            0,
            nativeLibraryControlIndex - 1
          );
      } else if (
        event.key === 'ArrowRight'
      ) {
        nativeLibraryControlIndex =
          Math.min(
            nativeLibraryControlsCache.length - 1,
            nativeLibraryControlIndex + 1
          );
      } else if (
        event.key === 'ArrowUp'
      ) {
        enterHeader(true);
        return true;
      } else if (
        event.key === 'ArrowDown'
      ) {
        if (nativeLibraryRows.length) {
          setNativeGridPosition(
            0,
            Math.min(
              nativeLibraryCol,
              nativeLibraryRows[0]
                .cards.length - 1
            )
          );
        }
        return true;
      } else if (
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        const target =
          nativeLibraryControlsCache[
            nativeLibraryControlIndex
          ];

        click(target);

        setTimeout(
          () => {
            const liveRoot =
              nativeLibraryPageRoot();

            if (liveRoot) {
              refreshNativeLibraryState(
                liveRoot
              );

              if (
                zone ===
                'native-controls'
              ) {
                showNativeControlFocus();
              }
            }
          },
          180
        );

        return true;
      }

      showNativeControlFocus();
      return true;
    }

    if (zone === 'native-alpha') {
      if (!nativeAlphaTargetsCache.length) {
        return setNativeGridPosition(
          nativeAlphaReturnRow,
          nativeAlphaReturnCol
        );
      }

      if (event.key === 'ArrowUp') {
        nativeAlphaIndex =
          Math.max(
            0,
            nativeAlphaIndex - 1
          );
      } else if (
        event.key === 'ArrowDown'
      ) {
        nativeAlphaIndex =
          Math.min(
            nativeAlphaTargetsCache.length - 1,
            nativeAlphaIndex + 1
          );
      } else if (
        event.key === 'ArrowLeft'
      ) {
        refreshNativeLibraryState(root);

        const row =
          closestNativeRowToViewport();

        setNativeGridPosition(
          row,
          Math.min(
            nativeAlphaReturnCol,
            nativeLibraryRows[row]
              ?.cards.length - 1
          )
        );

        return true;
      } else if (
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        click(
          nativeAlphaTargetsCache[
            nativeAlphaIndex
          ]
        );

        setTimeout(
          () => {
            const liveRoot =
              nativeLibraryPageRoot();

            if (liveRoot) {
              refreshNativeLibraryState(
                liveRoot
              );
              showNativeAlphaFocus();
            }
          },
          180
        );

        return true;
      }

      showNativeAlphaFocus();
      return true;
    }

    if (
      zone ===
      'native-section-title'
    ) {
      if (
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        click(
          nativeSectionTitleTarget
        );
        return true;
      }

      if (event.key === 'ArrowDown') {
        setNativeGridPosition(
          nativeSectionReturnRow,
          0
        );
        return true;
      }

      if (event.key === 'ArrowUp') {
        if (nativeSectionReturnRow > 0) {
          const previousRow =
            nativeSectionReturnRow - 1;

          setNativeGridPosition(
            previousRow,
            Math.min(
              nativeLibraryCol,
              nativeLibraryRows[
                previousRow
              ].cards.length - 1
            )
          );
        } else if (
          nativeLibraryControlsCache.length
        ) {
          enterNativeControls();
        } else {
          enterHeader(true);
        }

        return true;
      }

      return true;
    }

    if (zone !== 'native-grid') {
      return enterNativeLibrary(
        root,
        false
      );
    }

    if (!nativeLibraryRows.length) {
      return true;
    }

    const currentRow =
      nativeLibraryRows[
        nativeLibraryRow
      ];

    if (!currentRow?.cards.length) {
      return true;
    }

    if (event.key === 'ArrowLeft') {
      if (nativeLibraryCol > 0) {
        nativeLibraryCol -= 1;
        showNativeCardFocus();
      } else {
        const drawerButton =
          document.querySelector(
            '.mainDrawerButton'
          );

        if (drawerButton) {
          click(drawerButton);
          setTimeout(
            () =>
              enterDrawer(true),
            120
          );
        }
      }

      return true;
    }

    if (event.key === 'ArrowRight') {
      if (
        nativeLibraryCol <
        currentRow.cards.length - 1
      ) {
        nativeLibraryCol += 1;
        showNativeCardFocus();
      } else if (
        nativeActiveTabIndex() === 0 &&
        nativeAlphaTargetsCache.length
      ) {
        enterNativeAlpha();
      }

      return true;
    }

    if (event.key === 'ArrowDown') {
      if (
        nativeLibraryRow <
        nativeLibraryRows.length - 1
      ) {
        setNativeGridPosition(
          nativeLibraryRow + 1,
          nativeLibraryCol
        );
      }

      return true;
    }

    if (event.key === 'ArrowUp') {
      const title =
        currentRow.title;

      if (title) {
        enterNativeSectionTitle(
          nativeLibraryRow
        );
      } else if (nativeLibraryRow > 0) {
        setNativeGridPosition(
          nativeLibraryRow - 1,
          nativeLibraryCol
        );
      } else if (
        nativeLibraryControlsCache.length
      ) {
        enterNativeControls();
      } else {
        enterHeader(true);
      }

      return true;
    }

    if (
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      activateNativeCard();
      return true;
    }

    return true;
  }

  // ============================================================
  // NATIVE DIALOGS
  // ============================================================

  function playerActionSheet() {
    if (!playerPage()) {
      return null;
    }

    return [
      ...document.querySelectorAll(
        '.dialogContainer .actionSheet,' +
        '.actionSheet'
      )
    ].find(
      root =>
        visible(root) &&
        !root.closest(
          '.bst-popout-wrapper'
        ) &&
        !root.closest(
          '.je-more-info-modal'
        )
    ) || null;
  }

  function playerActionSheetTargets(
    root
  ) {
    if (!root) {
      return [];
    }

    return uniqueVisible([
      ...root.querySelectorAll(
        '.actionSheetMenuItem:not([disabled])'
      )
    ]);
  }

  function preferredPlayerActionSheetTarget(
    root,
    targets
  ) {
    const active =
      document.activeElement;

    const focused =
      targets.find(
        el =>
          el === active ||
          el.classList.contains(
            'autoFocus'
          )
      );

    if (focused) {
      return focused;
    }

    return (
      targets.find(
        el => {
          const check =
            el.querySelector(
              '.material-icons.check'
            );

          return (
            check &&
            visible(check)
          );
        }
      ) ||
      targets[0] ||
      null
    );
  }

  function enterPlayerActionSheet(
    root
  ) {
    const targets =
      playerActionSheetTargets(
        root
      );

    zone =
      'player-action-sheet';

    return setExt(
      'player-action-sheet',
      root,
      targets,
      preferredPlayerActionSheetTarget(
        root,
        targets
      )
    );
  }

  function closePlayerActionSheet(
    root
  ) {
    const close =
      [
        ...root.querySelectorAll(
          '.btnCloseActionSheet'
        )
      ].find(
        visible
      );

    if (close) {
      click(close);

      return true;
    }

    return false;
  }

  function handlePlayerActionSheet(
    event,
    root
  ) {
    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      consume(event);

      if (
        !closePlayerActionSheet(
          root
        )
      ) {
        /*
         * Jellyfin ActionSheets enable dialog history by default. Going back
         * one history state closes the top sheet through DialogHashHandler
         * without sending another keyboard event through our capture handler.
         */
        window.history.back();
      }

      setTimeout(
        resolveContext,
        80
      );

      return true;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(event);

    const targets =
      playerActionSheetTargets(
        root
      );

    const previous =
      extContext ===
        'player-action-sheet'
        ? extTargets[
            extIndex
          ]
        : null;

    extContext =
      'player-action-sheet';

    extRoot =
      root;

    extTargets =
      targets;

    if (!extTargets.length) {
      hideFocus();

      return true;
    }

    let index =
      previous
        ? extTargets.indexOf(
            previous
          )
        : -1;

    if (index < 0) {
      const preferred =
        preferredPlayerActionSheetTarget(
          root,
          extTargets
        );

      index =
        preferred
          ? extTargets.indexOf(
              preferred
            )
          : 0;
    }

    extIndex =
      Math.max(
        0,
        index
      );

    if (
      event.key ===
        'ArrowUp'
    ) {
      extIndex =
        Math.max(
          0,
          extIndex - 1
        );
    } else if (
      event.key ===
        'ArrowDown'
    ) {
      extIndex =
        Math.min(
          extTargets.length - 1,
          extIndex + 1
        );
    } else if (
      event.key ===
        'Enter' ||
      event.key ===
        ' '
    ) {
      const target =
        extTargets[
          extIndex
        ];

      click(target);

      setTimeout(
        resolveContext,
        80
      );

      return true;
    }

    const target =
      extTargets[
        extIndex
      ];

    scrollModalTarget(
      target,
      root
    );

    requestAnimationFrame(
      () => {
        showFocusElement(
          target
        );
      }
    );

    return true;
  }

  function nativeDialog() {
    return [
      ...document.querySelectorAll(
        '.dialogContainer .dialog,' +
        '.dialogContainer .formDialog,' +
        '.actionSheet,' +
        '.selectionCommandsPanel,' +
        '.promptDialog'
      )
    ].find(
      root =>
        visible(
          root
        ) &&
        !root.closest(
          '.bst-popout-wrapper'
        ) &&
        !root.closest(
          '.je-more-info-modal'
        ) &&
        !looksLikeRequestForm(
          root
        )
    ) || null;
  }

  function nativeDialogTargets(
    root
  ) {
    if (!root) {
      return [];
    }

    return sortVisual(
      uniqueVisible([
        ...root.querySelectorAll(
          'button:not([disabled]),' +
          'a[href],' +
          '[role="button"]:not([aria-disabled="true"]),' +
          '[role="option"]:not([aria-disabled="true"]),' +
          'input:not([type="hidden"]):not([disabled]),' +
          'select:not([disabled]),' +
          'textarea:not([disabled]),' +
          '[tabindex]:not([tabindex="-1"])'
        )
      ]).filter(
        el =>
          !el.closest(
            '[aria-hidden="true"]'
          )
      )
    );
  }

  function enterNativeDialog(
    root
  ) {
    const targets =
      nativeDialogTargets(
        root
      );

    zone =
      'native-dialog';

    const preferred =
      targets.find(
        el =>
          el === document.activeElement ||
          el.getAttribute(
            'aria-selected'
          ) === 'true' ||
          el.getAttribute(
            'aria-checked'
          ) === 'true' ||
          el.matches(
            '[autofocus],.selected,.emby-button-showfocus'
          )
      ) ||
      targets[0];

    return setExt(
      'native-dialog',
      root,
      targets,
      preferred
    );
  }

  function handleNativeDialog(
    event,
    root
  ) {
    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      if (
        closeModal(
          root
        )
      ) {
        consume(
          event
        );

        setTimeout(
          resolveContext,
          80
        );

        return true;
      }

      /*
       * If Jellyfin owns the dialog's Back behavior, leave the original
       * event untouched so its native handler can close it.
       */
      return false;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(
      event
    );

    if (
      !extTargetsStillValid(
        root
      ) ||
      extContext !==
      'native-dialog'
    ) {
      enterNativeDialog(
        root
      );
    }

    if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      click(
        extTargets[
          extIndex
        ]
      );

      setTimeout(
        resolveContext,
        80
      );

      return true;
    }

    moveExt(
      event.key
        .replace(
          'Arrow',
          ''
        )
        .toLowerCase()
    );

    return true;
  }

  // ============================================================
  // SCOPED OBSERVERS
  // ============================================================

  function disconnectPlayerObserver() {
    playerObserver
      ?.disconnect();

    playerObserver =
      null;

    playerObserverRoot =
      null;
  }

  function ensurePlayerObserver(
    page = playerPage()
  ) {
    if (!page) {
      disconnectPlayerObserver();

      return;
    }

    const bottom =
      playerBottomElement(
        page
      );

    if (!bottom) {
      return;
    }

    if (
      playerObserver &&
      playerObserverRoot ===
      bottom &&
      bottom.isConnected
    ) {
      return;
    }

    disconnectPlayerObserver();

    playerObserverRoot =
      bottom;

    playerObserver =
      new MutationObserver(
        () => {
          if (
            zone ===
            'player' &&
            playerSleeping(
              page
            )
          ) {
            hideFocus();
          }
        }
      );

    playerObserver.observe(
      bottom,
      {
        attributes:
          true,

        attributeFilter: [
          'class'
        ]
      }
    );
  }

  function disconnectMediaObserver() {
    mediaObserver
      ?.disconnect();

    mediaObserver =
      null;

    mediaObserverRoot =
      null;
  }

  function findMediaObserverRoot() {
    return (
      document.querySelector(
        '#slides-container'
      ) ||
      getActiveMediaSlide()
        ?.parentElement ||
      null
    );
  }

  function ensureMediaObserver() {
    const root =
      findMediaObserverRoot();

    if (!root) {
      disconnectMediaObserver();

      return;
    }

    if (
      mediaObserver &&
      mediaObserverRoot ===
      root &&
      root.isConnected
    ) {
      return;
    }

    disconnectMediaObserver();

    mediaObserverRoot =
      root;

    mediaObserver =
      new MutationObserver(
        () => {
          if (
            zone !==
            'media'
          ) {
            return;
          }

          clearTimeout(
            mediaBarTimer
          );

          mediaBarTimer =
            setTimeout(
              () => {
                if (
                  zone ===
                  'media'
                ) {
                  showMediaControlFocus();
                }
              },
              100
            );
        }
      );

    mediaObserver.observe(
      root,
      {
        childList:
          true,

        subtree:
          true,

        attributes:
          true,

        attributeFilter: [
          'class'
        ]
      }
    );
  }

  function maintainScopedObservers() {
    clearTimeout(
      observerMaintenanceTimer
    );

    observerMaintenanceTimer =
      setTimeout(
        () => {
          ensureMediaObserver();
          const pauseOverlay = document.querySelector('#pause-screen-overlay');
          if (pauseOverlay !== pauseScreenObserverRoot) {
            pauseScreenObserver?.disconnect();
            pauseScreenObserverRoot = pauseOverlay;
            pauseScreenObserver = pauseOverlay ? new MutationObserver(() => {
              if (enhancedPauseScreen()) hideFocus();
              scheduleContextRefresh();
            }) : null;
            pauseScreenObserver?.observe(pauseOverlay, {
              attributes: true, attributeFilter: ['aria-hidden', 'class', 'style']
            });
          }
          const details = detailRoot();
          if (details !== detailObserverRoot) {
            detailObserver?.disconnect();
            detailObserverRoot = details;
            detailObserver = details ? new MutationObserver(() => scheduleContextRefresh()) : null;
            detailObserver?.observe(details, {
              subtree: true, attributes: true,
              attributeFilter: ['class', 'disabled', 'aria-hidden']
            });
          }

          if (
            zone ===
            'player' ||
            playerPage()
          ) {
            ensurePlayerObserver();
          } else {
            disconnectPlayerObserver();
          }
        },
        80
      );
  }

  function scheduleContextRefresh(
    delay = 45
  ) {
    clearTimeout(
      contextRefreshTimer
    );

    contextRefreshTimer =
      setTimeout(
        () => {
          /*
           * DOM changes can introduce a higher-priority context without a
           * route change (dialogs, SeerrFin popouts, drawers, same-route
           * pages). Always re-resolve instead of waiting for D-pad input.
           */
          resolveContext();
        },
        delay
      );
  }

  function mutationIntroducesOverlay(
    mutations
  ) {
    const selector =
      '.dialogContainer,' +
      '.dialog,' +
      '.formDialog,' +
      '.actionSheet,' +
      '.selectionCommandsPanel,' +
      '.promptDialog,' +
      '.bst-popout-wrapper,' +
      '.je-more-info-modal,' +
      '.bst-request-form,' +
      '#jws3-overlay,' +
      '.jws3-dialog';

    for (
      const mutation of
      mutations
    ) {
      if (
        mutation.type !==
        'childList'
      ) {
        continue;
      }

      for (
        const node of
        mutation.addedNodes
      ) {
        if (
          !(node instanceof Element)
        ) {
          continue;
        }

        if (
          node.matches?.(
            selector
          ) ||
          node.querySelector?.(
            selector
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function installGlobalObserver() {
    globalObserver
      ?.disconnect();

    globalObserver =
      new MutationObserver(
        mutations => {
          let changed =
            false;

          for (
            const mutation of
            mutations
          ) {
            if (
              mutation.type !==
                'childList' ||
              !(
                mutation.addedNodes
                  .length ||
                mutation.removedNodes
                  .length
              )
            ) {
              continue;
            }

            changed =
              true;

            const target =
              mutation.target instanceof
                Element
                ? mutation.target
                : mutation.target
                    ?.parentElement;

            if (
              target &&
              (
                target.closest?.(
                  '#jws3-overlay'
                ) ||
                target.closest?.(
                  '.skinHeader,.headerTabs'
                )
              )
            ) {
              watchlistRowsDirty =
                true;
            }

            if (
              target &&
              nativeLibraryRoot &&
              nativeLibraryRoot.contains(
                target
              )
            ) {
              nativeLibraryDirty =
                true;
            }
          }

          if (!changed) {
            return;
          }

          if (
            mutationIntroducesOverlay(
              mutations
            )
          ) {
            /*
             * Never leave the old page's ring visible behind a newly
             * mounted overlay while its controls finish rendering.
             */
            hideFocus();
          }

          maintainScopedObservers();
          scheduleContextRefresh();
        }
      );

    globalObserver.observe(
      document.body,
      {
        childList:
          true,

        subtree:
          true
      }
    );
  }

  // ============================================================
  // ROUTE / SAME-PAGE STATE
  // ============================================================

  function resetOnRoute() {
    if (
      lastLocationKey ===
      location.href
    ) {
      return false;
    }

    homeMediaSettleToken++;
    homeRowSettleToken++;
    watchlistRowsDirty =
      true;
    lastLocationKey =
      location.href;

    resetTransientNavigationState(
      'route-reset'
    );

    clearNativeLibraryState();

    headerTargets =
      [];

    headerIndex =
      0;

    playerLane =
      'bottom';

    playerBottomIndex =
      0;

    playerTopIndex =
      0;

    disconnectPlayerObserver();

    maintainScopedObservers();

    return true;
  }

  function beginHomePreferredFocus() {
    const token =
      ++homeMediaSettleToken;

    rowIndex =
      0;

    cardIndex =
      0;

    mediaControlIndex =
      0;

    scrollEverythingToTop();

    const settle =
      () => {
        if (
          token !==
          homeMediaSettleToken ||
          (
            location.hash &&
            !location.hash.startsWith(
              '#/home'
            )
          ) ||
          detailRoot() ||
          playerPage() ||
          searchPageRoot() ||
          nativeLibraryPageRoot() ||
          drawerOpen()
        ) {
          return;
        }

        if (
          getMediaControls()
            .length
        ) {
          enterMediaBar(
            false
          );

          homeMediaSettleToken++;

          return;
        }

        rebuildRows();

        if (
          rows.length
        ) {
          zone =
            'library';

          selectRow(
            0,
            0
          );
        } else {
          enterHeader(
            true
          );
        }
      };

    settle();

    [
      120,
      300,
      650,
      1000,
      1600,
      2500
    ].forEach(
      delay =>
        setTimeout(
          settle,
          delay
        )
    );

    return true;
  }

  function restoreHomeAfterRoute() {
    if (
      location.hash &&
      !location.hash.startsWith('#/home')
    ) {
      return false;
    }

    if (
      detailRoot() ||
      playerPage() ||
      searchPageRoot() ||
      nativeLibraryPageRoot() ||
      drawerOpen()
    ) {
      return false;
    }

    return beginHomePreferredFocus();
  }

  function handleRouteSignal() {
    if (
      !resetOnRoute()
    ) {
      return;
    }

    clearTimeout(
      rebuildTimer
    );

    const settle =
      attempt => {
        const context =
          resolveContext();

        if (
          context.type === 'home' &&
          zone === 'route-reset'
        ) {
          restoreHomeAfterRoute();
        }

        maintainScopedObservers();

        /*
         * Jellyfin's SPA can update the hash before the destination page
         * is mounted. Keep retrying only while no real context has claimed
         * navigation. This is what makes Details focus appear without the
         * first D-pad press.
         */
        if (
          zone === 'route-reset' &&
          attempt < 4
        ) {
          rebuildTimer =
            setTimeout(
              () =>
                settle(
                  attempt + 1
                ),
              120 +
              attempt * 120
            );
        }
      };

    rebuildTimer =
      setTimeout(
        () =>
          settle(0),
        80
      );
  }

  // ============================================================
  // CONTEXT RESOLUTION


  // ============================================================

  function resolveContext() {
    resetOnRoute();

    if (
      keyboardRoot
    ) {
      return {
        type:
          'keyboard',

        root:
          keyboardRoot
      };
    }

    const watchlist =
      watchlistLayer();

    if (watchlist) {
      parentMainTabKey =
        'watchlist';
      if (
        zone !==
          watchlist.type ||
        extContext !==
          watchlist.type ||
        !extTargetsStillValid(
          watchlist.root
        )
      ) {
        enterWatchlistLayer(
          watchlist
        );
      }

      return watchlist;
    }

    const request =
      requestFormRoot();

    if (request) {
      zone =
        'request-form';

      const targets =
        requestFormTargets(
          request
        );

      setExt(
        'request-form',
        request,
        targets,

        request.querySelector(
          '.bst-season-option,' +
          '.bst-quality-option,' +
          'select,' +
          '[role="combobox"],' +
          '.bst-quality-continue'
        ) ||
        targets[0]
      );

      return {
        type:
          'request-form',

        root:
          request
      };
    }

    const seerrModal =
      seerrInfoModal();

    if (seerrModal) {
      zone =
        'seerr-modal';

      if (
        !extTargetsStillValid(
          seerrModal
        ) ||
        extContext !==
        'seerr-modal'
      ) {
        const targets =
          seerrActionTargets(
            seerrModal
          );

        setExt(
          'seerr-modal',
          seerrModal,
          targets,

          seerrModal.querySelector(
            '.bst-btn-request:not([disabled]),' +
            '.bst-btn-request-4k:not([disabled]),' +
            '.bst-btn-trailer:not([disabled])'
          ) ||
          targets[0]
        );
      }

      return {
        type:
          'seerr-modal',

        root:
          seerrModal
      };
    }

    const enhanced =
      enhancedInfoModal();

    if (enhanced) {
      zone =
        'enhanced-modal';

      if (
        !extTargetsStillValid(
          enhanced
        ) ||
        extContext !==
        'enhanced-modal'
      ) {
        const targets =
          enhancedPrimaryTargets(
            enhanced
          );

        setExt(
          'enhanced-modal',
          enhanced,
          targets,

          enhanced.querySelector(
            '.jellyseerr-request-button:not([disabled]),' +
            '.jellyseerr-button-request:not([disabled])'
          ) ||
          targets[0]
        );
      }

      return {
        type:
          'enhanced-modal',

        root:
          enhanced
      };
    }

    const playerSheet =
      playerActionSheet();

    if (playerSheet) {
      if (
        zone !==
          'player-action-sheet' ||
        extContext !==
          'player-action-sheet' ||
        !extTargetsStillValid(
          playerSheet
        )
      ) {
        enterPlayerActionSheet(
          playerSheet
        );
      }

      return {
        type:
          'player-action-sheet',

        root:
          playerSheet
      };
    }

    const dialog =
      nativeDialog();

    if (dialog) {
      if (
        zone !==
          'native-dialog' ||
        extContext !==
          'native-dialog' ||
        !extTargetsStillValid(
          dialog
        )
      ) {
        enterNativeDialog(
          dialog
        );
      }

      return {
        type:
          'native-dialog',

        root:
          dialog
      };
    }

    const pauseScreen = enhancedPauseScreen();
    if (pauseScreen && playerPage()) {
      zone = 'enhanced-pause-screen';
      hideFocus();
      return { type: 'enhanced-pause-screen', root: pauseScreen };
    }

    if (drawerOpen()) {
      if (zone !== 'drawer') {
        enterDrawer(true);
      }

      return {
        type: 'drawer',
        root: mainDrawer()
      };
    }

    const player =
      playerPage();

    if (player) {
      ensurePlayerObserver(
        player
      );

      if (
        zone !==
        'player'
      ) {
        enterPlayer(
          player
        );
      }

      return {
        type:
          'player',

        root:
          player
      };
    }

    const search =
      searchPageRoot();

    if (search) {
      rebuildHeaderTargets();

      if (
        zone !==
        'header' &&
        zone !==
        'search-results'
      ) {
        zone =
          'search';

        const input =
          searchInput();

        if (input) {
          scrollSearchToTop(
            input,
            search
          );
        }
      }

      return {
        type:
          'search',

        root:
          search
      };
    }

    const details =
      detailRoot();

    if (details) {
      rebuildHeaderTargets();

      if (detailFocusRoot !== details) {
        detailFocusRoot = details;
        detailPrimaryPending = true;
      }
      const primary = detailPrimaryAction(details);
      const needsInitialPrimary = detailPrimaryPending && primary;

      if (
        zone !== 'detail' || extContext !== 'detail' ||
        !extTargetsStillValid(details) || needsInitialPrimary
      ) {
        enterDetail(details,
          zone !== 'detail' || extRoot !== details || !!needsInitialPrimary
        );
        if (primary) detailPrimaryPending = false;
      }

      return {
        type:
          'detail',

        root:
          details
      };
    }

    const seerrGrid =
      seerrGridRoot();

    if (seerrGrid) {
      const activeKey =
        activeMainTabKey();

      if (
        activeKey &&
        activeKey !==
          'watchlist'
      ) {
        parentMainTabKey =
          activeKey;
      }
      const cards =
        seerrGridCards(
          seerrGrid
        );

      const gridHasCurrentCard =
        cards.length ===
          0 ||
        extTargets.some(
          target =>
            cards.includes(
              target
            )
        );

      if (
        zone !==
          'seerr-grid' ||
        extContext !==
          'seerr-grid' ||
        !extTargetsStillValid(
          seerrGrid
        ) ||
        !gridHasCurrentCard
      ) {
        enterSeerrGrid(
          seerrGrid
        );
      }

      return {
        type:
          'seerr-grid',

        root:
          seerrGrid
      };
    }

    const nativeLibrary =
      nativeLibraryPageRoot();

    if (nativeLibrary) {
      if (
        zone ===
        'route-reset'
      ) {
        clearNativeLibraryState();

        nativeLibraryRoot =
          nativeLibrary;

        /*
         * A freshly opened Movies / TV library should begin on the
         * active Jellyfin tab (Movies or Shows), not the first poster.
         * Down from the tab still enters the library's native controls
         * and then its grid.
         */
        enterHeader(
          true
        );
      } else if (
        zone !== 'header' &&
        ![
          'native-controls',
          'native-grid',
          'native-alpha',
          'native-section-title'
        ].includes(zone)
      ) {
        enterNativeLibrary(
          nativeLibrary,
          false
        );
      } else if (
        nativeLibraryRoot !== nativeLibrary &&
        zone !== 'header'
      ) {
        enterNativeLibrary(
          nativeLibrary,
          false
        );
      }

      return {
        type: 'native-library',
        root: nativeLibrary
      };
    }

    const seerrRoot =
      seerrPageRoot();

    if (seerrRoot) {
      if (
        zone !==
        'seerr-library' &&
        zone !==
        'header'
      ) {
        enterSeerrDiscovery();
      }

      return {
        type:
          'seerr',

        root:
          seerrRoot
      };
    }

    if (
      zone ===
        'route-reset' ||
      [
        'native-dialog',
        'watchlist',
        'watchlist-dialog',
        'request-form',
        'seerr-modal',
        'enhanced-modal',
        'player',
        'player-action-sheet',
        'enhanced-pause-screen'
      ].includes(
        zone
      )
    ) {
      restoreHomeAfterRoute();
    }

    return {
      type:
        'home',

      root:
        null
    };
  }

  // ============================================================
  // INPUT HANDLERS
  // ============================================================

  function handleHeader(
    event
  ) {
    if (
      isBackKey(
        event.key
      )
    ) {
      consume(
        event
      );

      return true;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(
      event
    );

    if (
      event.key ===
      'ArrowLeft'
    ) {
      moveHeader(
        'left'
      );

      return true;
    }

    if (
      event.key ===
      'ArrowRight'
    ) {
      moveHeader(
        'right'
      );

      return true;
    }

    if (
      event.key ===
      'ArrowDown'
    ) {
      headerDownDestination();

      return true;
    }

    if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      const target =
        headerTargets[
          headerIndex
        ];

      activateHeader();

      if (
        target?.matches(
          '.headerSearchButton'
        )
      ) {
        setTimeout(
          () => {
            const input =
              searchInput();

            const root =
              searchPageRoot();

            if (input) {
              zone =
                'search';

              scrollSearchToTop(
                input,
                root
              );
            }
          },
          250
        );
      }

      return true;
    }

    return true;
  }

  function handleRequestForm(
    event,
    root
  ) {
    if (
      selectMode &&
      handleSelectMode(
        event
      )
    ) {
      return true;
    }

    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      consume(
        event
      );

      closeModal(
        root
      );

      setTimeout(
        resolveContext,
        80
      );

      return true;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(
      event
    );

    if (
      !extTargetsStillValid(
        root
      ) ||
      extContext !==
      'request-form'
    ) {
      setExt(
        'request-form',
        root,
        requestFormTargets(
          root
        )
      );
    }

    if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      activateRequestTarget();

      setTimeout(
        () => {
          if (
            !selectMode
          ) {
            resolveContext();
          }
        },
        100
      );

      return true;
    }

    moveRequest(
      event.key
        .replace(
          'Arrow',
          ''
        )
        .toLowerCase(),
      root
    );

    return true;
  }

  function handlePopup(
    event,
    context
  ) {
    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      consume(
        event
      );

      closeModal(
        context.root
      );

      setTimeout(
        resolveContext,
        80
      );

      return true;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(
      event
    );

    if (
      !extTargetsStillValid(
        context.root
      ) ||
      extContext !==
      context.type
    ) {
      const targets =
        context.type ===
        'enhanced-modal'
          ?
            enhancedPrimaryTargets(
              context.root
            )
          :
            seerrActionTargets(
              context.root
            );

      setExt(
        context.type,
        context.root,
        targets
      );
    }

    if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      click(
        extTargets[
          extIndex
        ]
      );

      setTimeout(
        resolveContext,
        100
      );

      return true;
    }

    moveExt(
      event.key
        .replace(
          'Arrow',
          ''
        )
        .toLowerCase()
    );

    return true;
  }

  function handleDetail(
    event,
    root
  ) {
    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      const back =
        document.querySelector(
          '.headerBackButton'
        ) ||
        headerTargets.find(
          el =>
            /^back$/i.test(
              el.getAttribute(
                'aria-label'
              ) ||
              ''
            )
        );

      if (
        back &&
        back.isConnected
      ) {
        consume(
          event
        );

        click(
          back
        );

        restoreParentMainTabAfterBackNavigation(
          root
        );

        return true;
      }

      return false;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    detailPrimaryPending = false;

    consume(
      event
    );

    if (
      !extTargetsStillValid(
        root
      ) ||
      extContext !==
      'detail'
    ) {
      setExt(
        'detail',
        root,
        buildDetailTargets(
          root
        )
      );
    }

    if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      const activationTarget =
        detailActivationTarget(
          extTargets[
            extIndex
          ]
        );

      if (
        activationTarget?.matches?.(
          '.btnPlay,' +
          '.btnResume,' +
          '[data-action="play"],' +
          '[data-action="resume"]'
        ) ||
        activationTarget?.closest?.(
          '.mainDetailButtons'
        ) &&
        /^(play|resume)(\s|$)/i.test(
          (
            activationTarget.getAttribute?.(
              'aria-label'
            ) ||
            activationTarget.getAttribute?.(
              'title'
            ) ||
            activationTarget.textContent ||
            ''
          ).trim()
        )
      ) {
        showPlayerLaunchShield();
      }

      click(
        activationTarget
      );

      return true;
    }

    const current =
      extTargets[
        extIndex
      ];

    if (
      event.key ===
      'ArrowDown' &&
      current?.closest?.(
        '.mainDetailButtons'
      ) &&
      detailSimilarCards(
        root
      ).length
    ) {
      if (
        selectFreshDetailTarget(
          root,
          target =>
            !!target.closest?.(
              '#similarCollapsible'
            )
        )
      ) {
        return true;
      }
    }

    if (
      event.key ===
      'ArrowUp' &&
      current?.closest?.(
        '#similarCollapsible'
      )
    ) {
      if (
        selectFreshDetailTarget(
          root,
          target =>
            !!target.closest?.(
              '.mainDetailButtons'
            )
        )
      ) {
        return true;
      }
    }

    moveExt(
      event.key
        .replace(
          'Arrow',
          ''
        )
        .toLowerCase()
    );

    return true;
  }

  function handlePlayer(
    event,
    page
  ) {
    if (
      [
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      consume(
        event
      );

      exitPlayer();

      return true;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    if (
      playerSleeping(
        page
      )
    ) {
      consume(
        event
      );

      if (event.key === 'Enter' || event.key === ' ') {
        togglePlayerPlayback(
          page
        );

        /*
         * Tapping OK while the OSD is hidden is the TV-style play/pause
         * gesture. If Jellyfin Enhanced did not claim the pause with its own
         * screen, immediately reveal Jellyfin's native OSD and focus Play/Pause.
         */
        setTimeout(
          () => {
            const live =
              playerPage();

            if (
              live &&
              !enhancedPauseScreen()
            ) {
              wakePlayer(
                live
              );
            }
          },
          30
        );

        return true;
      }

      wakePlayer(
        page
      );

      return true;
    }

    consume(
      event
    );

    keepPlayerOsdAlive();

    if (
      playerLane ===
      'bottom'
    ) {
      const controls =
        playerBottomControls(
          page
        );

      if (
        !controls.length
      ) {
        wakePlayer(
          page
        );

        return true;
      }

      if (
        event.key ===
        'ArrowLeft'
      ) {
        playerBottomIndex =
          Math.max(
            0,
            playerBottomIndex -
            1
          );
      } else if (
        event.key ===
        'ArrowRight'
      ) {
        playerBottomIndex =
          Math.min(
            controls.length -
            1,
            playerBottomIndex +
            1
          );
      } else if (
        event.key ===
        'ArrowDown'
      ) {
        if (
          playerSlider(
            page
          )
        ) {
          playerLane =
            'progress';
        }
      } else if (
        event.key ===
        'ArrowUp'
      ) {
        const top =
          playerTopControls(
            page
          );

        if (
          top.length
        ) {
          playerLane =
            'top';

          playerTopIndex =
            Math.max(
              0,
              Math.min(
                playerTopIndex,
                top.length -
                1
              )
            );
        }
      } else if (
        event.key ===
        'Enter' ||
        event.key ===
        ' '
      ) {
        click(
          controls[
            playerBottomIndex
          ]
        );
      }

      showPlayerFocus();

      return true;
    }

    if (
      playerLane ===
      'progress'
    ) {
      if (
        event.key ===
        'ArrowLeft'
      ) {
        seekPlayer(
          'left'
        );
      } else if (
        event.key ===
        'ArrowRight'
      ) {
        seekPlayer(
          'right'
        );
      } else if (
        event.key ===
        'ArrowUp'
      ) {
        playerLane =
          'bottom';
      }

      showPlayerFocus();

      return true;
    }

    if (
      playerLane ===
      'top'
    ) {
      const controls =
        playerTopControls(
          page
        );

      if (
        !controls.length
      ) {
        playerLane =
          'bottom';

        showPlayerFocus();

        return true;
      }

      if (
        event.key ===
        'ArrowLeft'
      ) {
        playerTopIndex =
          Math.max(
            0,
            playerTopIndex -
            1
          );
      } else if (
        event.key ===
        'ArrowRight'
      ) {
        playerTopIndex =
          Math.min(
            controls.length -
            1,
            playerTopIndex +
            1
          );
      } else if (
        event.key ===
        'ArrowDown'
      ) {
        playerLane =
          'bottom';
      } else if (
        event.key ===
        'Enter' ||
        event.key ===
        ' '
      ) {
        click(
          controls[
            playerTopIndex
          ]
        );
      }

      showPlayerFocus();

      return true;
    }

    return true;
  }

  function handleSeerr(
    event
  ) {
    const root =
      seerrPageRoot();

    if (!root) {
      return false;
    }

    if (
      zone ===
      'header'
    ) {
      return handleHeader(
        event
      );
    }

    if (
      isBackKey(
        event.key
      )
    ) {
      consume(
        event
      );

      focusMainTab(
        currentMainTabKey(),
        false
      );

      return true;
    }

    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' '
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(
      event
    );

    rows =
      buildRowsWithin(
        root
      );

    if (
      !rows.length
    ) {
      return true;
    }

    rowIndex =
      Math.max(
        0,
        Math.min(
          rowIndex,
          rows.length -
          1
        )
      );

    cardIndex =
      Math.max(
        0,
        Math.min(
          cardIndex,
          rows[
            rowIndex
          ].cards.length -
          1
        )
      );

    zone =
      'seerr-library';

    if (
      event.key ===
      'ArrowLeft'
    ) {
      moveCardHorizontal(
        'left'
      );
    } else if (
      event.key ===
      'ArrowRight'
    ) {
      moveCardHorizontal(
        'right'
      );
    } else if (
      event.key ===
      'ArrowUp'
    ) {
      if (
        rowIndex ===
        0
      ) {
        enterHeader(
          true
        );
      } else {
        selectRow(
          rowIndex -
          1,

          Math.min(
            cardIndex,

            rows[
              rowIndex -
              1
            ].cards.length -
            1
          )
        );
      }
    } else if (
      event.key ===
      'ArrowDown'
    ) {
      if (
        rowIndex <
        rows.length -
        1
      ) {
        selectRow(
          rowIndex +
          1,

          Math.min(
            cardIndex,

            rows[
              rowIndex +
              1
            ].cards.length -
            1
          )
        );
      }
    } else if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      activateCurrentCard();
    }

    return true;
  }

  function handleSeerrGrid(
    event,
    root
  ) {
    if (
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter',
        ' ',
        'Escape',
        'BrowserBack',
        'GoBack'
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(
      event
    );

    if (
      isBackKey(
        event.key
      )
    ) {
      const back =
        root.querySelector(
          '[data-grid-nav="back"]'
        );

      if (back) {
        click(
          back
        );
      }

      setTimeout(
        () =>
          focusMainTab(
            currentMainTabKey(),
            false
          ),
        100
      );

      return true;
    }

    const cards =
      seerrGridCards(
        root
      );

    const targets =
      seerrGridTargets(
        root,
        cards
      );

    if (
      !targets.length
    ) {
      return true;
    }

    const previous =
      extTargets[
        extIndex
      ];

    extContext =
      'seerr-grid';

    extRoot =
      root;

    extTargets =
      targets;

    let index =
      previous
        ?
          extTargets.indexOf(
            previous
          )
        :
          -1;

    if (
      index < 0
    ) {
      const firstCard =
        cards[0];

      index =
        firstCard
          ?
            extTargets.indexOf(
              firstCard
            )
          :
            0;
    }

    extIndex =
      Math.max(
        0,
        index
      );

    if (
      event.key ===
      'ArrowLeft'
    ) {
      moveExt(
        'left'
      );
    } else if (
      event.key ===
      'ArrowRight'
    ) {
      moveExt(
        'right'
      );
    } else if (
      event.key ===
      'ArrowUp'
    ) {
      moveExt(
        'up'
      );
    } else if (
      event.key ===
      'ArrowDown'
    ) {
      moveExt(
        'down'
      );
    } else if (
      event.key ===
      'Enter' ||
      event.key ===
      ' '
    ) {
      const target =
        extTargets[
          extIndex
        ];

      if (target) {
        click(
          target
        );

        setTimeout(
          resolveContext,
          80
        );
      }
    }

    return true;
  }

  function enterFirstHomeRowWithSettle() {
    const token =
      ++homeRowSettleToken;

    const settle =
      () => {
        if (
          token !==
          homeRowSettleToken ||
          zone !==
          'library'
        ) {
          return;
        }

        rebuildRows();

        if (
          !rows.length
        ) {
          return;
        }

        /*
         * Do not steal focus back after the user has already moved.
         * While the initial first-card selection is untouched, keep
         * refreshing row 0 briefly so a late Continue Watching /
         * Next Up row can insert above the faster-loading shelves.
         */
        if (
          rowIndex ===
          0 &&
          cardIndex ===
          0
        ) {
          selectRow(
            0,
            0
          );
        }
      };

    rowIndex =
      0;

    cardIndex =
      0;

    settle();

    [
      120,
      300,
      650,
      1000
    ].forEach(
      delay =>
        setTimeout(
          settle,
          delay
        )
    );

    return true;
  }

  function handleHome(
    event
  ) {
    homeMediaSettleToken++;

    if (
      isBackKey(
        event.key
      )
    ) {
      consume(
        event
      );

      focusMainTab(
        'home',
        false
      );

      return true;
    }

    const target =
      event.target;

    if (
      target instanceof
      HTMLInputElement ||
      target instanceof
      HTMLTextAreaElement ||
      target instanceof
      HTMLSelectElement ||
      target?.isContentEditable
    ) {
      return false;
    }

    if (
      zone ===
      'header'
    ) {
      return handleHeader(
        event
      );
    }

    if (
      ![
        'library',
        'media'
      ].includes(
        zone
      )
    ) {
      rebuildRows();

      rowIndex =
        0;

      cardIndex =
        0;

      mediaControlIndex =
        0;

      if (
        rows.length
      ) {
        zone =
          'library';

        selectRow(
          0,
          0
        );
      } else if (
        getMediaControls()
          .length
      ) {
        zone =
          'media';

        enterMediaBar(
          false
        );
      } else {
        enterHeader(
          true
        );
      }
    }

    if (
      zone ===
      'media'
    ) {
      if (
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Enter'
        ].includes(
          event.key
        )
      ) {
        return false;
      }

      consume(
        event
      );

      const controls =
        getMediaControls();

      if (
        event.key ===
        'ArrowLeft'
      ) {
        mediaControlIndex =
          Math.max(
            0,
            mediaControlIndex -
            1
          );
      } else if (
        event.key ===
        'ArrowRight'
      ) {
        mediaControlIndex =
          Math.min(
            controls.length -
            1,
            mediaControlIndex +
            1
          );
      } else if (
        event.key ===
        'ArrowUp'
      ) {
        enterHeader(
          true
        );

        return true;
      } else if (
        event.key ===
        'ArrowDown'
      ) {
        zone =
          'library';

        enterFirstHomeRowWithSettle();

        return true;
      } else if (
        event.key ===
        'Enter'
      ) {
        activateMediaControl();

        return true;
      }

      showMediaControlFocus();

      return true;
    }

    if (
      !rows.length
    ) {
      rebuildRows();
    }

    const row =
      rows[
        rowIndex
      ];

    if (
      !row ||
      ![
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Enter'
      ].includes(
        event.key
      )
    ) {
      return false;
    }

    consume(
      event
    );

    if (
      event.key ===
      'ArrowLeft'
    ) {
      moveCardHorizontal(
        'left'
      );
    } else if (
      event.key ===
      'ArrowRight'
    ) {
      moveCardHorizontal(
        'right'
      );
    } else if (
      event.key ===
      'ArrowDown'
    ) {
      if (
        rowIndex <
        rows.length -
        1
      ) {
        selectRow(
          rowIndex +
          1,

          Math.min(
            cardIndex,

            rows[
              rowIndex +
              1
            ].cards.length -
            1
          )
        );
      }
    } else if (
      event.key ===
      'ArrowUp'
    ) {
      if (
        rowIndex ===
        0
      ) {
        enterMediaBar(
          false
        );
      } else {
        selectRow(
          rowIndex -
          1,

          Math.min(
            cardIndex,

            rows[
              rowIndex -
              1
            ].cards.length -
            1
          )
        );
      }
    } else if (
      event.key ===
      'Enter'
    ) {
      activateCurrentCard();
    }

    return true;
  }

  // ============================================================
  // MASTER INPUT ROUTER
  // ============================================================

  function handleNavigationKeyDown(
    event
  ) {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    if (
      keyboardRoot
    ) {
      handleKeyboard(
        event
      );

      return;
    }

    if (
      selectMode &&
      handleSelectMode(
        event
      )
    ) {
      return;
    }

    const context =
      resolveContext();

    if (
      context.type ===
        'watchlist' ||
      context.type ===
        'watchlist-dialog'
    ) {
      handleWatchlist(
        event,
        context
      );

      return;
    }

    if (context.type === 'enhanced-pause-screen') {
      handleEnhancedPauseScreen(event, context.root);
      return;
    }

    if (
      context.type ===
      'player-action-sheet'
    ) {
      handlePlayerActionSheet(
        event,
        context.root
      );

      return;
    }

    if (
      context.type ===
      'native-dialog'
    ) {
      handleNativeDialog(
        event,
        context.root
      );

      return;
    }

    if (
      context.type ===
      'drawer'
    ) {
      handleDrawer(
        event
      );

      return;
    }

    if (
      context.type ===
      'keyboard'
    ) {
      handleKeyboard(
        event
      );

      return;
    }

    if (
      context.type ===
      'request-form'
    ) {
      handleRequestForm(
        event,
        context.root
      );

      return;
    }

    if (
      context.type ===
      'seerr-modal' ||
      context.type ===
      'enhanced-modal'
    ) {
      handlePopup(
        event,
        context
      );

      return;
    }

    if (
      context.type ===
      'player'
    ) {
      handlePlayer(
        event,
        context.root
      );

      return;
    }

    if (
      context.type ===
      'search'
    ) {
      handleSearch(
        event,
        context.root
      );

      return;
    }

    if (
      context.type ===
      'detail'
    ) {
      handleDetail(
        event,
        context.root
      );

      return;
    }

    if (
      context.type ===
      'native-library'
    ) {
      handleNativeLibrary(
        event,
        context.root
      );

      return;
    }

    if (
      context.type ===
      'seerr-grid'
    ) {
      handleSeerrGrid(
        event,
        context.root
      );

      return;
    }

    if (
      context.type ===
      'seerr'
    ) {
      handleSeerr(
        event
      );

      return;
    }

    handleHome(
      event
    );
  }

  function handleKeyDown(
    event
  ) {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    if (
      event.key ===
      'Enter'
    ) {
      startEnterHold(
        event
      );

      return;
    }

    if (
      isBackKey(
        event.key
      )
    ) {
      startBackHold(
        event
      );

      return;
    }

    handleNavigationKeyDown(
      event
    );
  }

  function handleKeyUp(
    event
  ) {
    if (
      event.key ===
      'Enter'
    ) {
      finishEnterHold(
        event
      );

      return;
    }

    if (
      isBackKey(
        event.key
      )
    ) {
      finishBackHold(
        event
      );
    }
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  function cleanup() {
    universalHomeToken++;
    homeMediaSettleToken++;
    homeRowSettleToken++;
    window.removeEventListener(
      'keydown',
      handleKeyDown,
      true
    );

    window.removeEventListener(
      'keyup',
      handleKeyUp,
      true
    );

    window.removeEventListener(
      'hashchange',
      handleRouteSignal
    );

    window.removeEventListener(
      'popstate',
      handleRouteSignal
    );

    globalObserver
      ?.disconnect();

    disconnectMediaObserver();
    disconnectPlayerObserver();
    pauseScreenObserver?.disconnect();
    pauseScreenObserver = null;
    pauseScreenObserverRoot = null;
    detailObserver?.disconnect();
    detailObserver = null;
    detailObserverRoot = null;

    [
      rebuildTimer,
      contextRefreshTimer,
      mediaBarTimer,
      playerWakeTimer,
      enterLongTimer,
      backLongTimer,
      observerMaintenanceTimer,
      postHeaderTimer,
      universalHomeTimer
    ].forEach(
      timer => {
        if (timer) {
          clearTimeout(
            timer
          );
        }
      }
    );

    if (focusArrivalAnimation) {
      try {
        focusArrivalAnimation.cancel();
      } catch (_) {}

      focusArrivalAnimation =
        null;
    }

    lastFocusMetrics =
      null;

    enterHeld =
      false;

    enterLongTriggered =
      false;

    backHeld =
      false;

    backLongTriggered =
      false;

    keyboardRoot
      ?.remove();

    removePlayerLaunchShield();

    focusRing
      ?.remove();

    injectedStyle
      ?.remove();

    drawerStyle
      ?.remove();

    keyboardRoot =
      null;

    keyboardInput =
      null;

    focusRing =
      null;

    injectedStyle =
      null;

    drawerStyle =
      null;

    clearNativeLibraryState();

    watchlistRowsCacheRoot =
      null;

    watchlistRowsCache =
      [];

    watchlistRowsDirty =
      true;

    selectMode =
      null;

    delete window
      .__JF_LIBRARY_TEST_CLEANUP__;

    delete window
      .__JF_LIBRARY_TEST_API__;

    delete window
      .__JELLYFIN_TV_REMOTE__;
  }

  // ============================================================
  // DEBUG API
  // ============================================================

  window
    .__JF_LIBRARY_TEST_CLEANUP__ =
    cleanup;

  window
    .__JELLYFIN_TV_REMOTE__ = {
      version:
        VERSION,

      watchlistKeyOwnership:
        true,

      cleanup,

      refresh:
        refreshJellyfin,

      wakePlayer:
        () => {
          const page =
            playerPage();

          if (page) {
            wakePlayer(
              page
            );
          }
        },

      nativeOsdCommand:
        nativePlayerOsdCommand,

      openKeyboard:
        () => {
          const input =
            searchInput();

          if (input) {
            openKeyboard(
              input
            );
          }
        },

      state:
        () => {
          const page =
            playerPage();

          const bottom =
            playerBottomElement(
              page
            );

          return {
            version:
              VERSION,

            zone,

            rowIndex,
            cardIndex,

            mediaControlIndex,
            headerIndex,

            drawerIndex,
            nativeLibraryRow,
            nativeLibraryCol,
            nativeLibraryRows:
              nativeLibraryRows.length,
            nativeLibraryControls:
              nativeLibraryControlsCache.length,
            nativeAlphaIndex,
            nativeAlphaTargets:
              nativeAlphaTargetsCache.length,

            extContext,
            extIndex,

            extTargets:
              extTargets.length,

            playerLane,

            playerBottomIndex,
            playerTopIndex,

            playerSleeping:
              playerSleeping(
                page
              ),

            playerBottomClasses:
              bottom?.className ||
              null,

            keyboardOpen:
              !!keyboardRoot,

            enterHeld,

            longPressMs:
              LONG_PRESS_REFRESH_MS,

            observers: {
              global:
                !!globalObserver,

              media:
                !!mediaObserver,

              player:
                !!playerObserver
            },

            context:
              resolveContext()
                .type
          };
        }
    };

  window
    .__JF_LIBRARY_TEST_API__ =
    window
      .__JELLYFIN_TV_REMOTE__;

  // ============================================================
  // START
  // ============================================================

  installStyles();
  installDrawerStyles();

  rebuildRows();
  rebuildHeaderTargets();

  const initialMainTab =
    headerTargets.find(
      target =>
        mainTabKey(
          target
        ) &&
        (
          target.classList.contains(
            'emby-tab-button-active'
          ) ||
          target.getAttribute(
            'aria-selected'
          ) ===
            'true'
        )
    );

  rememberParentMainTab(
    initialMainTab
  );

  createFocusRing();

  window.addEventListener(
    'keydown',
    handleKeyDown,
    true
  );

  window.addEventListener(
    'keyup',
    handleKeyUp,
    true
  );

  window.addEventListener(
    'hashchange',
    handleRouteSignal
  );

  window.addEventListener(
    'popstate',
    handleRouteSignal
  );

  installGlobalObserver();
  ensureMediaObserver();

  const initial =
    resolveContext();

  if (
    initial.type ===
    'home'
  ) {
    beginHomePreferredFocus();
  }

  maintainScopedObservers();

  console.log(
    '[JF TV Navigation] Loaded',
    VERSION,
    `Long OK refresh: ${LONG_PRESS_REFRESH_MS}ms`
  );
})();
