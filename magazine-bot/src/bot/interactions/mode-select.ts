import {
  ButtonInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
} from 'discord.js';
import { searchWhiskyTrends, searchByKeyword, type SearchResult } from '../../services/search.js';
import { saveStageData, getStageData } from '../../db/index.js';
import { Stage } from '../../workflow/machine.js';
import { handleTopicSelection } from '../../workflow/stages/topic-selection.js';

export type TopicMode = 'trend' | 'keyword' | 'classic';

function parseButtonId(customId: string): { mode: TopicMode; issueId: number; userId: string } | null {
  const match = customId.match(/^mode_(trend|keyword|classic)_(\d+)_(\d+)$/);
  if (!match) return null;
  return {
    mode: match[1] as TopicMode,
    issueId: parseInt(match[2], 10),
    userId: match[3],
  };
}

function parseSearchResultId(customId: string): { issueId: number; resultIndex: number; userId: string } | null {
  const match = customId.match(/^search_result_(\d+)_(\d+)_(\d+)$/);
  if (!match) return null;
  return {
    issueId: parseInt(match[1], 10),
    resultIndex: parseInt(match[2], 10),
    userId: match[3],
  };
}

async function showSearchResults(
  interaction: ButtonInteraction,
  issueId: number,
  userId: string,
  results: SearchResult[],
  mode: 'trend' | 'keyword',
): Promise<void> {
  if (results.length === 0) {
    await interaction.editReply({
      content: '검색 결과가 없습니다. 기존 방식으로 주제를 생성합니다...',
    });
    // Fallback to classic mode
    const channel = interaction.channel as TextChannel;
    await handleTopicSelection(issueId, channel, userId);
    return;
  }

  // Save search results for later use
  saveStageData(issueId, Stage.TOPIC_SELECTION, {
    mode,
    searchResults: results,
  });

  const embed = new EmbedBuilder()
    .setTitle(mode === 'trend' ? '🔥 최신 위스키 트렌드' : '🔍 검색 결과')
    .setDescription('아래 검색 결과 중 하나를 선택해주세요. 선택한 주제로 매거진 콘텐츠를 생성합니다.')
    .setColor(0xd4a574);

  results.forEach((result, index) => {
    const sourceInfo = result.publishedDate ? ` (${result.publishedDate})` : '';
    embed.addFields({
      name: `${index + 1}. ${result.title}`,
      value: `${result.description.slice(0, 150)}...\n🔗 ${result.source}${sourceInfo}`,
      inline: false,
    });
  });

  const buttons = results.map((_, index) =>
    new ButtonBuilder()
      .setCustomId(`search_result_${issueId}_${index}_${userId}`)
      .setLabel(`${index + 1}`)
      .setStyle(ButtonStyle.Primary)
  );

  // Add regenerate button
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`mode_trend_${issueId}_${userId}`)
      .setLabel('🔄 다시 검색')
      .setStyle(ButtonStyle.Secondary)
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5));
  const components = [row];

  if (buttons.length > 5) {
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(5));
    components.push(row2);
  }

  await interaction.editReply({
    content: `<@${userId}>`,
    embeds: [embed],
    components,
  });
}

export async function handleModeButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseButtonId(interaction.customId);
  if (!parsed) return;

  const { mode, issueId, userId } = parsed;

  if (mode === 'classic') {
    await interaction.update({
      content: '📝 기존 방식으로 주제를 생성합니다...',
      embeds: [],
      components: [],
    });
    const channel = interaction.channel as TextChannel;
    await handleTopicSelection(issueId, channel, userId);
    return;
  }

  if (mode === 'keyword') {
    const modal = new ModalBuilder()
      .setCustomId(`keyword_modal_${issueId}_${userId}`)
      .setTitle('키워드 입력');

    const keywordInput = new TextInputBuilder()
      .setCustomId('keyword_input')
      .setLabel('검색할 키워드를 입력하세요')
      .setPlaceholder('예: 버번, 피트, 아일라, 하이볼')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(keywordInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
    return;
  }

  if (mode === 'trend') {
    await interaction.update({
      content: '🔍 최신 위스키 트렌드를 검색하고 있습니다...',
      embeds: [],
      components: [],
    });

    try {
      const results = await searchWhiskyTrends();
      await showSearchResults(interaction, issueId, userId, results, 'trend');
    } catch (error) {
      console.error('Trend search failed:', error);
      await interaction.editReply({
        content: '검색 중 오류가 발생했습니다. 기존 방식으로 주제를 생성합니다...',
      });
      const channel = interaction.channel as TextChannel;
      await handleTopicSelection(issueId, channel, userId);
    }
  }
}

export async function handleKeywordModal(interaction: ModalSubmitInteraction): Promise<void> {
  const match = interaction.customId.match(/^keyword_modal_(\d+)_(\d+)$/);
  if (!match) return;

  const issueId = parseInt(match[1], 10);
  const userId = match[2];
  const keyword = interaction.fields.getTextInputValue('keyword_input');

  await interaction.deferReply();

  try {
    const results = await searchByKeyword(keyword);

    // Save keyword for later use
    const existingDataRow = getStageData(issueId, Stage.TOPIC_SELECTION);
    const existingData = existingDataRow ? JSON.parse(existingDataRow.data_json) : {};
    saveStageData(issueId, Stage.TOPIC_SELECTION, {
      ...existingData,
      mode: 'keyword',
      keyword,
      searchResults: results,
    });

    if (results.length === 0) {
      await interaction.editReply({
        content: `"${keyword}" 검색 결과가 없습니다. 기존 방식으로 주제를 생성합니다...`,
      });
      const channel = interaction.channel as TextChannel;
      await handleTopicSelection(issueId, channel, userId);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 "${keyword}" 검색 결과`)
      .setDescription('아래 검색 결과 중 하나를 선택해주세요.')
      .setColor(0xd4a574);

    results.forEach((result, index) => {
      const sourceInfo = result.publishedDate ? ` (${result.publishedDate})` : '';
      embed.addFields({
        name: `${index + 1}. ${result.title}`,
        value: `${result.description.slice(0, 150)}...\n🔗 ${result.source}${sourceInfo}`,
        inline: false,
      });
    });

    const buttons = results.map((_, index) =>
      new ButtonBuilder()
        .setCustomId(`search_result_${issueId}_${index}_${userId}`)
        .setLabel(`${index + 1}`)
        .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    await interaction.editReply({
      content: `<@${userId}>`,
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Keyword search failed:', error);
    await interaction.editReply({
      content: '검색 중 오류가 발생했습니다. 기존 방식으로 주제를 생성합니다...',
    });
    const channel = interaction.channel as TextChannel;
    await handleTopicSelection(issueId, channel, userId);
  }
}

export async function handleSearchResultButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseSearchResultId(interaction.customId);
  if (!parsed) return;

  const { issueId, resultIndex, userId } = parsed;

  await interaction.update({
    content: '✅ 선택한 주제로 콘텐츠를 생성합니다...',
    embeds: [],
    components: [],
  });

  const channel = interaction.channel as TextChannel;
  await handleTopicSelection(issueId, channel, userId, resultIndex);
}
