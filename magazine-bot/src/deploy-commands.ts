import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { data as magazineStartData } from './bot/commands/magazine-start.js';
import { data as magazineRetryData } from './bot/commands/magazine-retry.js';
import { data as magazineResetData } from './bot/commands/magazine-reset.js';
import { data as magazineCancelData } from './bot/commands/magazine-cancel.js';

const commands = [
  magazineStartData.toJSON(),
  magazineRetryData.toJSON(),
  magazineResetData.toJSON(),
  magazineCancelData.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

async function deploy() {
  try {
    console.log(`Registering ${commands.length} slash commands...`);

    await rest.put(
      Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
      { body: commands }
    );

    console.log('Commands registered successfully.');
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
}

deploy();
