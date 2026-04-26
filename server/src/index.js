const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('node:fs/promises');
const path = require('node:path');
const { z } = require('zod');
const {
  initializeDatabase,
  getDatabaseEngine,
  readInvitation,
  createRsvp,
  listRsvps,
  listWishes,
  createWish,
  createGift,
  createAnalyticsEvent,
  readAppState,
  writeAppState,
} = require('./db');
const {
  getTemplateEditorItems,
  applyTemplateEditorUpdates,
  buildTemplateSetupSnapshot,
} = require('./templateEditor');

const app = express();
const port = Number(process.env.PORT || 8787);
const repoRoot = path.join(__dirname, '..', '..');
const webDistPath = path.join(repoRoot, 'web', 'dist');
const templateHtmlPublicPath = path.join(
  repoRoot,
  'web',
  'public',
  'template42-localized.html'
);
const templateBackupPublicPath = path.join(
  repoRoot,
  'web',
  'public',
  'template42-localized.backup.html'
);
const templateHtmlDistPath = path.join(webDistPath, 'template42-localized.html');
const templateBackupDistPath = path.join(webDistPath, 'template42-localized.backup.html');
const setupConfigPath = path.join(
  repoRoot,
  'scripts',
  'template42-customize.json'
);
const customAssetsDir = path.join(repoRoot, 'web', 'public', 'custom-assets');
const preferDistTemplate = process.env.NODE_ENV === 'production';
const TEMPLATE_EDITOR_STATE_KEY = 'template42-editor-state-v1';

const DEFAULT_TEMPLATE_UPLOAD_MAX_MB = 30;
const rawTemplateUploadMaxMb = Number(process.env.TEMPLATE_UPLOAD_MAX_MB);
const templateUploadMaxMb =
  Number.isFinite(rawTemplateUploadMaxMb) && rawTemplateUploadMaxMb > 0
    ? rawTemplateUploadMaxMb
    : DEFAULT_TEMPLATE_UPLOAD_MAX_MB;
const templateUploadMaxBytes = Math.floor(templateUploadMaxMb * 1024 * 1024);
const templateUploadJsonLimitMb = Math.max(
  5,
  Math.ceil((templateUploadMaxBytes * 1.4) / (1024 * 1024)) + 2
);

app.use(cors());
app.use(express.json({ limit: `${templateUploadJsonLimitMb}mb` }));
app.use(morgan('dev'));

const slugSchema = z.string().trim().min(3).max(120);

const rsvpSchema = z.object({
  slug: slugSchema,
  guestName: z.string().trim().min(2).max(80),
  attendance: z.enum(['yes', 'no']),
  guestCount: z.coerce.number().int().min(0).max(20),
  note: z.string().trim().max(300).optional().default(''),
});

const rsvpListQuerySchema = z.object({
  slug: slugSchema,
  limit: z.coerce.number().int().min(1).max(1000).optional().default(300),
});

const wishSchema = z.object({
  slug: slugSchema,
  senderName: z.string().trim().min(2).max(60),
  message: z.string().trim().min(3).max(400),
});

const giftSchema = z.object({
  slug: slugSchema,
  senderName: z.string().trim().max(60).optional(),
  giftType: z.enum(['heart-shot', 'lucky-money', 'flower-bouquet']),
  amount: z.coerce.number().int().min(1).max(1000),
  message: z.string().trim().max(200).optional(),
});

const analyticsSchema = z.object({
  slug: slugSchema,
  eventName: z.string().trim().min(2).max(120),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const replacementPairSchema = z.object({
  from: z.string().min(1).max(2000),
  to: z.string().max(6000),
});

const setupApplySchema = z.object({
  strict: z.boolean().optional().default(false),
  textReplacements: z.array(replacementPairSchema).optional().default([]),
  assetReplacements: z.array(replacementPairSchema).optional().default([]),
});

const setupUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  dataBase64: z.string().trim().min(1),
  mimeType: z.string().trim().max(120).optional(),
});

const editorApplySchema = z.object({
  strict: z.boolean().optional().default(true),
  updates: z
    .array(
      z.object({
        id: z.string().trim().min(6).max(80),
        value: z.string().max(10000),
      })
    )
    .max(2000),
});

const LEGACY_API_ORIGIN =
  process.env.LEGACY_API_ORIGIN || 'https://api.cinelove.me';

const LEGACY_API_PATH_MATCHERS = [
  /^\/gifts(?:\/|$)/,
  /^\/messages(?:\/|$)/,
  /^\/pages(?:\/|$)/,
  /^\/showcase(?:\/|$)/,
];

function sendValidationError(res, parsed) {
  return res.status(400).json({
    message: 'Dữ liệu không hợp lệ.',
    errors: parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

function countOccurrences(text, subText) {
  if (!subText) {
    return 0;
  }

  return text.split(subText).length - 1;
}

function decodeHtmlEntities(rawText) {
  return rawText
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractTextCandidates(html) {
  const matches = html.match(/>([^<>]{2,90})</g) ?? [];
  const seen = new Set();
  const result = [];

  for (const match of matches) {
    const text = decodeHtmlEntities(match.slice(1, -1)).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2 || text.length > 80) {
      continue;
    }
    if (!/[A-Za-z0-9]/.test(text)) {
      continue;
    }
    if (
      text.includes('{') ||
      text.includes('}') ||
      text.includes('function') ||
      text.includes('jsx-') ||
      text.includes('http')
    ) {
      continue;
    }
    if (seen.has(text)) {
      continue;
    }

    seen.add(text);
    result.push(text);
    if (result.length >= 200) {
      break;
    }
  }

  return result;
}

function extractImageCandidates(html) {
  const matches = html.match(
    /\/(?:template42-assets|custom-assets)\/[^"'\s)<>]+\.(?:jpg|jpeg|png|webp|gif|svg)/gi
  ) ?? [];

  return [...new Set(matches)].slice(0, 200);
}

function applyReplacementList(content, replacements, strict, sectionName, report) {
  let updated = content;

  for (const [index, item] of replacements.entries()) {
    const from = item.from;
    const to = item.to;
    const count = countOccurrences(updated, from);

    if (strict && count === 0) {
      throw new Error(`Khong tim thay chuoi can thay: ${sectionName}[${index}]`);
    }

    if (count > 0) {
      updated = updated.split(from).join(to);
    }

    report.push({
      section: sectionName,
      index,
      from,
      to,
      count,
    });
  }

  return updated;
}

function sanitizeFileName(fileName) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getTemplateActivePaths() {
  const preferred = preferDistTemplate
    ? { html: templateHtmlDistPath, backup: templateBackupDistPath }
    : { html: templateHtmlPublicPath, backup: templateBackupPublicPath };
  const fallback = preferDistTemplate
    ? { html: templateHtmlPublicPath, backup: templateBackupPublicPath }
    : { html: templateHtmlDistPath, backup: templateBackupDistPath };

  if (await pathExists(preferred.html)) {
    return preferred;
  }

  return fallback;
}

async function readActiveTemplateHtml() {
  const paths = await getTemplateActivePaths();
  const html = await fs.readFile(paths.html, 'utf8');
  return {
    html,
    paths,
  };
}

async function ensureTemplateBackup(currentHtml, paths) {
  if (await pathExists(paths.backup)) {
    return;
  }

  await fs.writeFile(paths.backup, currentHtml, 'utf8');
}

async function writeTemplateHtmlToActiveAndMirror(updatedHtml, activePaths) {
  await fs.writeFile(activePaths.html, updatedHtml, 'utf8');

  const mirrorHtmlPath =
    activePaths.html === templateHtmlDistPath
      ? templateHtmlPublicPath
      : templateHtmlDistPath;

  if (await pathExists(mirrorHtmlPath)) {
    await fs.writeFile(mirrorHtmlPath, updatedHtml, 'utf8');
  }
}

function createTemplateItemStateKey(item) {
  return `${String(item?.source || '')}|${String(item?.nodeId || '')}|${String(item?.selector || '')}`;
}

function normalizeTemplateEditorState(rawValue) {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id || ''),
      source: String(entry.source || ''),
      nodeId: String(entry.nodeId || ''),
      selector: String(entry.selector || ''),
      value: String(entry.value ?? ''),
    }))
    .filter((entry) => entry.source && entry.selector);
}

async function loadPersistedTemplateEditorState() {
  const raw = await readAppState(TEMPLATE_EDITOR_STATE_KEY, []);
  return normalizeTemplateEditorState(raw);
}

async function savePersistedTemplateEditorState(entries) {
  await writeAppState(TEMPLATE_EDITOR_STATE_KEY, normalizeTemplateEditorState(entries));
}

function overlayTemplateItemsWithPersistedValues(items, persistedEntries) {
  const byId = new Map();
  const bySignature = new Map();

  for (const entry of persistedEntries) {
    if (entry.id) {
      byId.set(entry.id, entry.value);
    }

    bySignature.set(createTemplateItemStateKey(entry), entry.value);
  }

  return items.map((item) => {
    const byItemId = byId.get(item.id);
    if (typeof byItemId === 'string') {
      return {
        ...item,
        value: byItemId,
      };
    }

    const byItemSignature = bySignature.get(createTemplateItemStateKey(item));
    if (typeof byItemSignature === 'string') {
      return {
        ...item,
        value: byItemSignature,
      };
    }

    return item;
  });
}

function resolvePersistedEntriesToUpdates(items, persistedEntries) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const itemBySignature = new Map(items.map((item) => [createTemplateItemStateKey(item), item]));
  const updates = [];
  const seen = new Set();

  for (const entry of persistedEntries) {
    const matchedItem = itemById.get(entry.id) || itemBySignature.get(createTemplateItemStateKey(entry));
    if (!matchedItem) {
      continue;
    }

    if (String(matchedItem.value) === String(entry.value)) {
      continue;
    }

    if (seen.has(matchedItem.id)) {
      continue;
    }

    seen.add(matchedItem.id);
    updates.push({
      id: matchedItem.id,
      value: String(entry.value),
    });
  }

  return updates;
}

function shouldProxyLegacyApi(pathName) {
  return LEGACY_API_PATH_MATCHERS.some((matcher) => matcher.test(pathName));
}

function getLegacyApiFallback(method, pathName) {
  const normalizedMethod = String(method || '').toUpperCase();

  if (normalizedMethod === 'GET' && pathName === '/gifts/animated-gift') {
    return { success: true, gifts: [] };
  }

  if (normalizedMethod === 'GET' && /^\/messages\/[^/]+$/.test(pathName)) {
    return { success: true, messages: [] };
  }

  if (
    normalizedMethod === 'GET' &&
    /^\/showcase\/messages\/[^/]+$/.test(pathName)
  ) {
    return { success: true, messages: [] };
  }

  if (
    normalizedMethod === 'GET' &&
    /^\/showcase\/gifts\/received\/[^/]+$/.test(pathName)
  ) {
    return { success: true, gifts: [] };
  }

  if (normalizedMethod === 'GET' && /^\/pages\/[^/]+\/likes$/.test(pathName)) {
    return { success: true, likes: 0 };
  }

  if (normalizedMethod === 'POST' && /^\/pages\/[^/]+\/likes$/.test(pathName)) {
    return { success: true, likes: 0 };
  }

  if (normalizedMethod === 'POST' && /^\/pages\/[^/]+\/views$/.test(pathName)) {
    return { success: true, views: 0 };
  }

  return null;
}

async function tryProxyLegacyApi(req, res, next) {
  const pathName = String(req.path || '/');
  if (!shouldProxyLegacyApi(pathName)) {
    return next();
  }

  const method = String(req.method || 'GET').toUpperCase();
  const upstreamPath = String(req.originalUrl || '').replace(/^\/api/, '') || pathName;
  const upstreamUrl = `${LEGACY_API_ORIGIN}${upstreamPath}`;

  const requestHeaders = {
    Accept: req.get('accept') || 'application/json',
  };

  const contentType = req.get('content-type');
  if (contentType) {
    requestHeaders['Content-Type'] = contentType;
  }

  const fetchOptions = {
    method,
    headers: requestHeaders,
  };

  if (method !== 'GET' && method !== 'HEAD') {
    const hasBody =
      req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0;
    if (hasBody) {
      fetchOptions.body = JSON.stringify(req.body);
    }
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, fetchOptions);

    if (!upstreamResponse.ok) {
      const fallbackData = getLegacyApiFallback(method, pathName);
      if (fallbackData) {
        return res.status(200).json(fallbackData);
      }

      const detail = await upstreamResponse.text();
      return res.status(upstreamResponse.status).json({
        success: false,
        message: 'Legacy API request failed.',
        status: upstreamResponse.status,
        detail: detail.slice(0, 500),
      });
    }

    const responseContentType = upstreamResponse.headers.get('content-type') || '';
    res.status(upstreamResponse.status);
    res.setHeader('x-legacy-api-proxy', 'cinelove');

    if (responseContentType) {
      res.setHeader('content-type', responseContentType);
    }

    if (responseContentType.includes('application/json')) {
      const data = await upstreamResponse.json();
      return res.send(data);
    }

    const bytes = Buffer.from(await upstreamResponse.arrayBuffer());
    return res.send(bytes);
  } catch (error) {
    const fallbackData = getLegacyApiFallback(method, pathName);
    if (fallbackData) {
      return res.status(200).json(fallbackData);
    }

    return next(error);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'wedding-invite-api',
    storage: getDatabaseEngine(),
  });
});

app.get('/api/invitation/:slug', async (req, res, next) => {
  const parsed = slugSchema.safeParse(req.params.slug);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const invitation = await readInvitation(parsed.data);
    if (!invitation) {
      return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
    }

    return res.json(invitation);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/wishes', async (req, res, next) => {
  const parsed = slugSchema.safeParse(req.query.slug);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const wishes = await listWishes(parsed.data, 40);
    return res.json({ wishes });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/rsvp', async (req, res, next) => {
  const parsed = rsvpSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const invitation = await readInvitation(parsed.data.slug);
    if (!invitation) {
      return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
    }

    const result = await createRsvp(parsed.data);
    return res.status(201).json({
      message: 'Xác nhận tham dự đã được ghi nhận.',
      id: result.id,
      createdAt: result.createdAt,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/rsvps', async (req, res, next) => {
  const parsed = rsvpListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const invitation = await readInvitation(parsed.data.slug);
    if (!invitation) {
      return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
    }

    const items = await listRsvps(parsed.data.slug, parsed.data.limit);
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/wishes', async (req, res, next) => {
  const parsed = wishSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const invitation = await readInvitation(parsed.data.slug);
    if (!invitation) {
      return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
    }

    const result = await createWish(parsed.data);
    return res.status(201).json({
      message: 'Cảm ơn bạn đã gửi lời chúc.',
      id: result.id,
      createdAt: result.createdAt,
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/gifts', async (req, res, next) => {
  const parsed = giftSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const invitation = await readInvitation(parsed.data.slug);
    if (!invitation) {
      return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
    }

    const result = await createGift(parsed.data);
    return res.status(201).json({
      message: 'Món quà của bạn đã được gửi thành công.',
      id: result.id,
      createdAt: result.createdAt,
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/analytics/events', async (req, res, next) => {
  const parsed = analyticsSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    await createAnalyticsEvent(parsed.data);
    return res.status(202).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/template42/setup/config', async (_req, res, next) => {
  try {
    const rawConfig = await fs.readFile(setupConfigPath, 'utf8');
    const parsedConfig = setupApplySchema.safeParse(JSON.parse(rawConfig));

    if (!parsedConfig.success) {
      return res.json({
        strict: false,
        textReplacements: [],
        assetReplacements: [],
      });
    }

    return res.json(parsedConfig.data);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return res.json({
        strict: false,
        textReplacements: [],
        assetReplacements: [],
      });
    }

    return next(error);
  }
});

app.get('/api/template42/setup/snapshot', async (_req, res, next) => {
  try {
    const { html } = await readActiveTemplateHtml();
    const items = getTemplateEditorItems(html);
    const persistedState = await loadPersistedTemplateEditorState();
    const effectiveItems = overlayTemplateItemsWithPersistedValues(items, persistedState);
    const snapshot = buildTemplateSetupSnapshot(effectiveItems);

    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/template42/editor/items', async (_req, res, next) => {
  try {
    const { html } = await readActiveTemplateHtml();
    const items = getTemplateEditorItems(html);
    const persistedState = await loadPersistedTemplateEditorState();
    const effectiveItems = overlayTemplateItemsWithPersistedValues(items, persistedState);

    return res.json({
      items: effectiveItems,
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return res.status(404).json({
        message: 'Khong tim thay file template42-localized.html.',
      });
    }

    return next(error);
  }
});

app.post('/api/template42/editor/apply', async (req, res, next) => {
  const parsed = editorApplySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const { html, paths } = await readActiveTemplateHtml();
    await ensureTemplateBackup(html, paths);
    const currentItems = getTemplateEditorItems(html);
    const currentById = new Map(currentItems.map((item) => [item.id, item]));

    const result = applyTemplateEditorUpdates(
      html,
      parsed.data.updates,
      parsed.data.strict
    );

    await writeTemplateHtmlToActiveAndMirror(result.html, paths);

    const persistedState = await loadPersistedTemplateEditorState();
    const persistedMap = new Map(
      persistedState.map((entry) => [createTemplateItemStateKey(entry), entry])
    );

    for (const update of parsed.data.updates) {
      const currentItem = currentById.get(update.id);
      if (!currentItem) {
        continue;
      }

      const key = createTemplateItemStateKey(currentItem);
      const nextValue = String(update.value ?? '');

      if (nextValue === String(currentItem.value ?? '')) {
        persistedMap.delete(key);
        continue;
      }

      persistedMap.set(key, {
        id: currentItem.id,
        source: currentItem.source,
        nodeId: currentItem.nodeId,
        selector: currentItem.selector,
        value: nextValue,
      });
    }

    await savePersistedTemplateEditorState([...persistedMap.values()]);

    return res.json({
      message: 'Da cap nhat thanh cong tu editor.',
      totalApplied: result.totalApplied,
      report: result.report,
      runtime: result.runtime,
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return res.status(404).json({
        message: 'Khong tim thay file template42-localized.html.',
      });
    }

    return next(error);
  }
});

app.post('/api/template42/setup/upload', async (req, res, next) => {
  const parsed = setupUploadSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    await fs.mkdir(customAssetsDir, { recursive: true });

    const safeNameBase = sanitizeFileName(parsed.data.fileName);
    const extension = path.extname(safeNameBase);
    const allowedExtensions = new Set([
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.gif',
      '.svg',
    ]);

    if (!allowedExtensions.has(extension)) {
      return res.status(400).json({
        message: 'Dinh dang anh khong hop le. Chi ho tro jpg, png, webp, gif, svg.',
      });
    }

    const inputBase64 = parsed.data.dataBase64.includes(',')
      ? parsed.data.dataBase64.split(',').pop() ?? ''
      : parsed.data.dataBase64;
    const bytes = Buffer.from(inputBase64, 'base64');

    if (bytes.length === 0 || Number.isNaN(bytes.length)) {
      return res.status(400).json({
        message: 'Noi dung file khong hop le.',
      });
    }

    if (bytes.length > templateUploadMaxBytes) {
      return res.status(400).json({
        message: `File vuot qua gioi han ${templateUploadMaxMb}MB.`,
      });
    }

    const outputName = `${Date.now()}-${safeNameBase}`;
    const outputPath = path.join(customAssetsDir, outputName);
    await fs.writeFile(outputPath, bytes);

    return res.status(201).json({
      message: 'Tai anh len thanh cong.',
      publicPath: `/custom-assets/${outputName}`,
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/template42/setup/apply', async (req, res, next) => {
  const parsed = setupApplySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  try {
    const { html, paths } = await readActiveTemplateHtml();
    await ensureTemplateBackup(html, paths);

    const report = [];
    let updated = html;

    updated = applyReplacementList(
      updated,
      parsed.data.textReplacements,
      parsed.data.strict,
      'textReplacements',
      report
    );
    updated = applyReplacementList(
      updated,
      parsed.data.assetReplacements,
      parsed.data.strict,
      'assetReplacements',
      report
    );

    await writeTemplateHtmlToActiveAndMirror(updated, paths);
    await fs.writeFile(setupConfigPath, JSON.stringify(parsed.data, null, 2), 'utf8');
    await savePersistedTemplateEditorState([]);

    const totalApplied = report.reduce((sum, item) => sum + item.count, 0);
    return res.json({
      message: 'Da cap nhat mau thiep thanh cong.',
      totalApplied,
      report,
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return res.status(404).json({
        message: 'Khong tim thay file template42-localized.html.',
      });
    }

    return next(error);
  }
});

app.post('/api/template42/setup/reset', async (_req, res, next) => {
  try {
    const paths = await getTemplateActivePaths();
    const backup = await fs.readFile(paths.backup, 'utf8');
    await writeTemplateHtmlToActiveAndMirror(backup, paths);
    await savePersistedTemplateEditorState([]);

    return res.json({
      message: 'Da khoi phuc template ve ban backup.',
    });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return res.status(404).json({
        message: 'Khong tim thay file backup template.',
      });
    }

    return next(error);
  }
});

// Proxy legacy template runtime API calls to preserve original template behavior.
app.use('/api', tryProxyLegacyApi);

app.get('/template42-localized.html', async (_req, res, next) => {
  try {
    const { html } = await readActiveTemplateHtml();
    const items = getTemplateEditorItems(html);
    const persistedState = await loadPersistedTemplateEditorState();
    const persistedUpdates = resolvePersistedEntriesToUpdates(items, persistedState);

    if (persistedUpdates.length === 0) {
      return res.type('html').send(html);
    }

    const result = applyTemplateEditorUpdates(html, persistedUpdates, false);
    return res.type('html').send(result.html);
  } catch (error) {
    return next(error);
  }
});

// Serve built frontend when running as a single fullstack service.
app.use(express.static(webDistPath));

app.get(/^\/(?!api(?:\/|$)).*/, async (_req, res, next) => {
  try {
    await fs.access(webDistPath);
    return res.sendFile(path.join(webDistPath, 'index.html'));
  } catch {
    return next();
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Có lỗi hệ thống, vui lòng thử lại.' });
});

async function boot() {
  try {
    await initializeDatabase();
    app.listen(port, () => {
      console.log(`Wedding invite API is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

void boot();
