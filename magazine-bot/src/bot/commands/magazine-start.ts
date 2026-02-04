import { SlashCommandBuilder, ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import { getActiveIssue, updateIssueStage, createIssue, updateIssueThread, updateIssueThreadUrl } from '../../db/index.js';
import { handleTopicSelection } from '../../workflow/stages/topic-selection.js';

function cancelIssue(id: number): void {
  updateIssueStage(id, 'COMPLETE');
}

export const data = new SlashCommandBuilder()
  .setName('magazine-start')
  .setDescription('새로운 매거진 이슈를 시작합니다');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const active = getActiveIssue(channelId);

  if (active) {
    cancelIssue(active.id);
  }

  // Reply to the interaction
  await interaction.reply(`매거진 이슈를 시작합니다...`);

  // Create issue first without thread
  const issue = createIssue(channelId);

  // Create thread
  const channel = interaction.channel as TextChannel;
  const thread = await channel.threads.create({
    name: `매거진 #${issue.issue_number} — 주제선정`,
    autoArchiveDuration: 10080, // 7 days
  });

  // Update issue with thread ID and URL
  updateIssueThread(issue.id, thread.id);
  const threadUrl = `https://discord.com/channels/${interaction.guildId}/${thread.id}`;
  updateIssueThreadUrl(issue.id, threadUrl);

  // Start topic selection in the thread
  await handleTopicSelection(issue.id, thread);
}
