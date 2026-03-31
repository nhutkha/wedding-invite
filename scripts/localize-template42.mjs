import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'c:/DC/wedding-invite';
const SOURCE_HTML = path.join(ROOT, 'tmp-template42.html');
const WEB_PUBLIC = path.join(ROOT, 'web', 'public');
const ASSET_ROOT = path.join(WEB_PUBLIC, 'template42-assets');
const OUTPUT_HTML = path.join(WEB_PUBLIC, 'template42-localized.html');
const LOCAL_PAGE_PUBLIC_PATH = '/template42-localized.html';
const LOCAL_MAP_EMBED_PUBLIC_PATH = '/template42-map-embed.html';
const LOCAL_MAP_EMBED_OUTPUT = path.join(WEB_PUBLIC, 'template42-map-embed.html');
const TMP_NEXT_CHUNKS_DIR = path.join(ROOT, 'tmp-next-chunks');
const LOCAL_SCRIPT_CACHE_BUSTER = 'v=local-runtime-4';
const LOCAL_TEMPLATE_API_BASE = '/api';

const SITE_ORIGIN = 'https://cinelove.me';
const LOCAL_MAP_EMBED_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Map Placeholder</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
    }

    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: #f3ece8;
    }

    .map-shell {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      border: 1px solid rgba(120, 96, 85, 0.24);
      border-radius: 12px;
      background: radial-gradient(circle at 20% 20%, #fdf6f2 0%, #f3ece8 44%, #e8ddcf 100%);
      color: #3b3232;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 16px;
      gap: 8px;
      overflow: hidden;
    }

    .pin {
      width: 44px;
      height: 44px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      background: #ca4a5a;
      position: relative;
      margin-bottom: 10px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.18);
    }

    .pin::after {
      content: "";
      position: absolute;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      top: 13px;
      left: 13px;
      background: #fff;
    }

    .title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .address {
      font-size: 13px;
      max-width: 280px;
      line-height: 1.4;
    }

    .hint {
      font-size: 11px;
      opacity: 0.72;
    }
  </style>
</head>
<body>
  <div class="map-shell" aria-label="Wedding location map placeholder">
    <div class="pin" aria-hidden="true"></div>
    <div class="title">Wedding Location</div>
    <div class="address">Ấp 3A, xã Phương Thịnh Đồng Tháp</div>
    <div class="hint">Map embed replaced by local placeholder for fully local HTML mode.</div>
  </div>
</body>
</html>
`;

const EXTRA_STYLE = `
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #f0f2f5;
  }

  .absolute.inset-0.bg-white.z-50.flex.items-center.justify-center {
    display: none !important;
  }
</style>
`;

const EXTRA_SCRIPT = `
<script>
  (function () {
    var AUTO_SCROLL_SPEED = 0.08;
    var AUTO_SCROLL_DELAY_MS = 2000;
    var ENVELOPE_UNLOCK_DELAY_MS = 3000;
    var autoScrollEnabled = true;
    var autoScrollRunning = false;
    var autoScrollFrameId = 0;
    var autoScrollStartTimerId = 0;
    var scrollLocked = false;
    var envelopeUnlocked = false;

    function parseTransitionMeta(key) {
      if (typeof key !== 'string') {
        return null;
      }

      var match = key.match(/(slide-up|slide-left|slide-right|fade-in)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-([a-z-]+)-(true|false)$/i);
      if (!match) {
        return null;
      }

      return {
        type: match[1].toLowerCase(),
        duration: Number(match[2]) || 1.3,
        delay: Number(match[3]) || 0,
        easing: match[4] || 'ease-out',
      };
    }

    function normalizeTransform(value) {
      if (!value || value === 'none') {
        return 'none';
      }

      return value
        .replace(/translate3d\\(([-0-9.]+)px,\\s*([-0-9.]+)px,\\s*([-0-9.]+)px\\)/g, 'translate3d(0px, 0px, 0px)')
        .replace(/translateX\\(([-0-9.]+)px\\)/g, 'translateX(0px)')
        .replace(/translateY\\(([-0-9.]+)px\\)/g, 'translateY(0px)')
        .replace(/translate\\(([-0-9.]+)px,\\s*([-0-9.]+)px\\)/g, 'translate(0px, 0px)');
    }

    function getScrollRoot() {
      var root = document.querySelector('.styles_customScroll__X5r6w');
      return root instanceof HTMLElement ? root : null;
    }

    function updateAutoScrollButton() {
      var button = document.getElementById('auto-scroll-play-local');
      if (!(button instanceof HTMLElement)) {
        return;
      }

      button.style.display = autoScrollEnabled && !autoScrollRunning && !scrollLocked ? 'flex' : 'none';
    }

    function ensureAutoScrollButton() {
      var existing = document.getElementById('auto-scroll-play-local');
      if (existing instanceof HTMLElement) {
        updateAutoScrollButton();
        return existing;
      }

      var button = document.createElement('button');
      button.id = 'auto-scroll-play-local';
      button.type = 'button';
      button.setAttribute('aria-label', 'Auto scroll');
      button.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"></path></svg>';
      button.style.position = 'fixed';
      button.style.top = '10px';
      button.style.left = '10px';
      button.style.width = '40px';
      button.style.height = '40px';
      button.style.border = '0';
      button.style.borderRadius = '999px';
      button.style.zIndex = '1000';
      button.style.cursor = 'pointer';
      button.style.display = 'none';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.color = '#2f2f2f';
      button.style.background = 'rgba(255,255,255,0.9)';
      button.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';

      button.addEventListener('click', function () {
        autoScrollEnabled = true;
        scheduleAutoScroll(0);
      });

      document.body.appendChild(button);
      updateAutoScrollButton();
      return button;
    }

    function setScrollLock(locked) {
      var root = getScrollRoot();
      scrollLocked = !!locked;

      if (root instanceof HTMLElement) {
        root.style.overflowY = scrollLocked ? 'hidden' : 'auto';
        root.style.touchAction = scrollLocked ? 'none' : 'auto';
      }

      updateAutoScrollButton();
    }

    function stopAutoScroll() {
      autoScrollRunning = false;

      if (autoScrollFrameId) {
        window.cancelAnimationFrame(autoScrollFrameId);
        autoScrollFrameId = 0;
      }

      updateAutoScrollButton();
    }

    function runAutoScrollTick(previousTime) {
      if (!autoScrollRunning) {
        return;
      }

      var root = getScrollRoot();
      if (!(root instanceof HTMLElement) || scrollLocked) {
        stopAutoScroll();
        return;
      }

      autoScrollFrameId = window.requestAnimationFrame(function (timestamp) {
        var delta = timestamp - previousTime;
        root.scrollTo({
          top: root.scrollTop + delta * AUTO_SCROLL_SPEED,
          behavior: 'auto',
        });

        if (root.scrollTop >= root.scrollHeight - root.clientHeight - 1) {
          stopAutoScroll();
          return;
        }

        runAutoScrollTick(timestamp);
      });
    }

    function startAutoScroll() {
      if (!autoScrollEnabled || autoScrollRunning || scrollLocked) {
        updateAutoScrollButton();
        return;
      }

      var root = getScrollRoot();
      if (!(root instanceof HTMLElement)) {
        return;
      }

      autoScrollRunning = true;
      updateAutoScrollButton();

      autoScrollFrameId = window.requestAnimationFrame(function (timestamp) {
        runAutoScrollTick(timestamp);
      });
    }

    function scheduleAutoScroll(delayMs) {
      if (autoScrollStartTimerId) {
        window.clearTimeout(autoScrollStartTimerId);
      }

      autoScrollStartTimerId = window.setTimeout(function () {
        startAutoScroll();
      }, delayMs);
    }

    function setupScrollInteractions() {
      var root = getScrollRoot();
      if (!(root instanceof HTMLElement)) {
        return;
      }

      function handleWheel(event) {
        if (scrollLocked) {
          event.preventDefault();
          return;
        }

        if (autoScrollRunning) {
          stopAutoScroll();
        }
      }

      function handleTouchMove(event) {
        if (scrollLocked) {
          event.preventDefault();
        }
      }

      function handleTouchStart() {
        if (!scrollLocked && autoScrollRunning) {
          stopAutoScroll();
        }
      }

      root.addEventListener('wheel', handleWheel, { passive: false });
      root.addEventListener('touchmove', handleTouchMove, { passive: false });
      root.addEventListener('touchstart', handleTouchStart, { passive: true });

      ensureAutoScrollButton();
    }

    function revealNode(node) {
      if (!(node instanceof HTMLElement) || node.dataset.localRevealDone === '1') {
        return;
      }

      var key = node.getAttribute('data-transition-key') || '';
      var meta = parseTransitionMeta(key);
      if (meta && !node.style.transition) {
        node.style.transition = 'all ' + meta.duration + 's ' + meta.easing + ' ' + meta.delay + 's';
      }

      node.style.opacity = '1';
      node.style.transform = normalizeTransform(node.style.transform);
      node.dataset.localRevealDone = '1';
    }

    function animateTransitionNodes() {
      var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-transition-key]'));
      if (!nodes.length) {
        return;
      }

      var root = getScrollRoot();

      // If IntersectionObserver is unavailable, fall back to progressive reveal.
      if (typeof window.IntersectionObserver !== 'function') {
        nodes.forEach(function (node, index) {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          var stagger = Math.min(index * 35, 450);
          window.setTimeout(function () {
            revealNode(node);
          }, stagger);
        });
        return;
      }

      var observer = new window.IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
              return;
            }

            revealNode(entry.target);
            observer.unobserve(entry.target);
          });
        },
        {
          root: root,
          threshold: 0.1,
          rootMargin: '0px 0px -50px 0px',
        }
      );

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          nodes.forEach(function (node) {
            if (!(node instanceof HTMLElement)) {
              return;
            }

            node.style.willChange = 'transform, opacity';
            observer.observe(node);
          });
        });
      });
    }

    function setupEnvelope() {
      var envelope = document.querySelector('.animated-envelope-component');
      var container = document.querySelector('.envelope-container');

      if (!(envelope instanceof HTMLElement) || !(container instanceof HTMLElement)) {
        return false;
      }

      envelope.style.cursor = 'pointer';
      envelope.addEventListener('click', function () {
        var isOpen = container.classList.contains('open');
        container.classList.toggle('open', !isOpen);
        container.classList.toggle('close', isOpen);

        if (!isOpen && !envelopeUnlocked) {
          envelopeUnlocked = true;

          window.setTimeout(function () {
            setScrollLock(false);
            window.dispatchEvent(new CustomEvent('envelope-opened'));
          }, ENVELOPE_UNLOCK_DELAY_MS);
        }
      });

      return true;
    }

    function setupAudioToggle() {
      var audio = document.querySelector('audio');
      var toggle = document.querySelector('#audio-control-wrapper .audio-toggle');
      var cancelIcon = document.querySelector('#audio-control-wrapper .icon-cancel');

      if (!(audio instanceof HTMLAudioElement) || !(toggle instanceof HTMLElement)) {
        return;
      }

      audio.volume = 0.75;

      function setPlayingState(isPlaying) {
        toggle.classList.toggle('mrotate', isPlaying);
        if (cancelIcon instanceof HTMLElement) {
          cancelIcon.style.display = isPlaying ? 'none' : 'block';
        }
      }

      setPlayingState(false);

      function tryPlayFromGesture() {
        if (!audio.paused) {
          return;
        }

        audio.play().then(function () {
          setPlayingState(true);
        }).catch(function () {
          setPlayingState(false);
        });
      }

      ['click', 'touchstart', 'keydown', 'wheel'].forEach(function (eventName) {
        document.addEventListener(eventName, tryPlayFromGesture, { once: true, passive: true });
      });

      audio.addEventListener('play', function () {
        setPlayingState(true);
      });
      audio.addEventListener('pause', function () {
        setPlayingState(false);
      });

      toggle.addEventListener('click', function () {
        if (audio.paused) {
          audio.play().then(function () {
            setPlayingState(true);
          }).catch(function () {
            setPlayingState(false);
          });
        } else {
          audio.pause();
          setPlayingState(false);
        }
      });
    }

    function setupCountdown() {
      var defaultTargetIso = '2026-12-15T10:30:00+07:00';
      var countdownBlocks = document.querySelectorAll('.countdown.componentBOX');

      if (!countdownBlocks.length) {
        return;
      }

      function parseCountdownTarget(rawValue) {
        var text = String(rawValue || '').trim();
        if (!text) {
          return null;
        }

        if (/^\d+$/.test(text)) {
          var epochMs = Number(text);
          if (Number.isFinite(epochMs) && epochMs > 0) {
            return epochMs;
          }
        }

        var parsed = new Date(text).getTime();
        if (!Number.isNaN(parsed)) {
          return parsed;
        }

        return null;
      }

      var target = parseCountdownTarget(defaultTargetIso);

      countdownBlocks.forEach(function (block) {
        if (!(block instanceof HTMLElement)) {
          return;
        }

        var blockTarget = parseCountdownTarget(block.getAttribute('data-countdown-target'));
        if (blockTarget !== null) {
          target = blockTarget;
        }
      });

      if (target === null) {
        return;
      }

      function updateBlock(block) {
        if (!(block instanceof HTMLElement)) {
          return;
        }

        var valueNodes = block.querySelectorAll(':scope > div > div:first-child');
        if (valueNodes.length < 4) {
          return;
        }

        var diff = Math.max(target - Date.now(), 0);
        var days = Math.floor(diff / 86400000);
        var hours = Math.floor((diff % 86400000) / 3600000);
        var minutes = Math.floor((diff % 3600000) / 60000);
        var seconds = Math.floor((diff % 60000) / 1000);

        valueNodes[0].textContent = String(days);
        valueNodes[1].textContent = String(hours);
        valueNodes[2].textContent = String(minutes);
        valueNodes[3].textContent = String(seconds);
      }

      function tick() {
        countdownBlocks.forEach(updateBlock);
      }

      tick();
      window.setInterval(tick, 1000);
    }

    function removeLoadingMask() {
      var mask = document.querySelector('.absolute.inset-0.bg-white.z-50.flex.items-center.justify-center');
      if (mask instanceof HTMLElement) {
        mask.style.transition = 'opacity 0.45s ease';
        mask.style.opacity = '1';

        requestAnimationFrame(function () {
          mask.style.opacity = '0';
          window.setTimeout(function () {
            mask.style.display = 'none';
          }, 460);
        });
      }
    }

    function boot() {
      removeLoadingMask();
      setupScrollInteractions();
      animateTransitionNodes();
      var hasEnvelope = setupEnvelope();

      if (hasEnvelope) {
        setScrollLock(true);
        window.addEventListener(
          'envelope-opened',
          function () {
            scheduleAutoScroll(500);
          },
          { once: true }
        );
      } else {
        setScrollLock(false);
        scheduleAutoScroll(AUTO_SCROLL_DELAY_MS);
      }

      setupAudioToggle();
      setupCountdown();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })();
</script>
`;

const BRANDING_OVERRIDE_STYLE = `
<style id="template42-branding-style">
  #app-view-index .watermark,
  #app-view-index .watermark-content,
  #app-view-index .watermark-link {
    display: none !important;
  }

  .qr-code-popup {
    display: none !important;
  }

  #template42-custom-qr-popup {
    position: fixed;
    right: 64px;
    bottom: 64px;
    z-index: 1200;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    transition: all 0.25s ease;
  }

  #template42-custom-qr-popup button {
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  #template42-custom-qr-popup[data-expanded="false"] {
    width: 48px;
    height: 48px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #template42-custom-qr-popup[data-expanded="true"] {
    width: 164px;
    padding: 10px;
  }

  #template42-custom-qr-popup[data-visible="false"] {
    display: none !important;
  }

  #template42-custom-qr-popup .qr-toggle-icon {
    font-size: 22px;
    color: #666666;
    line-height: 1;
  }

  #template42-custom-qr-popup .qr-card {
    display: none;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  #template42-custom-qr-popup[data-expanded="true"] .qr-card {
    display: flex;
  }

  #template42-custom-qr-popup .qr-close-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    color: #555555;
    font-size: 14px;
    line-height: 1;
  }

  #template42-custom-qr-popup .qr-close-btn:hover {
    background: #f3f3f3;
  }

  #template42-custom-qr-popup .qr-image-wrap {
    margin-top: 10px;
    padding: 6px;
    border-radius: 6px;
    background: #ffffff;
  }

  #template42-custom-qr-popup .qr-image-wrap img {
    display: block;
    width: 120px;
    height: 120px;
  }

  #template42-custom-qr-popup .qr-caption {
    margin: 0;
    max-width: 120px;
    text-align: center;
    font-size: 11px;
    line-height: 1.4;
    color: #666666;
    font-weight: 500;
  }

  @media (max-width: 1000px) {
    #template42-custom-qr-popup {
      display: none !important;
    }
  }
</style>
`;

const QR_OVERRIDE_SCRIPT = `
<script id="template42-qr-override-script">
  (function () {
    var popupId = 'template42-custom-qr-popup';
    if (window.__template42QrOverrideReady) {
      return;
    }
    window.__template42QrOverrideReady = true;

    function normalizeQrUrl(rawValue) {
      var text = String(rawValue || '').trim();
      if (!text) {
        return '';
      }

      try {
        return new URL(text, window.location.href).toString();
      } catch {
        return '';
      }
    }

    function readQrTargetUrl() {
      var htmlUrl = normalizeQrUrl(document.documentElement.getAttribute('data-qr-url'));
      if (htmlUrl) {
        return htmlUrl;
      }

      var bodyUrl = normalizeQrUrl(document.body && document.body.getAttribute('data-qr-url'));
      if (bodyUrl) {
        return bodyUrl;
      }

      return window.location.href;
    }

    function hideNativeQrPopup() {
      document.querySelectorAll('.qr-code-popup').forEach(function (node) {
        if (node instanceof HTMLElement) {
          node.style.display = 'none';
        }
      });
    }

    function updatePopupVisibility(root) {
      var shouldShow = window.innerWidth > 1000;
      root.setAttribute('data-visible', shouldShow ? 'true' : 'false');
    }

    function buildQrImageUrl(targetUrl) {
      return 'https://quickchart.io/qr?size=220&margin=1&text=' + encodeURIComponent(targetUrl);
    }

    function buildQrImageFallbackUrl(targetUrl) {
      return 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(targetUrl);
    }

    function mountCustomQrPopup() {
      var existing = document.getElementById(popupId);
      if (existing instanceof HTMLElement) {
        updatePopupVisibility(existing);
        return;
      }

      var targetUrl = readQrTargetUrl();
      var root = document.createElement('div');
      root.id = popupId;
      root.setAttribute('data-expanded', 'false');
      root.setAttribute('data-visible', 'true');

      var toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'qr-toggle-btn';
      toggleBtn.setAttribute('aria-label', 'Open QR code');
      toggleBtn.innerHTML = '<span class="qr-toggle-icon">QR</span>';

      var card = document.createElement('div');
      card.className = 'qr-card';

      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'qr-close-btn';
      closeBtn.setAttribute('aria-label', 'Close QR code');
      closeBtn.textContent = 'x';

      var imageWrap = document.createElement('div');
      imageWrap.className = 'qr-image-wrap';

      var image = document.createElement('img');
      image.alt = 'QR code';
      image.referrerPolicy = 'no-referrer';
      image.src = buildQrImageUrl(targetUrl);
      image.addEventListener('error', function () {
        if (image.dataset.fallbackApplied === '1') {
          return;
        }

        image.dataset.fallbackApplied = '1';
        image.src = buildQrImageFallbackUrl(targetUrl);
      });

      var caption = document.createElement('p');
      caption.className = 'qr-caption';
      caption.textContent = 'Scan QR code to open your website';

      imageWrap.appendChild(image);
      card.appendChild(closeBtn);
      card.appendChild(imageWrap);
      card.appendChild(caption);
      root.appendChild(toggleBtn);
      root.appendChild(card);

      function expand() {
        root.setAttribute('data-expanded', 'true');
        toggleBtn.setAttribute('aria-label', 'Collapse QR code');
      }

      function collapse() {
        root.setAttribute('data-expanded', 'false');
        toggleBtn.setAttribute('aria-label', 'Open QR code');
      }

      toggleBtn.addEventListener('click', function () {
        var expanded = root.getAttribute('data-expanded') === 'true';
        if (expanded) {
          collapse();
          return;
        }

        expand();
      });

      closeBtn.addEventListener('click', function () {
        collapse();
      });

      window.addEventListener('resize', function () {
        updatePopupVisibility(root);
      });

      updatePopupVisibility(root);
      document.body.appendChild(root);
    }

    function boot() {
      hideNativeQrPopup();
      mountCustomQrPopup();

      if (typeof window.MutationObserver === 'function') {
        var observer = new MutationObserver(function () {
          hideNativeQrPopup();
        });

        observer.observe(document.body, { childList: true, subtree: true });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  })();
</script>
`;

const EDITOR_MODE_BOOTSTRAP = `
<script>
  (function () {
    var params = new URLSearchParams(window.location.search);
    if (!params.has('editor')) {
      return;
    }

    function stripRuntimeScripts() {
      document.querySelectorAll('script[src]').forEach(function (node) {
        var src = String(node.getAttribute('src') || '');
        if (/_next\\/static\\//.test(src) || /googletagmanager\\.com/.test(src)) {
          node.remove();
        }
      });
    }

    var style = document.createElement('style');
    style.textContent = [
      '[data-transition-key]{opacity:1 !important;transform:none !important;transition:none !important;}',
      '.absolute.inset-0.bg-white.z-50.flex.items-center.justify-center{display:none !important;}',
      '.styles_customScroll__X5r6w{overflow-y:auto !important;touch-action:auto !important;}'
    ].join('');
    document.head.appendChild(style);

    stripRuntimeScripts();
  })();
</script>
`;

function toAbsoluteUrl(raw, base = SITE_ORIGIN) {
  if (!raw) {
    return null;
  }
  if (raw.startsWith('data:') || raw.startsWith('blob:') || raw.startsWith('#')) {
    return null;
  }
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

function toRelativeUrl(absoluteUrl) {
  try {
    const url = new URL(absoluteUrl);
    const relative = `${url.pathname}${url.search}${url.hash}`;
    return relative || '/';
  } catch {
    return '/';
  }
}

function mapAbsoluteUrlToLocal(rawValue) {
  if (!rawValue) {
    return null;
  }

  const decoded = rawValue.replace(/&amp;/g, '&').trim();

  if (/^https?:\/\/cinelove\.me\/template\/thiep-cuoi-42\/?$/i.test(decoded)) {
    return LOCAL_PAGE_PUBLIC_PATH;
  }

  if (/^https?:\/\/cinelove\.me\/?$/i.test(decoded)) {
    return '/';
  }

  if (/^https?:\/\/cinelove\.me\//i.test(decoded)) {
    return toRelativeUrl(decoded);
  }

  return null;
}

function safeDecodeUriPath(value) {
  try {
    return decodeURI(String(value || ''));
  } catch {
    return String(value || '');
  }
}

function localPublicPathFromUrl(absoluteUrl) {
  const url = new URL(absoluteUrl);
  const cleanPath = safeDecodeUriPath(url.pathname).replace(/^\/+/, '');
  return `/template42-assets/${url.hostname}/${cleanPath}`;
}

function localFsPathFromPublicPath(publicPath) {
  const relativePublicPath = publicPath.replace(/^\//, '');
  return path.join(WEB_PUBLIC, safeDecodeUriPath(relativePublicPath));
}

function localizeWebpackPublicPath(scriptText, hostName) {
  const localNextRoot = `/template42-assets/${hostName}/_next/`;
  let nextScriptText = String(scriptText || '');

  // Next webpack runtime assigns public path using r.p="/_next/".
  // Replace just the assignment expression, keep surrounding delimiters untouched.
  nextScriptText = nextScriptText.replace(
    /r\.p\s*=\s*(["'])\/_next\/\1/g,
    `r.p="${localNextRoot}"`
  );

  // Repair malformed cached variants where the closing quote before comma was lost.
  nextScriptText = nextScriptText.replace(
    /r\.p\s*=\s*"([^"\n]*\/_next\/),/g,
    'r.p="$1",'
  );

  // Normalize any already-localized public path to the current host-specific root.
  nextScriptText = nextScriptText.replace(
    /r\.p\s*=\s*(["'])\/template42-assets\/[^"']+\/_next\/\1/g,
    `r.p="${localNextRoot}"`
  );

  return nextScriptText;
}

function localizeRuntimeApiBase(scriptText) {
  let nextScriptText = String(scriptText || '');

  nextScriptText = nextScriptText.replace(
    /API_URL:\s*"https?:\/\/api\.cinelove\.me\/?"/g,
    `API_URL:"${LOCAL_TEMPLATE_API_BASE}"`
  );

  nextScriptText = nextScriptText.replace(
    /API_URL:\s*'https?:\/\/api\.cinelove\.me\/?'/g,
    `API_URL:"${LOCAL_TEMPLATE_API_BASE}"`
  );

  return nextScriptText;
}

function extractNextMediaPaths(scriptText) {
  const mediaPathRegex = /\/_next\/static\/media\/[^"'`\s)]+/g;
  return [...new Set(String(scriptText || '').match(mediaPathRegex) ?? [])];
}

function localizeRuntimeMediaPaths(scriptText, hostName) {
  const localMediaRoot = `/template42-assets/${hostName}/_next/static/media/`;
  let nextScriptText = String(scriptText || '');

  // Normalize absolute and root-relative Next media URLs to local mirrored assets.
  nextScriptText = nextScriptText.replace(
    /(["'])https?:\/\/[^"']+\/_next\/static\/media\//g,
    `$1${localMediaRoot}`
  );

  nextScriptText = nextScriptText.replace(
    /(["'])\/_next\/static\/media\//g,
    `$1${localMediaRoot}`
  );

  nextScriptText = nextScriptText.replace(
    /(["'])\/template42-assets\/[^"']+\/_next\/static\/media\//g,
    `$1${localMediaRoot}`
  );

  return nextScriptText;
}

async function mirrorMediaAssetsFromScript(scriptText, hostName) {
  const mediaPaths = extractNextMediaPaths(scriptText);
  if (!mediaPaths.length) {
    return;
  }

  const hostOrigin = `https://${hostName}`;
  for (const mediaPath of mediaPaths) {
    const absoluteMediaUrl = toAbsoluteUrl(mediaPath, hostOrigin);
    if (!absoluteMediaUrl) {
      continue;
    }

    const mediaPublicPath = localPublicPathFromUrl(absoluteMediaUrl);
    const mediaFsPath = localFsPathFromPublicPath(mediaPublicPath);
    await downloadBinary(absoluteMediaUrl, mediaFsPath);
  }
}

async function ensureDirectoryForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function buildFallbackUrls(rawUrl) {
  const fallbacks = [rawUrl];

  try {
    const parsed = new URL(rawUrl);

    if (parsed.hostname === 'cinelove.me' && parsed.pathname.startsWith('/assets/')) {
      fallbacks.push(`https://assets.cinelove.me${parsed.pathname}${parsed.search}`);
    }

    if (parsed.hostname === 'cinelove.me' && parsed.pathname.startsWith('/uploads/')) {
      fallbacks.push(`https://img.cinelove.me${parsed.pathname}${parsed.search}`);
    }

    if (parsed.hostname === 'cinelove.me' && parsed.pathname.startsWith('/images/')) {
      fallbacks.push(`https://assets.cinelove.me${parsed.pathname}${parsed.search}`);
    }

    if (
      parsed.hostname === 'cinelove.me' &&
      parsed.pathname.startsWith('/_next/static/chunks/') &&
      parsed.search
    ) {
      // Some mirrored chunk URLs include a deployment query string that can 404.
      // Retry without the query string to fetch the canonical chunk file.
      fallbacks.push(`https://cinelove.me${parsed.pathname}`);
    }

    if (
      parsed.hostname === 'cinelove.me' &&
      parsed.pathname.startsWith('/_next/static/') &&
      parsed.search
    ) {
      // Manifest files can also carry deployment query strings that are not needed.
      fallbacks.push(`https://cinelove.me${parsed.pathname}`);
    }
  } catch {
    // Ignore malformed URL and only use the original.
  }

  return [...new Set(fallbacks)];
}

async function downloadBinary(url, destination) {
  try {
    await fs.access(destination);
    return true;
  } catch {
    // File does not exist, continue download.
  }

  const candidates = buildFallbackUrls(url);
  for (const candidate of candidates) {
    const response = await fetch(candidate);
    if (!response.ok) {
      continue;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    await ensureDirectoryForFile(destination);
    await fs.writeFile(destination, bytes);
    return true;
  }

  return false;
}

async function hydrateChunkFromTmpMirror(absoluteUrl, destination) {
  try {
    const parsed = new URL(absoluteUrl);
    if (
      parsed.hostname !== 'cinelove.me' ||
      !parsed.pathname.startsWith('/_next/static/chunks/')
    ) {
      return false;
    }

    const targetFile = path.basename(parsed.pathname);
    if (!targetFile) {
      return false;
    }

    const entries = await fs.readdir(TMP_NEXT_CHUNKS_DIR);
    const matched = entries.find((entry) => entry.includes(targetFile));
    if (!matched) {
      return false;
    }

    const sourcePath = path.join(TMP_NEXT_CHUNKS_DIR, matched);
    const bytes = await fs.readFile(sourcePath);
    await ensureDirectoryForFile(destination);
    await fs.writeFile(destination, bytes);
    return true;
  } catch {
    return false;
  }
}

async function ensureNextManifestStub(absoluteUrl, destination) {
  try {
    const parsed = new URL(absoluteUrl);
    if (parsed.hostname !== 'cinelove.me' || !parsed.pathname.startsWith('/_next/static/')) {
      return false;
    }

    const fileName = path.basename(parsed.pathname);
    let stubContent = '';

    if (fileName === '_buildManifest.js') {
      stubContent = [
        'self.__BUILD_MANIFEST = self.__BUILD_MANIFEST || {};',
        'self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB();',
      ].join('\n');
    } else if (fileName === '_ssgManifest.js') {
      stubContent = [
        'self.__SSG_MANIFEST = self.__SSG_MANIFEST || new Set();',
        'self.__SSG_MANIFEST_CB && self.__SSG_MANIFEST_CB();',
      ].join('\n');
    } else {
      return false;
    }

    await ensureDirectoryForFile(destination);
    await fs.writeFile(destination, `${stubContent}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function processCssLink(href, htmlBaseUrl) {
  const absoluteUrl = toAbsoluteUrl(href, htmlBaseUrl);
  if (!absoluteUrl) {
    return { original: href, replacement: href };
  }

  const cssPublicPath = localPublicPathFromUrl(absoluteUrl);
  const cssFsPath = localFsPathFromPublicPath(cssPublicPath);

  let cssText;
  try {
    cssText = await fs.readFile(cssFsPath, 'utf8');
  } catch {
    const cssResponse = await fetch(absoluteUrl);
    if (!cssResponse.ok) {
      throw new Error(`Failed to download css ${absoluteUrl}: ${cssResponse.status}`);
    }
    cssText = await cssResponse.text();
  }

  const urlRegex = /url\(([^)]+)\)/g;
  const cssUrls = [];
  let cssMatch;
  while ((cssMatch = urlRegex.exec(cssText)) !== null) {
    cssUrls.push(cssMatch[1].trim().replace(/^['"]|['"]$/g, ''));
  }

  let updatedCss = cssText;
  for (const cssUrl of cssUrls) {
    const absoluteAssetUrl = toAbsoluteUrl(cssUrl, absoluteUrl);
    if (!absoluteAssetUrl) {
      continue;
    }

    const assetPublicPath = localPublicPathFromUrl(absoluteAssetUrl);
    const assetFsPath = localFsPathFromPublicPath(assetPublicPath);
    const downloaded = await downloadBinary(absoluteAssetUrl, assetFsPath);
    if (!downloaded) {
      continue;
    }

    const escaped = cssUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    updatedCss = updatedCss.replace(new RegExp(escaped, 'g'), assetPublicPath);
  }

  await ensureDirectoryForFile(cssFsPath);
  await fs.writeFile(cssFsPath, updatedCss, 'utf8');

  return {
    original: href,
    replacement: cssPublicPath,
  };
}

async function processScriptSrc(src, htmlBaseUrl) {
  const absoluteUrl = toAbsoluteUrl(src, htmlBaseUrl);
  if (!absoluteUrl) {
    return { original: src, replacement: src };
  }

  const hostName = new URL(absoluteUrl).hostname.toLowerCase();
  if (hostName.includes('googletagmanager.com')) {
    return { original: src, replacement: absoluteUrl };
  }

  const parsedUrl = new URL(absoluteUrl);
  const scriptFileName = path.basename(parsedUrl.pathname);
  const isWebpackRuntimeScript =
    parsedUrl.hostname === 'cinelove.me' &&
    parsedUrl.pathname.startsWith('/_next/static/chunks/') &&
    /^webpack-.*\.js$/i.test(scriptFileName);

  const scriptPublicPath = localPublicPathFromUrl(absoluteUrl);
  const scriptFsPath = localFsPathFromPublicPath(scriptPublicPath);

  if (isWebpackRuntimeScript) {
    // Always refresh webpack runtime from source to avoid stale malformed cache.
    await fs.rm(scriptFsPath, { force: true });
  }

  let downloaded = await downloadBinary(absoluteUrl, scriptFsPath);

  if (!downloaded) {
    downloaded = await hydrateChunkFromTmpMirror(absoluteUrl, scriptFsPath);
  }

  if (!downloaded) {
    downloaded = await ensureNextManifestStub(absoluteUrl, scriptFsPath);
  }

  if (!downloaded) {
    return { original: src, replacement: src };
  }

  try {
    const scriptText = await fs.readFile(scriptFsPath, 'utf8');

    if (parsedUrl.hostname === 'cinelove.me') {
      await mirrorMediaAssetsFromScript(scriptText, parsedUrl.hostname);
    }

    let localizedScriptText = scriptText;

    if (isWebpackRuntimeScript) {
      localizedScriptText = localizeWebpackPublicPath(localizedScriptText, parsedUrl.hostname);
    }

    localizedScriptText = localizeRuntimeApiBase(localizedScriptText);
    localizedScriptText = localizeRuntimeMediaPaths(localizedScriptText, parsedUrl.hostname);

    if (localizedScriptText !== scriptText) {
      await fs.writeFile(scriptFsPath, localizedScriptText, 'utf8');
    }
  } catch {
    // Ignore post-processing failures and keep downloaded script as-is.
  }

  return {
    original: src,
    replacement: `${scriptPublicPath}?${LOCAL_SCRIPT_CACHE_BUSTER}`,
  };
}

async function localizeInlineStyleUrls(html, htmlBaseUrl) {
  const styleUrlRegex = /url\((?:&quot;|["'])?(https?:\/\/[^)"']+?)(?:&quot;|["'])?\)/gi;
  const styleUrls = [];
  let styleUrlMatch;

  while ((styleUrlMatch = styleUrlRegex.exec(html)) !== null) {
    styleUrls.push(styleUrlMatch[1]);
  }

  let updatedHtml = html;
  for (const rawStyleUrl of [...new Set(styleUrls)]) {
    const decodedStyleUrl = rawStyleUrl.replace(/&amp;/g, '&').replace(/&quot;/g, '');
    const absoluteUrl = toAbsoluteUrl(decodedStyleUrl, htmlBaseUrl);
    if (!absoluteUrl) {
      continue;
    }

    const publicPath = localPublicPathFromUrl(absoluteUrl);
    const fsPath = localFsPathFromPublicPath(publicPath);
    const downloaded = await downloadBinary(absoluteUrl, fsPath);
    if (!downloaded) {
      continue;
    }

    const escapedRaw = rawStyleUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    updatedHtml = updatedHtml.replace(new RegExp(escapedRaw, 'g'), publicPath);
  }

  return updatedHtml;
}

function rewriteAbsoluteUrlsInAttributes(html) {
  const attrRegex = /\b(href|src|content)=(["'])(https?:\/\/[^"']+)\2/gi;
  return html.replace(attrRegex, (fullMatch, attrName, quoteChar, rawUrl) => {
    const replacement = mapAbsoluteUrlToLocal(rawUrl);
    if (!replacement) {
      return fullMatch;
    }

    const escapedReplacement = replacement.replace(/&/g, '&amp;');
    return `${attrName}=${quoteChar}${escapedReplacement}${quoteChar}`;
  });
}

function rewriteRemainingAbsoluteTextUrls(html) {
  const absoluteRegex = /https?:\/\/[^"'\s<>]+/gi;
  return html.replace(absoluteRegex, (rawUrl) => {
    const replacement = mapAbsoluteUrlToLocal(rawUrl);
    return replacement ?? rawUrl;
  });
}

function ensureBodyQrUrlAttribute(html) {
  if (/\bdata-qr-url\s*=\s*/i.test(html)) {
    return html;
  }

  return html.replace(/<body\b([^>]*)>/i, '<body$1 data-qr-url="">');
}

function injectIntoHeadOnce(html, markerId, snippet) {
  if (html.includes(`id="${markerId}"`)) {
    return html;
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${snippet}\n</head>`);
  }

  return `${snippet}\n${html}`;
}

function injectBeforeBodyCloseOnce(html, markerId, snippet) {
  if (html.includes(`id="${markerId}"`)) {
    return html;
  }

  if (html.includes('</body>')) {
    return html.replace('</body>', `${snippet}\n</body>`);
  }

  return `${html}\n${snippet}`;
}

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractEnvelopeImageFallbackUrl(html) {
  const urls = [];
  const styleUrlRegex = /background-image\s*:\s*url\((?:&quot;|["'])?([^\)"']+)(?:&quot;|["'])?\)/gi;
  let match;

  while ((match = styleUrlRegex.exec(html)) !== null) {
    const raw = String(match[1] || '').trim().replace(/&amp;/g, '&');
    if (!raw) {
      continue;
    }

    if (!/\.(?:jpg|jpeg|png|webp|gif)(?:\?|$)/i.test(raw)) {
      continue;
    }

    if (/wax-seal|audio-\d+\.png|calen_heart/i.test(raw)) {
      continue;
    }

    urls.push(raw);
  }

  const unique = [...new Set(urls)];
  if (!unique.length) {
    return '';
  }

  const strongPreferred = unique.find(
    (url) =>
      /\/templates\/assets\//i.test(url) && /\.(?:jpg|jpeg|webp)(?:\?|$)/i.test(url)
  );
  if (strongPreferred) {
    return strongPreferred;
  }

  const preferred = unique.find((url) => /\/templates\/assets\//i.test(url));
  if (preferred) {
    return preferred;
  }

  return unique[0];
}

function injectEnvelopeLetterImage(html) {
  if (/<img[^>]+class="[^"]*\bletter-image\b[^"]*"/i.test(html)) {
    return html;
  }

  const imageUrl = extractEnvelopeImageFallbackUrl(html);
  if (!imageUrl) {
    return html;
  }

  const letterBlockRegex = /<div class="([^"]*\bletter\b[^"]*)">\s*<div class="([^"]*\bwords\b[^"]*\bline1\b[^"]*)"><\/div>\s*<div class="([^"]*\bwords\b[^"]*\bline2\b[^"]*)"><\/div>\s*<div class="([^"]*\bwords\b[^"]*\bline3\b[^"]*)"><\/div>\s*<div class="([^"]*\bwords\b[^"]*\bline4\b[^"]*)"><\/div>\s*<\/div>/i;
  const match = html.match(letterBlockRegex);
  if (!match) {
    return html;
  }

  const letterClass = match[1];
  const classTokens = `${match[1]} ${match[2]}`.split(/\s+/).filter(Boolean);
  const jsxClass = classTokens.find((token) => /^jsx-[a-z0-9_-]+$/i.test(token)) || '';
  const imageClass = `${jsxClass ? `${jsxClass} ` : ''}letter-image`;

  const replacement = `<div class="${letterClass}"><img src="${escapeHtmlAttribute(
    imageUrl
  )}" alt="Letter" class="${imageClass}"></div>`;

  return html.replace(letterBlockRegex, replacement);
}

async function main() {
  await fs.mkdir(ASSET_ROOT, { recursive: true });

  let html = await fs.readFile(SOURCE_HTML, 'utf8');

  const cssHrefRegex = /<link[^>]*href="([^"]+\.css[^"]*)"[^>]*>/gi;
  const cssHrefs = [];
  let cssLinkMatch;
  while ((cssLinkMatch = cssHrefRegex.exec(html)) !== null) {
    cssHrefs.push(cssLinkMatch[1]);
  }

  const cssReplacements = new Map();
  for (const href of [...new Set(cssHrefs)]) {
    const mapping = await processCssLink(href, SITE_ORIGIN);
    cssReplacements.set(mapping.original, mapping.replacement);
  }

  for (const [original, replacement] of cssReplacements) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(escaped, 'g'), replacement);
  }

  const scriptSrcRegex = /<script[^>]*src="([^"]+)"[^>]*>/gi;
  const scriptSrcs = [];
  let scriptMatch;
  while ((scriptMatch = scriptSrcRegex.exec(html)) !== null) {
    scriptSrcs.push(scriptMatch[1]);
  }

  const scriptReplacements = new Map();
  for (const src of [...new Set(scriptSrcs)]) {
    const mapping = await processScriptSrc(src, SITE_ORIGIN);
    scriptReplacements.set(mapping.original, mapping.replacement);
  }

  for (const [original, replacement] of scriptReplacements) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(escaped, 'g'), replacement);
  }

  html = await localizeInlineStyleUrls(html, SITE_ORIGIN);

  const assetRegex = /(https:\/\/assets\.cinelove\.me\/[\w\-./%?=&]+|https:\/\/img\.cinelove\.me\/[\w\-./%?=&]+|https:\/\/cinelove\.me\/_next\/static\/media\/[\w\-./%?=&]+|\/_next\/static\/media\/[\w\-./%?=&]+)/g;
  const matches = [...new Set(html.match(assetRegex) ?? [])];

  for (const match of matches) {
    const absoluteUrl = toAbsoluteUrl(match, SITE_ORIGIN);
    if (!absoluteUrl) {
      continue;
    }
    const publicPath = localPublicPathFromUrl(absoluteUrl);
    const fsPath = localFsPathFromPublicPath(publicPath);
    const downloaded = await downloadBinary(absoluteUrl, fsPath);
    if (!downloaded) {
      continue;
    }

    const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(escaped, 'g'), publicPath);
  }

  // Drop base tag if present from previous mirror mode.
  html = html.replace(/<base\s+href="[^"]*"\s*\/>/gi, '');

  html = rewriteAbsoluteUrlsInAttributes(html);
  html = rewriteRemainingAbsoluteTextUrls(html);

  html = ensureBodyQrUrlAttribute(html);
  html = injectIntoHeadOnce(html, 'template42-branding-style', BRANDING_OVERRIDE_STYLE);
  html = injectBeforeBodyCloseOnce(
    html,
    'template42-qr-override-script',
    QR_OVERRIDE_SCRIPT
  );

  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n${EDITOR_MODE_BOOTSTRAP}\n`);
  }

  await fs.writeFile(OUTPUT_HTML, html, 'utf8');
  console.log(`Localized template written to ${OUTPUT_HTML}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
