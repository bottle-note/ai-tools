import { type ButtonInteraction, type TextChannel } from 'discord.js';
import { getIssue, getStageData, approveStageData, saveStageData, publishTopic } from '../../db/index.js';
import { advanceStage } from '../../workflow/engine.js';
import { Stage } from '../../workflow/machine.js';
import { generateCaption, type Card, type Topic } from '../../services/ai.js';

interface ContentStageData {
  cards: Card[];
}

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

    const channel = interaction.channel as TextChannel;
    const issueNumber = issue.issue_number;
    await channel.send(`🎉 BottleNote #${issueNumber} 매거진이 완료되었습니다!`);

    await advanceStage(issueId);
  }

  // Handle caption regeneration
  else if (customId.startsWith('final_regenerate_')) {
    // Get content data
    const contentData = getStageData(issueId, Stage.CONTENT_WRITING);
    if (!contentData || contentData.status !== 'approved') {
      await interaction.followUp({
        content: '콘텐츠 데이터를 찾을 수 없습니다.',
        ephemeral: true,
      });
      return;
    }

    const content = JSON.parse(contentData.data_json) as ContentStageData;

    const channel = interaction.channel as TextChannel;
    await channel.send('🔄 캡션을 재생성하는 중...');

    // Re-generate caption
    const { caption, hashtags } = await generateCaption(content.cards);

    // Save new caption data
    saveStageData(issueId, Stage.FINAL_OUTPUT, { caption, hashtags });

    // Re-display the final output
    const { handleFinalOutput } = await import(
      '../../workflow/stages/final-output.js'
    );
    await handleFinalOutput(issueId, channel);

    // Remove old message buttons
    await interaction.message.edit({ components: [] });
  }
}
