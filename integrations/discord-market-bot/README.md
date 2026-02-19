# Discord Market Bot (Bounty #10)

Discord bot with slash commands for browsing Baozi prediction markets with rich embeds.

**Invite:** [Add to Discord](https://discord.com/api/oauth2/authorize?client_id=1473426190977990678&permissions=2147483648&scope=bot%20applications.commands)
**Wallet:** `FyzVsqsBnUoDVchFU4y5tS7ptvi5onfuFcm9iSC1ChMz`
**Bounty:** #10 (1.0 SOL)

## Commands
- `/markets` — List active markets with odds and pool sizes
- `/odds <id>` — Detailed odds display with progress bars
- `/portfolio <wallet>` — Portfolio positions via Solana RPC buffer decoding
- `/hot` — Top markets by volume
- `/closing` — Markets closing within 24h
- `/race` — Race markets with multi-outcome display
- `/setup` — Admin: configure daily roundup channel

## Features
- Real-time data from `baozi.bet/api/markets` (64 mainnet markets)
- Rich Discord embeds with progress bars and color coding
- SafeEmbedBuilder: automatic truncation at 5900 chars / 25 fields
- Daily roundup cron per guild
- Solana RPC buffer decoding for portfolio positions
- Modular architecture: one file per command

## Running
```bash
npm install
npm run build
node dist/index.js
```

## Tests
```bash
npm test
```

## Environment
```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=1473426190977990678
RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```
