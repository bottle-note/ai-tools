import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../config.js';
import type { AIProvider } from './ai-provider.js';
import { GeminiProvider } from './providers/gemini.js';
import { ClaudeProvider } from './providers/claude.js';
import { OpenAIProvider } from './providers/openai.js';

function createProvider(): AIProvider {
  switch (config.AI_PROVIDER) {
    case 'gemini':
      return new GeminiProvider(config.AI_API_KEY);
    case 'claude':
      return new ClaudeProvider(config.AI_API_KEY);
    case 'openai':
      return new OpenAIProvider(config.AI_API_KEY);
    default:
      return new GeminiProvider(config.AI_API_KEY);
  }
}

const provider = createProvider();

export interface Topic {
  title: string;
  subtitle: string;
  description: string;
  cardStructure: string[];
}

export interface Card {
  type: 'cover' | 'content' | 'closing';
  heading: string;
  body: string;
  imageRef?: string;
}

const PROMPTS_DIR = join(process.cwd(), 'src', 'prompts');

export function loadPrompt(name: string, vars?: Record<string, string>): string {
  const filePath = join(PROMPTS_DIR, `${name}.md`);
  let content = readFileSync(filePath, 'utf-8');

  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      content = content.replaceAll(`{{${key}}}`, value);
    }
  }

  // Handle simple {{#if var}}...{{/if}} blocks
  content = content.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, varName, block) => {
    return vars?.[varName] ? block : '';
  });

  return content;
}

export async function generateTopics(context?: { recentTopics?: string[] }): Promise<Topic[]> {
  const vars: Record<string, string> = {};
  if (context?.recentTopics?.length) {
    vars.recentTopics = context.recentTopics.map((t) => `- ${t}`).join('\n');
  }

  const systemPrompt = loadPrompt('topic-selection', vars);

  const parsed = await provider.generateJSON<{ topics: Topic[] }>(
    systemPrompt,
    '다음 매거진 이슈를 위한 주제 3가지를 제안해주세요.',
  );
  return parsed.topics;
}

export async function generateContent(topic: Topic): Promise<Card[]> {
  const vars: Record<string, string> = {
    title: topic.title,
    subtitle: topic.subtitle,
    description: topic.description,
    cardStructure: topic.cardStructure.map((c, i) => `${i + 1}. ${c}`).join('\n'),
  };

  const systemPrompt = loadPrompt('content-writing', vars);

  const parsed = await provider.generateJSON<{ cards: Card[] }>(
    systemPrompt,
    `"${topic.title}" 주제로 카드 콘텐츠를 작성해주세요. 카드 구조 가이드를 참고하여 적절한 장수로 구성하세요.`,
  );
  return parsed.cards;
}

export async function generateCaption(cards: Card[]): Promise<{ caption: string; hashtags: string[] }> {
  const contentSummary = cards
    .map((c) => `[${c.type}] ${c.heading}: ${c.body}`)
    .join('\n');

  const vars: Record<string, string> = { content: contentSummary };
  const systemPrompt = loadPrompt('caption', vars);

  return provider.generateJSON<{ caption: string; hashtags: string[] }>(
    systemPrompt,
    '이 매거진 콘텐츠에 맞는 인스타그램 캡션과 해시태그를 작성해주세요.',
  );
}
