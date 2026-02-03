import {
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
} from 'discord.js';
import { getIssue, getStageData, approveStageData, saveStageData } from '../../db/index.js';
import { advanceStage } from '../../workflow/engine.js';
import { Stage } from '../../workflow/machine.js';
import { collectImages, buildPrompts } from '../../services/midjourney.js';
import { generateContent, type Card } from '../../services/ai.js';
import { config } from '../../config.js';
import { client } from '../client.js';

interface ImageStageData {
  cards: Card[];
  prompts: string[];
  imageMapping: Record<number, string>;
}

export async function handleImageButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  const issueId = parseInt(customId.split('_').pop()!, 10);

  const issue = getIssue(issueId);
  if (!issue) {
    await interaction.reply({ content: '이슈를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  if (issue.stage !== Stage.IMAGE_GENERATION) {
    await interaction.reply({ content: '현재 이미지 생성 단계가 아닙니다.', ephemeral: true });
    return;
  }

  const channel = interaction.channel as TextChannel;

  // Get stage data
  const stageData = getStageData(issueId, Stage.IMAGE_GENERATION);
  if (!stageData) {
    await interaction.reply({ content: '이미지 생성 데이터를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  const imageData = JSON.parse(stageData.data_json) as ImageStageData;

  // Regenerate prompts (re-generate mjKeywords via OpenAI)
  if (customId.startsWith('image_regenerate_')) {
    await interaction.deferUpdate();
    await interaction.message.delete().catch(() => {});

    // Get topic from content writing stage
    const contentData = getStageData(issueId, Stage.CONTENT_WRITING);
    if (!contentData) {
      await channel.send('❌ 콘텐츠 데이터를 찾을 수 없습니다.');
      return;
    }

    const { topic } = JSON.parse(contentData.data_json);

    // Re-generate content to get fresh mjKeywords
    const statusMsg = await channel.send('🔄 새로운 프롬프트를 생성하고 있습니다...');
    const newCards = await generateContent(topic);

    // Build new prompts
    const newPrompts = buildPrompts(newCards);

    // Save updated data
    saveStageData(issueId, Stage.IMAGE_GENERATION, {
      cards: newCards,
      prompts: newPrompts,
      imageMapping: {},
    });

    await statusMsg.delete().catch(() => {});

    // Show new prompts
    const { handleImageGeneration } = await import('../../workflow/stages/image-generation.js');
    await handleImageGeneration(issueId, channel);
    return;
  }

  // Collect images from Midjourney channel
  if (customId.startsWith('image_collect_')) {
    await interaction.deferReply();

    // Get MJ channel
    const mjChannel = await client.channels.fetch(config.MJ_CHANNEL_ID);
    if (!mjChannel || !mjChannel.isTextBased()) {
      await interaction.editReply('❌ Midjourney 채널을 찾을 수 없습니다.');
      return;
    }

    // Collect images since issue creation
    const sinceDate = new Date(issue.created_at);
    const images = await collectImages(mjChannel as TextChannel, sinceDate);

    if (images.length === 0) {
      await interaction.editReply(
        '❌ 이미지를 찾을 수 없습니다. Midjourney에서 이미지를 생성한 후 다시 시도해주세요.',
      );
      return;
    }

    // Show collected images
    await interaction.editReply(`✅ ${images.length}개의 이미지를 찾았습니다.`);

    // Show images as embeds with thumbnails (max 10 per message due to Discord limits)
    const imageEmbeds = images.slice(0, 10).map((img, idx) =>
      new EmbedBuilder()
        .setTitle(`이미지 ${idx + 1}`)
        .setImage(img.url)
        .setColor(0x5865f2)
        .setFooter({ text: `Message ID: ${img.messageId}` }),
    );

    await channel.send({ embeds: imageEmbeds });

    // Create select menus for each card that needs an image
    const cardsWithImages = imageData.cards.filter((c) => c.mjKeywords);

    for (let i = 0; i < cardsWithImages.length; i++) {
      const card = cardsWithImages[i];
      const cardIndex = imageData.cards.indexOf(card);
      const cardLabel = card.type === 'cover' ? '커버' : `카드 ${cardIndex + 1}`;

      const options = images.slice(0, 25).map((img, idx) => ({
        label: `이미지 ${idx + 1}`,
        value: img.url,
        description: `Message: ${img.messageId.slice(0, 20)}...`,
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`image_assign_${issueId}_${cardIndex}`)
        .setPlaceholder(`${cardLabel}에 사용할 이미지를 선택하세요`)
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      await channel.send({
        content: `**${cardLabel}** - ${card.heading}`,
        components: [row],
      });
    }

    // Add completion button
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`image_complete_${issueId}`)
        .setLabel('✅ 매핑 완료')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`image_collect_${issueId}`)
        .setLabel('🔄 다시 수집')
        .setStyle(ButtonStyle.Secondary),
    );

    await channel.send({ content: '모든 카드에 이미지를 지정한 후 매핑 완료 버튼을 눌러주세요.', components: [buttonRow] });
    return;
  }

  // Complete image assignment
  if (customId.startsWith('image_complete_')) {
    await interaction.deferUpdate();

    // Verify all cards have images assigned
    const cardsWithImages = imageData.cards.filter((c) => c.mjKeywords);
    const missingImages = cardsWithImages.filter((c) => {
      const cardIndex = imageData.cards.indexOf(c);
      return !imageData.imageMapping[cardIndex];
    });

    if (missingImages.length > 0) {
      await interaction.followUp({
        content: '❌ 모든 카드에 이미지를 지정해주세요.',
        ephemeral: true,
      });
      return;
    }

    // Approve stage and advance
    approveStageData(stageData.id);
    await interaction.message.edit({ components: [] });
    await channel.send('✅ 이미지 매핑이 완료되었습니다. Figma 레이아웃 단계로 넘어갑니다.');
    advanceStage(issueId);

    // Trigger Figma layout stage
    const { handleFigmaLayout } = await import('../../workflow/stages/figma-layout.js');
    await handleFigmaLayout(issueId, channel);
    return;
  }
}

export async function handleImageSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const customId = interaction.customId;
  const parts = customId.split('_');
  const issueId = parseInt(parts[2], 10);
  const cardIndex = parseInt(parts[3], 10);

  const stageData = getStageData(issueId, Stage.IMAGE_GENERATION);
  if (!stageData) {
    await interaction.reply({ content: '이미지 생성 데이터를 찾을 수 없습니다.', ephemeral: true });
    return;
  }

  const imageData = JSON.parse(stageData.data_json) as ImageStageData;

  // Store the selected image URL for this card
  const selectedImageUrl = interaction.values[0];
  imageData.imageMapping[cardIndex] = selectedImageUrl;

  // Save updated mapping
  saveStageData(issueId, Stage.IMAGE_GENERATION, imageData);

  await interaction.deferUpdate();
  await interaction.message.edit({
    content: `${interaction.message.content}\n✅ 이미지가 지정되었습니다.`,
    components: [],
  });
}
