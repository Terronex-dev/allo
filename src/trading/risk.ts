/**
 * Risk Manager — Position sizing and risk controls
 * 
 * Implements fractional Kelly criterion with safety limits.
 */

export interface RiskConfig {
    maxPositionUsd: number;      // Max single position
    maxTotalExposure: number;    // Max total capital at risk
    kellyFraction: number;       // Fraction of Kelly to use (0.1 = 10%)
    minEdge: number;             // Minimum edge to trade (0.05 = 5%)
    dailyLossLimit: number;      // Stop trading if daily loss exceeds
    maxDrawdown: number;         // Max drawdown before pause (0.2 = 20%)
    minConfidence: number;       // Minimum confidence to trade
}

export interface Position {
    marketId: string;
    side: 'YES' | 'NO';
    shares: number;
    avgPrice: number;
    currentPrice: number;
    unrealizedPnl: number;
}

export interface RiskState {
    currentExposure: number;
    dailyPnl: number;
    dailyTrades: number;
    peakBalance: number;
    currentBalance: number;
    drawdown: number;
    positions: Position[];
}

// Trading fees eat into edge - must account for them
const TRADING_FEE = 0.01;           // 1% Polymarket fee
const SLIPPAGE_ESTIMATE = 0.005;    // 0.5% estimated slippage
const TOTAL_FEES = TRADING_FEE + SLIPPAGE_ESTIMATE;  // 1.5% total cost

const DEFAULT_CONFIG: RiskConfig = {
    maxPositionUsd: 10,
    maxTotalExposure: 50,
    kellyFraction: 0.1,
    minEdge: 0.05,              // 5% edge required BEFORE fees
    dailyLossLimit: 20,
    maxDrawdown: 0.2,
    minConfidence: 0.3,
};

export class RiskManager {
    private config: RiskConfig;
    private state: RiskState;

    constructor(config: Partial<RiskConfig> = {}, initialBalance = 100) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = {
            currentExposure: 0,
            dailyPnl: 0,
            dailyTrades: 0,
            peakBalance: initialBalance,
            currentBalance: initialBalance,
            drawdown: 0,
            positions: [],
        };
    }

    /**
     * Calculate optimal position size using Kelly Criterion
     * 
     * Kelly formula: f* = (bp - q) / b
     * where:
     *   b = net odds (payout ratio)
     *   p = probability of winning
     *   q = probability of losing (1 - p)
     * 
     * For binary markets with equal payout:
     *   f* = 2p - 1 (when p > 0.5)
     * 
     * We use fractional Kelly (e.g., 1/10th) for safety.
     */
    calculatePositionSize(params: {
        edge: number;           // Our edge (estimated prob - market prob)
        confidence: number;     // How confident in our estimate (0-1)
        marketPrice: number;    // Current market price (0-1)
        balance: number;        // Available balance
    }): {
        recommendedSize: number;
        maxSize: number;
        kellySize: number;
        reason: string;
        approved: boolean;
        netEdge: number;        // Edge after fees
    } {
        const { edge, confidence, marketPrice, balance } = params;
        const absEdge = Math.abs(edge);

        // CRITICAL: Subtract fees from edge - this is the REAL edge
        const netEdge = absEdge - TOTAL_FEES;

        // If edge doesn't cover fees, we LOSE money on average
        if (netEdge <= 0) {
            return {
                recommendedSize: 0,
                maxSize: 0,
                kellySize: 0,
                reason: `Edge ${(absEdge * 100).toFixed(1)}% doesn't cover fees (${(TOTAL_FEES * 100).toFixed(1)}%). Net edge: ${(netEdge * 100).toFixed(1)}%. NO TRADE.`,
                approved: false,
                netEdge,
            };
        }

        // Check minimum edge (after fees)
        if (netEdge < this.config.minEdge) {
            return {
                recommendedSize: 0,
                maxSize: 0,
                kellySize: 0,
                reason: `Net edge ${(netEdge * 100).toFixed(1)}% (after ${(TOTAL_FEES * 100).toFixed(1)}% fees) below minimum ${(this.config.minEdge * 100).toFixed(0)}%`,
                approved: false,
                netEdge,
            };
        }

        // Check confidence
        if (confidence < this.config.minConfidence) {
            return {
                recommendedSize: 0,
                maxSize: 0,
                kellySize: 0,
                reason: `Confidence ${(confidence * 100).toFixed(0)}% below minimum ${(this.config.minConfidence * 100).toFixed(0)}%`,
                approved: false,
                netEdge,
            };
        }

        // Check daily loss limit
        if (this.state.dailyPnl <= -this.config.dailyLossLimit) {
            return {
                recommendedSize: 0,
                maxSize: 0,
                kellySize: 0,
                reason: `Daily loss limit reached ($${this.config.dailyLossLimit})`,
                approved: false,
                netEdge,
            };
        }

        // Check drawdown
        if (this.state.drawdown >= this.config.maxDrawdown) {
            return {
                recommendedSize: 0,
                maxSize: 0,
                kellySize: 0,
                reason: `Max drawdown reached (${(this.state.drawdown * 100).toFixed(0)}%)`,
                approved: false,
                netEdge,
            };
        }

        // Calculate Kelly fraction using NET EDGE (after fees)
        // For binary markets: f* = edge / variance
        const variance = marketPrice * (1 - marketPrice);
        const fullKelly = netEdge / Math.max(variance, 0.01);
        
        // Apply fractional Kelly
        const fractionalKelly = fullKelly * this.config.kellyFraction;
        
        // Convert to dollar amount
        const kellySize = fractionalKelly * balance;

        // Apply confidence scaling
        const confidenceScaled = kellySize * confidence;

        // Apply limits
        const maxByPosition = this.config.maxPositionUsd;
        const maxByExposure = this.config.maxTotalExposure - this.state.currentExposure;
        const maxByBalance = balance * 0.5; // Never risk more than 50% of balance

        const maxSize = Math.min(maxByPosition, maxByExposure, maxByBalance);
        const recommendedSize = Math.min(confidenceScaled, maxSize);

        // Round to reasonable precision
        const finalSize = Math.floor(recommendedSize * 100) / 100;

        return {
            recommendedSize: Math.max(0, finalSize),
            maxSize,
            kellySize,
            reason: `Gross edge: ${(absEdge * 100).toFixed(1)}%, Fees: ${(TOTAL_FEES * 100).toFixed(1)}%, Net edge: ${(netEdge * 100).toFixed(1)}%, Kelly: $${kellySize.toFixed(2)}, Recommended: $${finalSize.toFixed(2)}`,
            approved: finalSize > 0,
            netEdge,
        };
    }

    /**
     * Get fee info
     */
    getFees(): { tradingFee: number; slippage: number; total: number } {
        return {
            tradingFee: TRADING_FEE,
            slippage: SLIPPAGE_ESTIMATE,
            total: TOTAL_FEES,
        };
    }

    /**
     * Check if trade is allowed
     */
    canTrade(): { allowed: boolean; reason: string } {
        if (this.state.dailyPnl <= -this.config.dailyLossLimit) {
            return { allowed: false, reason: 'Daily loss limit reached' };
        }

        if (this.state.drawdown >= this.config.maxDrawdown) {
            return { allowed: false, reason: 'Max drawdown reached' };
        }

        if (this.state.currentExposure >= this.config.maxTotalExposure) {
            return { allowed: false, reason: 'Max exposure reached' };
        }

        return { allowed: true, reason: 'OK' };
    }

    /**
     * Record a new position
     */
    addPosition(position: Omit<Position, 'unrealizedPnl'>): void {
        this.state.positions.push({
            ...position,
            unrealizedPnl: 0,
        });
        this.state.currentExposure += position.shares * position.avgPrice;
        this.state.dailyTrades++;
    }

    /**
     * Close a position and record P&L
     */
    closePosition(marketId: string, exitPrice: number): number {
        const idx = this.state.positions.findIndex(p => p.marketId === marketId);
        if (idx === -1) return 0;

        const position = this.state.positions[idx];
        const priceDiff = exitPrice - position.avgPrice;
        const pnl = position.side === 'YES' 
            ? priceDiff * position.shares 
            : -priceDiff * position.shares;

        // Update state
        this.state.positions.splice(idx, 1);
        this.state.currentExposure -= position.shares * position.avgPrice;
        this.state.dailyPnl += pnl;
        this.state.currentBalance += pnl;

        // Update peak and drawdown
        if (this.state.currentBalance > this.state.peakBalance) {
            this.state.peakBalance = this.state.currentBalance;
        }
        this.state.drawdown = (this.state.peakBalance - this.state.currentBalance) / this.state.peakBalance;

        return pnl;
    }

    /**
     * Update unrealized P&L for all positions
     */
    updatePrices(prices: Map<string, number>): void {
        for (const position of this.state.positions) {
            const currentPrice = prices.get(position.marketId);
            if (currentPrice !== undefined) {
                position.currentPrice = currentPrice;
                const priceDiff = currentPrice - position.avgPrice;
                position.unrealizedPnl = position.side === 'YES'
                    ? priceDiff * position.shares
                    : -priceDiff * position.shares;
            }
        }
    }

    /**
     * Reset daily stats (call at midnight)
     */
    resetDaily(): void {
        this.state.dailyPnl = 0;
        this.state.dailyTrades = 0;
    }

    /**
     * Get current state
     */
    getState(): RiskState {
        return { ...this.state };
    }

    /**
     * Update config
     */
    updateConfig(updates: Partial<RiskConfig>): void {
        this.config = { ...this.config, ...updates };
    }

    /**
     * Get config
     */
    getConfig(): RiskConfig {
        return { ...this.config };
    }
}
