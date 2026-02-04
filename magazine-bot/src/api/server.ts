import express from 'express';
import cors from 'cors';
import { db, getIssue, getStageData, approveStageData } from '../db/index.js';
import { advanceStage } from '../workflow/engine.js';
import { Stage } from '../workflow/machine.js';
import type { Card } from '../services/ai.js';
import type { Issue } from '../db/index.js';

interface ContentStageData {
  topic: { title: string; subtitle: string };
  cards: Card[];
}

export function createApiServer(
  port: number,
  onLayoutComplete?: (issueId: number) => void,
) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/issues', (_req, res) => {
    const stmt = db.prepare(
      "SELECT * FROM magazine_issues WHERE stage = ? ORDER BY created_at DESC",
    );
    const issues = stmt.all(Stage.FIGMA_LAYOUT) as Issue[];

    res.json(
      issues.map((i) => ({
        id: i.id,
        issueNumber: i.issue_number,
        stage: i.stage,
        createdAt: i.created_at,
      })),
    );
  });

  app.get('/api/issues/:id/layout', (req, res) => {
    const issueId = parseInt(req.params.id, 10);
    const issue = getIssue(issueId);

    if (!issue) {
      res.status(404).json({ error: '이슈를 찾을 수 없습니다.' });
      return;
    }

    const contentData = getStageData(issueId, Stage.CONTENT_WRITING);
    if (!contentData) {
      res.status(404).json({ error: '콘텐츠 데이터를 찾을 수 없습니다.' });
      return;
    }

    const content = JSON.parse(contentData.data_json) as ContentStageData;

    const cards = content.cards.map((card) => ({
      type: card.type,
      heading: card.heading,
      body: card.body,
      imageRef: card.imageRef ?? null,
    }));

    res.json({
      issueNumber: issue.issue_number,
      topic: {
        title: content.topic.title,
        subtitle: content.topic.subtitle,
      },
      cards,
      threadUrl: issue.thread_url ?? null,
    });
  });

  app.post('/api/issues/:id/complete', (req, res) => {
    const issueId = parseInt(req.params.id, 10);
    const issue = getIssue(issueId);

    if (!issue) {
      res.status(404).json({ error: '이슈를 찾을 수 없습니다.' });
      return;
    }

    if (issue.stage !== Stage.FIGMA_LAYOUT) {
      res.status(400).json({ error: '현재 Figma 레이아웃 단계가 아닙니다.' });
      return;
    }

    const stageData = getStageData(issueId, Stage.FIGMA_LAYOUT);
    if (stageData) {
      approveStageData(stageData.id);
    }

    advanceStage(issueId);

    if (onLayoutComplete) {
      onLayoutComplete(issueId);
    }

    res.json({ success: true });
  });

  const server = app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });

  return server;
}
