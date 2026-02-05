import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { initDatabase } from './schema.js';

export interface Issue {
  id: number;
  issue_number: number;
  stage: string;
  channel_id: string;
  thread_id: string | null;
  thread_url: string | null;
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

export interface PublishedTopic {
  id: number;
  issue_id: number;
  topic_title: string;
  published_at: string;
}

export interface StageError {
  id: number;
  issue_id: number;
  stage: string;
  error_message: string;
  retry_count: number;
  resolved_at: string | null;
  created_at: string;
}

const dbPath = process.env.DATABASE_PATH || './bottlenote.db';
const db: DatabaseType = new Database(dbPath);
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

export interface ActiveIssueWithTopic extends Issue {
  topic_title: string | null;
}

export function getAllActiveIssues(): ActiveIssueWithTopic[] {
  const stmt = db.prepare(`
    SELECT
      mi.*,
      json_extract(sd.data_json, '$.selectedTopic.title') as topic_title
    FROM magazine_issues mi
    LEFT JOIN stage_data sd ON sd.issue_id = mi.id AND sd.stage = 'TOPIC_SELECTION'
    WHERE mi.stage != 'COMPLETE'
    ORDER BY mi.id DESC
  `);
  return stmt.all() as ActiveIssueWithTopic[];
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

export function updateIssueThreadUrl(id: number, threadUrl: string): void {
  const stmt = db.prepare(
    "UPDATE magazine_issues SET thread_url = ?, updated_at = datetime('now') WHERE id = ?"
  );
  stmt.run(threadUrl, id);
}

// Published Topics functions
export function publishTopic(issueId: number, topicTitle: string): void {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO published_topics (issue_id, topic_title) VALUES (?, ?)'
  );
  stmt.run(issueId, topicTitle);
}

export function isTopicPublished(title: string): boolean {
  const stmt = db.prepare('SELECT id FROM published_topics WHERE topic_title = ?');
  return stmt.get(title) !== undefined;
}

export function getPublishedTopicTitles(): string[] {
  const stmt = db.prepare('SELECT topic_title FROM published_topics ORDER BY published_at DESC');
  const rows = stmt.all() as { topic_title: string }[];
  return rows.map(r => r.topic_title);
}

// Stage Error functions
export function recordStageError(issueId: number, stage: string, errorMessage: string): number {
  const stmt = db.prepare(
    'INSERT INTO stage_errors (issue_id, stage, error_message) VALUES (?, ?, ?)'
  );
  const result = stmt.run(issueId, stage, errorMessage);
  return Number(result.lastInsertRowid);
}

export function incrementRetryCount(errorId: number): void {
  const stmt = db.prepare('UPDATE stage_errors SET retry_count = retry_count + 1 WHERE id = ?');
  stmt.run(errorId);
}

export function markErrorResolved(errorId: number): void {
  const stmt = db.prepare("UPDATE stage_errors SET resolved_at = datetime('now') WHERE id = ?");
  stmt.run(errorId);
}

export function getUnresolvedErrors(issueId: number): StageError[] {
  const stmt = db.prepare(
    'SELECT * FROM stage_errors WHERE issue_id = ? AND resolved_at IS NULL ORDER BY created_at DESC'
  );
  return stmt.all(issueId) as StageError[];
}

export function getLatestUnresolvedError(issueId: number, stage: string): StageError | null {
  const stmt = db.prepare(
    'SELECT * FROM stage_errors WHERE issue_id = ? AND stage = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1'
  );
  return (stmt.get(issueId, stage) as StageError) ?? null;
}
