import { SlashCommandBuilder } from 'discord.js';
import { SafeEmbedBuilder } from '../utils/embed';
import { Command } from './interface';

export const portfolioCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('portfolio')
    .setDescription('View portfolio')
    .addStringOption(option =>
      option.setName('wallet')
        .setDescription('Wallet address')
        .setRequired(true)
    ),
  execute: async (interaction, client) => {
    await interaction.deferReply();
    const wallet = interaction.options.getString('wallet', true);
    
    const positions = await client.getPositions(wallet);
    
    if (positions.length === 0) {
      await interaction.editReply(`No positions found for wallet: ${wallet}`);
      return;
    }

    const embed = new SafeEmbedBuilder()
      .setTitle(`Portfolio: ${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`)
      .setColor('#ffcc00')
      .setDescription(`Found ${positions.length} active/historical positions.`)
      .setFooter({ text: 'Powered by Baozi Prediction Markets' })
      .setTimestamp();

    for (const pos of positions) {
      const status = pos.claimed ? 'Claimed' : 'Active';
      const side = pos.side;
      const amount = pos.totalAmountSol;
      
      embed.addFields({
        name: `Market #${pos.marketId}`,
        value: `Side: **${side}** • Amount: ${amount} SOL • Status: ${status}`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
