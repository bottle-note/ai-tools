import { config } from './config.js';
import { client } from './bot/client.js';
import { ChatInputCommandInteraction, Events, Interaction } from 'discord.js';
import * as magazineStart from './bot/commands/magazine-start.js';
import { handleTopicButton } from './bot/interactions/topic-select.js';
import { handleContentButton, handleContentModal } from './bot/interactions/content-review.js';
import { handleImageButton, handleImageSelect } from './bot/interactions/image-collect.js';
import { handleLayoutButton } from './bot/interactions/layout-ready.js';
import { handleFinalButton } from './bot/interactions/final-complete.js';
import { createApiServer } from './api/server.js';
import { onLayoutComplete } from './services/figma-bridge.js';

const commands = new Map<string, {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}>();

commands.set(magazineStart.data.name, magazineStart);

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Slash commands
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) {
      console.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);
      const reply = { content: '명령 실행 중 오류가 발생했습니다.', ephemeral: true as const };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
    return;
  }

  // Button interactions
  if (interaction.isButton()) {
    try {
      const id = interaction.customId;
      if (id.startsWith('topic_')) {
        await handleTopicButton(interaction);
      } else if (id.startsWith('content_')) {
        await handleContentButton(interaction);
      } else if (id.startsWith('image_')) {
        await handleImageButton(interaction);
      } else if (id.startsWith('layout_')) {
        await handleLayoutButton(interaction);
      } else if (id.startsWith('final_')) {
        await handleFinalButton(interaction);
      }
    } catch (error) {
      console.error('Error handling button interaction:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '처리 중 오류가 발생했습니다.', ephemeral: true });
      }
    }
    return;
  }

  // Modal submissions
  if (interaction.isModalSubmit()) {
    try {
      const id = interaction.customId;
      if (id.startsWith('content_modal_')) {
        await handleContentModal(interaction);
      }
    } catch (error) {
      console.error('Error handling modal submission:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '처리 중 오류가 발생했습니다.', ephemeral: true });
      }
    }
    return;
  }

  // String select menu interactions
  if (interaction.isStringSelectMenu()) {
    try {
      const id = interaction.customId;
      if (id.startsWith('image_assign_')) {
        await handleImageSelect(interaction);
      }
    } catch (error) {
      console.error('Error handling select menu interaction:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '처리 중 오류가 발생했습니다.', ephemeral: true });
      }
    }
    return;
  }
});

// Start API server for Figma plugin bridge
createApiServer(config.API_PORT, (issueId: number) => {
  onLayoutComplete(issueId, client);
});

client.login(config.DISCORD_TOKEN);
