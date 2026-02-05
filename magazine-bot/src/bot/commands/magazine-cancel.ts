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
  .setName('magazine-cancel')
  .setDescription('진행 중인 이슈를 취소합니다')
  .addIntegerOption(option =>
    option
      .setName('issue_id')
      .setDescription('이슈 ID (선택사항, 미지정 시 목록에서 선택)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const specifiedIssueId = interaction.options.getInteger('issue_id');

  // If issue ID is specified, cancel directly
  if (specifiedIssueId) {
    const issue = getIssue(specifiedIssueId);
    if (!issue) {
      await interaction.reply({
        content: `이슈 #${specifiedIssueId}을(를) 찾을 수 없습니다.`,
        ephemeral: true,
      });
      return;
    }
    await cancelIssue(interaction, issue.id);
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

  // If only one active issue, cancel it directly
  if (activeIssues.length === 1) {
    await cancelIssue(interaction, activeIssues[0].id);
    return;
  }

  // Multiple active issues - show selection menu
  const embed = new EmbedBuilder()
    .setTitle('🚫 이슈 취소')
    .setDescription('취소할 이슈를 선택해주세요.')
    .setColor(0xff6b6b);

  activeIssues.forEach((issue) => {
    const topicInfo = issue.topic_title || '(주제 미선정)';
    embed.addFields({
      name: `#${issue.id} - ${topicInfo}`,
      value: `단계: ${issue.stage} | 생성: ${issue.created_at}`,
      inline: false,
    });
  });

  const options = activeIssues.map((issue) => ({
    label: `#${issue.id} - ${issue.topic_title || '주제 미선정'}`,
    description: `단계: ${issue.stage}`,
    value: String(issue.id),
  }));

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cancel_issue_select')
      .setPlaceholder('취소할 이슈 선택')
      .addOptions(options.slice(0, 25)), // Max 25 options
  );

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

async function cancelIssue(interaction: ChatInputCommandInteraction, issueId: number): Promise<void> {
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
      content: '이 이슈는 이미 완료되었습니다.',
      ephemeral: true,
    });
    return;
  }

  // Mark as complete (cancelled)
  updateIssueStage(issue.id, Stage.COMPLETE);

  // Mark any unresolved errors as resolved
  const unresolvedErrors = getUnresolvedErrors(issue.id);
  for (const error of unresolvedErrors) {
    markErrorResolved(error.id);
  }

  await interaction.reply(`🚫 이슈 #${issue.id}이(가) 취소되었습니다.`);

  // Update thread name if available
  if (issue.thread_id) {
    try {
      const thread = await client.channels.fetch(issue.thread_id) as ThreadChannel;
      if (thread && thread.isThread()) {
        await thread.setName(`매거진 #${issue.issue_number} — ❌ 취소됨`);
      }
    } catch (error) {
      console.error('Failed to update thread name:', error);
    }
  }
}
