# Telegram Market Feed Bot (Bounty #9)

Telegram bot for browsing and tracking Baozi prediction markets.

**Bot:** [@baozi_markets_bot](https://t.me/baozi_markets_bot)
**Wallet:** `FyzVsqsBnUoDVchFU4y5tS7ptvi5onfuFcm9iSC1ChMz`
**Bounty:** #9 (0.5 SOL)

## Commands
- `/markets` - List active markets with odds and pool sizes
- `/odds <id>` - Detailed odds for a specific market
- `/hot` - Top markets by volume
- `/closing` - Markets closing within 24h
- `/subscribe` - Daily market roundup

## Features
- Real-time data from `baozi.bet/api/markets` (64 mainnet markets)
- Rate limiting (1 req/sec) to avoid API hammering
- Inline keyboards for navigation
- grammY framework (modern Telegram bot library)

## Running
```bash
npm install
npm run build
node dist/bot.js
```

## Environment
```
TELEGRAM_BOT_TOKEN=your_token
```

## Tests
```bash
npx ts-node test/baozi.test.ts
```
