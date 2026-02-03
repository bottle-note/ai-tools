import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { initDatabase } from './schema.js';

export interface Issue {
  id: number;
  issue_number: number;
  stage: string;
  channel_id: string;
  thread_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageData {
  id: number;
  issue_id: number;
  stage: string;
  data_json: string;
  status: string;
  created_at: string;
}

const db: DatabaseType = new Database('./bottlenote.db');
db.pragma('journal_mode = WAL');
initDatabase(db);

export { db };

export function createIssue(channelId: string, threadId?: string): Issue {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM magazine_issues');
  const { count } = countStmt.get() as { count: number };
  const issueNumber = count + 1;

  const stmt = db.prepare(
    'INSERT INTO magazine_issues (issue_number, channel_id, thread_id) VALUES (?, ?, ?)'
  );
  const result = stmt.run(issueNumber, channelId, threadId ?? null);

  return getIssue(Number(result.lastInsertRowid))!;
}

export function getIssue(id: number): Issue | null {
  const stmt = db.prepare('SELECT * FROM magazine_issues WHERE id = ?');
  return (stmt.get(id) as Issue) ?? null;
}

export function getActiveIssue(channelId: string): Issue | null {
  const stmt = db.prepare(
    "SELECT * FROM magazine_issues WHERE channel_id = ? AND stage != 'COMPLETE' ORDER BY id DESC LIMIT 1"
  );
  return (stmt.get(channelId) as Issue) ?? null;
}

export function updateIssueStage(id: number, stage: string): void {
  const stmt = db.prepare(
    "UPDATE magazine_issues SET stage = ?, updated_at = datetime('now') WHERE id = ?"
  );
  stmt.run(stage, id);
}

export function saveStageData(issueId: number, stage: string, data: unknown): void {
  const stmt = db.prepare(
    'INSERT INTO stage_data (issue_id, stage, data_json) VALUES (?, ?, ?)'
  );
  stmt.run(issueId, stage, JSON.stringify(data));
}

export function getStageData(issueId: number, stage: string): StageData | null {
  const stmt = db.prepare(
    'SELECT * FROM stage_data WHERE issue_id = ? AND stage = ? ORDER BY id DESC LIMIT 1'
  );
  return (stmt.get(issueId, stage) as StageData) ?? null;
}

export function approveStageData(id: number): void {
  const stmt = db.prepare("UPDATE stage_data SET status = 'approved' WHERE id = ?");
  stmt.run(id);
}

export function getIssueByThread(threadId: string): Issue | null {
  const stmt = db.prepare('SELECT * FROM magazine_issues WHERE thread_id = ?');
  return (stmt.get(threadId) as Issue) ?? null;
}

export function updateIssueThread(id: number, threadId: string): void {
  const stmt = db.prepare(
    "UPDATE magazine_issues SET thread_id = ?, updated_at = datetime('now') WHERE id = ?"
  );
  stmt.run(threadId, id);
}
