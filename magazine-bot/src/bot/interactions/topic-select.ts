import type { ButtonInteraction, TextChannel, ThreadChannel } from 'discord.js';
import { getIssue, getStageData, approveStageData, saveStageData } from '../../db/index.js';
import { advanceStage } from '../../workflow/engine.js';
import { Stage } from '../../workflow/machine.js';
import { handleTopicSelection } from '../../workflow/stages/topic-selection.js';
import { handleContentWriting } from '../../workflow/stages/content-writing.js';
import { executeWithRetry } from '../../workflow/recovery.js';
import type { Topic } from '../../services/ai.js';
import { client } from '../client.js';

export async function handleTopicButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  const issueId = parseInt(customId.split('_').pop()!, 10);

  const issue = getIssue(issueId);
  if (!issue) {
    await interaction.reply({ content: '이슈를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  if (issue.stage !== Stage.TOPIC_SELECTION) {
    await interaction.reply({ content: '현재 주제 선택 단계가 아닙니다.', ephemeral: true });
    return;
  }

  const channel = interaction.channel as TextChannel;

  // Regenerate
  if (customId.startsWith('topic_regenerate_')) {
    await interaction.deferUpdate();
    await interaction.message.delete().catch(() => {});
    await handleTopicSelection(issueId, channel, interaction.user.id);
    return;
  }

  // Select topic 1, 2, or 3
  const topicIndex = parseInt(customId.split('_')[1], 10) - 1;

  const stageData = getStageData(issueId, Stage.TOPIC_SELECTION);
  if (!stageData) {
    await interaction.reply({ content: '주제 데이터를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  const { topics } = JSON.parse(stageData.data_json) as { topics: Topic[] };
  const selectedTopic = topics[topicIndex];

  if (!selectedTopic) {
    await interaction.reply({ content: '잘못된 주제 번호입니다.', ephemeral: true });
    return;
  }

  await interaction.deferUpdate();

  // Approve and save selected topic
  approveStageData(stageData.id);
  saveStageData(issueId, Stage.TOPIC_SELECTION, { topics, selectedTopic, selectedIndex: topicIndex });

  // Update thread name with the selected topic
  if (issue.thread_id) {
    try {
      const thread = await client.channels.fetch(issue.thread_id) as ThreadChannel;
      if (thread && thread.isThread()) {
        await thread.setName(`${selectedTopic.title} — 콘텐츠작성`);
      }
    } catch (error) {
      console.error('Failed to update thread name:', error);
    }
  }

  // Disable buttons on the original message
  await interaction.message.edit({ components: [] });

  await channel.send(`✅ 주제 **"${selectedTopic.title}"** 이(가) 선택되었습니다.`);

  // Advance to CONTENT_WRITING
  await advanceStage(issueId);

  // Trigger content writing with retry
  try {
    await executeWithRetry(
      issueId,
      Stage.CONTENT_WRITING,
      () => handleContentWriting(issueId, channel, selectedTopic),
      async (attempt, maxRetries, error, nextDelayMs) => {
        await channel.send(
          `⚠️ 콘텐츠 생성 중 오류 발생. 재시도 중... (${attempt}/${maxRetries})\n` +
          `다음 시도까지 ${Math.round(nextDelayMs / 1000)}초`
        );
      }
    );
  } catch (error) {
    await channel.send(
      `❌ 콘텐츠 생성에 실패했습니다: ${(error as Error).message}\n` +
      `\`/magazine-retry\` 명령어로 재시도하거나 관리자에게 문의하세요.`
    );
  }
}
