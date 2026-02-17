import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command } from './interface';
import { RaceMarket } from '../types';

function isRaceMarket(market: any): market is RaceMarket {
  return (market as RaceMarket).outcomes !== undefined;
}

export const raceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('race')
    .setDescription('List active race markets'),
  execute: async (interaction, client) => {
    await interaction.deferReply();
    const markets = await client.getMarkets('Active');
    const raceMarkets = markets.filter(isRaceMarket);

    if (raceMarkets.length === 0) {
      await interaction.editReply('No active race markets found.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🏁 Active Race Markets')
      .setColor('#ffcc00')
      .setFooter({ text: 'Baozi Prediction Markets' })
      .setTimestamp();

    for (const market of raceMarkets.slice(0, 5)) { // Limit to 5
      let outcomesText = '';
      // Show top 3 outcomes
      const topOutcomes = [...market.outcomes].sort((a, b) => b.percent - a.percent).slice(0, 3);
      for (const outcome of topOutcomes) {
        outcomesText += `• **${outcome.label}**: ${outcome.percent}%\n`;
      }
      if (market.outcomes.length > 3) outcomesText += `...and ${market.outcomes.length - 3} more\n`;

      embed.addFields({
        name: market.question,
        value: `Ends: ${market.closingTime.toLocaleDateString()}\nPool: ${market.totalPoolSol} SOL\n${outcomesText}`,
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
  },
};
