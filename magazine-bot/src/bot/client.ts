import { Client, GatewayIntentBits } from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', (c) => {
  console.log(`Bot ready as ${c.user.tag}`);
});
