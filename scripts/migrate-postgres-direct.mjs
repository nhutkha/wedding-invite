import process from 'node:process';
import pgModule from '../server/node_modules/pg/lib/index.js';

const { Pool } = pgModule;

function parseArgs(argv) {
  const args = { source: '', target: '' };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (token === '--source' || token === '-s') {
      args.source = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    if (token === '--target' || token === '-t') {
      args.target = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
  }

  return args;
}

function resolveSsl(connectionString) {
  const lower = String(connectionString || '').toLowerCase();
  if (lower.includes('sslmode=disable')) {
    return false;
  }

  if (lower.includes('sslmode=require') || lower.includes('sslmode=verify-full')) {
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: false };
}

function logStep(message) {
  // eslint-disable-next-line no-console
  console.log(`[migrate-direct] ${message}`);
}

async function ensureTargetSchema(targetPool) {
  await targetPool.query(`
    CREATE TABLE IF NOT EXISTS invitations (
      slug TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rsvps (
      id BIGSERIAL PRIMARY KEY,
      invitation_slug TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      attendance TEXT NOT NULL CHECK (attendance IN ('yes', 'no')),
      guest_count INTEGER NOT NULL CHECK (guest_count >= 0 AND guest_count <= 20),
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id BIGSERIAL PRIMARY KEY,
      invitation_slug TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gifts (
      id BIGSERIAL PRIMARY KEY,
      invitation_slug TEXT NOT NULL,
      sender_name TEXT,
      gift_type TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount >= 1),
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGSERIAL PRIMARY KEY,
      invitation_slug TEXT NOT NULL,
      event_name TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL
    );
  `);
}

function chunkRows(rows, size = 500) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

async function bulkInsert(client, table, columns, rows, jsonColumns = []) {
  if (!rows.length) {
    return;
  }

  const chunks = chunkRows(rows, 400);

  for (const part of chunks) {
    const values = [];
    const placeholders = [];

    for (const row of part) {
      const rowPlaceholders = [];

      for (const column of columns) {
        values.push(row[column]);
        const index = values.length;
        if (jsonColumns.includes(column)) {
          rowPlaceholders.push(`$${index}::jsonb`);
        } else {
          rowPlaceholders.push(`$${index}`);
        }
      }

      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`;
    // eslint-disable-next-line no-await-in-loop
    await client.query(sql, values);
  }
}

async function main() {
  const { source, target } = parseArgs(process.argv.slice(2));

  if (!source || !target) {
    // eslint-disable-next-line no-console
    console.error('Usage: node scripts/migrate-postgres-direct.mjs --source "SOURCE_DATABASE_URL" --target "TARGET_DATABASE_URL"');
    process.exit(1);
  }

  const sourcePool = new Pool({
    connectionString: source,
    ssl: resolveSsl(source),
  });

  const targetPool = new Pool({
    connectionString: target,
    ssl: resolveSsl(target),
  });

  const targetClient = await targetPool.connect();

  try {
    logStep('Checking source and target connectivity.');
    await sourcePool.query('SELECT 1');
    await targetPool.query('SELECT 1');

    logStep('Ensuring target schema exists.');
    await ensureTargetSchema(targetPool);

    logStep('Reading data from source database.');
    const invitations = (await sourcePool.query('SELECT slug, payload, created_at, updated_at FROM invitations')).rows;
    const rsvps = (await sourcePool.query('SELECT id, invitation_slug, guest_name, attendance, guest_count, note, created_at FROM rsvps ORDER BY id')).rows;
    const wishes = (await sourcePool.query('SELECT id, invitation_slug, sender_name, message, created_at FROM wishes ORDER BY id')).rows;
    const gifts = (await sourcePool.query('SELECT id, invitation_slug, sender_name, gift_type, amount, message, created_at FROM gifts ORDER BY id')).rows;
    const analyticsEvents = (await sourcePool.query('SELECT id, invitation_slug, event_name, metadata, created_at FROM analytics_events ORDER BY id')).rows;

    logStep('Writing data to target database in a transaction.');
    await targetClient.query('BEGIN');
    await targetClient.query('TRUNCATE TABLE analytics_events, gifts, wishes, rsvps, invitations RESTART IDENTITY');

    await bulkInsert(targetClient, 'invitations', ['slug', 'payload', 'created_at', 'updated_at'], invitations, ['payload']);
    await bulkInsert(targetClient, 'rsvps', ['id', 'invitation_slug', 'guest_name', 'attendance', 'guest_count', 'note', 'created_at'], rsvps);
    await bulkInsert(targetClient, 'wishes', ['id', 'invitation_slug', 'sender_name', 'message', 'created_at'], wishes);
    await bulkInsert(targetClient, 'gifts', ['id', 'invitation_slug', 'sender_name', 'gift_type', 'amount', 'message', 'created_at'], gifts);
    await bulkInsert(targetClient, 'analytics_events', ['id', 'invitation_slug', 'event_name', 'metadata', 'created_at'], analyticsEvents, ['metadata']);

    await targetClient.query(`SELECT setval(pg_get_serial_sequence('rsvps', 'id'), COALESCE((SELECT MAX(id) FROM rsvps), 1), (SELECT EXISTS(SELECT 1 FROM rsvps)))`);
    await targetClient.query(`SELECT setval(pg_get_serial_sequence('wishes', 'id'), COALESCE((SELECT MAX(id) FROM wishes), 1), (SELECT EXISTS(SELECT 1 FROM wishes)))`);
    await targetClient.query(`SELECT setval(pg_get_serial_sequence('gifts', 'id'), COALESCE((SELECT MAX(id) FROM gifts), 1), (SELECT EXISTS(SELECT 1 FROM gifts)))`);
    await targetClient.query(`SELECT setval(pg_get_serial_sequence('analytics_events', 'id'), COALESCE((SELECT MAX(id) FROM analytics_events), 1), (SELECT EXISTS(SELECT 1 FROM analytics_events)))`);

    await targetClient.query('COMMIT');

    logStep(`Done. invitations=${invitations.length}, rsvps=${rsvps.length}, wishes=${wishes.length}, gifts=${gifts.length}, analytics_events=${analyticsEvents.length}`);
  } catch (error) {
    await targetClient.query('ROLLBACK').catch(() => undefined);
    // eslint-disable-next-line no-console
    console.error('[migrate-direct] FAILED:', error?.message || error);
    process.exitCode = 1;
  } finally {
    targetClient.release();
    await sourcePool.end();
    await targetPool.end();
  }
}

main();
