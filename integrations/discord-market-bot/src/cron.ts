import cron from 'node-cron';
import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { BaoziClient } from './client';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(__dirname, '../config/guilds.json');

export function startCronJobs(client: Client, baoziClient: BaoziClient) {
  // Check every minute
  cron.schedule('* * * * *', async () => {
    try {
      if (!fs.existsSync(CONFIG_PATH)) return;
      const fileContent = fs.readFileSync(CONFIG_PATH, 'utf8');
      if (!fileContent) return;
      
      const config = JSON.parse(fileContent);
      const now = new Date();
      // Use UTC
      const currentHour = now.getUTCHours().toString().padStart(2, '0');
      const currentMinute = now.getUTCMinutes().toString().padStart(2, '0');
      const currentTime = `${currentHour}:${currentMinute}`;

      for (const guildId in config) {
        const settings = config[guildId];
        if (settings.enabled && settings.time === currentTime) {
          try {
            const channel = await client.channels.fetch(settings.channelId) as TextChannel;
            if (channel) {
              const markets = await baoziClient.getHotMarkets(5);
              if (markets.length > 0) {
                 const embed = new EmbedBuilder()
                   .setTitle('🌤️ Daily Market Roundup')
                   .setDescription('Here are the hottest markets on Baozi today!')
                   .setColor('#0099ff')
                   .setTimestamp();

                 for (const m of markets) {
                   const closing = m.closingTime.toLocaleDateString();
                   embed.addFields({
                     name: m.question,
                     value: `Volume: **${m.totalPoolSol} SOL** • Ends: ${closing}\n[View Market](https://baozi.bet/market/${m.publicKey})`
                   });
                 }
                 
                 await channel.send({ embeds: [embed] });
                 console.log(`Sent daily roundup to guild ${guildId}`);
              }
            }
          } catch (err) {
            console.error(`Failed to send roundup for guild ${guildId}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Cron job error:', err);
    }
  });
}
