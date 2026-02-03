import { type TextChannel, type Message, AttachmentBuilder } from 'discord.js';
import type { Card } from './ai.js';

const MIDJOURNEY_BOT_ID = '936929561302675456';

export interface MJImage {
  url: string;
  messageId: string;
  timestamp: Date;
}

/**
 * Build Midjourney prompts from approved cards
 */
export function buildPrompts(cards: Card[]): string[] {
  const prompts: string[] = [];

  for (const card of cards) {
    // Only generate prompts for cards with mjKeywords
    if (!card.mjKeywords) continue;

    const basePrompt = `${card.mjKeywords}, whiskey photography, dark moody lighting, editorial magazine style --ar 4:5 --v 6 --style raw`;

    // Cover card gets extra styling
    if (card.type === 'cover') {
      prompts.push(`${card.mjKeywords}, magazine cover layout, whiskey photography, dark moody lighting, editorial magazine style --ar 4:5 --v 6 --style raw`);
    } else {
      prompts.push(basePrompt);
    }
  }

  return prompts;
}

/**
 * Collect upscaled images from Midjourney channel since a given date
 */
export async function collectImages(channel: TextChannel, since: Date): Promise<MJImage[]> {
  const images: MJImage[] = [];
  let lastMessageId: string | undefined;

  // Fetch messages in batches
  while (true) {
    const options: { limit: number; before?: string } = { limit: 100 };
    if (lastMessageId) {
      options.before = lastMessageId;
    }

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    for (const [_, message] of messages) {
      // Stop if we've gone past the "since" timestamp
      if (message.createdAt < since) {
        return sortAndDedupe(images);
      }

      // Only process messages from Midjourney bot
      if (message.author.id !== MIDJOURNEY_BOT_ID) continue;

      // Extract images from attachments
      for (const attachment of message.attachments.values()) {
        // Filter for upscaled images (not the 4-grid preview)
        // Upscaled images are typically larger and don't have "_grid_" in filename
        if (
          attachment.contentType?.startsWith('image/') &&
          !attachment.name?.includes('_grid_') &&
          attachment.width &&
          attachment.width > 1024
        ) {
          images.push({
            url: attachment.url,
            messageId: message.id,
            timestamp: message.createdAt,
          });
        }
      }

      // Also check embeds for images
      for (const embed of message.embeds) {
        if (embed.image?.url) {
          images.push({
            url: embed.image.url,
            messageId: message.id,
            timestamp: message.createdAt,
          });
        }
      }
    }

    lastMessageId = messages.last()?.id;

    // Safety break if we've fetched too many batches
    if (images.length > 500) break;
  }

  return sortAndDedupe(images);
}

/**
 * Sort images by timestamp (newest first) and remove duplicates by URL
 */
function sortAndDedupe(images: MJImage[]): MJImage[] {
  const seen = new Set<string>();
  const unique: MJImage[] = [];

  // Sort newest first
  images.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  for (const image of images) {
    if (!seen.has(image.url)) {
      seen.add(image.url);
      unique.push(image);
    }
  }

  return unique;
}
