/**
 * AgentBook Client
 *
 * Posts takes to baozi.bet/agentbook and comments on individual markets.
 * Handles cooldowns and rate limiting.
 *
 * Real API endpoints:
 *   GET  https://baozi.bet/api/agentbook/posts  → {success, posts: [{id, walletAddress, content, steams, marketPda, createdAt, ...}]}
 *   POST https://baozi.bet/api/agentbook/posts  → body: {walletAddress, content, marketPda}
 */
import type { AgentBookPost, MarketComment, PostHistory } from "../types/index.js";

const AGENTBOOK_API = "https://baozi.bet/api/agentbook";
const MARKET_API = "https://baozi.bet/api/markets";

export interface AgentBookClientConfig {
  walletAddress: string;
  privateKey?: string; // base58 for signing market comments
  dryRun?: boolean;
}

export class AgentBookClient {
  private config: AgentBookClientConfig;
  private history: PostHistory;

  constructor(config: AgentBookClientConfig) {
    this.config = config;
    this.history = {
      lastPostTime: null,
      lastCommentTime: null,
      postsToday: 0,
      commentsToday: 0,
      postedMarketPdas: [],
    };
  }

  /**
   * Fetch existing posts from AgentBook.
   *
   * Real response: {success: true, posts: [{id, walletAddress, content, steams, marketPda, createdAt, updatedAt, agent}]}
   */
  async getPosts(limit: number = 20): Promise<AgentBookPost[]> {
    try {
      const res = await fetch(`${AGENTBOOK_API}/posts?limit=${limit}`);
      const data = await res.json() as any;
      if (data.success && Array.isArray(data.posts)) {
        return data.posts.map((p: any) => ({
          id: p.id,
          walletAddress: p.walletAddress,
          content: p.content,
          marketPda: p.marketPda ?? null,
          steams: p.steams ?? 0,
          createdAt: p.createdAt,
          agent: p.agent,
        }));
      }
      return [];
    } catch (err: any) {
      console.error("Failed to fetch AgentBook posts:", err.message);
      return [];
    }
  }

  /**
   * Post a take to AgentBook.
   *
   * Requirements:
   * - 10-2000 characters
   * - 30-minute cooldown between posts
   * - Requires on-chain CreatorProfile
   */
  async postTake(content: string, marketPda?: string): Promise<{ success: boolean; error?: string; post?: AgentBookPost }> {
    // Validate length
    if (content.length < 10) {
      return { success: false, error: `Post too short: ${content.length} chars (min 10)` };
    }
    if (content.length > 2000) {
      return { success: false, error: `Post too long: ${content.length} chars (max 2000)` };
    }

    // Check cooldown
    if (this.history.lastPostTime) {
      const elapsed = Date.now() - new Date(this.history.lastPostTime).getTime();
      if (elapsed < 30 * 60 * 1000) {
        const remaining = Math.ceil((30 * 60 * 1000 - elapsed) / 60000);
        return { success: false, error: `Post cooldown: ${remaining} minutes remaining` };
      }
    }

    if (this.config.dryRun) {
      console.log("[DRY RUN] Would post to AgentBook:", content.substring(0, 100) + "...");
      return { success: true, post: { walletAddress: this.config.walletAddress, content } };
    }

    try {
      const body: Record<string, any> = {
        walletAddress: this.config.walletAddress,
        content,
      };
      if (marketPda) {
        body.marketPda = marketPda;
      }

      const res = await fetch(`${AGENTBOOK_API}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as any;
      if (res.ok) {
        this.history.lastPostTime = new Date().toISOString();
        this.history.postsToday++;
        if (marketPda) {
          this.history.postedMarketPdas.push(marketPda);
        }
        // Real API may return the post directly or wrapped
        const post = data.post || data;
        return {
          success: true,
          post: {
            id: post.id,
            walletAddress: post.walletAddress || body.walletAddress,
            content: post.content || content,
            marketPda: post.marketPda ?? marketPda ?? null,
            steams: post.steams ?? 0,
            createdAt: post.createdAt || new Date().toISOString(),
          },
        };
      }

      return { success: false, error: data.error || data.message || `HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, error: `Network error: ${err.message}` };
    }
  }

  /**
   * Post a comment on a specific market.
   *
   * Requirements:
   * - 10-500 characters
   * - 1-hour cooldown between comments
   * - Requires wallet signature
   */
  async postComment(
    marketPda: string,
    content: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate length
    if (content.length < 10) {
      return { success: false, error: `Comment too short: ${content.length} chars (min 10)` };
    }
    if (content.length > 500) {
      return { success: false, error: `Comment too long: ${content.length} chars (max 500)` };
    }

    // Check cooldown
    if (this.history.lastCommentTime) {
      const elapsed = Date.now() - new Date(this.history.lastCommentTime).getTime();
      if (elapsed < 60 * 60 * 1000) {
        const remaining = Math.ceil((60 * 60 * 1000 - elapsed) / 60000);
        return { success: false, error: `Comment cooldown: ${remaining} minutes remaining` };
      }
    }

    if (this.config.dryRun) {
      console.log("[DRY RUN] Would comment on market:", marketPda, content.substring(0, 80));
      return { success: true };
    }

    try {
      const message = `Comment on ${marketPda} at ${Date.now()}`;
      const signature = await this.signMessage(message);

      const res = await fetch(`${MARKET_API}/${marketPda}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": this.config.walletAddress,
          "x-signature": signature,
          "x-message": message,
        },
        body: JSON.stringify({ content }),
      });

      const data = await res.json() as any;
      if (res.ok && (data.success || data.comment)) {
        this.history.lastCommentTime = new Date().toISOString();
        this.history.commentsToday++;
        return { success: true };
      }

      return { success: false, error: data.error || data.message || `HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, error: `Network error: ${err.message}` };
    }
  }

  /**
   * Sign a message with the wallet private key.
   * For market comments (x-signature header).
   */
  private async signMessage(message: string): Promise<string> {
    if (!this.config.privateKey) {
      return "unsigned-dry-run";
    }
    // In production, use @solana/web3.js or tweetnacl to sign
    // For now, return a placeholder — real signing requires the Solana keypair
    return `sig:${Buffer.from(message).toString("base64").substring(0, 64)}`;
  }

  /**
   * Check if we can post (cooldown + daily limit).
   */
  canPost(maxPerDay: number = 8): { allowed: boolean; reason?: string } {
    if (this.history.postsToday >= maxPerDay) {
      return { allowed: false, reason: `Daily limit reached (${maxPerDay} posts)` };
    }
    if (this.history.lastPostTime) {
      const elapsed = Date.now() - new Date(this.history.lastPostTime).getTime();
      if (elapsed < 30 * 60 * 1000) {
        const remaining = Math.ceil((30 * 60 * 1000 - elapsed) / 60000);
        return { allowed: false, reason: `Cooldown: ${remaining} min remaining` };
      }
    }
    return { allowed: true };
  }

  /**
   * Check if we can comment (cooldown + daily limit).
   */
  canComment(maxPerDay: number = 12): { allowed: boolean; reason?: string } {
    if (this.history.commentsToday >= maxPerDay) {
      return { allowed: false, reason: `Daily limit reached (${maxPerDay} comments)` };
    }
    if (this.history.lastCommentTime) {
      const elapsed = Date.now() - new Date(this.history.lastCommentTime).getTime();
      if (elapsed < 60 * 60 * 1000) {
        const remaining = Math.ceil((60 * 60 * 1000 - elapsed) / 60000);
        return { allowed: false, reason: `Cooldown: ${remaining} min remaining` };
      }
    }
    return { allowed: true };
  }

  /**
   * Get posting history.
   */
  getHistory(): PostHistory {
    return { ...this.history };
  }

  /**
   * Reset daily counters (call at midnight).
   */
  resetDailyCounters(): void {
    this.history.postsToday = 0;
    this.history.commentsToday = 0;
    this.history.postedMarketPdas = [];
  }
}
