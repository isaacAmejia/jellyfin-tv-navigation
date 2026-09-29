(() => {
  'use strict';

  const VERSION = '2026.09.29-r12.11-smooth-far-focus';
  const LONG_PRESS_REFRESH_MS = 900;
  const LONG_PRESS_HOME_MS = 900;

  try {
    window.__JF_LIBRARY_TEST_CLEANUP__?.();
  } catch (e) {
    console.warn('[JF TV] Previous cleanup failed:', e);
  }

  try {
    window.__JELLYFIN_TV_REMOTE__?.cleanup?.();
  } catch (e) {
    console.warn('[JF TV] Previous remote cleanup failed:', e);
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

  let globalObserver = null;
  let mediaObserver = null;
  let mediaObserverRoot = null;

  let playerObserver = null;
  let playerObserverRoot = null;

  let rebuildTimer = null;
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

  // Native Jellyfin library / drawer state
  let drawerStyle = null;
  let drawerIndex = 0;

  let nativeLibraryRoot = null;
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
        '[JF TV] Click failed:',
        error
      );

      return false;
    }
  }

  function visualSort(a, b) {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();

    const tolerance = Math.max(
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
      ) <= tolerance
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

  function goUniversalHome() {
    hideFocus();

    const home =
      [
        ...document.querySelectorAll(
          '.headerHomeButton'
        )
      ].find(
        el =>
          el.isConnected
      );

    if (home) {
      click(home);

      return;
    }

    if (
      location.hash.startsWith(
        '#/home'
      )
    ) {
      restoreHomeAfterRoute();

      return;
    }

    location.hash =
      '#/home';
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

  function rebuildHeaderTargets() {
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

        return (
          rect.top >=
          -5 &&
          rect.top <
          135
        );
      }
    );

    headerTargets =
      uniqueVisible(
        candidates
      ).sort(
        (
          a,
          b
        ) =>
          a
            .getBoundingClientRect()
            .left -
          b
            .getBoundingClientRect()
            .left
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

  function findActiveHeaderIndex() {
    rebuildHeaderTargets();

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
        findActiveHeaderIndex();
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
     * Media Bar Enhanced owns its slideshow lifecycle. Our remote
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
    preferred = null
  ) {
    const previous =
      extContext ===
      context
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
        uniqueVisible([
          ...root.querySelectorAll(
            'button:not([disabled])'
          )
        ]).sort(
          visualSort
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

  function enterSeerrDiscovery() {
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

    return uniqueVisible(
      result
    ).sort(
      visualSort
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
    return uniqueVisible([
      ...root.querySelectorAll(
        '.mainDetailButtons button,' +
        '.mainDetailButtons a'
      ),

      ...root.querySelectorAll(
        '.je-series-request-more-btn'
      )
    ]).sort(
      visualSort
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
    return uniqueVisible([
      ...root.querySelectorAll(
        '#similarCollapsible .card[data-type]'
      )
    ]).sort(
      visualSort
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

  function enterDetail(
    root
  ) {
    rebuildHeaderTargets();

    zone =
      'detail';

    const targets =
      buildDetailTargets(
        root
      );

    return setExt(
      'detail',
      root,
      targets,

      detailActions(
        root
      )[0] ||
      targets[0]
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
    ].filter(
      visible
    )[0] ||
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

    if (
      submit &&
      input
    ) {
      submitSearch(
        input
      );
    }

    setTimeout(
      () => {
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
    const page =
      document.querySelector(
        '#videoOsdPage'
      );

    if (
      page &&
      (
        page.isConnected ||
        /#\/video(?:$|\?)/
          .test(
            location.hash
          )
      )
    ) {
      return page;
    }

    const video =
      document.querySelector(
        'video.htmlvideoplayer,' +
        'video'
      );

    if (
      video &&
      /#\/video/
        .test(
          location.hash
        )
    ) {
      return (
        page ||
        video.closest(
          '.page'
        ) ||
        document.body
      );
    }

    return null;
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
        '[JF TV] Native Jellyfin OSD command failed:',
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
    return uniqueVisible([
      ...(
        page ||
        document
      ).querySelectorAll(
        '.videoOsdBottom button:not([disabled]),' +
        '.osdControls button:not([disabled])'
      )
    ]).sort(
      (
        a,
        b
      ) =>
        a
          .getBoundingClientRect()
          .left -
        b
          .getBoundingClientRect()
          .left
    );
  }

  function playerTopControls(
    page
  ) {
    return uniqueVisible([
      ...page.querySelectorAll(
        '.osdHeader button:not([disabled])'
      )
    ]).sort(
      (
        a,
        b
      ) =>
        a
          .getBoundingClientRect()
          .left -
        b
          .getBoundingClientRect()
          .left
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

  function exitPlayer() {
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

      return true;
    }

    window.history.back();

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

    return uniqueVisible([
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
    ).sort(
      visualSort
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
    const pages = [
      ...document.querySelectorAll(
        '.page'
      )
    ].filter(
      visible
    );

    return pages[
      pages.length - 1
    ] || null;
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
        group.cards
          .slice()
          .sort(visualSort);

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

    return uniqueVisible([
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
        !el.closest('.card') &&
        el.getBoundingClientRect()
          .top <
          firstCardTop
    ).sort(
      visualSort
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

    return uniqueVisible([
      ...content.querySelectorAll(
        '.alphaPickerButton'
      )
    ]).filter(
      el =>
        !el.disabled &&
        el.getAttribute(
          'aria-disabled'
        ) !== 'true'
    ).sort(
      (a, b) =>
        a.getBoundingClientRect()
          .top -
        b.getBoundingClientRect()
          .top
    );
  }

  function clearNativeLibraryState() {
    nativeLibraryRoot = null;
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
    refreshNativeLibraryState(root);

    if (
      event.key === 'Escape' ||
      event.key === 'BrowserBack' ||
      event.key === 'GoBack'
    ) {
      const back =
        document.querySelector(
          '.headerBackButton,' +
          'button[aria-label="Back" i],' +
          'button[title="Back" i]'
        );

      if (back && back.isConnected) {
        click(back);
      } else {
        window.history.back();
      }

      return true;
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

  function scheduleContextRefresh() {
    clearTimeout(
      rebuildTimer
    );

    rebuildTimer =
      setTimeout(
        () => {
          if (
            [
              'route-reset',
              'detail',
              'enhanced-modal',
              'seerr-modal',
              'request-form',
              'search',
              'search-results',
              'header',
              'native-controls',
              'native-grid',
              'native-alpha',
              'native-section-title',
              'drawer'
            ].includes(
              zone
            )
          ) {
            const context =
              resolveContext();

            if (
              context.type === 'home' &&
              zone === 'route-reset'
            ) {
              restoreHomeAfterRoute();
            }
          }
        },
        120
      );
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
              mutation.type ===
              'childList' &&
              (
                mutation.addedNodes
                  .length ||
                mutation.removedNodes
                  .length
              )
            ) {
              changed =
                true;

              break;
            }
          }

          if (!changed) {
            return;
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

    scrollEverythingToTop();
    rebuildRows();

    rowIndex = 0;
    cardIndex = 0;
    mediaControlIndex = 0;

    if (rows.length) {
      zone = 'library';
      selectRow(0, 0);
      return true;
    }

    if (
      getMediaControls()
        .length
    ) {
      enterMediaBar(false);
      return true;
    }

    return enterHeader(true);
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

    const dialog =
      nativeDialog();

    if (dialog) {
      return {
        type:
          'native-dialog',

        root:
          dialog
      };
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

      const actions =
        detailActions(
          details
        );

      const detailNeedsPrimaryFocus =
        actions.length > 0 &&
        !extTargets.some(
          target =>
            actions.includes(
              target
            )
        );

      if (
        zone !==
        'detail' ||
        extContext !==
        'detail' ||
        !extTargetsStillValid(
          details
        ) ||
        detailNeedsPrimaryFocus
      ) {
        enterDetail(
          details
        );
      }

      return {
        type:
          'detail',

        root:
          details
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

    if (zone === 'route-reset') {
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
      click(
        detailActivationTarget(
          extTargets[
            extIndex
          ]
        )
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
      'native-dialog'
    ) {
      hideFocus();

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

    [
      rebuildTimer,
      mediaBarTimer,
      playerWakeTimer,
      enterLongTimer,
      backLongTimer,
      observerMaintenanceTimer,
      postHeaderTimer
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

      mediaControlIndex =
        0;

      showMediaControlFocus();
    } else {
      enterHeader(
        true
      );
    }
  }

  maintainScopedObservers();

  console.log(
    '[JF TV Navigation] Loaded',
    VERSION,
    `Long OK refresh: ${LONG_PRESS_REFRESH_MS}ms`
  );
})();