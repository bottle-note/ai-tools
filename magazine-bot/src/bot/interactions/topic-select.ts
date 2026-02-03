import type { ButtonInteraction, TextChannel } from 'discord.js';
import { getIssue, getStageData, approveStageData, saveStageData } from '../../db/index.js';
import { advanceStage } from '../../workflow/engine.js';
import { Stage } from '../../workflow/machine.js';
import { handleTopicSelection } from '../../workflow/stages/topic-selection.js';
import { handleContentWriting } from '../../workflow/stages/content-writing.js';
import type { Topic } from '../../services/ai.js';

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
    await handleTopicSelection(issueId, channel);
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

  // Disable buttons on the original message
  await interaction.message.edit({ components: [] });

  await channel.send(`✅ 주제 **"${selectedTopic.title}"** 이(가) 선택되었습니다.`);

  // Advance to CONTENT_WRITING
  await advanceStage(issueId);

  // Trigger content writing
  await handleContentWriting(issueId, channel, selectedTopic);
}
