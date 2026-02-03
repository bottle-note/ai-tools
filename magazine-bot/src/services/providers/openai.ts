import OpenAI from 'openai';
import type { AIProvider } from '../ai-provider.js';

export class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model = 'gpt-4o') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateJSON<T>(systemPrompt: string, userPrompt?: string): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt || 'Generate the requested content.' },
      ],
    });
    return JSON.parse(response.choices[0].message.content || '{}') as T;
  }
}
