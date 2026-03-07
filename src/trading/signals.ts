/**
 * Signal Generation — News, Sentiment, and External Data Sources
 * 
 * Generates trading signals from external information sources.
 */

import { SignalGenerators } from './bayesian.js';

export interface NewsItem {
    title: string;
    source: string;
    url: string;
    publishedAt: number;
    relevanceScore: number;
    sentiment: number; // -1 to 1
    keywords: string[];
}

export interface SignalResult {
    name: string;
    likelihood: number;
    weight: number;
    source: string;
    timestamp: number;
}

// RSS feeds for news
const NEWS_FEEDS = [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World' },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', name: 'NYT World' },
    { url: 'https://feeds.reuters.com/reuters/topNews', name: 'Reuters' },
    { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk' },
];

// Keywords mapped to market categories
const KEYWORD_CATEGORIES: Record<string, string[]> = {
    crypto: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency', 'blockchain'],
    politics_us: ['trump', 'biden', 'congress', 'senate', 'republican', 'democrat', 'election', 'white house'],
    politics_intl: ['putin', 'russia', 'ukraine', 'china', 'taiwan', 'nato', 'eu', 'brexit'],
    economy: ['fed', 'interest rate', 'inflation', 'recession', 'gdp', 'unemployment', 'stock market'],
    tech: ['ai', 'artificial intelligence', 'openai', 'google', 'apple', 'microsoft', 'meta'],
    sports: ['nfl', 'nba', 'mlb', 'world cup', 'olympics', 'championship'],
    entertainment: ['oscars', 'grammy', 'album', 'movie', 'netflix', 'spotify'],
};

// Sentiment keywords
const POSITIVE_WORDS = ['surge', 'soar', 'gain', 'win', 'victory', 'success', 'approve', 'pass', 'agree', 'rise', 'jump', 'boost', 'strong', 'confident'];
const NEGATIVE_WORDS = ['crash', 'fall', 'lose', 'defeat', 'fail', 'reject', 'deny', 'drop', 'plunge', 'weak', 'crisis', 'fear', 'concern', 'warning'];

export class SignalGenerator {
    private newsCache: Map<string, NewsItem[]> = new Map();
    private lastFetch: number = 0;
    private fetchInterval = 5 * 60 * 1000; // 5 minutes

    /**
     * Fetch news from RSS feeds
     */
    async fetchNews(): Promise<NewsItem[]> {
        // Rate limit
        if (Date.now() - this.lastFetch < this.fetchInterval) {
            return this.getAllCachedNews();
        }

        const allNews: NewsItem[] = [];

        for (const feed of NEWS_FEEDS) {
            try {
                const items = await this.fetchRSSFeed(feed.url, feed.name);
                this.newsCache.set(feed.name, items);
                allNews.push(...items);
            } catch (err) {
                // Skip failed feeds silently
            }
        }

        this.lastFetch = Date.now();
        return allNews;
    }

    private async fetchRSSFeed(url: string, sourceName: string): Promise<NewsItem[]> {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'AlloTrade/1.0' },
                signal: AbortSignal.timeout(10000),
            });

            if (!response.ok) return [];

            const text = await response.text();
            return this.parseRSS(text, sourceName);
        } catch {
            return [];
        }
    }

    private parseRSS(xml: string, sourceName: string): NewsItem[] {
        const items: NewsItem[] = [];
        
        // Simple regex-based RSS parsing
        const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
        
        for (const itemXml of itemMatches.slice(0, 20)) {
            const title = this.extractTag(itemXml, 'title');
            const link = this.extractTag(itemXml, 'link');
            const pubDate = this.extractTag(itemXml, 'pubDate');

            if (!title) continue;

            const keywords = this.extractKeywords(title);
            const sentiment = this.analyzeSentiment(title);

            items.push({
                title,
                source: sourceName,
                url: link || '',
                publishedAt: pubDate ? new Date(pubDate).getTime() : Date.now(),
                relevanceScore: keywords.length > 0 ? 0.5 + (keywords.length * 0.1) : 0,
                sentiment,
                keywords,
            });
        }

        return items;
    }

    private extractTag(xml: string, tag: string): string {
        const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        if (match) {
            return match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
        }
        return '';
    }

    private extractKeywords(text: string): string[] {
        const lower = text.toLowerCase();
        const found: string[] = [];

        for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
            for (const keyword of keywords) {
                if (lower.includes(keyword)) {
                    found.push(category);
                    break;
                }
            }
        }

        return [...new Set(found)];
    }

    private analyzeSentiment(text: string): number {
        const lower = text.toLowerCase();
        let score = 0;

        for (const word of POSITIVE_WORDS) {
            if (lower.includes(word)) score += 0.15;
        }
        for (const word of NEGATIVE_WORDS) {
            if (lower.includes(word)) score -= 0.15;
        }

        return Math.max(-1, Math.min(1, score));
    }

    /**
     * Generate signals for a specific market question
     */
    generateSignalsForMarket(marketQuestion: string, news: NewsItem[]): SignalResult[] {
        const signals: SignalResult[] = [];
        const questionLower = marketQuestion.toLowerCase();

        // Determine market category
        const marketCategories = this.extractKeywords(marketQuestion);

        // Filter relevant news
        const relevantNews = news.filter(item => {
            // Check keyword overlap
            const overlap = item.keywords.some(k => marketCategories.includes(k));
            if (overlap) return true;

            // Check title similarity
            const titleLower = item.title.toLowerCase();
            const questionWords = questionLower.split(/\s+/).filter(w => w.length > 4);
            const matchCount = questionWords.filter(w => titleLower.includes(w)).length;
            return matchCount >= 2;
        });

        // Generate signals from relevant news
        for (const item of relevantNews.slice(0, 5)) {
            // Recency weight - news older than 24h is less relevant
            const ageHours = (Date.now() - item.publishedAt) / (1000 * 60 * 60);
            const recencyWeight = Math.max(0.1, 1 - (ageHours / 24));

            // Convert sentiment to likelihood
            // Positive sentiment -> higher likelihood of YES
            const likelihood = 0.5 + (item.sentiment * 0.3);

            signals.push({
                name: `news_${item.source.toLowerCase().replace(/\s+/g, '_')}`,
                likelihood,
                weight: item.relevanceScore * recencyWeight * 0.5,
                source: item.title.slice(0, 50),
                timestamp: item.publishedAt,
            });
        }

        return signals;
    }

    /**
     * Get all cached news
     */
    getAllCachedNews(): NewsItem[] {
        const all: NewsItem[] = [];
        for (const items of this.newsCache.values()) {
            all.push(...items);
        }
        return all;
    }
}

/**
 * Time Decay Analysis — Factor in time to expiry
 */
export function analyzeTimeDecay(endDate: Date, currentPrice: number): SignalResult | null {
    const now = Date.now();
    const end = endDate.getTime();
    const hoursRemaining = (end - now) / (1000 * 60 * 60);

    if (hoursRemaining < 0) return null; // Market expired

    // Markets near expiry with extreme prices are more certain
    if (hoursRemaining < 24) {
        // Last 24 hours - prices should converge to 0 or 1
        if (currentPrice < 0.1) {
            return {
                name: 'time_decay_no',
                likelihood: 0.05, // Almost certainly NO
                weight: 0.7,
                source: `${hoursRemaining.toFixed(0)}h remaining, price at ${(currentPrice * 100).toFixed(0)}%`,
                timestamp: now,
            };
        } else if (currentPrice > 0.9) {
            return {
                name: 'time_decay_yes',
                likelihood: 0.95, // Almost certainly YES
                weight: 0.7,
                source: `${hoursRemaining.toFixed(0)}h remaining, price at ${(currentPrice * 100).toFixed(0)}%`,
                timestamp: now,
            };
        }
    }

    // Longer timeframes - less certainty from time alone
    if (hoursRemaining < 72 && (currentPrice < 0.2 || currentPrice > 0.8)) {
        return {
            name: 'time_decay_trend',
            likelihood: currentPrice,
            weight: 0.3,
            source: `${(hoursRemaining / 24).toFixed(1)} days remaining`,
            timestamp: now,
        };
    }

    return null;
}

/**
 * Correlation Analysis — Cross-market signals
 */
export const MARKET_CORRELATIONS: Record<string, string[]> = {
    // Political correlations
    'trump': ['republican', 'gop', 'maga', 'desantis'],
    'biden': ['democrat', 'democratic', 'harris'],
    'republican': ['trump', 'gop', 'senate republican', 'house republican'],
    'democrat': ['biden', 'harris', 'senate democrat', 'house democrat'],
    
    // Crypto correlations
    'bitcoin': ['btc', 'crypto', 'ethereum', 'coinbase'],
    'ethereum': ['eth', 'crypto', 'bitcoin', 'defi'],
    
    // Geopolitical correlations
    'russia': ['ukraine', 'putin', 'nato', 'sanctions'],
    'ukraine': ['russia', 'zelensky', 'nato', 'ceasefire'],
    'china': ['taiwan', 'xi', 'trade war', 'tariffs'],
    'taiwan': ['china', 'invasion', 'semiconductor'],
};

export function findCorrelatedMarkets(
    targetQuestion: string,
    allMarkets: Array<{ question: string; yesPrice: number; id: string }>
): Array<{ market: typeof allMarkets[0]; correlation: number }> {
    const targetLower = targetQuestion.toLowerCase();
    const correlated: Array<{ market: typeof allMarkets[0]; correlation: number }> = [];

    // Find keywords in target
    const targetKeywords: string[] = [];
    for (const [key, related] of Object.entries(MARKET_CORRELATIONS)) {
        if (targetLower.includes(key)) {
            targetKeywords.push(key, ...related);
        }
    }

    if (targetKeywords.length === 0) return [];

    // Find markets with matching keywords
    for (const market of allMarkets) {
        if (market.question === targetQuestion) continue;

        const marketLower = market.question.toLowerCase();
        let matchCount = 0;

        for (const keyword of targetKeywords) {
            if (marketLower.includes(keyword)) {
                matchCount++;
            }
        }

        if (matchCount > 0) {
            correlated.push({
                market,
                correlation: Math.min(1, matchCount * 0.3),
            });
        }
    }

    return correlated.sort((a, b) => b.correlation - a.correlation).slice(0, 5);
}

// Singleton
export const signalGenerator = new SignalGenerator();
