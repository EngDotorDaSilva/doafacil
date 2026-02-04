import Database from 'better-sqlite3';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const PROVIDER = String(process.env.DB_CONNECTION || process.env.DB_PROVIDER || 'sqlite').toLowerCase();

function getSqlitePath() {
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

function normalizeParams(params) {
  return Array.isArray(params) ? params : [];
}

function createSqliteDb() {
  const raw = new Database(getSqlitePath());
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  return {
    provider: 'sqlite',
    raw,
    async get(sql, params = []) {
      return raw.prepare(sql).get(...normalizeParams(params));
    },
    async all(sql, params = []) {
      return raw.prepare(sql).all(...normalizeParams(params));
    },
    async run(sql, params = []) {
      const info = raw.prepare(sql).run(...normalizeParams(params));
      return { 
        insertId: Number(info.lastInsertRowid || 0), 
        lastInsertRowid: Number(info.lastInsertRowid || 0),
        changes: Number(info.changes || 0) 
      };
    },
    async tx(fn) {
      // SQLite transactions are synchronous, but we need to support async functions
      // We'll use a manual transaction approach with BEGIN/COMMIT/ROLLBACK
      const api = {
        // Make methods async-compatible but execute synchronously
        async get(sql, params = []) {
          return raw.prepare(sql).get(...normalizeParams(params));
        },
        async all(sql, params = []) {
          return raw.prepare(sql).all(...normalizeParams(params));
        },
        async run(sql, params = []) {
          const info = raw.prepare(sql).run(...normalizeParams(params));
          return { 
            insertId: Number(info.lastInsertRowid || 0),
            lastInsertRowid: Number(info.lastInsertRowid || 0),
            changes: Number(info.changes || 0) 
          };
        }
      };
      
      // Start transaction manually
      raw.exec('BEGIN IMMEDIATE TRANSACTION');
      try {
        // Execute the async function
        const result = await fn(api);
        // Commit if successful
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        // Rollback on error
        raw.exec('ROLLBACK');
        throw err;
      }
    }
  };
}

async function createMysqlDb() {
  const pool = mysql.createPool({
    ...getMysqlConfig(),
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true
  });
  return {
    provider: 'mysql',
    pool,
    async get(sql, params = []) {
      const [rows] = await pool.execute(sql, normalizeParams(params));
      const arr = rows;
      return Array.isArray(arr) ? arr[0] : null;
    },
    async all(sql, params = []) {
      const [rows] = await pool.execute(sql, normalizeParams(params));
      return Array.isArray(rows) ? rows : [];
    },
    async run(sql, params = []) {
      const [res] = await pool.execute(sql, normalizeParams(params));
      const r = res;
      return { insertId: Number(r.insertId || 0), changes: Number(r.affectedRows || 0) };
    },
    async tx(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const api = {
          async get(sql, params = []) {
            const [rows] = await conn.execute(sql, normalizeParams(params));
            return Array.isArray(rows) ? rows[0] : null;
          },
          async all(sql, params = []) {
            const [rows] = await conn.execute(sql, normalizeParams(params));
            return Array.isArray(rows) ? rows : [];
          },
          async run(sql, params = []) {
            const [res] = await conn.execute(sql, normalizeParams(params));
            return { insertId: Number(res.insertId || 0), changes: Number(res.affectedRows || 0) };
          }
        };
        const out = await fn(api);
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    }
  };
}

export const db = PROVIDER === 'mysql' ? await createMysqlDb() : createSqliteDb();

export async function migrate() {
  if (db.provider === 'sqlite') {
    const raw = db.raw;
    raw.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('donor','center','admin')),
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS centers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL UNIQUE,
        displayName TEXT NOT NULL,
        address TEXT NOT NULL,
        lat REAL,
        lng REAL,
        hours TEXT,
        acceptedItemTypes TEXT NOT NULL DEFAULT '[]',
        approved INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        authorUserId INTEGER NOT NULL,
        centerId INTEGER,
        text TEXT NOT NULL,
        category TEXT NOT NULL,
        imageUrl TEXT,
        imageUrls TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (authorUserId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (centerId) REFERENCES centers(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        authorUserId INTEGER NOT NULL,
        text TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (authorUserId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        donorUserId INTEGER NOT NULL,
        centerUserId INTEGER NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(donorUserId, centerUserId),
        FOREIGN KEY (donorUserId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (centerUserId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        threadId INTEGER NOT NULL,
        senderUserId INTEGER NOT NULL,
        text TEXT NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        readAt TEXT,
        FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE,
        FOREIGN KEY (senderUserId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS moderation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        adminUserId INTEGER NOT NULL,
        action TEXT NOT NULL,
        targetType TEXT NOT NULL,
        targetId INTEGER,
        reason TEXT,
        meta TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (adminUserId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS push_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        platform TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        codeHash TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        usedAt TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('like','love','dislike')),
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(postId, userId),
        FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS saved_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(postId, userId),
        FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        postId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(postId, userId),
        FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS available_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        centerId INTEGER NOT NULL,
        itemType TEXT NOT NULL,
        description TEXT,
        quantity INTEGER,
        status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','unavailable','donated')),
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (centerId) REFERENCES centers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS donation_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        itemId INTEGER NOT NULL,
        donorUserId INTEGER NOT NULL,
        centerId INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','completed','cancelled')),
        message TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (itemId) REFERENCES available_items(id) ON DELETE CASCADE,
        FOREIGN KEY (donorUserId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (centerId) REFERENCES centers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporterUserId INTEGER NOT NULL,
        targetType TEXT NOT NULL CHECK (targetType IN ('post','comment','user')),
        targetId INTEGER NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('spam','inappropriate','harassment','fake','other')),
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','resolved','dismissed')),
        reviewedByAdminUserId INTEGER,
        reviewedAt TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (reporterUserId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewedByAdminUserId) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    // Lightweight migrations for existing databases (SQLite doesn't auto-add columns).
    ensureColumnSqlite(raw, 'users', 'phone', 'TEXT');
    ensureColumnSqlite(raw, 'users', 'avatarUrl', 'TEXT');
    ensureColumnSqlite(raw, 'users', 'lat', 'REAL');
    ensureColumnSqlite(raw, 'users', 'lng', 'REAL');
    ensureColumnSqlite(raw, 'users', 'isBlocked', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumnSqlite(raw, 'users', 'blockedAt', 'TEXT');
    ensureColumnSqlite(raw, 'users', 'blockedReason', 'TEXT');
    ensureColumnSqlite(raw, 'users', 'deletedAt', 'TEXT');
    ensureColumnSqlite(raw, 'users', 'deletedByAdminUserId', 'INTEGER');
    ensureColumnSqlite(raw, 'users', 'deletedReason', 'TEXT');

    // Soft-delete for moderation (keep history).
    ensureColumnSqlite(raw, 'posts', 'deletedAt', 'TEXT');
    ensureColumnSqlite(raw, 'posts', 'deletedByAdminUserId', 'INTEGER');
    ensureColumnSqlite(raw, 'posts', 'deletedReason', 'TEXT');
    ensureColumnSqlite(raw, 'posts', 'imageUrls', "TEXT NOT NULL DEFAULT '[]'");
    ensureColumnSqlite(raw, 'posts', 'lat', 'REAL');
    ensureColumnSqlite(raw, 'posts', 'lng', 'REAL');
    ensureColumnSqlite(raw, 'comments', 'deletedAt', 'TEXT');
    ensureColumnSqlite(raw, 'comments', 'deletedByAdminUserId', 'INTEGER');
    ensureColumnSqlite(raw, 'comments', 'deletedReason', 'TEXT');
    
    // Ensure reactions table exists (migration for existing databases)
    const reactionsExists = raw.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='reactions'`).get();
    if (!reactionsExists) {
      raw.exec(`
        CREATE TABLE IF NOT EXISTS reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          postId INTEGER NOT NULL,
          userId INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('like','love','dislike')),
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(postId, userId),
          FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
    }
    
    // Ensure saved_posts table exists
    const savedPostsExists = raw.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='saved_posts'`).get();
    if (!savedPostsExists) {
      raw.exec(`
        CREATE TABLE IF NOT EXISTS saved_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          postId INTEGER NOT NULL,
          userId INTEGER NOT NULL,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(postId, userId),
          FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
    }
    
    // Ensure shares table exists
    const sharesExists = raw.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='shares'`).get();
    if (!sharesExists) {
      raw.exec(`
        CREATE TABLE IF NOT EXISTS shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          postId INTEGER NOT NULL,
          userId INTEGER NOT NULL,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(postId, userId),
          FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
      `);
    }
    return;
  }

  // MySQL schema
  await db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      passwordHash VARCHAR(255) NOT NULL,
      role ENUM('donor','center','admin') NOT NULL,
      phone VARCHAR(64) NULL,
      avatarUrl TEXT NULL,
      lat DOUBLE NULL,
      lng DOUBLE NULL,
      isBlocked TINYINT(1) NOT NULL DEFAULT 0,
      blockedAt DATETIME NULL,
      blockedReason TEXT NULL,
      deletedAt DATETIME NULL,
      deletedByAdminUserId INT NULL,
      deletedReason TEXT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS centers (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL UNIQUE,
      displayName VARCHAR(255) NOT NULL,
      address TEXT NOT NULL,
      lat DOUBLE NULL,
      lng DOUBLE NULL,
      hours TEXT NULL,
      acceptedItemTypes TEXT NOT NULL,
      approved TINYINT(1) NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_centers_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS posts (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      authorUserId INT NOT NULL,
      centerId INT NULL,
      text TEXT NOT NULL,
      category VARCHAR(64) NOT NULL,
      imageUrl TEXT NULL,
      imageUrls TEXT NOT NULL,
      lat DOUBLE NULL,
      lng DOUBLE NULL,
      deletedAt DATETIME NULL,
      deletedByAdminUserId INT NULL,
      deletedReason TEXT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_posts_author FOREIGN KEY (authorUserId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_posts_center FOREIGN KEY (centerId) REFERENCES centers(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS comments (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      postId INT NOT NULL,
      authorUserId INT NOT NULL,
      text TEXT NOT NULL,
      deletedAt DATETIME NULL,
      deletedByAdminUserId INT NULL,
      deletedReason TEXT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_comments_post FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
      CONSTRAINT fk_comments_author FOREIGN KEY (authorUserId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS threads (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      donorUserId INT NOT NULL,
      centerUserId INT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_thread (donorUserId, centerUserId),
      CONSTRAINT fk_threads_donor FOREIGN KEY (donorUserId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_threads_center FOREIGN KEY (centerUserId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS messages (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      threadId INT NOT NULL,
      senderUserId INT NOT NULL,
      text TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      readAt DATETIME NULL,
      CONSTRAINT fk_messages_thread FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE,
      CONSTRAINT fk_messages_sender FOREIGN KEY (senderUserId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS moderation_logs (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      adminUserId INT NOT NULL,
      action VARCHAR(64) NOT NULL,
      targetType VARCHAR(64) NOT NULL,
      targetId INT NULL,
      reason TEXT NULL,
      meta TEXT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_modlog_admin FOREIGN KEY (adminUserId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS push_tokens (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      token VARCHAR(255) NOT NULL UNIQUE,
      platform VARCHAR(32) NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_push_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS password_resets (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      codeHash VARCHAR(255) NOT NULL,
      expiresAt DATETIME NOT NULL,
      usedAt DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_resets_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS reactions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      postId INT NOT NULL,
      userId INT NOT NULL,
      type ENUM('like','love','dislike') NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_reaction (postId, userId),
      CONSTRAINT fk_reactions_post FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
      CONSTRAINT fk_reactions_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS saved_posts (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      postId INT NOT NULL,
      userId INT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_saved (postId, userId),
      CONSTRAINT fk_saved_post FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
      CONSTRAINT fk_saved_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS shares (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      postId INT NOT NULL,
      userId INT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_share (postId, userId),
      CONSTRAINT fk_shares_post FOREIGN KEY (postId) REFERENCES posts(id) ON DELETE CASCADE,
      CONSTRAINT fk_shares_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS available_items (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      centerId INT NOT NULL,
      itemType VARCHAR(64) NOT NULL,
      description TEXT NULL,
      quantity INT NULL,
      status ENUM('available','unavailable','donated') NOT NULL DEFAULT 'available',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_items_center FOREIGN KEY (centerId) REFERENCES centers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS donation_requests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      itemId INT NOT NULL,
      donorUserId INT NOT NULL,
      centerId INT NOT NULL,
      status ENUM('pending','accepted','completed','cancelled') NOT NULL DEFAULT 'pending',
      message TEXT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_requests_item FOREIGN KEY (itemId) REFERENCES available_items(id) ON DELETE CASCADE,
      CONSTRAINT fk_requests_donor FOREIGN KEY (donorUserId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_requests_center FOREIGN KEY (centerId) REFERENCES centers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );

  await db.run(
    `CREATE TABLE IF NOT EXISTS reports (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      reporterUserId INT NOT NULL,
      targetType ENUM('post','comment','user') NOT NULL,
      targetId INT NOT NULL,
      reason ENUM('spam','inappropriate','harassment','fake','other') NOT NULL,
      description TEXT NULL,
      status ENUM('pending','reviewed','resolved','dismissed') NOT NULL DEFAULT 'pending',
      reviewedByAdminUserId INT NULL,
      reviewedAt DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_reports_reporter FOREIGN KEY (reporterUserId) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_reports_admin FOREIGN KEY (reviewedByAdminUserId) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_target (targetType, targetId),
      INDEX idx_status (status),
      INDEX idx_reporter (reporterUserId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  );
}

export async function touchCenter(centerId) {
  if (db.provider === 'sqlite') {
    await db.run(`UPDATE centers SET updatedAt = datetime('now') WHERE id = ?`, [centerId]);
  } else {
    await db.run(`UPDATE centers SET updatedAt = NOW() WHERE id = ?`, [centerId]);
  }
}

export async function touchThread(threadId) {
  if (db.provider === 'sqlite') {
    await db.run(`UPDATE threads SET updatedAt = datetime('now') WHERE id = ?`, [threadId]);
  } else {
    await db.run(`UPDATE threads SET updatedAt = NOW() WHERE id = ?`, [threadId]);
  }
}

function ensureColumnSqlite(raw, tableName, columnName, columnType) {
  const cols = raw.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = cols.some((c) => c.name === columnName);
  if (exists) return;
  raw.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}

