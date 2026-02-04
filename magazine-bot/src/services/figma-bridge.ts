import { type Client, type TextChannel, type ThreadChannel, EmbedBuilder } from 'discord.js';
import { getIssue } from '../db/index.js';

export async function onLayoutComplete(
  issueId: number,
  client: Client,
): Promise<void> {
  const issue = getIssue(issueId);
  if (!issue) {
    console.error(`[figma-bridge] Issue ${issueId} not found`);
    return;
  }

  try {
    // Use thread if available, otherwise fall back to channel
    const targetChannelId = issue.thread_id || issue.channel_id;
    const channel = (await client.channels.fetch(targetChannelId)) as TextChannel | ThreadChannel;
    if (!channel) {
      console.error(`[figma-bridge] Channel/Thread ${targetChannelId} not found`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Figma 레이아웃 완료!')
      .setDescription('최종 산출물을 생성합니다...')
      .setColor(0x00c853);

    await channel.send({ embeds: [embed] });

    // Trigger final output stage
    const { handleFinalOutput } = await import(
      '../workflow/stages/final-output.js'
    );
    await handleFinalOutput(issueId, channel);
  } catch (error) {
    console.error('[figma-bridge] Error handling layout complete:', error);
  }
}
