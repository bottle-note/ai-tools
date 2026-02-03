import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type Message,
} from 'discord.js';
import { getStageData, getIssue, saveStageData } from '../../db/index.js';
import { Stage } from '../machine.js';
import { generateCaption, type Card } from '../../services/ai.js';

interface ContentStageData {
  cards: Card[];
}

interface CaptionData {
  caption: string;
  hashtags: string[];
}

export async function handleFinalOutput(
  issueId: number,
  channel: TextChannel,
): Promise<Message> {
  // Get content data
  const contentData = getStageData(issueId, Stage.CONTENT_WRITING);
  if (!contentData || contentData.status !== 'approved') {
    throw new Error('Content writing stage not approved');
  }

  const content = JSON.parse(contentData.data_json) as ContentStageData;

  // Generate Instagram caption
  const { caption, hashtags } = await generateCaption(content.cards);

  // Save caption data
  const captionData: CaptionData = { caption, hashtags };
  saveStageData(issueId, Stage.FINAL_OUTPUT, captionData);

  // Get issue number for display
  const issue = getIssue(issueId);
  const issueNumber = issue?.issue_number ?? issueId;

  // Build Discord embed
  const embed = new EmbedBuilder()
    .setTitle(`📝 BottleNote #${issueNumber} — 최종 산출물`)
    .setDescription('매거진 제작이 완료되었습니다!')
    .setColor(0x00ff00)
    .addFields(
      {
        name: '인스타그램 캡션',
        value: caption.length > 1024 ? caption.slice(0, 1021) + '...' : caption,
        inline: false,
      },
      {
        name: '해시태그',
        value: hashtags.join(' '),
        inline: false,
      },
    )
    .setFooter({
      text: 'Figma에서 카드 이미지를 내보내고, 위 캡션과 함께 인스타그램에 업로드하세요',
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`final_complete_${issueId}`)
      .setLabel('✅ 완료 — 아카이브')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`final_regenerate_${issueId}`)
      .setLabel('🔄 캡션 재생성')
      .setStyle(ButtonStyle.Secondary),
  );

  return channel.send({ embeds: [embed], components: [row] });
}
