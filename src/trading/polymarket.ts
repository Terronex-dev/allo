/**
 * Polymarket API Client
 * 
 * Public endpoints - no auth required for market data
 */

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

export interface PolymarketEvent {
    id: string;
    title: string;
    slug: string;
    description: string;
    startDate: string;
    endDate: string;
    markets: PolymarketMarket[];
    active: boolean;
    closed: boolean;
    archived: boolean;
    liquidity: number;
    volume: number;
    commentCount: number;
}

export interface PolymarketMarket {
    id: string;
    question: string;
    conditionId: string;
    slug: string;
    outcomes: string;           // JSON string: '["Yes", "No"]'
    outcomePrices: string;      // JSON string: '["0.65", "0.35"]'
    active: boolean;
    closed: boolean;
    enableOrderBook: boolean;
    clobTokenIds: string;       // JSON string with YES/NO token IDs
    volume: number;
    liquidity: number;
    startDate: string;
    endDate: string;
}

export interface ParsedMarket {
    id: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
    active: boolean;
    closed: boolean;
    tradeable: boolean;
    yesTokenId?: string;
    noTokenId?: string;
    endDate: Date;
}

export interface OrderBook {
    market: string;
    assetId: string;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
    timestamp: string;
}

export interface PriceHistory {
    history: Array<{
        t: number;      // timestamp
        p: number;      // price
    }>;
}

export class PolymarketClient {
    private cache: Map<string, { data: any; expires: number }> = new Map();
    private cacheTTL = 30000; // 30 seconds

    /**
     * Fetch with caching
     */
    private async fetch<T>(url: string, ttl = this.cacheTTL): Promise<T> {
        const cached = this.cache.get(url);
        if (cached && cached.expires > Date.now()) {
            return cached.data as T;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Polymarket API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        this.cache.set(url, { data, expires: Date.now() + ttl });
        return data as T;
    }

    /**
     * Get active events
     */
    async getEvents(params: {
        limit?: number;
        offset?: number;
        active?: boolean;
        closed?: boolean;
        tag?: string;
    } = {}): Promise<PolymarketEvent[]> {
        const query = new URLSearchParams();
        if (params.limit) query.set('limit', String(params.limit));
        if (params.offset) query.set('offset', String(params.offset));
        if (params.active !== undefined) query.set('active', String(params.active));
        if (params.closed !== undefined) query.set('closed', String(params.closed));
        if (params.tag) query.set('tag', params.tag);

        const url = `${GAMMA_API}/events?${query}`;
        return this.fetch<PolymarketEvent[]>(url);
    }

    /**
     * Get single event by ID
     */
    async getEvent(id: string): Promise<PolymarketEvent> {
        return this.fetch<PolymarketEvent>(`${GAMMA_API}/events/${id}`);
    }

    /**
     * Get markets
     */
    async getMarkets(params: {
        limit?: number;
        offset?: number;
        active?: boolean;
        closed?: boolean;
    } = {}): Promise<PolymarketMarket[]> {
        const query = new URLSearchParams();
        if (params.limit) query.set('limit', String(params.limit));
        if (params.offset) query.set('offset', String(params.offset));
        if (params.active !== undefined) query.set('active', String(params.active));
        if (params.closed !== undefined) query.set('closed', String(params.closed));

        const url = `${GAMMA_API}/markets?${query}`;
        return this.fetch<PolymarketMarket[]>(url);
    }

    /**
     * Get single market by ID
     */
    async getMarket(id: string): Promise<PolymarketMarket> {
        return this.fetch<PolymarketMarket>(`${GAMMA_API}/markets/${id}`);
    }

    /**
     * Search events and markets
     */
    async search(query: string): Promise<{
        events: PolymarketEvent[];
        markets: PolymarketMarket[];
    }> {
        const url = `${GAMMA_API}/public-search?query=${encodeURIComponent(query)}`;
        return this.fetch(url);
    }

    /**
     * Get current price for a token
     */
    async getPrice(tokenId: string): Promise<number> {
        const data = await this.fetch<{ price: string }>(`${CLOB_API}/price?token_id=${tokenId}`, 5000);
        return parseFloat(data.price);
    }

    /**
     * Get prices for multiple tokens
     */
    async getPrices(tokenIds: string[]): Promise<Map<string, number>> {
        const query = tokenIds.map(id => `token_ids=${id}`).join('&');
        const data = await this.fetch<Record<string, string>>(`${CLOB_API}/prices?${query}`, 5000);
        
        const prices = new Map<string, number>();
        for (const [id, price] of Object.entries(data)) {
            prices.set(id, parseFloat(price));
        }
        return prices;
    }

    /**
     * Get order book for a token
     */
    async getOrderBook(tokenId: string): Promise<OrderBook> {
        return this.fetch<OrderBook>(`${CLOB_API}/book?token_id=${tokenId}`, 5000);
    }

    /**
     * Get price history for a token
     */
    async getPriceHistory(tokenId: string, interval = '1d', fidelity = 60): Promise<PriceHistory> {
        const url = `${CLOB_API}/prices-history?market=${tokenId}&interval=${interval}&fidelity=${fidelity}`;
        return this.fetch<PriceHistory>(url, 60000);
    }

    /**
     * Get midpoint price
     */
    async getMidpoint(tokenId: string): Promise<number> {
        const data = await this.fetch<{ mid: string }>(`${CLOB_API}/midpoint?token_id=${tokenId}`, 5000);
        return parseFloat(data.mid);
    }

    /**
     * Get spread
     */
    async getSpread(tokenId: string): Promise<{ bid: number; ask: number; spread: number }> {
        const data = await this.fetch<{ bid: string; ask: string }>(`${CLOB_API}/spread?token_id=${tokenId}`, 5000);
        const bid = parseFloat(data.bid);
        const ask = parseFloat(data.ask);
        return { bid, ask, spread: ask - bid };
    }

    /**
     * Analyze liquidity for a market
     * Returns a score 0-1 where 1 = highly liquid
     */
    async analyzeLiquidity(tokenId: string): Promise<{
        score: number;
        bidDepth: number;
        askDepth: number;
        spread: number;
        tradeable: boolean;
        reason: string;
    }> {
        try {
            const book = await this.getOrderBook(tokenId);
            const spreadData = await this.getSpread(tokenId);

            // Calculate depth (sum of sizes in top 5 levels)
            const bidDepth = book.bids.slice(0, 5).reduce((sum, b) => sum + parseFloat(b.size), 0);
            const askDepth = book.asks.slice(0, 5).reduce((sum, a) => sum + parseFloat(a.size), 0);
            const totalDepth = bidDepth + askDepth;

            // Score components
            const depthScore = Math.min(1, totalDepth / 10000); // $10k depth = 1.0
            const spreadScore = Math.max(0, 1 - (spreadData.spread * 10)); // 10% spread = 0
            const balanceScore = Math.min(bidDepth, askDepth) / Math.max(bidDepth, askDepth, 1);

            const score = (depthScore * 0.4) + (spreadScore * 0.4) + (balanceScore * 0.2);

            // Determine if tradeable
            let tradeable = true;
            let reason = 'OK';

            if (spreadData.spread > 0.05) {
                tradeable = false;
                reason = `Spread too wide: ${(spreadData.spread * 100).toFixed(1)}%`;
            } else if (totalDepth < 1000) {
                tradeable = false;
                reason = `Insufficient depth: $${totalDepth.toFixed(0)}`;
            } else if (bidDepth < 100 || askDepth < 100) {
                tradeable = false;
                reason = 'Order book imbalanced';
            }

            return {
                score,
                bidDepth,
                askDepth,
                spread: spreadData.spread,
                tradeable,
                reason,
            };
        } catch {
            return {
                score: 0,
                bidDepth: 0,
                askDepth: 0,
                spread: 1,
                tradeable: false,
                reason: 'Failed to fetch liquidity data',
            };
        }
    }

    /**
     * Parse market into usable format
     */
    parseMarket(market: PolymarketMarket): ParsedMarket {
        const outcomes = JSON.parse(market.outcomes || '["Yes", "No"]');
        const prices = JSON.parse(market.outcomePrices || '["0.5", "0.5"]');
        
        let yesTokenId: string | undefined;
        let noTokenId: string | undefined;
        
        try {
            const tokens = JSON.parse(market.clobTokenIds || '[]');
            if (Array.isArray(tokens) && tokens.length >= 2) {
                yesTokenId = tokens[0];
                noTokenId = tokens[1];
            }
        } catch {}

        const yesIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'yes');
        const noIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'no');

        return {
            id: market.id,
            question: market.question,
            yesPrice: parseFloat(prices[yesIdx] || prices[0] || '0.5'),
            noPrice: parseFloat(prices[noIdx] || prices[1] || '0.5'),
            volume: market.volume || 0,
            liquidity: market.liquidity || 0,
            active: market.active,
            closed: market.closed,
            tradeable: market.enableOrderBook && market.active && !market.closed,
            yesTokenId,
            noTokenId,
            endDate: new Date(market.endDate),
        };
    }

    /**
     * Get top active markets by volume
     */
    async getTopMarkets(limit = 20): Promise<ParsedMarket[]> {
        const markets = await this.getMarkets({ 
            limit, 
            active: true, 
            closed: false 
        });

        return markets
            .map(m => this.parseMarket(m))
            .filter(m => m.tradeable)
            .sort((a, b) => b.volume - a.volume);
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear();
    }
}

// Singleton
export const polymarket = new PolymarketClient();
