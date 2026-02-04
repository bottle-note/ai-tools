import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { getIssue, getStageData, approveStageData, saveStageData } from '../../db/index.js';
import { advanceStage } from '../../workflow/engine.js';
import { Stage } from '../../workflow/machine.js';
import { handleContentWriting } from '../../workflow/stages/content-writing.js';
import { executeWithRetry } from '../../workflow/recovery.js';
import type { Card, Topic } from '../../services/ai.js';

export async function handleContentButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  const issueId = parseInt(customId.split('_').pop()!, 10);

  const issue = getIssue(issueId);
  if (!issue) {
    await interaction.reply({ content: '이슈를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  if (issue.stage !== Stage.CONTENT_WRITING) {
    await interaction.reply({ content: '현재 콘텐츠 작성 단계가 아닙니다.', ephemeral: true });
    return;
  }

  const channel = interaction.channel as TextChannel;

  const stageData = getStageData(issueId, Stage.CONTENT_WRITING);
  if (!stageData) {
    await interaction.reply({ content: '콘텐츠 데이터를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  const { cards, topic } = JSON.parse(stageData.data_json) as { cards: Card[]; topic: Topic };

  // Approve
  if (customId.startsWith('content_approve_')) {
    await interaction.deferUpdate();
    approveStageData(stageData.id);
    await interaction.message.edit({ components: [] });
    await channel.send('✅ 콘텐츠가 승인되었습니다. Figma 레이아웃을 준비합니다.');
    await advanceStage(issueId);

    // Trigger figma layout stage
    const { handleFigmaLayout } = await import('../../workflow/stages/figma-layout.js');
    await handleFigmaLayout(issueId, channel);
    return;
  }

  // Regenerate
  if (customId.startsWith('content_regenerate_')) {
    await interaction.deferUpdate();
    await interaction.message.delete().catch(() => {});

    try {
      await executeWithRetry(
        issueId,
        Stage.CONTENT_WRITING,
        () => handleContentWriting(issueId, channel, topic),
        async (attempt, maxRetries, _error, nextDelayMs) => {
          await channel.send(
            `⚠️ 콘텐츠 재생성 중 오류 발생. 재시도 중... (${attempt}/${maxRetries})\n` +
            `다음 시도까지 ${Math.round(nextDelayMs / 1000)}초`
          );
        }
      );
    } catch (error) {
      await channel.send(
        `❌ 콘텐츠 재생성에 실패했습니다: ${(error as Error).message}\n` +
        `\`/magazine-retry\` 명령어로 재시도하거나 관리자에게 문의하세요.`
      );
    }
    return;
  }

  // Edit - show modal with first 5 cards (Discord modal limit is 5 text inputs)
  if (customId.startsWith('content_edit_')) {
    const modal = new ModalBuilder()
      .setCustomId(`content_modal_${issueId}`)
      .setTitle('카드 콘텐츠 수정');

    const inputs = cards.slice(0, 5).map((card: Card, i: number) => {
      const label = `카드 ${i + 1} (${card.type})`;
      return new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`card_${i}`)
          .setLabel(label.substring(0, 45))
          .setStyle(TextInputStyle.Paragraph)
          .setValue(`${card.heading}\n---\n${card.body}`)
          .setRequired(true),
      );
    });

    modal.addComponents(...inputs);
    await interaction.showModal(modal);
    return;
  }
}

function buildContentEmbeds(cards: Card[]): EmbedBuilder[] {
  return cards.map((card: Card, index: number) => {
    const typeLabel =
      card.type === 'cover' ? '📕 커버' : card.type === 'closing' ? '📗 마무리' : '📄 본문';

    const embed = new EmbedBuilder()
      .setTitle(`${typeLabel} | 카드 ${index + 1}`)
      .addFields(
        { name: '제목', value: card.heading, inline: false },
        { name: '본문', value: card.body, inline: false },
      )
      .setColor(card.type === 'cover' ? 0xd4a574 : card.type === 'closing' ? 0x8b6914 : 0xf5e6d0);

    if (card.imageRef) {
      embed.setFooter({ text: `🔗 ${card.imageRef}` });
    }

    return embed;
  });
}

export async function handleContentModal(interaction: ModalSubmitInteraction): Promise<void> {
  const issueId = parseInt(interaction.customId.split('_').pop()!, 10);

  const stageData = getStageData(issueId, Stage.CONTENT_WRITING);
  if (!stageData) {
    await interaction.reply({ content: '콘텐츠 데이터를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  const { cards, topic } = JSON.parse(stageData.data_json) as { cards: Card[]; topic: Topic };

  // Update cards from modal fields
  for (let i = 0; i < Math.min(5, cards.length); i++) {
    const value = interaction.fields.getTextInputValue(`card_${i}`);
    const separatorIndex = value.indexOf('---');
    if (separatorIndex !== -1) {
      cards[i].heading = value.substring(0, separatorIndex).trim();
      cards[i].body = value.substring(separatorIndex + 3).trim();
    } else {
      cards[i].body = value.trim();
    }
  }

  // Save updated cards
  saveStageData(issueId, Stage.CONTENT_WRITING, { cards, topic });

  await interaction.deferUpdate();

  const channel = interaction.channel as TextChannel;

  const embeds = buildContentEmbeds(cards);

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

  await channel.send({ content: '📝 수정된 콘텐츠:', embeds, components: [row] });
}
