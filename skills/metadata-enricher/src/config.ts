import * as dotenv from 'dotenv';
dotenv.config();

export const config = {
  apiUrl: process.env.BAOZI_API_URL || 'https://baozi.bet/api',
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  walletAddress: process.env.WALLET_ADDRESS || 'FyzVsqsBnUoDVchFU4y5tS7ptvi5onfuFcm9iSC1ChMz',
  privateKey: process.env.PRIVATE_KEY || '',
  enrichIntervalMinutes: parseInt(process.env.ENRICH_INTERVAL_MINUTES || '120', 10),
};
