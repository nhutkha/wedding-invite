const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('node:fs/promises');
const path = require('node:path');
const { z } = require('zod');
const {
  readInvitation,
  createRsvp,
  listWishes,
  createWish,
  createGift,
  createAnalyticsEvent,
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
const templateHtmlPath = path.join(
  repoRoot,
  'web',
  'public',
  'template42-localized.html'
);
const templateBackupPath = path.join(
  repoRoot,
  'web',
  'public',
  'template42-localized.backup.html'
);
const setupConfigPath = path.join(
  repoRoot,
  'scripts',
  'template42-customize.json'
);
const customAssetsDir = path.join(repoRoot, 'web', 'public', 'custom-assets');

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(morgan('dev'));

const slugSchema = z.string().trim().min(3).max(120);

const rsvpSchema = z.object({
  slug: slugSchema,
  guestName: z.string().trim().min(2).max(80),
  attendance: z.enum(['yes', 'no']),
  guestCount: z.coerce.number().int().min(0).max(20),
  note: z.string().trim().max(300).optional().default(''),
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'wedding-invite-api' });
});

app.get('/api/invitation/:slug', (req, res) => {
  const parsed = slugSchema.safeParse(req.params.slug);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  const invitation = readInvitation(parsed.data);
  if (!invitation) {
    return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
  }

  return res.json(invitation);
});

app.get('/api/wishes', (req, res) => {
  const parsed = slugSchema.safeParse(req.query.slug);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  const wishes = listWishes(parsed.data, 40);
  return res.json({ wishes });
});

app.post('/api/rsvp', (req, res) => {
  const parsed = rsvpSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  const invitation = readInvitation(parsed.data.slug);
  if (!invitation) {
    return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
  }

  const result = createRsvp(parsed.data);
  return res.status(201).json({
    message: 'Xác nhận tham dự đã được ghi nhận.',
    id: result.id,
    createdAt: result.createdAt,
  });
});

app.post('/api/wishes', (req, res) => {
  const parsed = wishSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  const invitation = readInvitation(parsed.data.slug);
  if (!invitation) {
    return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
  }

  const result = createWish(parsed.data);
  return res.status(201).json({
    message: 'Cảm ơn bạn đã gửi lời chúc.',
    id: result.id,
    createdAt: result.createdAt,
  });
});

app.post('/api/gifts', (req, res) => {
  const parsed = giftSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  const invitation = readInvitation(parsed.data.slug);
  if (!invitation) {
    return res.status(404).json({ message: 'Không tìm thấy thiệp.' });
  }

  const result = createGift(parsed.data);
  return res.status(201).json({
    message: 'Món quà của bạn đã được gửi thành công.',
    id: result.id,
    createdAt: result.createdAt,
  });
});

app.post('/api/analytics/events', (req, res) => {
  const parsed = analyticsSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendValidationError(res, parsed);
  }

  createAnalyticsEvent(parsed.data);
  return res.status(202).json({ ok: true });
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
    const html = await fs.readFile(templateHtmlPath, 'utf8');
    const items = getTemplateEditorItems(html);
    const snapshot = buildTemplateSetupSnapshot(items);

    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/template42/editor/items', async (_req, res, next) => {
  try {
    const html = await fs.readFile(templateHtmlPath, 'utf8');
    const items = getTemplateEditorItems(html);

    return res.json({
      items,
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
    const html = await fs.readFile(templateHtmlPath, 'utf8');

    try {
      await fs.access(templateBackupPath);
    } catch {
      await fs.writeFile(templateBackupPath, html, 'utf8');
    }

    const result = applyTemplateEditorUpdates(
      html,
      parsed.data.updates,
      parsed.data.strict
    );

    await fs.writeFile(templateHtmlPath, result.html, 'utf8');

    return res.json({
      message: 'Da cap nhat thanh cong tu editor.',
      totalApplied: result.totalApplied,
      report: result.report,
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

    if (bytes.length > 10 * 1024 * 1024) {
      return res.status(400).json({
        message: 'File vuot qua gioi han 10MB.',
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
    const html = await fs.readFile(templateHtmlPath, 'utf8');

    try {
      await fs.access(templateBackupPath);
    } catch {
      await fs.writeFile(templateBackupPath, html, 'utf8');
    }

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

    await fs.writeFile(templateHtmlPath, updated, 'utf8');
    await fs.writeFile(setupConfigPath, JSON.stringify(parsed.data, null, 2), 'utf8');

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
    const backup = await fs.readFile(templateBackupPath, 'utf8');
    await fs.writeFile(templateHtmlPath, backup, 'utf8');

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

app.listen(port, () => {
  console.log(`Wedding invite API is running at http://localhost:${port}`);
});
