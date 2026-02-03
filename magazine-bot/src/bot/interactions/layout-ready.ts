import { type ButtonInteraction, type TextChannel } from 'discord.js';
import { getIssue, getStageData, approveStageData } from '../../db/index.js';
import { advanceStage } from '../../workflow/engine.js';
import { Stage } from '../../workflow/machine.js';

export async function handleLayoutButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;
  const issueId = parseInt(customId.split('_').pop()!, 10);

  const issue = getIssue(issueId);
  if (!issue) {
    await interaction.reply({ content: '이슈를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  if (issue.stage !== Stage.FIGMA_LAYOUT) {
    await interaction.reply({
      content: '현재 Figma 레이아웃 단계가 아닙니다.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferUpdate();

  // Approve stage data and advance
  const stageData = getStageData(issueId, Stage.FIGMA_LAYOUT);
  if (stageData) {
    approveStageData(stageData.id);
  }

  await interaction.message.edit({ components: [] });

  const channel = interaction.channel as TextChannel;
  await channel.send('Figma 레이아웃이 완료되었습니다. 최종 산출물을 생성합니다...');

  advanceStage(issueId);

  // Trigger final output
  const { handleFinalOutput } = await import(
    '../../workflow/stages/final-output.js'
  );
  await handleFinalOutput(issueId, channel);
}
