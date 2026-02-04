import { SlashCommandBuilder, ChatInputCommandInteraction, type TextChannel, type ThreadChannel } from 'discord.js';
import { getActiveIssue, getIssue, getStageData, markErrorResolved, getUnresolvedErrors } from '../../db/index.js';
import { Stage } from '../../workflow/machine.js';
import { executeWithRetry } from '../../workflow/recovery.js';
import { client } from '../client.js';

export const data = new SlashCommandBuilder()
  .setName('magazine-retry')
  .setDescription('현재 단계를 재시도합니다')
  .addIntegerOption(option =>
    option
      .setName('issue_id')
      .setDescription('이슈 ID (선택사항, 미지정 시 현재 채널의 활성 이슈)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const specifiedIssueId = interaction.options.getInteger('issue_id');

  let issue = specifiedIssueId
    ? getIssue(specifiedIssueId)
    : getActiveIssue(channelId);

  if (!issue) {
    await interaction.reply({
      content: specifiedIssueId
        ? `이슈 #${specifiedIssueId}을(를) 찾을 수 없습니다.`
        : '현재 채널에 활성 이슈가 없습니다.',
      ephemeral: true,
    });
    return;
  }

  if (issue.stage === Stage.COMPLETE) {
    await interaction.reply({
      content: '이 이슈는 이미 완료되었습니다.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  // Get the channel/thread to send messages to
  const targetChannelId = issue.thread_id || issue.channel_id;
  const channel = await client.channels.fetch(targetChannelId) as TextChannel | ThreadChannel;

  if (!channel) {
    await interaction.editReply('채널을 찾을 수 없습니다.');
    return;
  }

  // Mark any unresolved errors as resolved since we're manually retrying
  const unresolvedErrors = getUnresolvedErrors(issue.id);
  for (const error of unresolvedErrors) {
    markErrorResolved(error.id);
  }

  const currentStage = issue.stage as Stage;

  await interaction.editReply(`🔄 이슈 #${issue.id}의 **${getStageKoreanName(currentStage)}** 단계를 재시도합니다...`);

  try {
    switch (currentStage) {
      case Stage.TOPIC_SELECTION: {
        const { handleTopicSelection } = await import('../../workflow/stages/topic-selection.js');
        await executeWithRetry(
          issue.id,
          currentStage,
          () => handleTopicSelection(issue!.id, channel as TextChannel, interaction.user.id),
        );
        break;
      }

      case Stage.CONTENT_WRITING: {
        const topicData = getStageData(issue.id, Stage.TOPIC_SELECTION);
        if (!topicData) {
          await channel.send('❌ 주제 데이터를 찾을 수 없습니다. 처음부터 다시 시작해주세요.');
          return;
        }
        const { selectedTopic } = JSON.parse(topicData.data_json);
        if (!selectedTopic) {
          await channel.send('❌ 선택된 주제가 없습니다. 주제를 먼저 선택해주세요.');
          return;
        }

        const { handleContentWriting } = await import('../../workflow/stages/content-writing.js');
        await executeWithRetry(
          issue.id,
          currentStage,
          () => handleContentWriting(issue!.id, channel as TextChannel, selectedTopic),
        );
        break;
      }

      case Stage.FIGMA_LAYOUT: {
        const { handleFigmaLayout } = await import('../../workflow/stages/figma-layout.js');
        await handleFigmaLayout(issue.id, channel as TextChannel);
        break;
      }

      case Stage.FINAL_OUTPUT: {
        const { handleFinalOutput } = await import('../../workflow/stages/final-output.js');
        await handleFinalOutput(issue.id, channel as TextChannel);
        break;
      }

      default:
        await channel.send(`❌ 알 수 없는 단계입니다: ${currentStage}`);
    }
  } catch (error) {
    await channel.send(`❌ 재시도 실패: ${(error as Error).message}`);
  }
}

function getStageKoreanName(stage: Stage): string {
  const names: Record<Stage, string> = {
    [Stage.TOPIC_SELECTION]: '주제 선정',
    [Stage.CONTENT_WRITING]: '콘텐츠 작성',
    [Stage.FIGMA_LAYOUT]: 'Figma 레이아웃',
    [Stage.FINAL_OUTPUT]: '최종 산출물',
    [Stage.COMPLETE]: '완료',
  };
  return names[stage] || stage;
}
