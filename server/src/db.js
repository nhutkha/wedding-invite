const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'wedding.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

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

const now = new Date().toISOString();
const existingInvitation = db
  .prepare('SELECT slug FROM invitations WHERE slug = ?')
  .get(seedInvitation.slug);

if (!existingInvitation) {
  db.prepare(
    'INSERT INTO invitations (slug, payload, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run(seedInvitation.slug, JSON.stringify(seedInvitation), now, now);
}

const invitationBySlugStmt = db.prepare(
  'SELECT payload FROM invitations WHERE slug = ?'
);
const statsStmt = {
  rsvps: db.prepare(
    'SELECT COUNT(*) AS total FROM rsvps WHERE invitation_slug = ?'
  ),
  attendees: db.prepare(
    "SELECT COALESCE(SUM(guest_count), 0) AS total FROM rsvps WHERE invitation_slug = ? AND attendance = 'yes'"
  ),
  wishes: db.prepare(
    'SELECT COUNT(*) AS total FROM wishes WHERE invitation_slug = ?'
  ),
  hearts: db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM gifts WHERE invitation_slug = ? AND gift_type = 'heart-shot'"
  ),
};

const insertRsvpStmt = db.prepare(
  'INSERT INTO rsvps (invitation_slug, guest_name, attendance, guest_count, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertWishStmt = db.prepare(
  'INSERT INTO wishes (invitation_slug, sender_name, message, created_at) VALUES (?, ?, ?, ?)'
);
const insertGiftStmt = db.prepare(
  'INSERT INTO gifts (invitation_slug, sender_name, gift_type, amount, message, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertAnalyticsStmt = db.prepare(
  'INSERT INTO analytics_events (invitation_slug, event_name, metadata, created_at) VALUES (?, ?, ?, ?)'
);
const listWishesStmt = db.prepare(
  'SELECT id, sender_name, message, created_at FROM wishes WHERE invitation_slug = ? ORDER BY id DESC LIMIT ?'
);

function readInvitation(slug) {
  const row = invitationBySlugStmt.get(slug);
  if (!row) {
    return null;
  }

  const payload = JSON.parse(row.payload);
  return {
    ...payload,
    stats: {
      rsvpCount: statsStmt.rsvps.get(slug).total,
      attendingGuests: statsStmt.attendees.get(slug).total,
      wishCount: statsStmt.wishes.get(slug).total,
      heartCount: statsStmt.hearts.get(slug).total,
    },
  };
}

function createRsvp({ slug, guestName, attendance, guestCount, note }) {
  const createdAt = new Date().toISOString();
  const result = insertRsvpStmt.run(
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

function listWishes(slug, limit = 30) {
  return listWishesStmt.all(slug, limit).map((row) => ({
    id: row.id,
    senderName: row.sender_name,
    message: row.message,
    createdAt: row.created_at,
  }));
}

function createWish({ slug, senderName, message }) {
  const createdAt = new Date().toISOString();
  const result = insertWishStmt.run(slug, senderName, message, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    createdAt,
  };
}

function createGift({ slug, senderName, giftType, amount, message }) {
  const createdAt = new Date().toISOString();
  const result = insertGiftStmt.run(
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

function createAnalyticsEvent({ slug, eventName, metadata }) {
  const createdAt = new Date().toISOString();
  insertAnalyticsStmt.run(
    slug,
    eventName,
    metadata ? JSON.stringify(metadata) : null,
    createdAt
  );
}

module.exports = {
  readInvitation,
  createRsvp,
  listWishes,
  createWish,
  createGift,
  createAnalyticsEvent,
};
