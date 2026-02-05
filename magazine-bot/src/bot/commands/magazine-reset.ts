import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  type ThreadChannel,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getAllActiveIssues, getIssue, updateIssueStage, markErrorResolved, getUnresolvedErrors } from '../../db/index.js';
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
      .setDescription('이슈 ID (선택사항, 미지정 시 목록에서 선택)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const specifiedIssueId = interaction.options.getInteger('issue_id');
  const targetStage = interaction.options.getString('stage', true) as Stage;

  // If issue ID is specified, reset directly
  if (specifiedIssueId) {
    const issue = getIssue(specifiedIssueId);
    if (!issue) {
      await interaction.reply({
        content: `이슈 #${specifiedIssueId}을(를) 찾을 수 없습니다.`,
        ephemeral: true,
      });
      return;
    }
    await resetIssue(interaction, issue.id, targetStage);
    return;
  }

  // Show all active issues
  const activeIssues = getAllActiveIssues();

  if (activeIssues.length === 0) {
    await interaction.reply({
      content: '진행 중인 이슈가 없습니다.',
      ephemeral: true,
    });
    return;
  }

  // If only one active issue, reset it directly
  if (activeIssues.length === 1) {
    await resetIssue(interaction, activeIssues[0].id, targetStage);
    return;
  }

  // Multiple active issues - show selection menu
  const embed = new EmbedBuilder()
    .setTitle('🔄 이슈 리셋')
    .setDescription(`**${getStageKoreanName(targetStage)}** 단계로 리셋할 이슈를 선택해주세요.`)
    .setColor(0xffa500);

  activeIssues.forEach((issue) => {
    const topicInfo = issue.topic_title || '(주제 미선정)';
    embed.addFields({
      name: `#${issue.id} - ${topicInfo}`,
      value: `현재 단계: ${getStageKoreanName(issue.stage as Stage)} | 생성: ${issue.created_at}`,
      inline: false,
    });
  });

  const options = activeIssues.map((issue) => ({
    label: `#${issue.id} - ${issue.topic_title || '주제 미선정'}`,
    description: `현재: ${getStageKoreanName(issue.stage as Stage)}`,
    value: `${issue.id}_${targetStage}`,
  }));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('reset_issue_select')
      .setPlaceholder('리셋할 이슈 선택')
      .addOptions(options.slice(0, 25)),
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

async function resetIssue(
  interaction: ChatInputCommandInteraction,
  issueId: number,
  targetStage: Stage,
): Promise<void> {
  const issue = getIssue(issueId);
  if (!issue) {
    await interaction.reply({
      content: `이슈 #${issueId}을(를) 찾을 수 없습니다.`,
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

  await interaction.reply(
    `✅ 이슈 #${issue.id}이(가) **${getStageKoreanName(targetStage)}** 단계로 리셋되었습니다.\n` +
    `\`/magazine-retry\` 명령어로 해당 단계를 실행할 수 있습니다.`
  );

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
