/**
 * Trading Memory — Engram Trace integration for learning from trades
 * 
 * Uses semantic memory to:
 * - Remember past trades and outcomes
 * - Recall similar market conditions
 * - Learn what strategies work
 * - Consolidate lessons over time
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const MEMORY_DIR = path.join(process.env.HOME || '~', '.allo-trade');
const BRAIN_FILE = path.join(MEMORY_DIR, 'trading-brain.engram');

export interface Trade {
    id: string;
    timestamp: number;
    marketId: string;
    marketQuestion: string;
    side: 'YES' | 'NO';
    entryPrice: number;
    exitPrice?: number;
    shares: number;
    amount: number;
    edge: number;
    confidence: number;
    signals: string[];
    status: 'open' | 'closed' | 'resolved';
    pnl?: number;
    lesson?: string;
    resolution?: 'win' | 'loss' | 'push';
}

export interface MarketMemory {
    question: string;
    category: string;
    lastSeen: number;
    trades: number;
    wins: number;
    losses: number;
    avgEdge: number;
    notes: string[];
}

// Type for EngramTrace instance
type EngramTraceInstance = {
    init(): Promise<void>;
    remember(content: string, options?: { importance?: number; metadata?: Record<string, any> }): Promise<void>;
    recall(query: string, options?: { limit?: number }): Promise<Array<{ content: string; score: number; metadata?: Record<string, any> }>>;
    close(): Promise<void>;
};

export class TradingMemory {
    private trace: EngramTraceInstance | null = null;
    private trades: Map<string, Trade> = new Map();
    private initialized = false;

    /**
     * Initialize memory system
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        await fs.mkdir(MEMORY_DIR, { recursive: true });

        try {
            // Dynamic import to handle optional dependency
            const { EngramTrace } = await import('@terronex/engram-trace');

            // Initialize EngramTrace
            this.trace = new EngramTrace({
                file: BRAIN_FILE,
                embedder: { provider: 'local', model: 'Xenova/all-MiniLM-L6-v2' },
            }) as unknown as EngramTraceInstance;

            await this.trace.init();
            this.initialized = true;
        } catch (err) {
            console.warn('EngramTrace not available, using fallback memory:', (err as Error).message);
            await this.loadFallback();
            this.initialized = true;
        }
    }

    /**
     * Load fallback JSON memory if Engram not available
     */
    private async loadFallback(): Promise<void> {
        const tradesFile = path.join(MEMORY_DIR, 'trades.json');
        try {
            const data = await fs.readFile(tradesFile, 'utf-8');
            const parsed = JSON.parse(data);
            for (const trade of parsed.trades || []) {
                this.trades.set(trade.id, trade);
            }
        } catch {
            // No existing trades
        }
    }

    /**
     * Save memory to disk
     */
    async save(): Promise<void> {
        if (this.trace) {
            // Trace auto-saves, but we can close and reopen
            await this.trace.close();
            const { EngramTrace } = await import('@terronex/engram-trace');
            this.trace = new EngramTrace({
                file: BRAIN_FILE,
                embedder: { provider: 'local', model: 'Xenova/all-MiniLM-L6-v2' },
            }) as unknown as EngramTraceInstance;
            await this.trace.init();
        }
        
        // Always save fallback too
        const tradesFile = path.join(MEMORY_DIR, 'trades.json');
        const data = {
            trades: Array.from(this.trades.values()),
            lastUpdated: Date.now(),
        };
        await fs.writeFile(tradesFile, JSON.stringify(data, null, 2));
    }

    /**
     * Record a new trade
     */
    async recordTrade(trade: Omit<Trade, 'id' | 'timestamp' | 'status'>): Promise<Trade> {
        const id = `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const fullTrade: Trade = {
            ...trade,
            id,
            timestamp: Date.now(),
            status: 'open',
        };

        this.trades.set(id, fullTrade);

        // Add to semantic memory
        if (this.trace) {
            await this.trace.remember(
                `Opened ${trade.side} position on "${trade.marketQuestion}" at ${(trade.entryPrice * 100).toFixed(1)}% for $${trade.amount.toFixed(2)}. Edge: ${(trade.edge * 100).toFixed(1)}%, Confidence: ${(trade.confidence * 100).toFixed(0)}%. Signals: ${trade.signals.join(', ')}.`,
                {
                    importance: 0.7,
                    metadata: {
                        type: 'trade_open',
                        tradeId: id,
                        marketId: trade.marketId,
                        side: trade.side,
                        edge: trade.edge,
                        confidence: trade.confidence,
                    },
                }
            );
        }

        await this.save();
        return fullTrade;
    }

    /**
     * Close a trade
     */
    async closeTrade(id: string, exitPrice: number, reason?: string): Promise<Trade | null> {
        const trade = this.trades.get(id);
        if (!trade) return null;

        // Calculate P&L
        const priceDiff = exitPrice - trade.entryPrice;
        const pnl = trade.side === 'YES'
            ? priceDiff * trade.shares
            : -priceDiff * trade.shares;

        trade.exitPrice = exitPrice;
        trade.pnl = pnl;
        trade.status = 'closed';
        trade.resolution = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'push';

        // Add to semantic memory
        if (this.trace) {
            const outcome = pnl >= 0 ? 'profit' : 'loss';
            await this.trace.remember(
                `Closed ${trade.side} position on "${trade.marketQuestion}". Entry: ${(trade.entryPrice * 100).toFixed(1)}%, Exit: ${(exitPrice * 100).toFixed(1)}%. P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${outcome}). Reason: ${reason || 'manual'}. Original edge was ${(trade.edge * 100).toFixed(1)}%.`,
                {
                    importance: pnl < 0 ? 0.9 : 0.7, // Losses are more important to remember
                    metadata: {
                        type: 'trade_close',
                        tradeId: id,
                        marketId: trade.marketId,
                        pnl,
                        outcome,
                        reason,
                    },
                }
            );
        }

        await this.save();
        return trade;
    }

    /**
     * Record a lesson learned from a trade
     */
    async recordLesson(tradeId: string, lesson: string): Promise<void> {
        const trade = this.trades.get(tradeId);
        if (trade) {
            trade.lesson = lesson;
        }

        // Add to semantic memory with high importance
        if (this.trace) {
            await this.trace.remember(
                `LESSON LEARNED: ${lesson}`,
                {
                    importance: 0.95,
                    metadata: {
                        type: 'lesson',
                        tradeId,
                        marketId: trade?.marketId,
                    },
                }
            );
        }

        await this.save();
    }

    /**
     * Recall relevant memories for a market decision
     */
    async recallForMarket(marketQuestion: string, limit = 5): Promise<string[]> {
        if (!this.trace) return [];

        try {
            const results = await this.trace.recall(marketQuestion, { limit });
            return results.map(r => r.content);
        } catch {
            return [];
        }
    }

    /**
     * Recall lessons learned
     */
    async recallLessons(topic?: string, limit = 10): Promise<string[]> {
        if (!this.trace) {
            // Fallback: return lessons from trades
            const lessons: string[] = [];
            for (const trade of this.trades.values()) {
                if (trade.lesson) {
                    if (!topic || trade.lesson.toLowerCase().includes(topic.toLowerCase())) {
                        lessons.push(trade.lesson);
                    }
                }
            }
            return lessons.slice(0, limit);
        }

        try {
            const query = topic ? `lessons about ${topic}` : 'trading lessons learned';
            const results = await this.trace.recall(query, { limit });
            return results.map(r => r.content);
        } catch {
            return [];
        }
    }

    /**
     * Get trade by ID
     */
    getTrade(id: string): Trade | undefined {
        return this.trades.get(id);
    }

    /**
     * Get all open positions
     */
    getOpenPositions(): Trade[] {
        return Array.from(this.trades.values())
            .filter(t => t.status === 'open');
    }

    /**
     * Get trade history
     */
    getTradeHistory(limit = 50): Trade[] {
        return Array.from(this.trades.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * Get performance stats
     */
    getStats(): {
        totalTrades: number;
        openTrades: number;
        wins: number;
        losses: number;
        winRate: number;
        totalPnl: number;
        avgPnl: number;
    } {
        const all = Array.from(this.trades.values());
        const closed = all.filter(t => t.status === 'closed' || t.status === 'resolved');
        const wins = closed.filter(t => t.resolution === 'win').length;
        const losses = closed.filter(t => t.resolution === 'loss').length;
        const totalPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);

        return {
            totalTrades: all.length,
            openTrades: all.filter(t => t.status === 'open').length,
            wins,
            losses,
            winRate: closed.length > 0 ? wins / closed.length : 0,
            totalPnl,
            avgPnl: closed.length > 0 ? totalPnl / closed.length : 0,
        };
    }

    /**
     * Close the memory system
     */
    async close(): Promise<void> {
        if (this.trace) {
            await this.trace.close();
        }
    }
}

// Singleton instance
export const tradingMemory = new TradingMemory();
