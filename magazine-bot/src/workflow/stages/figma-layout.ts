import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type Message,
} from 'discord.js';
import { getStageData, saveStageData } from '../../db/index.js';
import { Stage } from '../machine.js';
import type { Card } from '../../services/ai.js';

interface ImageStageData {
  cards: Card[];
  prompts: string[];
  imageMapping: Record<number, string>;
}

interface ContentStageData {
  topic: { title: string; subtitle: string };
  cards: Card[];
}

export async function handleFigmaLayout(
  issueId: number,
  channel: TextChannel,
): Promise<Message> {
  // Get content data
  const contentData = getStageData(issueId, Stage.CONTENT_WRITING);
  if (!contentData || contentData.status !== 'approved') {
    throw new Error('Content writing stage not approved');
  }

  const content = JSON.parse(contentData.data_json) as ContentStageData;

  // Get image data
  const imageData = getStageData(issueId, Stage.IMAGE_GENERATION);
  if (!imageData || imageData.status !== 'approved') {
    throw new Error('Image generation stage not approved');
  }

  const images = JSON.parse(imageData.data_json) as ImageStageData;

  // Build card summary
  const cardSummary = content.cards.map((card, idx) => {
    const hasImage = !!images.imageMapping[idx];
    const imageStatus = hasImage ? '🖼️' : '➖';
    const label =
      card.type === 'cover'
        ? '커버'
        : card.type === 'closing'
          ? '마무리'
          : `카드 ${idx + 1}`;
    return `${imageStatus} **${label}**: ${card.heading}`;
  });

  // Save stage data
  saveStageData(issueId, Stage.FIGMA_LAYOUT, {
    topic: content.topic,
    cards: content.cards,
    imageMapping: images.imageMapping,
  });

  const embed = new EmbedBuilder()
    .setTitle('📐 Figma 레이아웃')
    .setDescription(
      'Figma 플러그인에서 데이터를 가져올 준비가 되었습니다.\n\n' +
        '**카드 구성:**\n' +
        cardSummary.join('\n'),
    )
    .setColor(0xa259ff)
    .addFields(
      {
        name: '주제',
        value: `${content.topic.title} - ${content.topic.subtitle}`,
        inline: false,
      },
      {
        name: '안내',
        value:
          'Figma에서 **BottleNote Magazine** 플러그인을 실행하세요.\n' +
          '플러그인이 자동으로 API에서 데이터를 가져와 템플릿에 배치합니다.\n' +
          '레이아웃 완료 후 플러그인에서 완료 버튼을 누르거나,\n' +
          '아래 수동 완료 버튼을 사용하세요.',
        inline: false,
      },
    )
    .setFooter({ text: `이슈 #${issueId} | API: GET /api/issues/${issueId}/layout` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`layout_complete_${issueId}`)
      .setLabel('레이아웃 완료')
      .setStyle(ButtonStyle.Success),
  );

  return channel.send({ embeds: [embed], components: [row] });
}
