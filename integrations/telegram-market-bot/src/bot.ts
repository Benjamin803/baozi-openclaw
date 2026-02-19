import { Bot, Context, InlineKeyboard } from "grammy";
import { BaoziClient, Market } from "./baozi";
import * as dotenv from "dotenv";
import * as fs from 'fs';
import * as path from 'path';
import cron from 'node-cron';

dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is missing in .env");
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);
const client = new BaoziClient();

// Subscriptions storage
const SUBS_FILE = path.join(__dirname, '..', 'subscriptions.json');
let subscriptions: { [chatId: string]: string } = {}; // chatId -> time (HH:MM)

function loadSubscriptions() {
    try {
        if (fs.existsSync(SUBS_FILE)) {
            subscriptions = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error("Error loading subscriptions", e);
    }
}

function saveSubscriptions() {
    try {
        fs.writeFileSync(SUBS_FILE, JSON.stringify(subscriptions, null, 2));
    } catch (e) {
        console.error("Error saving subscriptions", e);
    }
}

loadSubscriptions();

// Cron job for daily updates
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;

    for (const [chatId, time] of Object.entries(subscriptions)) {
        if (time === currentTime) {
            await sendRoundup(chatId);
        }
    }
});

async function sendRoundup(chatId: string) {
    try {
        const topMarkets = await client.getTopMarkets(5);
        if (topMarkets.length === 0) return;

        let message = "🌅 **Daily Market Roundup**\n\n";
        topMarkets.forEach((m, i) => {
            message += `${i+1}. ${m.question}\n`;
            message += `   Yes: ${m.yesPercent}% | No: ${m.noPercent}%\n`;
            message += `   /odds_${m.marketId}\n\n`;
        });
        
        await bot.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (e) {
        console.error(`Error sending roundup to ${chatId}:`, e);
    }
}

// Commands
bot.command("start", (ctx) => {
    ctx.reply(
        "👋 Welcome to Baozi Bot!\n\n" +
        "/markets - Top markets\n" +
        "/hot - Trending markets\n" +
        "/closing - Closing soon\n" +
        "/help - Show all commands"
    );
});

bot.command("help", (ctx) => {
    ctx.reply(
        "**Available Commands:**\n" +
        "/markets [filter] - List markets (optional keyword filter)\n" +
        "/hot - Show hot markets\n" +
        "/closing - Show markets closing soon\n" +
        "/odds <id> - Show market odds\n" +
        "/setup - Setup daily updates for this group\n" +
        "/subscribe <HH:MM> - Subscribe to daily updates at specific time\n" +
        "/unsubscribe - Unsubscribe from updates",
        { parse_mode: "Markdown" }
    );
});

bot.command("markets", async (ctx) => {
    const filter = ctx.match;
    let markets: Market[];
    
    if (filter) {
        markets = await client.getMarketsByCategory(filter.toString());
    } else {
        markets = await client.getTopMarkets(10);
    }

    if (markets.length === 0) {
        return ctx.reply("No markets found.");
    }

    let message = filter ? `🔍 **Markets matching "${filter}"**\n\n` : "🔥 **Top Active Markets**\n\n";
    const keyboard = new InlineKeyboard();

    markets.slice(0, 10).forEach((m, i) => {
        message += `${i+1}. ${m.question}\n`;
        message += `   Pool: ${m.totalPoolSol.toFixed(2)} SOL | Yes: ${m.yesPercent}%\n`;
        message += `   /odds_${m.marketId}\n\n`;
        
        keyboard.text(`View ${m.marketId}`, `view_${m.marketId}`);
        if (i % 2 === 1) keyboard.row();
    });
    
    keyboard.row().text("Refresh", filter ? `refresh_markets_${filter}` : "refresh_markets");

    await ctx.reply(message, { parse_mode: "Markdown", reply_markup: keyboard });
});

bot.command("hot", async (ctx) => {
    const markets = await client.getHotMarkets();
    let message = "🌶️ **Hot Markets**\n\n";
    const keyboard = new InlineKeyboard();

    markets.forEach((m, i) => {
        message += `${i+1}. ${m.question}\n`;
        message += `   Pool: ${m.totalPoolSol.toFixed(2)} SOL\n`;
        message += `   /odds_${m.marketId}\n\n`;
        keyboard.text(`View ${m.marketId}`, `view_${m.marketId}`);
        if (i % 2 === 1) keyboard.row();
    });

    await ctx.reply(message, { parse_mode: "Markdown", reply_markup: keyboard });
});

bot.command("closing", async (ctx) => {
    const markets = await client.getClosingSoon();
    let message = "⏳ **Closing Soon**\n\n";
    const keyboard = new InlineKeyboard();

    markets.forEach((m, i) => {
        const timeLeft = new Date(m.closingTime).getTime() - Date.now();
        const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
        
        message += `${i+1}. ${m.question}\n`;
        message += `   Closes in ${hoursLeft}h\n`;
        message += `   /odds_${m.marketId}\n\n`;
        keyboard.text(`View ${m.marketId}`, `view_${m.marketId}`);
        if (i % 2 === 1) keyboard.row();
    });

    await ctx.reply(message, { parse_mode: "Markdown", reply_markup: keyboard });
});

// Support /odds 123 and /odds_123 format
const oddsHandler = async (ctx: Context) => {
    let marketIdStr: string | undefined;
    
    if (ctx.match && typeof ctx.match === 'string') {
         marketIdStr = ctx.match; 
    } else if (ctx.message?.text) {
        const match = ctx.message.text.match(/\/odds_(\d+)/);
        if (match) marketIdStr = match[1];
    }

    if (!marketIdStr) {
        return ctx.reply("Usage: /odds <marketId>");
    }

    const marketId = parseInt(marketIdStr);
    if (isNaN(marketId)) return ctx.reply("Invalid market ID");

    const market = await client.getMarketById(marketId);
    if (!market) return ctx.reply("Market not found");

    const message = 
        `📊 **Market Odds**\n\n` +
        `❓ ${market.question}\n\n` +
        `🟢 **Yes**: ${market.yesPercent}%\n` +
        `🔴 **No**: ${market.noPercent}%\n\n` +
        `💧 Pool: ${market.totalPoolSol.toFixed(2)} SOL\n` +
        `⏳ Closes: ${new Date(market.closingTime).toLocaleString()}\n` +
        `Status: ${market.status}`;

    const keyboard = new InlineKeyboard()
        .url("View on Baozi", `https://baozi.bet/market/${market.publicKey}`)
        .row()
        .text("Refresh", `view_${marketId}`)
        .url("Share", `https://t.me/share/url?url=https://baozi.bet/market/${market.publicKey}&text=Check out this market!`);

    await ctx.reply(message, { parse_mode: "Markdown", reply_markup: keyboard });
};

bot.command("odds", oddsHandler);
bot.hears(/^\/odds_(\d+)$/, oddsHandler);


bot.command("setup", (ctx) => {
    ctx.reply(
        "**Group Setup**\n\n" +
        "To subscribe to daily roundups, use:\n" +
        "`/subscribe HH:MM` (24h format, e.g. 09:00)\n\n" +
        "To unsubscribe:\n" +
        "`/unsubscribe`",
        { parse_mode: "Markdown" }
    );
});

bot.command("subscribe", (ctx) => {
    if (!ctx.chat) return;
    const time = ctx.match as string;
    
    if (!time || !/^\d{2}:\d{2}$/.test(time)) {
        return ctx.reply("Please provide time in HH:MM format (24h). Example: /subscribe 09:00");
    }

    subscriptions[ctx.chat.id.toString()] = time;
    saveSubscriptions();
    ctx.reply(`✅ Subscribed to daily updates at ${time}`);
});

bot.command("unsubscribe", (ctx) => {
    if (!ctx.chat) return;
    if (subscriptions[ctx.chat.id.toString()]) {
        delete subscriptions[ctx.chat.id.toString()];
        saveSubscriptions();
        ctx.reply("✅ Unsubscribed from daily updates.");
    } else {
        ctx.reply("You are not subscribed.");
    }
});

// Callbacks
bot.callbackQuery(/view_(\d+)/, async (ctx) => {
    const marketId = parseInt(ctx.match[1]);
    const market = await client.getMarketById(marketId);
    if (!market) return ctx.answerCallbackQuery("Market not found");

    const message = 
        `📊 **Market Details**\n\n` +
        `❓ ${market.question}\n\n` +
        `🟢 Yes: ${market.yesPercent}%\n` +
        `🔴 No: ${market.noPercent}%\n` +
        `💧 Pool: ${market.totalPoolSol.toFixed(2)} SOL\n` +
        `Status: ${market.status}`;
    
    const keyboard = new InlineKeyboard()
        .url("View on Baozi", `https://baozi.bet/market/${market.publicKey}`)
        .row()
        .text("Refresh", `view_${marketId}`)
        .url("Share", `https://t.me/share/url?url=https://baozi.bet/market/${market.publicKey}&text=${encodeURIComponent(market.question)}`);

    try {
        await ctx.editMessageText(message, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (e) {
        // Message might not have changed
    }
    await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^refresh_markets(_(.+))?$/, async (ctx) => {
    const filter = ctx.match[2];
    let markets: Market[];
    
    if (filter) {
        markets = await client.getMarketsByCategory(filter);
    } else {
        markets = await client.getTopMarkets(10);
    }
    
    let message = filter ? `🔍 **Markets matching "${filter}"**\n\n` : "🔥 **Top Active Markets**\n\n";
    const keyboard = new InlineKeyboard();

    markets.slice(0, 10).forEach((m, i) => {
        message += `${i+1}. ${m.question}\n`;
        message += `   Pool: ${m.totalPoolSol.toFixed(2)} SOL | Yes: ${m.yesPercent}%\n`;
        message += `   /odds_${m.marketId}\n\n`;
        
        keyboard.text(`View ${m.marketId}`, `view_${m.marketId}`);
        if (i % 2 === 1) keyboard.row();
    });
    
    keyboard.row().text("Refresh", filter ? `refresh_markets_${filter}` : "refresh_markets");

    try {
        await ctx.editMessageText(message, { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (e) {
        // Ignore if text didn't change
    }
    await ctx.answerCallbackQuery("Refreshed");
});

bot.start({
    onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} is running...`);
    }
});
