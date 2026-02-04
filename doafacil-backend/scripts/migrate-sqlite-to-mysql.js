import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';

function sqlitePath() {
  return fileURLToPath(new URL('../data.sqlite', import.meta.url));
}

function getMysqlConfig() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'doacaoconnect'
  };
}

function toNullable(v) {
  return v === undefined ? null : v;
}

async function main() {
  const src = new Database(sqlitePath(), { readonly: true });
  const conn = await mysql.createConnection({ ...getMysqlConfig(), dateStrings: true, multipleStatements: true });

  console.log('[migrate] Connected to MySQL.');
  console.log('[migrate] Reading from SQLite:', sqlitePath());

  // Basic sanity: ensure target DB is reachable and empty-ish (we'll still insert with explicit IDs).
  await conn.execute('SET FOREIGN_KEY_CHECKS=0');

  const tables = [
    'password_resets',
    'push_tokens',
    'moderation_logs',
    'messages',
    'threads',
    'comments',
    'posts',
    'centers',
    'users'
  ];

  // Clear target tables in reverse dependency order
  for (const t of tables) {
    try {
      await conn.execute(`DELETE FROM ${t}`);
      await conn.execute(`ALTER TABLE ${t} AUTO_INCREMENT = 1`);
      console.log('[migrate] Cleared', t);
    } catch (e) {
      console.log('[migrate] Skip clearing', t, '-', String(e?.message || e));
    }
  }

  // Users
  const users = src.prepare(`SELECT * FROM users`).all();
  for (const u of users) {
    await conn.execute(
      `INSERT INTO users
        (id, name, email, passwordHash, role, phone, avatarUrl, lat, lng, isBlocked, blockedAt, blockedReason, deletedAt, deletedByAdminUserId, deletedReason, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.id,
        u.name,
        u.email,
        u.passwordHash,
        u.role,
        toNullable(u.phone),
        toNullable(u.avatarUrl),
        toNullable(u.lat),
        toNullable(u.lng),
        Number(u.isBlocked || 0),
        toNullable(u.blockedAt),
        toNullable(u.blockedReason),
        toNullable(u.deletedAt),
        toNullable(u.deletedByAdminUserId),
        toNullable(u.deletedReason),
        toNullable(u.createdAt)
      ]
    );
  }
  console.log('[migrate] users:', users.length);

  // Centers
  const centers = src.prepare(`SELECT * FROM centers`).all();
  for (const c of centers) {
    await conn.execute(
      `INSERT INTO centers
        (id, userId, displayName, address, lat, lng, hours, acceptedItemTypes, approved, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.userId,
        c.displayName,
        c.address,
        toNullable(c.lat),
        toNullable(c.lng),
        toNullable(c.hours),
        c.acceptedItemTypes ?? '[]',
        Number(c.approved || 0),
        toNullable(c.createdAt),
        toNullable(c.updatedAt)
      ]
    );
  }
  console.log('[migrate] centers:', centers.length);

  // Posts
  const posts = src.prepare(`SELECT * FROM posts`).all();
  for (const p of posts) {
    await conn.execute(
      `INSERT INTO posts
        (id, authorUserId, centerId, text, category, imageUrl, imageUrls, lat, lng, deletedAt, deletedByAdminUserId, deletedReason, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.authorUserId,
        toNullable(p.centerId),
        p.text,
        p.category,
        toNullable(p.imageUrl),
        p.imageUrls ?? '[]',
        toNullable(p.lat),
        toNullable(p.lng),
        toNullable(p.deletedAt),
        toNullable(p.deletedByAdminUserId),
        toNullable(p.deletedReason),
        toNullable(p.createdAt),
        toNullable(p.updatedAt)
      ]
    );
  }
  console.log('[migrate] posts:', posts.length);

  // Comments
  const comments = src.prepare(`SELECT * FROM comments`).all();
  for (const c of comments) {
    await conn.execute(
      `INSERT INTO comments
        (id, postId, authorUserId, text, deletedAt, deletedByAdminUserId, deletedReason, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.postId,
        c.authorUserId,
        c.text,
        toNullable(c.deletedAt),
        toNullable(c.deletedByAdminUserId),
        toNullable(c.deletedReason),
        toNullable(c.createdAt),
        toNullable(c.updatedAt)
      ]
    );
  }
  console.log('[migrate] comments:', comments.length);

  // Threads
  const threads = src.prepare(`SELECT * FROM threads`).all();
  for (const t of threads) {
    await conn.execute(
      `INSERT INTO threads (id, donorUserId, centerUserId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
      [t.id, t.donorUserId, t.centerUserId, toNullable(t.createdAt), toNullable(t.updatedAt)]
    );
  }
  console.log('[migrate] threads:', threads.length);

  // Messages
  const messages = src.prepare(`SELECT * FROM messages`).all();
  for (const m of messages) {
    await conn.execute(
      `INSERT INTO messages (id, threadId, senderUserId, text, createdAt, readAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [m.id, m.threadId, m.senderUserId, m.text, toNullable(m.createdAt), toNullable(m.readAt)]
    );
  }
  console.log('[migrate] messages:', messages.length);

  // Moderation logs
  const logs = src.prepare(`SELECT * FROM moderation_logs`).all();
  for (const l of logs) {
    await conn.execute(
      `INSERT INTO moderation_logs (id, adminUserId, action, targetType, targetId, reason, meta, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        l.id,
        l.adminUserId,
        l.action,
        l.targetType,
        toNullable(l.targetId),
        toNullable(l.reason),
        toNullable(l.meta),
        toNullable(l.createdAt)
      ]
    );
  }
  console.log('[migrate] moderation_logs:', logs.length);

  // Push tokens
  const pushTokens = src.prepare(`SELECT * FROM push_tokens`).all();
  for (const pt of pushTokens) {
    await conn.execute(
      `INSERT INTO push_tokens (id, userId, token, platform, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [pt.id, pt.userId, pt.token, toNullable(pt.platform), toNullable(pt.createdAt), toNullable(pt.updatedAt)]
    );
  }
  console.log('[migrate] push_tokens:', pushTokens.length);

  // Password resets
  const resets = src.prepare(`SELECT * FROM password_resets`).all();
  for (const r of resets) {
    await conn.execute(
      `INSERT INTO password_resets (id, userId, codeHash, expiresAt, usedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [r.id, r.userId, r.codeHash, r.expiresAt, toNullable(r.usedAt), toNullable(r.createdAt)]
    );
  }
  console.log('[migrate] password_resets:', resets.length);

  // Reset AUTO_INCREMENT to max(id)+1
  for (const t of [...tables].reverse()) {
    try {
      const [rows] = await conn.execute(`SELECT MAX(id) as maxId FROM ${t}`);
      const maxId = Array.isArray(rows) && rows[0]?.maxId ? Number(rows[0].maxId) : 0;
      await conn.execute(`ALTER TABLE ${t} AUTO_INCREMENT = ${maxId + 1}`);
    } catch {
      // ignore
    }
  }

  await conn.execute('SET FOREIGN_KEY_CHECKS=1');
  await conn.end();
  src.close();
  console.log('[migrate] Done.');
}

main().catch((e) => {
  console.error('[migrate] Failed:', e);
  process.exit(1);
});

