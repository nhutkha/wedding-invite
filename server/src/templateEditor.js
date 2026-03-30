const crypto = require('node:crypto');
const { load } = require('cheerio');

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

    const nextValue = String(update.value ?? '');

    if (current.source === 'text') {
      $target.text(nextValue);
    } else if (current.source === 'img-src') {
      $target.attr('src', nextValue);
    } else if (current.source === 'background-image') {
      const nextStyle = replaceBackgroundImageStyle($target.attr('style'), nextValue);
      $target.attr('style', nextStyle);
    }

    totalApplied += 1;
    report.push({
      id: current.id,
      label: current.label,
      source: current.source,
      nodeId: current.nodeId,
      count: 1,
    });
  }

  return {
    html: $.html(),
    report,
    totalApplied,
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
  buildTemplateSetupSnapshot,
};
