import type Database from 'better-sqlite3';

export function initDatabase(db: Database.Database): void {
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS magazine_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_number INTEGER NOT NULL,
      stage TEXT NOT NULL DEFAULT 'TOPIC_SELECTION',
      channel_id TEXT NOT NULL,
      thread_id TEXT,
      thread_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stage_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      stage TEXT NOT NULL,
      data_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (issue_id) REFERENCES magazine_issues(id)
    );

    CREATE TABLE IF NOT EXISTS published_topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      topic_title TEXT NOT NULL UNIQUE,
      published_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (issue_id) REFERENCES magazine_issues(id)
    );

    CREATE TABLE IF NOT EXISTS stage_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      stage TEXT NOT NULL,
      error_message TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (issue_id) REFERENCES magazine_issues(id)
    );
  `);

  // Run migrations for existing databases
  runMigrations(db);
}

function runMigrations(db: Database.Database): void {
  // Get existing columns in magazine_issues
  const columns = db.prepare("PRAGMA table_info(magazine_issues)").all() as { name: string }[];
  const columnNames = new Set(columns.map(c => c.name));

  // Migration: Add thread_url column if missing
  if (!columnNames.has('thread_url')) {
    db.exec('ALTER TABLE magazine_issues ADD COLUMN thread_url TEXT');
    console.log('Migration: Added thread_url column to magazine_issues');
  }
}
