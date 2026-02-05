import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  type TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getActiveIssue, updateIssueStage, createIssue, updateIssueThread, updateIssueThreadUrl } from '../../db/index.js';

function cancelIssue(id: number): void {
  updateIssueStage(id, 'COMPLETE');
}

export const data = new SlashCommandBuilder()
  .setName('magazine-start')
  .setDescription('새로운 매거진 이슈를 시작합니다');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const active = getActiveIssue(channelId);

  if (active) {
    cancelIssue(active.id);
  }

  // Reply to the interaction
  await interaction.reply(`매거진 이슈를 시작합니다...`);

  // Create issue first without thread
  const issue = createIssue(channelId);

  // Create thread
  const channel = interaction.channel as TextChannel;
  const thread = await channel.threads.create({
    name: `매거진 #${issue.issue_number} — 주제선정`,
    autoArchiveDuration: 10080, // 7 days
  });

  // Update issue with thread ID and URL
  updateIssueThread(issue.id, thread.id);
  const threadUrl = `https://discord.com/channels/${interaction.guildId}/${thread.id}`;
  updateIssueThreadUrl(issue.id, threadUrl);

  // Show mode selection buttons
  const embed = new EmbedBuilder()
    .setTitle('📰 매거진 주제 선정 모드')
    .setDescription('주제를 어떻게 찾을지 선택해주세요.')
    .addFields(
      { name: '🔥 트렌드 기반', value: '최신 위스키 뉴스와 트렌드를 검색합니다', inline: false },
      { name: '🔍 키워드 입력', value: '원하는 키워드로 관련 정보를 검색합니다', inline: false },
      { name: '📝 기존 방식', value: 'AI가 자유롭게 주제를 생성합니다', inline: false },
    )
    .setColor(0xd4a574);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`mode_trend_${issue.id}_${interaction.user.id}`)
      .setLabel('🔥 트렌드')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`mode_keyword_${issue.id}_${interaction.user.id}`)
      .setLabel('🔍 키워드')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`mode_classic_${issue.id}_${interaction.user.id}`)
      .setLabel('📝 기존')
      .setStyle(ButtonStyle.Secondary),
  );

  await thread.send({
    content: `<@${interaction.user.id}>`,
    embeds: [embed],
    components: [row],
  });
}
