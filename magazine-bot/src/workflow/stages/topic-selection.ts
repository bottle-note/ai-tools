import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type Message,
} from 'discord.js';
import { generateTopics, type Topic } from '../../services/ai.js';
import { saveStageData, getPublishedTopicTitles } from '../../db/index.js';
import { Stage } from '../machine.js';

export async function handleTopicSelection(
  issueId: number,
  channel: TextChannel,
  requestedByUserId?: string,
): Promise<Message> {
  const statusMsg = await channel.send('🔄 주제를 생성하고 있습니다...');

  const recentTopics = getPublishedTopicTitles();
  const topics = await generateTopics({ recentTopics });

  saveStageData(issueId, Stage.TOPIC_SELECTION, { topics });

  const embed = new EmbedBuilder()
    .setTitle('📰 매거진 주제 선택')
    .setDescription('아래 3가지 주제 후보 중 하나를 선택해주세요.')
    .setColor(0xd4a574);

  topics.forEach((topic: Topic, index: number) => {
    embed.addFields({
      name: `${index + 1}. ${topic.title}`,
      value: `*${topic.subtitle}*\n${topic.description}`,
      inline: false,
    });
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`topic_1_${issueId}`)
      .setLabel('1')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`topic_2_${issueId}`)
      .setLabel('2')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`topic_3_${issueId}`)
      .setLabel('3')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`topic_regenerate_${issueId}`)
      .setLabel('🔄 다시 생성')
      .setStyle(ButtonStyle.Secondary),
  );

  await statusMsg.delete().catch(() => {});

  // 주제 생성 완료 시 요청자에게 알림
  const mentionText = requestedByUserId
    ? `<@${requestedByUserId}> 주제 생성이 완료되었습니다! 아래에서 선택해주세요.`
    : undefined;

  return channel.send({
    content: mentionText,
    embeds: [embed],
    components: [row],
  });
}
