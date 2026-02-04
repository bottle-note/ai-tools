export interface AIProvider {
  generateJSON<T>(systemPrompt: string, userPrompt?: string): Promise<T>;
}

export type ProviderType = 'gemini' | 'claude' | 'openai';
