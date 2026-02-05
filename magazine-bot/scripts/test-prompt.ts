#!/usr/bin/env tsx
/**
 * 프롬프트 테스트 CLI
 *
 * 사용법:
 *   pnpm prompt                     # 기본 주제 생성
 *   pnpm prompt "버번 입문"          # 키워드로 주제 생성
 *   pnpm prompt --search "트렌드"   # 검색 기반 주제 생성
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

// Minimal config for testing (skip Discord validation)
const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini') as 'gemini' | 'claude' | 'openai';
const AI_API_KEY = process.env.AI_API_KEY;

if (!AI_API_KEY) {
  console.error('❌ AI_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Provider
// ─────────────────────────────────────────────────────────────────────────────

async function callAI(systemPrompt: string, userMessage: string): Promise<string> {
  if (AI_PROVIDER === 'gemini') {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${userMessage}` }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    return result.response.text();
  }

  if (AI_PROVIDER === 'claude') {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: AI_API_KEY });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text : '';
  }

  if (AI_PROVIDER === 'openai') {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: AI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    return response.choices[0]?.message?.content || '';
  }

  throw new Error(`Unknown provider: ${AI_PROVIDER}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Loader
// ─────────────────────────────────────────────────────────────────────────────

function loadPrompt(name: string, vars?: Record<string, string>): string {
  const filePath = join(process.cwd(), 'src', 'prompts', `${name}.md`);
  let content = readFileSync(filePath, 'utf-8');

  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      content = content.replaceAll(`{{${key}}}`, value);
    }
  }

  content = content.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, varName, block) => {
    return vars?.[varName] ? block : '';
  });

  return content;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pretty Print
// ─────────────────────────────────────────────────────────────────────────────

function printTopic(topic: any, index: number) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📌 주제 ${index + 1}: ${topic.title}`);
  console.log(`   ${topic.subtitle}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`📝 ${topic.description}\n`);

  console.log('📋 카드 구조:');
  topic.cardStructure?.forEach((card: string, i: number) => {
    console.log(`   ${i + 1}. ${card}`);
  });

  console.log('\n🎴 카드 상세:');
  topic.cards?.forEach((card: any, i: number) => {
    const typeEmoji: Record<string, string> = {
      cover: '🎬',
      description: '📖',
      whisky: '🥃',
      closing: '✨',
    };
    const emoji = typeEmoji[card.type] || '📄';
    console.log(`\n   ${emoji} [${card.type.toUpperCase()}] ${card.heading}`);
    console.log(`      ${card.body.replace(/\n/g, '\n      ')}`);
    if (card.tags?.length) {
      console.log(`      🏷️  ${card.tags.join(', ')}`);
    }
    if (card.imageRef) {
      console.log(`      🔗 ${card.imageRef}`);
    }
  });

  console.log('\n📸 캡션:');
  console.log(`   ${topic.caption?.replace(/\n/g, '\n   ')}`);

  console.log('\n#️⃣  해시태그:');
  console.log(`   ${topic.hashtags?.join(' ')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isSearchMode = args.includes('--search');
  const keyword = args.filter((a) => !a.startsWith('--')).join(' ');

  console.log(`\n🧪 프롬프트 테스트 (${AI_PROVIDER})`);
  console.log(`${'─'.repeat(60)}`);

  let systemPrompt: string;
  let userMessage: string;

  if (isSearchMode && keyword) {
    // 검색 기반 주제 생성 테스트
    console.log(`🔍 검색 모드: "${keyword}"`);
    systemPrompt = loadPrompt('topic-from-search', {
      searchTitle: keyword,
      searchUrl: 'https://example.com/trend',
      searchDescription: `${keyword}에 대한 트렌드 정보입니다.`,
      searchSource: '테스트',
    });
    userMessage = '주어진 검색 결과를 바탕으로 매거진 주제와 카드 콘텐츠를 작성해주세요.';
  } else if (keyword) {
    // 키워드 기반 주제 생성
    console.log(`🎯 키워드: "${keyword}"`);
    systemPrompt = loadPrompt('topic-selection');
    userMessage = `다음 키워드를 주제로 매거진 이슈를 위한 주제 1가지를 제안해주세요: "${keyword}". 카드 콘텐츠와 해시태그를 모두 포함해서 작성해주세요.`;
  } else {
    // 기본 주제 생성
    console.log('🎲 랜덤 주제 생성');
    systemPrompt = loadPrompt('topic-selection');
    userMessage =
      '다음 매거진 이슈를 위한 주제 1가지를 제안해주세요. 카드 콘텐츠와 해시태그를 모두 포함해서 작성해주세요.';
  }

  console.log('\n⏳ AI 호출 중...\n');

  try {
    const startTime = Date.now();
    const response = await callAI(systemPrompt, userMessage);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Parse JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || [null, response];
    const jsonStr = jsonMatch[1] || response;
    const parsed = JSON.parse(jsonStr);

    // Handle both single topic and topics array
    const topics = parsed.topics || (parsed.topic ? [parsed.topic] : [parsed]);

    topics.forEach((topic: any, i: number) => printTopic(topic, i));

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅ 완료 (${elapsed}s)`);

    // Raw JSON 출력 옵션
    if (args.includes('--raw')) {
      console.log('\n📦 Raw JSON:');
      console.log(JSON.stringify(parsed, null, 2));
    }
  } catch (error) {
    console.error('❌ 에러:', error);
    process.exit(1);
  }
}

main();
