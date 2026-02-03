import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1),
  AI_PROVIDER: z.enum(['gemini', 'claude', 'openai']).default('gemini'),
  AI_API_KEY: z.string().min(1),
  MJ_CHANNEL_ID: z.string().min(1),
  MAGAZINE_CHANNEL_ID: z.string().min(1),
  FIGMA_FILE_KEY: z.string().optional(),
  API_PORT: z.coerce.number().default(3000),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
