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
    <div class="address">18A Ly Van Phuc, P. O Cho Dua, Tp Ha Noi</div>
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
      var target = new Date('2026-12-15T10:30:00+07:00').getTime();
      var countdownBlocks = document.querySelectorAll('.countdown.componentBOX');

      if (!countdownBlocks.length) {
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

  if (/^https?:\/\/maps\.google\.com\/maps/i.test(decoded)) {
    return LOCAL_MAP_EMBED_PUBLIC_PATH;
  }

  if (/^https?:\/\/cinelove\.me\/template\/thiep-cuoi-42\/?$/i.test(decoded)) {
    return LOCAL_PAGE_PUBLIC_PATH;
  }

  if (/^https?:\/\/cinelove\.me\/?$/i.test(decoded)) {
    return '/';
  }

  if (/^https?:\/\/cinelove\.me\//i.test(decoded)) {
    return toRelativeUrl(decoded);
  }

  if (/^https?:\/\//i.test(decoded)) {
    return toRelativeUrl(decoded);
  }

  return null;
}

function localPublicPathFromUrl(absoluteUrl) {
  const url = new URL(absoluteUrl);
  const cleanPath = url.pathname.replace(/^\/+/, '');
  return `/template42-assets/${url.hostname}/${cleanPath}`;
}

function localFsPathFromPublicPath(publicPath) {
  return path.join(WEB_PUBLIC, publicPath.replace(/^\//, ''));
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

async function main() {
  await fs.mkdir(ASSET_ROOT, { recursive: true });

  let html = await fs.readFile(SOURCE_HTML, 'utf8');

  // Remove third-party/next runtime scripts. We'll provide local runtime script.
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

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

  if (html.includes('</head>')) {
    html = html.replace('</head>', `${EXTRA_STYLE}\n</head>`);
  }
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${EXTRA_SCRIPT}\n</body>`);
  }

  await fs.writeFile(LOCAL_MAP_EMBED_OUTPUT, LOCAL_MAP_EMBED_HTML, 'utf8');
  await fs.writeFile(OUTPUT_HTML, html, 'utf8');
  console.log(`Localized template written to ${OUTPUT_HTML}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
