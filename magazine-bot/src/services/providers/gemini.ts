import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider } from '../ai-provider.js';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model = 'gemini-2.5-flash') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  async generateJSON<T>(systemPrompt: string, userPrompt?: string): Promise<T> {
    const model = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const prompt = userPrompt ? `${systemPrompt}\n\n${userPrompt}` : systemPrompt;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text) as T;
  }
}
