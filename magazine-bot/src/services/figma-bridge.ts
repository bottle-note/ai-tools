import { type Client, type TextChannel, EmbedBuilder } from 'discord.js';
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
    const channel = (await client.channels.fetch(issue.channel_id)) as TextChannel;
    if (!channel) {
      console.error(`[figma-bridge] Channel ${issue.channel_id} not found`);
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
