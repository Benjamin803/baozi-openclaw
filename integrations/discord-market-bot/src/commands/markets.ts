import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { SafeEmbedBuilder } from '../utils/embed';
import { Command } from './interface';
import { Market, RaceMarket } from '../types';

function isRaceMarket(market: Market | RaceMarket): market is RaceMarket {
  return (market as RaceMarket).outcomes !== undefined;
}

export const marketsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('markets')
    .setDescription('List markets')
    .addStringOption(option =>
      option.setName('status')
        .setDescription('Market status (Active, Closed, Resolved)')
        .setRequired(false)
        .addChoices(
          { name: 'Active', value: 'Active' },
          { name: 'Closed', value: 'Closed' },
          { name: 'Resolved', value: 'Resolved' }
        )
    ),
  execute: async (interaction, client) => {
    await interaction.deferReply();
    const status = interaction.options.getString('status') || 'Active';
    
    const markets = await client.getMarkets(status);
    
    if (markets.length === 0) {
      await interaction.editReply(`No ${status.toLowerCase()} markets found.`);
      return;
    }

    const embed = new SafeEmbedBuilder()
      .setTitle(`Baozi Markets (${status})`)
      .setColor('#0099ff')
      .setDescription(`Found ${markets.length} markets.`)
      .setFooter({ text: 'Powered by Baozi Prediction Markets' })
      .setTimestamp();

    for (const market of markets) {
      const closingDate = market.closingTime.toLocaleDateString();
      let value = '';
      
      if (isRaceMarket(market)) {
        value = `🏁 **Race** • Ends: ${closingDate}\nPool: ${market.totalPoolSol} SOL\nOutcomes: ${market.outcomes.length}`;
      } else {
        value = `⚖️ **Yes/No** • Ends: ${closingDate}\nPool: ${market.totalPoolSol} SOL • Yes: ${market.yesPercent}% / No: ${market.noPercent}%`;
      }
      
      embed.addFields({ name: market.question, value });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
