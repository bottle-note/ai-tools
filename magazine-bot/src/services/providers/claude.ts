import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from '../ai-provider.js';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generateJSON<T>(systemPrompt: string, userPrompt?: string): Promise<T> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt || 'Generate the requested content.' }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    // Extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    return JSON.parse(jsonMatch[1]!.trim()) as T;
  }
}
