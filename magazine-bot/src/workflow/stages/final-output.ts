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
import { type Card, type Topic } from '../../services/ai.js';

interface ContentStageData {
  cards: Card[];
  topic: Topic;
}

interface FinalOutputData {
  caption: string;
  hashtags: string[];
}

export async function handleFinalOutput(
  issueId: number,
  channel: TextChannel,
): Promise<Message> {
  // Get content data (includes topic with hashtags)
  const contentData = getStageData(issueId, Stage.CONTENT_WRITING);
  if (!contentData || contentData.status !== 'approved') {
    throw new Error('Content writing stage not approved');
  }

  const content = JSON.parse(contentData.data_json) as ContentStageData;

  // caption과 hashtags는 topic에 이미 포함되어 있음 (주제 선정 시 AI가 함께 생성)
  const caption = content.topic.caption;
  const hashtags = content.topic.hashtags;

  // Save final output data
  const finalData: FinalOutputData = { caption, hashtags };
  saveStageData(issueId, Stage.FINAL_OUTPUT, finalData);

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
        name: '📝 캡션',
        value: caption,
        inline: false,
      },
      {
        name: '🏷️ 해시태그',
        value: hashtags.join(' '),
        inline: false,
      },
    )
    .setFooter({
      text: 'Figma에서 카드 이미지를 내보내고, 위 내용과 함께 인스타그램에 업로드하세요',
    });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`final_complete_${issueId}`)
      .setLabel('✅ 완료 — 아카이브')
      .setStyle(ButtonStyle.Success),
  );

  return channel.send({ embeds: [embed], components: [row] });
}
