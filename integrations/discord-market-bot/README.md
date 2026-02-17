# Discord Market Bot — Bounty #10

Discord bot with slash commands and rich embeds that brings Baozi prediction market data into Discord servers. Browse markets, check odds, track portfolios — all without leaving Discord.

## Features

- **`/markets [status]`** — List markets filtered by Active/Closed/Resolved
- **`/hot`** — Top 5 markets by volume with rich embeds
- **`/closing`** — Markets closing within 24h with countdown
- **`/odds <market>`** — Detailed odds with visual progress bars
- **`/portfolio <wallet>`** — View wallet positions across all markets
- **`/race`** — Active race (multi-outcome) markets with outcome breakdown
- **`/setup <channel> [time]`** — Configure daily roundup to a channel (admin only)
- **Rich embeds** — Color-coded, formatted with progress bars for odds
- **Daily roundup cron** — Automated per-guild at configurable UTC time
- **Both binary + race markets** — Full support for all Baozi market types

## Architecture

```
src/
├── index.ts        — Entry point, slash command registration, interaction handler
├── client.ts       — Baozi client (REST API + Solana RPC for positions)
├── config.ts       — Program ID, discriminators, RPC config
├── types.ts        — Market, RaceMarket, Position, RacePosition types
├── cron.ts         — Daily roundup scheduler
└── commands/
    ├── index.ts    — Command barrel export
    ├── interface.ts — Command interface definition
    ├── markets.ts  — /markets command
    ├── odds.ts     — /odds command with progress bars
    ├── hot.ts      — /hot command
    ├── closing.ts  — /closing command with countdown
    ├── portfolio.ts — /portfolio command
    ├── race.ts     — /race command
    └── setup.ts    — /setup command (admin)
```

Uses **Baozi REST API** for market data and **Solana RPC** (`getProgramAccounts`) for wallet portfolio lookups.

## Setup

```bash
cd integrations/discord-market-bot
npm install
cp .env.example .env  # Add DISCORD_TOKEN and CLIENT_ID
npm run build
npm start
```

## Configuration (.env)

```env
DISCORD_TOKEN=your-discord-bot-token
CLIENT_ID=your-application-client-id
RPC_ENDPOINT=https://api.mainnet-beta.solana.com
```

## Bot Permissions

When creating the OAuth2 URL, select:
- Scopes: `bot`, `applications.commands`
- Permissions: Send Messages, Embed Links, Use Slash Commands

## Deployment

Running as a systemd service:

```ini
[Unit]
Description=Baozi Discord Market Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/discord-market-bot
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/path/to/discord-market-bot/.env

[Install]
WantedBy=multi-user.target
```

## Proof of Operation

- Bot: **Baozi Markets#8970**
- Running 24/7 as systemd service
- Active in 2 Discord servers with real mainnet market data
- `/markets` displays 6 active markets with pool sizes, odds, closing dates
- Rich embeds with proper formatting and color coding
- Slash commands auto-registered on bot login

## SOL Wallet

`FyzVsqsBnUoDVchFU4y5tS7ptvi5onfuFcm9iSC1ChMz`
