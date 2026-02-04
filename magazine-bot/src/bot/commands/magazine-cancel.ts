import { SlashCommandBuilder, ChatInputCommandInteraction, type ThreadChannel } from 'discord.js';
import { getActiveIssue, getIssue, updateIssueStage, markErrorResolved, getUnresolvedErrors } from '../../db/index.js';
import { Stage } from '../../workflow/machine.js';
import { client } from '../client.js';

export const data = new SlashCommandBuilder()
  .setName('magazine-cancel')
  .setDescription('진행 중인 이슈를 취소합니다')
  .addIntegerOption(option =>
    option
      .setName('issue_id')
      .setDescription('이슈 ID (선택사항, 미지정 시 현재 채널의 활성 이슈)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const specifiedIssueId = interaction.options.getInteger('issue_id');

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
