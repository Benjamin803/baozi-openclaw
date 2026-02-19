import axios from 'axios';

export interface Market {
  publicKey: string;
  marketId: number;
  question: string;
  status: string;
  layer: string;
  outcome: string;
  yesPercent: number;
  noPercent: number;
  totalPoolSol: number;
  closingTime: string;
  isBettingOpen: boolean;
  category: string | null;
  creator: string;
  platformFeeBps: number;
}

export class BaoziClient {
  private apiUrl = 'https://baozi.bet/api/markets';
  private lastRequestTime: number = 0;

  private async throttle(): Promise<void> {
    const now = Date.now();
    const diff = now - this.lastRequestTime;
    if (diff < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - diff));
    }
    this.lastRequestTime = Date.now();
  }

  async getAllMarkets(): Promise<Market[]> {
    try {
      await this.throttle();
      const response = await axios.get(this.apiUrl);
      if (response.data.success && response.data.data && response.data.data.binary) {
        return response.data.data.binary;
      }
      return [];
    } catch (error) {
      console.error('Error fetching markets:', error);
      return [];
    }
  }

  async getMarketById(marketId: number): Promise<Market | undefined> {
    const markets = await this.getAllMarkets();
    return markets.find(m => m.marketId === marketId);
  }

  async getTopMarkets(limit: number = 10): Promise<Market[]> {
    const markets = await this.getAllMarkets();
    return markets
      .filter(m => m.status === 'Active' && m.isBettingOpen)
      .sort((a, b) => b.totalPoolSol - a.totalPoolSol)
      .slice(0, limit);
  }

  async getClosingSoon(limit: number = 5): Promise<Market[]> {
    const markets = await this.getAllMarkets();
    const now = new Date().getTime();
    return markets
      .filter(m => m.status === 'Active' && new Date(m.closingTime).getTime() > now)
      .sort((a, b) => new Date(a.closingTime).getTime() - new Date(b.closingTime).getTime())
      .slice(0, limit);
  }

  async getHotMarkets(limit: number = 5): Promise<Market[]> {
    // "Hot" defined as high volume active markets
    return this.getTopMarkets(limit);
  }

  async getMarketsByCategory(category: string): Promise<Market[]> {
      const markets = await this.getAllMarkets();
      return markets.filter(m => 
          (m.category && m.category.toLowerCase() === category.toLowerCase()) || 
          m.question.toLowerCase().includes(category.toLowerCase())
      );
  }
}
