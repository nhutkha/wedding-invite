import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = 'c:/DC/wedding-invite';
const HTML_PATH = path.join(ROOT, 'web', 'public', 'template42-localized.html');
const CONFIG_PATH = path.join(ROOT, 'scripts', 'template42-customize.json');

function countOccurrences(haystack, needle) {
  if (!needle) {
    return 0;
  }
  return haystack.split(needle).length - 1;
}

async function readJsonConfig(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Config must be a JSON object.');
  }

  const textReplacements = Array.isArray(parsed.textReplacements) ? parsed.textReplacements : [];
  const assetReplacements = Array.isArray(parsed.assetReplacements) ? parsed.assetReplacements : [];
  const strict = parsed.strict !== false;

  return { textReplacements, assetReplacements, strict };
}

function validatePair(item, section, index) {
  if (!item || typeof item !== 'object') {
    throw new Error(`${section}[${index}] must be an object with "from" and "to".`);
  }

  if (typeof item.from !== 'string' || item.from.length === 0) {
    throw new Error(`${section}[${index}].from must be a non-empty string.`);
  }

  if (typeof item.to !== 'string') {
    throw new Error(`${section}[${index}].to must be a string.`);
  }
}

function applyReplacementBatch(html, replacements, section, strict, report) {
  let updated = html;

  replacements.forEach((item, index) => {
    validatePair(item, section, index);

    const count = countOccurrences(updated, item.from);
    if (strict && count === 0) {
      throw new Error(`No match found for ${section}[${index}].from: ${item.from}`);
    }

    if (count > 0) {
      updated = updated.split(item.from).join(item.to);
    }

    report.push({
      section,
      index,
      from: item.from,
      to: item.to,
      count,
    });
  });

  return updated;
}

async function main() {
  const { textReplacements, assetReplacements, strict } = await readJsonConfig(CONFIG_PATH);
  const html = await fs.readFile(HTML_PATH, 'utf8');

  const report = [];
  let updated = html;

  updated = applyReplacementBatch(updated, textReplacements, 'textReplacements', strict, report);
  updated = applyReplacementBatch(updated, assetReplacements, 'assetReplacements', strict, report);

  await fs.writeFile(HTML_PATH, updated, 'utf8');

  const totalApplied = report.reduce((sum, item) => sum + item.count, 0);
  console.log(`Updated ${HTML_PATH}`);
  console.log(`Applied replacements: ${totalApplied}`);

  report.forEach((item) => {
    console.log(`[${item.section}#${item.index}] matches=${item.count}`);
    console.log(`  from: ${item.from}`);
    console.log(`  to  : ${item.to}`);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
