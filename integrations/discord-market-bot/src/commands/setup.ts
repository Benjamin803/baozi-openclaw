import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { Command } from './interface';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(__dirname, '../../config/guilds.json');

export const setupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure daily roundup')
    .addChannelOption(option => 
      option.setName('channel')
        .setDescription('Channel for daily roundup')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('time')
        .setDescription('Time in UTC (HH:MM), e.g. 09:00')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: async (interaction, client) => {
    const channel = interaction.options.getChannel('channel');
    const time = interaction.options.getString('time') || '09:00';
    
    // Validate time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(time)) {
      await interaction.reply({ content: 'Invalid time format. Please use HH:MM (UTC).', ephemeral: true });
      return;
    }

    if (!interaction.guildId) {
       await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
       return;
    }

    // Load existing config
    let config: any = {};
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const fileContent = fs.readFileSync(CONFIG_PATH, 'utf8');
        if (fileContent) config = JSON.parse(fileContent);
      }
    } catch (err) {
      console.error('Error reading config:', err);
    }

    // Update config
    config[interaction.guildId] = {
      channelId: channel?.id,
      time,
      enabled: true
    };

    // Ensure directory exists
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    await interaction.reply(`Daily roundup configured for <#${channel?.id}> at ${time} UTC.`);
  },
};
