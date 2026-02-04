import { SlashCommandBuilder, ChatInputCommandInteraction, type TextChannel, type ThreadChannel } from 'discord.js';
import { getActiveIssue, getIssue, updateIssueStage, markErrorResolved, getUnresolvedErrors } from '../../db/index.js';
import { Stage } from '../../workflow/machine.js';
import { client } from '../client.js';

export const data = new SlashCommandBuilder()
  .setName('magazine-reset')
  .setDescription('이슈를 특정 단계로 되돌립니다')
  .addStringOption(option =>
    option
      .setName('stage')
      .setDescription('되돌릴 단계')
      .setRequired(true)
      .addChoices(
        { name: '주제 선정', value: Stage.TOPIC_SELECTION },
        { name: '콘텐츠 작성', value: Stage.CONTENT_WRITING },
        { name: 'Figma 레이아웃', value: Stage.FIGMA_LAYOUT },
        { name: '최종 산출물', value: Stage.FINAL_OUTPUT },
      )
  )
  .addIntegerOption(option =>
    option
      .setName('issue_id')
      .setDescription('이슈 ID (선택사항, 미지정 시 현재 채널의 활성 이슈)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const specifiedIssueId = interaction.options.getInteger('issue_id');
  const targetStage = interaction.options.getString('stage', true) as Stage;

  const issue = specifiedIssueId
    ? getIssue(specifiedIssueId)
    : getActiveIssue(channelId);

  if (!issue) {
    await interaction.reply({
      content: specifiedIssueId
        ? `이슈 #${specifiedIssueId}을(를) 찾을 수 없습니다.`
        : '현재 채널에 활성 이슈가 없습니다.',
      ephemeral: true,
    });
    return;
  }

  if (issue.stage === Stage.COMPLETE) {
    await interaction.reply({
      content: '이 이슈는 이미 완료되었습니다. 리셋할 수 없습니다.',
      ephemeral: true,
    });
    return;
  }

  // Reset to the target stage
  updateIssueStage(issue.id, targetStage);

  // Mark any unresolved errors as resolved
  const unresolvedErrors = getUnresolvedErrors(issue.id);
  for (const error of unresolvedErrors) {
    markErrorResolved(error.id);
  }

  await interaction.reply(`✅ 이슈 #${issue.id}이(가) **${getStageKoreanName(targetStage)}** 단계로 리셋되었습니다.\n\`/magazine-retry\` 명령어로 해당 단계를 실행할 수 있습니다.`);

  // Update thread name if available
  if (issue.thread_id) {
    try {
      const thread = await client.channels.fetch(issue.thread_id) as ThreadChannel;
      if (thread && thread.isThread()) {
        await thread.setName(`매거진 #${issue.issue_number} — ${getStageKoreanName(targetStage)}`);
      }
    } catch (error) {
      console.error('Failed to update thread name:', error);
    }
  }
}

function getStageKoreanName(stage: Stage): string {
  const names: Record<Stage, string> = {
    [Stage.TOPIC_SELECTION]: '주제선정',
    [Stage.CONTENT_WRITING]: '콘텐츠작성',
    [Stage.FIGMA_LAYOUT]: '피그마레이아웃',
    [Stage.FINAL_OUTPUT]: '최종산출물',
    [Stage.COMPLETE]: '완료',
  };
  return names[stage] || stage;
}
