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

export interface Card {
  type: 'cover' | 'content' | 'closing';
  heading: string;
  body: string;
  imageRef?: string;
}

export interface Topic {
  title: string;
  subtitle: string;
  description: string;
  cardStructure: string[];
  cards: Card[];        // 카드 콘텐츠 (AI 호출 통합)
  caption: string;      // 인스타그램 캡션 (AI 호출 통합)
  hashtags: string[];   // 해시태그 (AI 호출 통합)
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
    '다음 매거진 이슈를 위한 주제 3가지를 제안해주세요. 각 주제마다 카드 콘텐츠와 해시태그를 모두 포함해서 작성해주세요.',
  );
  return parsed.topics;
}
