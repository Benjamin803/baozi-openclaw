import axios from 'axios';
import fs from 'fs';
import path from 'path';
import config from './config';

const ALERT_LOG = path.join(process.cwd(), 'alerts.log');

export interface Notification {
  message: string;
  type: 'info' | 'warning' | 'alert';
  timestamp: Date;
  marketId?: string;
  walletAddress?: string;
}

export class Notifier {
  private webhookUrl: string;
  private alertCount: number = 0;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(notification: Notification): Promise<void> {
    this.alertCount++;

    // Always log to file for proof
    const logEntry = JSON.stringify({
      alertNumber: this.alertCount,
      type: notification.type,
      message: notification.message,
      marketId: notification.marketId || null,
      wallet: notification.walletAddress || null,
      timestamp: notification.timestamp.toISOString(),
    }) + '\n';

    fs.appendFileSync(ALERT_LOG, logEntry);
    console.log(`[ALERT #${this.alertCount}] [${notification.type.toUpperCase()}] ${notification.message}`);

    // Send to webhook if configured
    if (this.webhookUrl) {
      try {
        const payload = {
          content: `**[${notification.type.toUpperCase()}]** ${notification.message}`,
          embeds: [{
            title: notification.type === 'alert' ? '🚨 ALERT' : (notification.type === 'warning' ? '⚠️ WARNING' : 'ℹ️ INFO'),
            description: notification.message,
            color: notification.type === 'alert' ? 0xff0000 : (notification.type === 'warning' ? 0xffcc00 : 0x00ccff),
            timestamp: notification.timestamp.toISOString(),
            fields: [
              { name: 'Market ID', value: notification.marketId || 'N/A', inline: true },
              { name: 'Wallet', value: notification.walletAddress ? notification.walletAddress.slice(0, 8) + '...' : 'N/A', inline: true },
            ],
            footer: { text: `Baozi Claim & Alert Agent • Alert #${this.alertCount}` },
          }]
        };
        await axios.post(this.webhookUrl, payload);
      } catch (error: any) {
        console.error('[Notifier] Webhook error:', error.message || error);
      }
    }
  }

  getAlertCount(): number {
    return this.alertCount;
  }
}
