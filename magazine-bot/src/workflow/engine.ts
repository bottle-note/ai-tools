import { createIssue, getIssue, updateIssueStage, getStageData } from '../db/index.js';
import type { Issue } from '../db/index.js';
import { getNextStage, canReject, isComplete, Stage } from './machine.js';
import { client } from '../bot/client.js';
import { type ThreadChannel } from 'discord.js';

export function startIssue(channelId: string): Issue {
  return createIssue(channelId);
}

function getTopicTitle(issueId: number): string | null {
  const stageData = getStageData(issueId, Stage.TOPIC_SELECTION);
  if (!stageData) return null;

  try {
    const data = JSON.parse(stageData.data_json);
    return data.selectedTopic?.title || null;
  } catch {
    return null;
  }
}

async function updateThreadName(issue: Issue, stage: Stage): Promise<void> {
  if (!issue.thread_id) return;

  const stageNames: Record<Stage, string> = {
    [Stage.TOPIC_SELECTION]: '주제선정',
    [Stage.CONTENT_WRITING]: '콘텐츠작성',
    [Stage.FIGMA_LAYOUT]: '피그마레이아웃',
    [Stage.FINAL_OUTPUT]: '최종산출물',
    [Stage.COMPLETE]: '완료',
  };

  try {
    const thread = await client.channels.fetch(issue.thread_id) as ThreadChannel;
    if (thread && thread.isThread()) {
      const topicTitle = getTopicTitle(issue.id);
      const stageSuffix = stage === Stage.COMPLETE ? ' ✅' : ` — ${stageNames[stage]}`;

      if (topicTitle) {
        // Use topic title once selected
        await thread.setName(`${topicTitle}${stageSuffix}`);
      } else {
        // Fallback for topic selection stage
        await thread.setName(`매거진 #${issue.issue_number} — ${stageNames[stage]}`);
      }
    }
  } catch (error) {
    console.error('Failed to update thread name:', error);
  }
}

export async function advanceStage(issueId: number): Promise<Issue> {
  const issue = getIssue(issueId);
  if (!issue) {
    throw new Error(`Issue ${issueId} not found`);
  }

  if (isComplete(issue.stage as Stage)) {
    throw new Error(`Issue ${issueId} is already complete`);
  }

  const next = getNextStage(issue.stage as Stage);
  if (!next) {
    throw new Error(`No next stage for ${issue.stage}`);
  }

  updateIssueStage(issueId, next);
  const updatedIssue = getIssue(issueId)!;

  // Update thread name
  await updateThreadName(updatedIssue, next);

  return updatedIssue;
}

export function rejectStage(issueId: number): Issue {
  const issue = getIssue(issueId);
  if (!issue) {
    throw new Error(`Issue ${issueId} not found`);
  }

  if (!canReject(issue.stage as Stage)) {
    throw new Error(`Cannot reject stage ${issue.stage}`);
  }

  // Re-run current stage by keeping the same stage (no state change needed)
  // Just update the timestamp to signal a re-run
  updateIssueStage(issueId, issue.stage);
  return getIssue(issueId)!;
}

export function getCurrentStage(issueId: number): Stage {
  const issue = getIssue(issueId);
  if (!issue) {
    throw new Error(`Issue ${issueId} not found`);
  }
  return issue.stage as Stage;
}
