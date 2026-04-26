const crypto = require('node:crypto');
const { load } = require('cheerio');
const LZUTF8 = require('lzutf8');

const IMAGE_PROP_KEYS = ['imgKey', 'imageUrl', 'galleryImageUrl', 'maskShapeImg'];
const DEFAULT_COUNTDOWN_TARGET = '2026-12-15T10:30:00+07:00';

function normalizeText(rawText) {
  return String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipText(text, maxLength = 60) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function extractBackgroundImageUrl(styleText) {
  const match = String(styleText || '').match(
    /background-image\s*:\s*url\((['"]?)(.*?)\1\)/i
  );

  if (!match) {
    return '';
  }

  return normalizeText(match[2]);
}

function getImageName(value) {
  try {
    const parsed = new URL(value, 'https://local-template.test');
    const segments = parsed.pathname.split('/').filter(Boolean);
    const fileName = segments.at(-1) || value;
    return clipText(fileName, 56);
  } catch {
    return clipText(value, 56);
  }
}

function getUrlLabel(value) {
  try {
    const parsed = new URL(value, 'https://local-template.test');
    if (
      parsed.hostname.includes('google.com') &&
      parsed.pathname.toLowerCase().includes('/maps')
    ) {
      return 'Google Maps embed URL';
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    const tail = segments.at(-1) || parsed.hostname || value;
    return clipText(tail, 56);
  } catch {
    return clipText(value, 56);
  }
}

function getCountdownTargetValue(rawValue) {
  const normalized = normalizeText(rawValue);
  if (!normalized) {
    return DEFAULT_COUNTDOWN_TARGET;
  }

  return normalized;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatCountdownDatePart(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatCountdownTimePart(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseCountdownTargetParts(rawValue) {
  const normalized = normalizeText(rawValue);
  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    const epochMs = Number(normalized);
    if (!Number.isFinite(epochMs) || epochMs <= 0) {
      return null;
    }

    const fromEpoch = new Date(epochMs);
    if (Number.isNaN(fromEpoch.getTime())) {
      return null;
    }

    return {
      dateText: formatCountdownDatePart(fromEpoch),
      timeText: formatCountdownTimePart(fromEpoch),
    };
  }

  const directIsoMatch = normalized.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/
  );

  if (directIsoMatch) {
    const [, dateText, hours = '00', minutes = '00'] = directIsoMatch;
    return {
      dateText,
      timeText: `${hours}:${minutes}`,
    };
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return {
    dateText: formatCountdownDatePart(parsed),
    timeText: formatCountdownTimePart(parsed),
  };
}

function buildCssSelector($, element) {
  const parts = [];
  let current = element;

  while (current && current.type === 'tag' && current.tagName !== 'html') {
    const tagName = String(current.tagName || '').toLowerCase();
    if (!tagName) {
      break;
    }

    const $current = $(current);
    const $sameTagSiblings = $current.parent().children(tagName);
    let index = 1;

    $sameTagSiblings.each((siblingIndex, sibling) => {
      if (sibling === current) {
        index = siblingIndex + 1;
        return false;
      }
      return undefined;
    });

    parts.unshift(`${tagName}:nth-of-type(${index})`);
    current = $current.parent()[0];
  }

  return parts.join(' > ');
}

function createItemId(source, selector) {
  const hash = crypto
    .createHash('sha1')
    .update(`${source}|${selector}`)
    .digest('hex')
    .slice(0, 16);

  return `item-${hash}`;
}

function getNearestNodeId($, element) {
  const node = $(element).closest('[data-node-id]');
  return String(node.attr('data-node-id') || '');
}

function parseJsonSafe(rawValue) {
  try {
    return JSON.parse(String(rawValue || ''));
  } catch {
    return null;
  }
}

function getValueByPath(target, pathParts) {
  let current = target;

  for (const pathPart of pathParts) {
    if (!current || typeof current !== 'object' || !(pathPart in current)) {
      return undefined;
    }

    current = current[pathPart];
  }

  return current;
}

function setValueByPath(target, pathParts, nextValue) {
  if (!target || typeof target !== 'object' || pathParts.length === 0) {
    return false;
  }

  let current = target;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const pathPart = pathParts[index];
    if (!current || typeof current !== 'object' || !(pathPart in current)) {
      return false;
    }

    current = current[pathPart];
  }

  const tail = pathParts[pathParts.length - 1];
  if (!current || typeof current !== 'object') {
    return false;
  }

  current[tail] = nextValue;
  return true;
}

function decodeCompressedTemplateData(encodedValue) {
  try {
    const compressedBuffer = Buffer.from(String(encodedValue || ''), 'base64');
    if (compressedBuffer.length === 0) {
      return null;
    }

    const decompressed = LZUTF8.decompress(compressedBuffer, {
      inputEncoding: 'Buffer',
      outputEncoding: 'String',
    });

    const parsed = parseJsonSafe(decompressed);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function encodeCompressedTemplateData(templateDataObject) {
  try {
    const jsonText = JSON.stringify(templateDataObject);
    const compressed = LZUTF8.compress(jsonText, {
      inputEncoding: 'String',
      outputEncoding: 'Buffer',
    });

    return Buffer.from(compressed).toString('base64');
  } catch {
    return '';
  }
}

function findEncodedTemplateDataRecursive(currentValue, currentPath = [], depth = 0) {
  if (!currentValue || typeof currentValue !== 'object' || depth > 12) {
    return null;
  }

  for (const [key, value] of Object.entries(currentValue)) {
    const nextPath = [...currentPath, key];

    if (key === 'templateData' && typeof value === 'string') {
      const decoded = decodeCompressedTemplateData(value);
      if (decoded) {
        return {
          path: nextPath,
          encoded: value,
          decoded,
        };
      }
    }

    const nested = findEncodedTemplateDataRecursive(value, nextPath, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function findEncodedTemplateData(nextDataObject) {
  const preferredPaths = [
    ['props', 'pageProps', 'templateData', 'templateData'],
    ['props', 'pageProps', 'templateData'],
  ];

  for (const pathParts of preferredPaths) {
    const candidate = getValueByPath(nextDataObject, pathParts);
    if (typeof candidate !== 'string') {
      continue;
    }

    const decoded = decodeCompressedTemplateData(candidate);
    if (!decoded) {
      continue;
    }

    return {
      path: pathParts,
      encoded: candidate,
      decoded,
    };
  }

  return findEncodedTemplateDataRecursive(nextDataObject);
}

function sanitizeTemplateNodeId(nodeId) {
  const normalized = String(nodeId || '').trim();
  if (!normalized) {
    return '';
  }

  return normalized.replace(/^template-/, '');
}

function normalizeImageReference(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value, 'https://template-local.test');
    return parsed.pathname.replace(/\\/g, '/').toLowerCase();
  } catch {
    return value.replace(/\\/g, '/').toLowerCase().split('?')[0].split('#')[0];
  }
}

function extractImageToken(rawValue) {
  const normalized = normalizeImageReference(rawValue);
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : normalized;
}

function isSameImageReference(left, right) {
  const normalizedLeft = normalizeImageReference(left);
  const normalizedRight = normalizeImageReference(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const tokenLeft = extractImageToken(normalizedLeft);
  const tokenRight = extractImageToken(normalizedRight);
  return Boolean(tokenLeft && tokenLeft === tokenRight);
}

function pickImagePropKey(nodeProps, previousValue) {
  if (!nodeProps || typeof nodeProps !== 'object') {
    return '';
  }

  const availableKeys = IMAGE_PROP_KEYS.filter(
    (key) => typeof nodeProps[key] === 'string' && nodeProps[key].trim().length > 0
  );

  if (availableKeys.length === 0) {
    return '';
  }

  const matchedKey = availableKeys.find((key) =>
    isSameImageReference(nodeProps[key], previousValue)
  );

  if (matchedKey) {
    return matchedKey;
  }

  if (availableKeys.includes('imgKey')) {
    return 'imgKey';
  }

  if (availableKeys.includes('imageUrl')) {
    return 'imageUrl';
  }

  return availableKeys[0];
}

function applySingleRuntimeUpdate(templateDataObject, update) {
  const nodeId = sanitizeTemplateNodeId(update.nodeId);
  if (!nodeId) {
    return false;
  }

  const targetNode = templateDataObject[nodeId];
  if (!targetNode || typeof targetNode !== 'object') {
    return false;
  }

  const targetProps = targetNode.props;
  if (!targetProps || typeof targetProps !== 'object') {
    return false;
  }

  const nextValue = String(update.nextValue ?? '');

  if (update.source === 'text' || update.source === 'runtime-text') {
    if (typeof targetProps.text !== 'string') {
      return false;
    }

    targetProps.text = nextValue;
    return true;
  }

  if (update.source === 'img-src' || update.source === 'background-image') {
    const imagePropKey = pickImagePropKey(targetProps, update.previousValue);
    if (!imagePropKey) {
      return false;
    }

    targetProps[imagePropKey] = nextValue;
    return true;
  }

  if (update.source === 'countdown-target') {
    const targetParts = parseCountdownTargetParts(nextValue);
    if (!targetParts) {
      return false;
    }

    targetProps.selectedDate = targetParts.dateText;
    targetProps.selectedTime = targetParts.timeText;
    return true;
  }

  return false;
}

function applyTemplateRuntimeDataUpdates(html, updates) {
  const baseReport = {
    status: 'skipped',
    totalCandidates: Array.isArray(updates) ? updates.length : 0,
    totalApplied: 0,
    affectedNodes: 0,
  };

  if (!Array.isArray(updates) || updates.length === 0) {
    return {
      html,
      runtimeReport: baseReport,
    };
  }

  const $ = load(html, { decodeEntities: false });
  const $nextData = $('#__NEXT_DATA__').first();
  if ($nextData.length === 0) {
    return {
      html,
      runtimeReport: {
        ...baseReport,
        status: 'missing-next-data',
      },
    };
  }

  const nextDataObject = parseJsonSafe($nextData.text() || $nextData.html() || '');
  if (!nextDataObject || typeof nextDataObject !== 'object') {
    return {
      html,
      runtimeReport: {
        ...baseReport,
        status: 'invalid-next-data',
      },
    };
  }

  const templateDataEntry = findEncodedTemplateData(nextDataObject);
  if (!templateDataEntry) {
    return {
      html,
      runtimeReport: {
        ...baseReport,
        status: 'missing-template-data',
      },
    };
  }

  const touchedNodeIds = new Set();
  for (const update of updates) {
    if (!update || typeof update !== 'object') {
      continue;
    }

    const applied = applySingleRuntimeUpdate(templateDataEntry.decoded, update);
    if (!applied) {
      continue;
    }

    baseReport.totalApplied += 1;
    const nodeId = sanitizeTemplateNodeId(update.nodeId);
    if (nodeId) {
      touchedNodeIds.add(nodeId);
    }
  }

  if (baseReport.totalApplied === 0) {
    return {
      html,
      runtimeReport: {
        ...baseReport,
        status: 'no-op',
      },
    };
  }

  const encodedTemplateData = encodeCompressedTemplateData(templateDataEntry.decoded);
  if (!encodedTemplateData) {
    return {
      html,
      runtimeReport: {
        ...baseReport,
        status: 'encode-failed',
        affectedNodes: touchedNodeIds.size,
      },
    };
  }

  const didSet = setValueByPath(nextDataObject, templateDataEntry.path, encodedTemplateData);
  if (!didSet) {
    return {
      html,
      runtimeReport: {
        ...baseReport,
        status: 'set-failed',
        affectedNodes: touchedNodeIds.size,
      },
    };
  }

  $nextData.text(JSON.stringify(nextDataObject));

  return {
    html: $.html(),
    runtimeReport: {
      ...baseReport,
      status: 'applied',
      affectedNodes: touchedNodeIds.size,
    },
  };
}

function getTemplateEditorItems(html) {
  const $ = load(html, { decodeEntities: false });
  const $root = $('#root-page-container').length ? $('#root-page-container') : $('body');
  const blockedTags = new Set([
    'script',
    'style',
    'svg',
    'path',
    'defs',
    'noscript',
    'iframe',
  ]);

  const items = [];
  const seen = new Set();

  $root.find('*').each((_, element) => {
    const tagName = String(element.tagName || '').toLowerCase();
    if (blockedTags.has(tagName)) {
      return;
    }

    const $element = $(element);
    const hasTagChildren = $element
      .children()
      .toArray()
      .some((child) => child.type === 'tag');

    if (hasTagChildren) {
      return;
    }

    const text = normalizeText($element.text());
    if (!text || text.length < 2 || text.length > 120) {
      return;
    }
    if (!/[\p{L}\p{N}]/u.test(text)) {
      return;
    }
    if (
      text.includes('http://') ||
      text.includes('https://') ||
      text.includes('function') ||
      text.includes('jsx-')
    ) {
      return;
    }

    const selector = buildCssSelector($, element);
    if (!selector) {
      return;
    }

    const uniqueKey = `text|${selector}`;
    if (seen.has(uniqueKey)) {
      return;
    }

    seen.add(uniqueKey);
    items.push({
      id: createItemId('text', selector),
      type: 'text',
      source: 'text',
      selector,
      nodeId: getNearestNodeId($, element),
      value: text,
      label: clipText(text, 52),
    });
  });

  $root.find('img[src]').each((_, element) => {
    const $element = $(element);
    const src = normalizeText($element.attr('src'));
    if (!src || src.startsWith('data:')) {
      return;
    }

    const selector = buildCssSelector($, element);
    if (!selector) {
      return;
    }

    const uniqueKey = `img-src|${selector}`;
    if (seen.has(uniqueKey)) {
      return;
    }

    seen.add(uniqueKey);
    items.push({
      id: createItemId('img-src', selector),
      type: 'image',
      source: 'img-src',
      selector,
      nodeId: getNearestNodeId($, element),
      value: src,
      label: getImageName(src),
    });
  });

  $root.find('[style*="background-image"]').each((_, element) => {
    const $element = $(element);
    const styleText = String($element.attr('style') || '');
    const imageUrl = extractBackgroundImageUrl(styleText);
    if (!imageUrl || imageUrl.startsWith('data:')) {
      return;
    }

    const selector = buildCssSelector($, element);
    if (!selector) {
      return;
    }

    const uniqueKey = `background-image|${selector}`;
    if (seen.has(uniqueKey)) {
      return;
    }

    seen.add(uniqueKey);
    items.push({
      id: createItemId('background-image', selector),
      type: 'image',
      source: 'background-image',
      selector,
      nodeId: getNearestNodeId($, element),
      value: imageUrl,
      label: getImageName(imageUrl),
    });
  });

  $root.find('iframe[src]').each((_, element) => {
    const $element = $(element);
    const src = normalizeText($element.attr('src'));
    if (!src) {
      return;
    }

    const selector = buildCssSelector($, element);
    if (!selector) {
      return;
    }

    const uniqueKey = `iframe-src|${selector}`;
    if (seen.has(uniqueKey)) {
      return;
    }

    seen.add(uniqueKey);
    items.push({
      id: createItemId('iframe-src', selector),
      type: 'text',
      source: 'iframe-src',
      selector,
      nodeId: getNearestNodeId($, element),
      value: src,
      label: getUrlLabel(src),
    });
  });

  $root.find('.countdown.componentBOX').each((_, element) => {
    const $element = $(element);
    const selector = buildCssSelector($, element);
    if (!selector) {
      return;
    }

    const uniqueKey = `countdown-target|${selector}`;
    if (seen.has(uniqueKey)) {
      return;
    }

    seen.add(uniqueKey);
    const targetValue = getCountdownTargetValue($element.attr('data-countdown-target'));
    items.push({
      id: createItemId('countdown-target', selector),
      type: 'text',
      source: 'countdown-target',
      selector,
      nodeId: getNearestNodeId($, element),
      value: targetValue,
      label: 'Countdown target (ISO datetime)',
    });
  });

  const $body = $('body').first();
  if ($body.length > 0) {
    const selector = 'body:nth-of-type(1)';
    const uniqueKey = `qr-url|${selector}`;

    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      const qrUrl = normalizeText($body.attr('data-qr-url'));

      items.push({
        id: createItemId('qr-url', selector),
        type: 'text',
        source: 'qr-url',
        selector,
        nodeId: '',
        value: qrUrl,
        label: 'QR destination URL (leave empty = current page)',
      });
    }
  }

  const $nextData = $('#__NEXT_DATA__').first();
  const nextDataObject = parseJsonSafe($nextData.text() || $nextData.html() || '');
  if (nextDataObject && typeof nextDataObject === 'object') {
    const templateDataEntry = findEncodedTemplateData(nextDataObject);
    if (templateDataEntry && templateDataEntry.decoded && typeof templateDataEntry.decoded === 'object') {
      const existingTextNodeIds = new Set(
        items
          .filter((item) => item.type === 'text' && item.nodeId)
          .map((item) => sanitizeTemplateNodeId(item.nodeId))
      );

      for (const [runtimeNodeId, nodeData] of Object.entries(templateDataEntry.decoded)) {
        if (!nodeData || typeof nodeData !== 'object') {
          continue;
        }

        const nodeProps = nodeData.props;
        if (!nodeProps || typeof nodeProps !== 'object' || typeof nodeProps.text !== 'string') {
          continue;
        }

        const runtimeText = normalizeText(nodeProps.text);
        if (!runtimeText || runtimeText.length < 2 || runtimeText.length > 120) {
          continue;
        }

        if (!/[\p{L}\p{N}]/u.test(runtimeText)) {
          continue;
        }

        if (
          runtimeText.includes('http://') ||
          runtimeText.includes('https://') ||
          runtimeText.includes('function') ||
          runtimeText.includes('jsx-')
        ) {
          continue;
        }

        const normalizedNodeId = sanitizeTemplateNodeId(runtimeNodeId);
        if (!normalizedNodeId || existingTextNodeIds.has(normalizedNodeId)) {
          continue;
        }

        const selector = `runtime-node:${normalizedNodeId}`;
        const uniqueKey = `runtime-text|${normalizedNodeId}`;
        if (seen.has(uniqueKey)) {
          continue;
        }

        seen.add(uniqueKey);
        items.push({
          id: createItemId('runtime-text', selector),
          type: 'text',
          source: 'runtime-text',
          selector,
          nodeId: normalizedNodeId,
          value: runtimeText,
          label: clipText(runtimeText, 52),
        });
      }
    }
  }

  return items;
}

function replaceBackgroundImageStyle(styleText, nextUrl) {
  const safeUrl = String(nextUrl || '').replace(/"/g, '\\"');
  const nextDeclaration = `background-image:url("${safeUrl}")`;
  const rawStyle = String(styleText || '');

  if (/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i.test(rawStyle)) {
    return rawStyle.replace(
      /background-image\s*:\s*url\((['"]?)(.*?)\1\)/i,
      nextDeclaration
    );
  }

  const separator = rawStyle.trim().length === 0 || rawStyle.trim().endsWith(';') ? '' : ';';
  return `${rawStyle}${separator}${nextDeclaration}`;
}

function applyTemplateEditorUpdates(html, updates, strict = true) {
  const $ = load(html, { decodeEntities: false });
  const currentItems = getTemplateEditorItems(html);
  const itemMap = new Map(currentItems.map((item) => [item.id, item]));
  const report = [];
  let totalApplied = 0;
  const runtimeUpdates = [];

  for (const [index, update] of updates.entries()) {
    const current = itemMap.get(update.id);
    if (!current) {
      if (strict) {
        throw new Error(`Khong tim thay item de cap nhat: updates[${index}]`);
      }

      report.push({
        id: update.id,
        label: '',
        source: 'unknown',
        nodeId: '',
        count: 0,
      });
      continue;
    }

    const nextValue = String(update.value ?? '');

    if (current.source !== 'runtime-text') {
      const $target = $(current.selector).first();
      if ($target.length === 0) {
        if (strict) {
          throw new Error(`Khong tim thay selector cho item: ${current.id}`);
        }

        report.push({
          id: current.id,
          label: current.label,
          source: current.source,
          nodeId: current.nodeId,
          count: 0,
        });
        continue;
      }

      if (current.source === 'text') {
        $target.text(nextValue);
      } else if (current.source === 'img-src') {
        $target.attr('src', nextValue);
      } else if (current.source === 'background-image') {
        const nextStyle = replaceBackgroundImageStyle($target.attr('style'), nextValue);
        $target.attr('style', nextStyle);
      } else if (current.source === 'iframe-src') {
        $target.attr('src', nextValue);
      } else if (current.source === 'countdown-target') {
        const normalizedTarget = normalizeText(nextValue);
        if (normalizedTarget) {
          $target.attr('data-countdown-target', normalizedTarget);
        } else {
          $target.removeAttr('data-countdown-target');
        }
      } else if (current.source === 'qr-url') {
        const normalizedQrUrl = normalizeText(nextValue);
        if (normalizedQrUrl) {
          $target.attr('data-qr-url', normalizedQrUrl);
        } else {
          $target.removeAttr('data-qr-url');
        }
      }
    }

    runtimeUpdates.push({
      id: current.id,
      nodeId: current.nodeId,
      source: current.source,
      previousValue: current.value,
      nextValue,
    });

    totalApplied += 1;
    report.push({
      id: current.id,
      label: current.label,
      source: current.source,
      nodeId: current.nodeId,
      count: 1,
    });
  }

  const runtimeResult = applyTemplateRuntimeDataUpdates($.html(), runtimeUpdates);

  return {
    html: runtimeResult.html,
    report,
    totalApplied,
    runtime: runtimeResult.runtimeReport,
  };
}

function buildTemplateSetupSnapshot(items) {
  const textCandidates = [];
  const imageCandidates = [];
  const textSeen = new Set();
  const imageSeen = new Set();

  for (const item of items) {
    if (item.type === 'text') {
      if (!textSeen.has(item.value)) {
        textSeen.add(item.value);
        textCandidates.push(item.value);
      }
      continue;
    }

    if (!imageSeen.has(item.value)) {
      imageSeen.add(item.value);
      imageCandidates.push(item.value);
    }
  }

  return {
    textCandidates: textCandidates.slice(0, 240),
    imageCandidates: imageCandidates.slice(0, 240),
  };
}

module.exports = {
  getTemplateEditorItems,
  applyTemplateEditorUpdates,
  applyTemplateRuntimeDataUpdates,
  buildTemplateSetupSnapshot,
};
