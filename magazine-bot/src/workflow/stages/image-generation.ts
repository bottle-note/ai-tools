import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type Message,
} from 'discord.js';
import { buildPrompts } from '../../services/midjourney.js';
import { getStageData, saveStageData } from '../../db/index.js';
import { Stage } from '../machine.js';
import type { Card } from '../../services/ai.js';

export async function handleImageGeneration(
  issueId: number,
  channel: TextChannel,
): Promise<Message> {
  // Get approved content from previous stage
  const contentData = getStageData(issueId, Stage.CONTENT_WRITING);
  if (!contentData || contentData.status !== 'approved') {
    throw new Error('Content writing stage not approved');
  }

  const { cards } = JSON.parse(contentData.data_json) as { cards: Card[] };

  // Build Midjourney prompts
  const prompts = buildPrompts(cards);

  // Save prompts to stage data
  saveStageData(issueId, Stage.IMAGE_GENERATION, { cards, prompts, imageMapping: {} });

  // Build embed showing all prompts
  const embed = new EmbedBuilder()
    .setTitle('🎨 Midjourney 프롬프트')
    .setDescription('아래 프롬프트를 Midjourney에서 실행해주세요:')
    .setColor(0x5865f2);

  // Add fields for each prompt with card label
  const cardsWithImages = cards.filter((c) => c.mjKeywords);
  for (let i = 0; i < prompts.length; i++) {
    const cardIndex = cards.indexOf(cardsWithImages[i]);
    const cardLabel = cardsWithImages[i].type === 'cover' ? '커버' : `카드 ${cardIndex + 1}`;
    embed.addFields({
      name: `${cardLabel}`,
      value: `\`\`\`${prompts[i]}\`\`\``,
      inline: false,
    });
  }

  embed.setFooter({ text: '위 프롬프트를 Midjourney에서 실행한 후, 이미지 수집 버튼을 눌러주세요' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`image_collect_${issueId}`)
      .setLabel('🖼️ 이미지 수집')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`image_regenerate_${issueId}`)
      .setLabel('🔄 프롬프트 재생성')
      .setStyle(ButtonStyle.Secondary),
  );

  return channel.send({ embeds: [embed], components: [row] });
}
