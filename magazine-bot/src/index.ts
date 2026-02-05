import { config } from './config.js';
import { client } from './bot/client.js';
import { ChatInputCommandInteraction, Events, Interaction, type ThreadChannel } from 'discord.js';
import * as magazineStart from './bot/commands/magazine-start.js';
import * as magazineRetry from './bot/commands/magazine-retry.js';
import * as magazineReset from './bot/commands/magazine-reset.js';
import * as magazineCancel from './bot/commands/magazine-cancel.js';
import { handleTopicButton } from './bot/interactions/topic-select.js';
import { handleModeButton, handleKeywordModal, handleSearchResultButton } from './bot/interactions/mode-select.js';
import { handleContentButton, handleContentModal } from './bot/interactions/content-review.js';
import { handleLayoutButton } from './bot/interactions/layout-ready.js';
import { handleFinalButton } from './bot/interactions/final-complete.js';
import { createApiServer } from './api/server.js';
import { onLayoutComplete } from './services/figma-bridge.js';
import { getIssue, updateIssueStage, markErrorResolved, getUnresolvedErrors } from './db/index.js';
import { Stage } from './workflow/machine.js';

const commands = new Map<string, {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}>();

commands.set(magazineStart.data.name, magazineStart);
commands.set(magazineRetry.data.name, magazineRetry);
commands.set(magazineReset.data.name, magazineReset);
commands.set(magazineCancel.data.name, magazineCancel);

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
      if (id.startsWith('mode_')) {
        await handleModeButton(interaction);
      } else if (id.startsWith('search_result_')) {
        await handleSearchResultButton(interaction);
      } else if (id.startsWith('topic_')) {
        await handleTopicButton(interaction);
      } else if (id.startsWith('content_')) {
        await handleContentButton(interaction);
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
      if (id.startsWith('keyword_modal_')) {
        await handleKeywordModal(interaction);
      } else if (id.startsWith('content_modal_')) {
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

  // String Select Menu interactions
  if (interaction.isStringSelectMenu()) {
    try {
      if (interaction.customId === 'cancel_issue_select') {
        const issueId = parseInt(interaction.values[0], 10);
        const issue = getIssue(issueId);

        if (!issue || issue.stage === Stage.COMPLETE) {
          await interaction.update({
            content: '이슈를 찾을 수 없거나 이미 완료되었습니다.',
            embeds: [],
            components: [],
          });
          return;
        }

        updateIssueStage(issue.id, Stage.COMPLETE);
        const unresolvedErrors = getUnresolvedErrors(issue.id);
        for (const error of unresolvedErrors) {
          markErrorResolved(error.id);
        }

        await interaction.update({
          content: `🚫 이슈 #${issue.id}이(가) 취소되었습니다.`,
          embeds: [],
          components: [],
        });

        if (issue.thread_id) {
          try {
            const thread = await client.channels.fetch(issue.thread_id) as ThreadChannel;
            if (thread && thread.isThread()) {
              await thread.setName(`매거진 #${issue.issue_number} — ❌ 취소됨`);
            }
          } catch (error) {
            console.error('Failed to update thread name:', error);
          }
        }
      } else if (interaction.customId === 'reset_issue_select') {
        const [issueIdStr, targetStage] = interaction.values[0].split('_');
        const issueId = parseInt(issueIdStr, 10);
        const issue = getIssue(issueId);

        if (!issue || issue.stage === Stage.COMPLETE) {
          await interaction.update({
            content: '이슈를 찾을 수 없거나 이미 완료되었습니다.',
            embeds: [],
            components: [],
          });
          return;
        }

        updateIssueStage(issue.id, targetStage);
        const unresolvedErrors = getUnresolvedErrors(issue.id);
        for (const error of unresolvedErrors) {
          markErrorResolved(error.id);
        }

        const stageNames: Record<string, string> = {
          [Stage.TOPIC_SELECTION]: '주제선정',
          [Stage.CONTENT_WRITING]: '콘텐츠작성',
          [Stage.FIGMA_LAYOUT]: '피그마레이아웃',
          [Stage.FINAL_OUTPUT]: '최종산출물',
        };
        const stageName = stageNames[targetStage] || targetStage;

        await interaction.update({
          content: `✅ 이슈 #${issue.id}이(가) **${stageName}** 단계로 리셋되었습니다.\n\`/magazine-retry\` 명령어로 해당 단계를 실행할 수 있습니다.`,
          embeds: [],
          components: [],
        });

        if (issue.thread_id) {
          try {
            const thread = await client.channels.fetch(issue.thread_id) as ThreadChannel;
            if (thread && thread.isThread()) {
              await thread.setName(`매거진 #${issue.issue_number} — ${stageName}`);
            }
          } catch (error) {
            console.error('Failed to update thread name:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error handling select menu:', error);
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
