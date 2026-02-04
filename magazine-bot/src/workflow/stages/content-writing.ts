import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type Message,
} from 'discord.js';
import { type Topic, type Card } from '../../services/ai.js';
import { saveStageData } from '../../db/index.js';
import { Stage } from '../machine.js';

export async function handleContentWriting(
  issueId: number,
  channel: TextChannel,
  topic: Topic,
): Promise<Message> {
  // topic.cards는 이미 AI 호출 시 생성됨 (주제 선정 단계에서 통합 생성)
  const cards = topic.cards;

  saveStageData(issueId, Stage.CONTENT_WRITING, { cards, topic });

  const embeds = cards.map((card: Card, index: number) => {
    const typeLabel =
      card.type === 'cover' ? '📕 커버' : card.type === 'closing' ? '📗 마무리' : '📄 본문';

    return new EmbedBuilder()
      .setTitle(`${typeLabel} | 카드 ${index + 1}`)
      .addFields(
        { name: '제목', value: card.heading, inline: false },
        { name: '본문', value: card.body, inline: false },
      )
      .setColor(card.type === 'cover' ? 0xd4a574 : card.type === 'closing' ? 0x8b6914 : 0xf5e6d0)
      .setFooter(card.imageRef ? { text: `🔗 ${card.imageRef}` } : null);
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`content_approve_${issueId}`)
      .setLabel('✅ 승인')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`content_edit_${issueId}`)
      .setLabel('✏️ 수정')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`content_regenerate_${issueId}`)
      .setLabel('🔄 재생성')
      .setStyle(ButtonStyle.Secondary),
  );

  return channel.send({ embeds, components: [row] });
}
