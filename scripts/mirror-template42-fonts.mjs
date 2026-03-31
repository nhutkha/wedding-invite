import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'c:/DC/wedding-invite';
const LOCAL_FONT_ROOT = path.join(
  ROOT,
  'web',
  'public',
  'template42-assets',
  'assets.cinelove.me',
  'fonts',
  'webfonts'
);

const REMOTE_FONT_ROOT = 'https://assets.cinelove.me/fonts/webfonts';
const FONT_SLUGS = ['bucthu', 'belinda-avenue', 'hoatay1', 'carlytte', 'the-artisan'];

function bytesToHuman(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function downloadText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

function rewriteCssToLocal(css, slug) {
  return css.replace(/url\('([^']+)'\)/g, (_match, fileUrl) => {
    const fileName = path.posix.basename(new URL(fileUrl).pathname);
    const localUrl = `/template42-assets/assets.cinelove.me/fonts/webfonts/${slug}/${fileName}`;
    return `url('${localUrl}')`;
  });
}

async function mirrorSlug(slug) {
  const remoteCssUrl = `${REMOTE_FONT_ROOT}/${slug}/font.css`;
  const localDir = path.join(LOCAL_FONT_ROOT, slug);
  await fs.mkdir(localDir, { recursive: true });

  const css = await downloadText(remoteCssUrl);
  const matches = [...css.matchAll(/url\('([^']+)'\)/g)];
  const files = [...new Set(matches.map((m) => m[1]))];

  let downloadedBytes = 0;
  for (const fileUrl of files) {
    const fileName = path.posix.basename(new URL(fileUrl).pathname);
    const outPath = path.join(localDir, fileName);
    const data = await downloadBuffer(fileUrl);
    await fs.writeFile(outPath, data);
    downloadedBytes += data.length;
  }

  const localCss = rewriteCssToLocal(css, slug);
  const cssPath = path.join(localDir, 'font.css');
  await fs.writeFile(cssPath, localCss, 'utf8');

  return {
    slug,
    fileCount: files.length,
    downloadedBytes,
    cssBytes: Buffer.byteLength(localCss, 'utf8'),
    cssPath,
  };
}

async function main() {
  let totalFiles = 0;
  let totalBytes = 0;

  for (const slug of FONT_SLUGS) {
    const result = await mirrorSlug(slug);
    totalFiles += result.fileCount;
    totalBytes += result.downloadedBytes + result.cssBytes;
    console.log(
      `[${slug}] files=${result.fileCount}, fontBytes=${bytesToHuman(result.downloadedBytes)}, cssBytes=${bytesToHuman(result.cssBytes)}`
    );
    console.log(`  wrote ${result.cssPath}`);
  }

  console.log(`Done. Total files: ${totalFiles}`);
  console.log(`Estimated added bytes (fonts + css): ${totalBytes} (${bytesToHuman(totalBytes)})`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
