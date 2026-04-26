const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const POSTGRES_URL = String(process.env.DATABASE_URL || '').trim();
const DATABASE_ENGINE = POSTGRES_URL ? 'postgres' : 'sqlite';

let sqliteDb = null;
let sqliteStmts = null;
let pgPool = null;
let isInitialized = false;

function resolvePgSsl() {
  const raw = String(process.env.PGSSL || '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'disable') {
    return false;
  }

  if (raw === '1' || raw === 'true' || raw === 'require') {
    return { rejectUnauthorized: false };
  }

  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }

  return false;
}

async function initializePostgresSchema() {
  await pgPool.query(`
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

    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      state_value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    );
  `);
}

function initializeSqliteSchema() {
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const dbPath = path.join(dataDir, 'wedding.sqlite');
  sqliteDb = new Database(dbPath);

  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS invitations (
      slug TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rsvps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invitation_slug TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      attendance TEXT NOT NULL CHECK (attendance IN ('yes', 'no')),
      guest_count INTEGER NOT NULL CHECK (guest_count >= 0 AND guest_count <= 20),
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invitation_slug TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invitation_slug TEXT NOT NULL,
      sender_name TEXT,
      gift_type TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount >= 1),
      message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invitation_slug TEXT NOT NULL,
      event_name TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      state_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  sqliteStmts = {
    invitationBySlug: sqliteDb.prepare(
      'SELECT payload FROM invitations WHERE slug = ?'
    ),
    stats: {
      rsvps: sqliteDb.prepare(
        'SELECT COUNT(*) AS total FROM rsvps WHERE invitation_slug = ?'
      ),
      attendees: sqliteDb.prepare(
        "SELECT COALESCE(SUM(guest_count), 0) AS total FROM rsvps WHERE invitation_slug = ? AND attendance = 'yes'"
      ),
      wishes: sqliteDb.prepare(
        'SELECT COUNT(*) AS total FROM wishes WHERE invitation_slug = ?'
      ),
      hearts: sqliteDb.prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM gifts WHERE invitation_slug = ? AND gift_type = 'heart-shot'"
      ),
    },
    insertRsvp: sqliteDb.prepare(
      'INSERT INTO rsvps (invitation_slug, guest_name, attendance, guest_count, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    insertWish: sqliteDb.prepare(
      'INSERT INTO wishes (invitation_slug, sender_name, message, created_at) VALUES (?, ?, ?, ?)'
    ),
    insertGift: sqliteDb.prepare(
      'INSERT INTO gifts (invitation_slug, sender_name, gift_type, amount, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    insertAnalytics: sqliteDb.prepare(
      'INSERT INTO analytics_events (invitation_slug, event_name, metadata, created_at) VALUES (?, ?, ?, ?)'
    ),
    listWishes: sqliteDb.prepare(
      'SELECT id, sender_name, message, created_at FROM wishes WHERE invitation_slug = ? ORDER BY id DESC LIMIT ?'
    ),
    listRsvps: sqliteDb.prepare(
      'SELECT id, invitation_slug, guest_name, attendance, guest_count, note, created_at FROM rsvps WHERE invitation_slug = ? ORDER BY id DESC LIMIT ?'
    ),
    appStateByKey: sqliteDb.prepare(
      'SELECT state_value FROM app_state WHERE state_key = ? LIMIT 1'
    ),
    upsertAppState: sqliteDb.prepare(
      `
        INSERT INTO app_state (state_key, state_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(state_key)
        DO UPDATE SET state_value = excluded.state_value, updated_at = excluded.updated_at
      `
    ),
  };
}

function parsePayload(rawPayload) {
  if (typeof rawPayload === 'string') {
    return JSON.parse(rawPayload);
  }

  return rawPayload;
}

function toIsoDate(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function assertInitialized() {
  if (!isInitialized) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
}

const seedInvitation = {
  slug: 'thiep-cuoi-42-clone',
  title: 'Wedding Invitation',
  subtitle:
    'Trân trọng mời bạn và gia đình đến dự lễ thành hôn của chúng tôi. Sự hiện diện của bạn là niềm hạnh phúc lớn lao của cả hai gia đình.',
  heroQuote:
    'Yêu nhau là khi hai trái tim cùng nhìn về một hướng, cùng chọn ở lại trong những ngày bình thường nhất.',
  dateLabel: '03.01.2026',
  countdownTarget: '2026-01-03T10:00:00+07:00',
  locationSummary: 'Thôn Tương Chúc, Nam Phù, Thanh Trì, Hà Nội',
  audioUrl:
    'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8d5f7a9bb.mp3?filename=romantic-background-music-for-video-118447.mp3',
  palette: {
    bg: '#f8f1e9',
    accent: '#b0764f',
    text: '#3e2d22',
    card: '#fffaf5',
  },
  couple: {
    groom: {
      role: 'Chú rể',
      name: 'Trọng Huy',
      quote:
        'Anh tin rằng mọi khoảnh khắc trong đời đều dịu dàng hơn khi có em đi cùng.',
      photo:
        'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80',
    },
    bride: {
      role: 'Cô dâu',
      name: 'Ngọc Mai',
      quote:
        'Em mong được nắm tay anh đi qua những ngày nắng, ngày mưa và cả những mùa thật bình yên.',
      photo:
        'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=80',
    },
  },
  story: [
    {
      title: 'Lần đầu gặp gỡ',
      date: '08/2021',
      text: 'Một buổi chiều mùa hạ, chúng tôi gặp nhau trong một cuộc hẹn tưởng như rất bình thường.',
    },
    {
      title: 'Lời tỏ tình',
      date: '02/2022',
      text: 'Sau nhiều tháng đồng hành, chúng tôi chọn ở bên nhau bằng một lời hứa chân thành.',
    },
    {
      title: 'Ngày cầu hôn',
      date: '11/2025',
      text: 'Trong ánh đèn vàng ấm áp, anh ngỏ lời và em đã gật đầu bằng nụ cười rạng rỡ.',
    },
  ],
  events: [
    {
      title: 'Lễ thành hôn',
      timeLabel: '17:00 - Thứ Bảy, 03.01.2026',
      lunarDate: '15 tháng 11 năm Ất Tỵ',
      venue: 'Tư gia nhà trai',
      address: 'Thôn Tương Chúc, Nam Phù, Thanh Trì, Hà Nội',
      mapUrl:
        'https://www.google.com/maps/search/?api=1&query=Nam+Phu,+Thanh+Tri,+Ha+Noi',
    },
    {
      title: 'Tiệc chung vui',
      timeLabel: '10:00 - Thứ Bảy, 03.01.2026',
      lunarDate: '15 tháng 11 năm Ất Tỵ',
      venue: 'Nhà văn hóa thôn Tương Chúc',
      address: 'Xã Nam Phù, Thanh Trì, Hà Nội',
      mapUrl:
        'https://www.google.com/maps/search/?api=1&query=Nha+Van+Hoa+Thon+Tuong+Chuc',
    },
  ],
  gallery: [
    {
      src: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80',
      alt: 'Khoảnh khắc nắm tay',
    },
    {
      src: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
      alt: 'Khoảnh khắc bên biển',
    },
    {
      src: 'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80',
      alt: 'Khoảnh khắc cười cùng nhau',
    },
    {
      src: 'https://images.unsplash.com/photo-1472653431158-6364773b2a56?auto=format&fit=crop&w=1200&q=80',
      alt: 'Khoảnh khắc dưới nắng',
    },
    {
      src: 'https://images.unsplash.com/photo-1487412912498-0447578fcca8?auto=format&fit=crop&w=1200&q=80',
      alt: 'Khoảnh khắc ánh nhìn',
    },
    {
      src: 'https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1200&q=80',
      alt: 'Khoảnh khắc dịu dàng',
    },
  ],
  mapEmbedUrl:
    'https://www.google.com/maps?q=Nam%20Phu%2C%20Thanh%20Tri%2C%20Ha%20Noi&output=embed',
};

async function seedInvitationIfMissing() {
  const now = new Date().toISOString();

  if (DATABASE_ENGINE === 'postgres') {
    const existing = await pgPool.query(
      'SELECT slug FROM invitations WHERE slug = $1 LIMIT 1',
      [seedInvitation.slug]
    );

    if (existing.rows.length > 0) {
      return;
    }

    await pgPool.query(
      'INSERT INTO invitations (slug, payload, created_at, updated_at) VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz)',
      [seedInvitation.slug, JSON.stringify(seedInvitation), now, now]
    );
    return;
  }

  const existing = sqliteDb
    .prepare('SELECT slug FROM invitations WHERE slug = ?')
    .get(seedInvitation.slug);

  if (!existing) {
    sqliteDb
      .prepare(
        'INSERT INTO invitations (slug, payload, created_at, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(seedInvitation.slug, JSON.stringify(seedInvitation), now, now);
  }
}

async function initializeDatabase() {
  if (isInitialized) {
    return;
  }

  if (DATABASE_ENGINE === 'postgres') {
    pgPool = new Pool({
      connectionString: POSTGRES_URL,
      ssl: resolvePgSsl(),
    });

    await initializePostgresSchema();
  } else {
    initializeSqliteSchema();
  }

  await seedInvitationIfMissing();
  isInitialized = true;
  console.log(`[db] Using ${DATABASE_ENGINE} storage`);
}

function getDatabaseEngine() {
  return DATABASE_ENGINE;
}

async function readInvitation(slug) {
  assertInitialized();

  if (DATABASE_ENGINE === 'postgres') {
    const invitationResult = await pgPool.query(
      'SELECT payload FROM invitations WHERE slug = $1 LIMIT 1',
      [slug]
    );

    if (invitationResult.rows.length === 0) {
      return null;
    }

    const statsResult = await pgPool.query(
      `
        SELECT
          (SELECT COUNT(*) FROM rsvps WHERE invitation_slug = $1) AS rsvp_count,
          (SELECT COALESCE(SUM(guest_count), 0) FROM rsvps WHERE invitation_slug = $1 AND attendance = 'yes') AS attendees_count,
          (SELECT COUNT(*) FROM wishes WHERE invitation_slug = $1) AS wishes_count,
          (SELECT COALESCE(SUM(amount), 0) FROM gifts WHERE invitation_slug = $1 AND gift_type = 'heart-shot') AS hearts_count
      `,
      [slug]
    );

    const payload = parsePayload(invitationResult.rows[0].payload);
    const stats = statsResult.rows[0];

    return {
      ...payload,
      stats: {
        rsvpCount: Number(stats.rsvp_count || 0),
        attendingGuests: Number(stats.attendees_count || 0),
        wishCount: Number(stats.wishes_count || 0),
        heartCount: Number(stats.hearts_count || 0),
      },
    };
  }

  const row = sqliteStmts.invitationBySlug.get(slug);
  if (!row) {
    return null;
  }

  const payload = parsePayload(row.payload);
  return {
    ...payload,
    stats: {
      rsvpCount: sqliteStmts.stats.rsvps.get(slug).total,
      attendingGuests: sqliteStmts.stats.attendees.get(slug).total,
      wishCount: sqliteStmts.stats.wishes.get(slug).total,
      heartCount: sqliteStmts.stats.hearts.get(slug).total,
    },
  };
}

async function createRsvp({ slug, guestName, attendance, guestCount, note }) {
  assertInitialized();

  const createdAt = new Date().toISOString();

  if (DATABASE_ENGINE === 'postgres') {
    const result = await pgPool.query(
      'INSERT INTO rsvps (invitation_slug, guest_name, attendance, guest_count, note, created_at) VALUES ($1, $2, $3, $4, $5, $6::timestamptz) RETURNING id, created_at',
      [slug, guestName, attendance, guestCount, note, createdAt]
    );

    return {
      id: Number(result.rows[0].id),
      createdAt: toIsoDate(result.rows[0].created_at),
    };
  }

  const result = sqliteStmts.insertRsvp.run(
    slug,
    guestName,
    attendance,
    guestCount,
    note,
    createdAt
  );

  return {
    id: Number(result.lastInsertRowid),
    createdAt,
  };
}

async function listWishes(slug, limit = 30) {
  assertInitialized();

  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 30, 200));

  if (DATABASE_ENGINE === 'postgres') {
    const result = await pgPool.query(
      'SELECT id, sender_name, message, created_at FROM wishes WHERE invitation_slug = $1 ORDER BY id DESC LIMIT $2',
      [slug, normalizedLimit]
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      senderName: row.sender_name,
      message: row.message,
      createdAt: toIsoDate(row.created_at),
    }));
  }

  return sqliteStmts.listWishes.all(slug, normalizedLimit).map((row) => ({
    id: row.id,
    senderName: row.sender_name,
    message: row.message,
    createdAt: row.created_at,
  }));
}

async function listRsvps(slug, limit = 300) {
  assertInitialized();

  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 300, 1000));

  if (DATABASE_ENGINE === 'postgres') {
    const result = await pgPool.query(
      'SELECT id, invitation_slug, guest_name, attendance, guest_count, COALESCE(note, \'\') AS note, created_at FROM rsvps WHERE invitation_slug = $1 ORDER BY id DESC LIMIT $2',
      [slug, normalizedLimit]
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      invitationSlug: row.invitation_slug,
      guestName: row.guest_name,
      attendance: row.attendance,
      guestCount: Number(row.guest_count || 0),
      note: row.note || '',
      createdAt: toIsoDate(row.created_at),
    }));
  }

  return sqliteStmts.listRsvps.all(slug, normalizedLimit).map((row) => ({
    id: Number(row.id),
    invitationSlug: row.invitation_slug,
    guestName: row.guest_name,
    attendance: row.attendance,
    guestCount: Number(row.guest_count || 0),
    note: row.note || '',
    createdAt: row.created_at,
  }));
}

async function createWish({ slug, senderName, message }) {
  assertInitialized();

  const createdAt = new Date().toISOString();

  if (DATABASE_ENGINE === 'postgres') {
    const result = await pgPool.query(
      'INSERT INTO wishes (invitation_slug, sender_name, message, created_at) VALUES ($1, $2, $3, $4::timestamptz) RETURNING id, created_at',
      [slug, senderName, message, createdAt]
    );

    return {
      id: Number(result.rows[0].id),
      createdAt: toIsoDate(result.rows[0].created_at),
    };
  }

  const result = sqliteStmts.insertWish.run(slug, senderName, message, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    createdAt,
  };
}

async function createGift({ slug, senderName, giftType, amount, message }) {
  assertInitialized();

  const createdAt = new Date().toISOString();

  if (DATABASE_ENGINE === 'postgres') {
    const result = await pgPool.query(
      'INSERT INTO gifts (invitation_slug, sender_name, gift_type, amount, message, created_at) VALUES ($1, $2, $3, $4, $5, $6::timestamptz) RETURNING id, created_at',
      [slug, senderName || null, giftType, amount, message || null, createdAt]
    );

    return {
      id: Number(result.rows[0].id),
      createdAt: toIsoDate(result.rows[0].created_at),
    };
  }

  const result = sqliteStmts.insertGift.run(
    slug,
    senderName || null,
    giftType,
    amount,
    message || null,
    createdAt
  );

  return {
    id: Number(result.lastInsertRowid),
    createdAt,
  };
}

async function createAnalyticsEvent({ slug, eventName, metadata }) {
  assertInitialized();

  const createdAt = new Date().toISOString();

  if (DATABASE_ENGINE === 'postgres') {
    await pgPool.query(
      'INSERT INTO analytics_events (invitation_slug, event_name, metadata, created_at) VALUES ($1, $2, $3::jsonb, $4::timestamptz)',
      [slug, eventName, metadata ? JSON.stringify(metadata) : null, createdAt]
    );
    return;
  }

  sqliteStmts.insertAnalytics.run(
    slug,
    eventName,
    metadata ? JSON.stringify(metadata) : null,
    createdAt
  );
}

async function readAppState(stateKey, fallbackValue = null) {
  assertInitialized();

  if (DATABASE_ENGINE === 'postgres') {
    const result = await pgPool.query(
      'SELECT state_value FROM app_state WHERE state_key = $1 LIMIT 1',
      [stateKey]
    );

    if (result.rows.length === 0) {
      return fallbackValue;
    }

    return parsePayload(result.rows[0].state_value);
  }

  const row = sqliteStmts.appStateByKey.get(stateKey);
  if (!row) {
    return fallbackValue;
  }

  return parsePayload(row.state_value);
}

async function writeAppState(stateKey, value) {
  assertInitialized();

  const now = new Date().toISOString();
  const serialized = JSON.stringify(value ?? null);

  if (DATABASE_ENGINE === 'postgres') {
    await pgPool.query(
      `
        INSERT INTO app_state (state_key, state_value, updated_at)
        VALUES ($1, $2::jsonb, $3::timestamptz)
        ON CONFLICT(state_key)
        DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = EXCLUDED.updated_at
      `,
      [stateKey, serialized, now]
    );
    return;
  }

  sqliteStmts.upsertAppState.run(stateKey, serialized, now);
}

module.exports = {
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
};
