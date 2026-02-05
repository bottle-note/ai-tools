import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type TextChannel,
  type Message,
} from 'discord.js';
import { generateTopics, generateTopicFromSearch, type Topic } from '../../services/ai.js';
import { saveStageData, getStageData, getPublishedTopicTitles } from '../../db/index.js';
import { Stage } from '../machine.js';

export async function handleTopicSelection(
  issueId: number,
  channel: TextChannel,
  requestedByUserId?: string,
  searchResultIndex?: number,
): Promise<Message> {
  const statusMsg = await channel.send('🔄 주제를 생성하고 있습니다...');

  const recentTopics = getPublishedTopicTitles();

  // Check if this is a search-based topic generation
  if (searchResultIndex !== undefined) {
    const stageDataRow = getStageData(issueId, Stage.TOPIC_SELECTION);
    const stageData = stageDataRow ? JSON.parse(stageDataRow.data_json) : null;
    const searchResults = stageData?.searchResults;

    if (searchResults && searchResults[searchResultIndex]) {
      const selectedResult = searchResults[searchResultIndex];
      const topic = await generateTopicFromSearch(selectedResult, recentTopics);

      // Save single topic as selected
      saveStageData(issueId, Stage.TOPIC_SELECTION, {
        ...stageData,
        topics: [topic],
        selectedTopicIndex: 0,
        selectedSearchResult: selectedResult,
      });

      await statusMsg.delete().catch(() => {});

      const embed = new EmbedBuilder()
        .setTitle('📰 검색 기반 주제 생성 완료')
        .setDescription('아래 주제로 콘텐츠를 생성합니다.')
        .addFields(
          { name: topic.title, value: `*${topic.subtitle}*\n${topic.description}`, inline: false },
          { name: '📊 카드 수', value: `${topic.cards.length}장`, inline: true },
          { name: '🔗 원본', value: selectedResult.source || selectedResult.url, inline: true },
        )
        .setColor(0xd4a574);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`topic_confirm_${issueId}`)
          .setLabel('✅ 이 주제로 진행')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`topic_regenerate_search_${issueId}_${searchResultIndex}`)
          .setLabel('🔄 다시 생성')
          .setStyle(ButtonStyle.Secondary),
      );

      const mentionText = requestedByUserId
        ? `<@${requestedByUserId}> 주제 생성이 완료되었습니다!`
        : undefined;

      return channel.send({
        content: mentionText,
        embeds: [embed],
        components: [row],
      });
    }
  }

  // Classic mode: generate 3 topics
  const topics = await generateTopics({ recentTopics });

  saveStageData(issueId, Stage.TOPIC_SELECTION, { topics, mode: 'classic' });

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
