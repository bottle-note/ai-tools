import { type ButtonInteraction, type TextChannel } from 'discord.js';
import { getIssue, getStageData, approveStageData, publishTopic, updateIssueThreadUrl } from '../../db/index.js';
import { advanceStage } from '../../workflow/engine.js';
import { Stage } from '../../workflow/machine.js';
import type { Topic } from '../../services/ai.js';

export async function handleFinalButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;
  const issueId = parseInt(customId.split('_').pop()!, 10);

  const issue = getIssue(issueId);
  if (!issue) {
    await interaction.reply({ content: '이슈를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  if (issue.stage !== Stage.FINAL_OUTPUT) {
    await interaction.reply({
      content: '현재 최종 산출물 단계가 아닙니다.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  // Handle completion
  if (customId.startsWith('final_complete_')) {
    // Approve stage data and advance to COMPLETE
    const stageData = getStageData(issueId, Stage.FINAL_OUTPUT);
    if (stageData) {
      approveStageData(stageData.id);
    }

    // Get the selected topic title and add it to published topics
    const topicData = getStageData(issueId, Stage.TOPIC_SELECTION);
    if (topicData) {
      const { selectedTopic } = JSON.parse(topicData.data_json) as { selectedTopic: Topic };
      if (selectedTopic?.title) {
        publishTopic(issueId, selectedTopic.title);
      }
    }

    await interaction.message.edit({ components: [] });

    // Save thread URL for Figma plugin reference
    if (issue.thread_id && interaction.guildId) {
      const threadUrl = `https://discord.com/channels/${interaction.guildId}/${issue.thread_id}`;
      updateIssueThreadUrl(issueId, threadUrl);
    }

    const channel = interaction.channel as TextChannel;
    const issueNumber = issue.issue_number;
    await channel.send(`🎉 BottleNote #${issueNumber} 매거진이 완료되었습니다!`);

    await advanceStage(issueId);
  }
}
