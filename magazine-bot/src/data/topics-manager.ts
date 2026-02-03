import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TOPICS_FILE = join(__dirname, 'published-topics.json');

interface TopicsData {
  topics: string[];
}

export function getPublishedTopics(): string[] {
  const data = JSON.parse(readFileSync(TOPICS_FILE, 'utf-8')) as TopicsData;
  return data.topics;
}

export function addPublishedTopic(topic: string): void {
  const data = JSON.parse(readFileSync(TOPICS_FILE, 'utf-8')) as TopicsData;
  data.topics.push(topic);
  writeFileSync(TOPICS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}
