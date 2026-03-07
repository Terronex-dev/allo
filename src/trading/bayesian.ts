/**
 * Bayesian Engine — Probabilistic market analysis
 * 
 * Uses Bayes' theorem to update probability estimates based on evidence.
 * Works in log-space for numerical stability.
 */

export interface Signal {
    name: string;
    timestamp: number;
    likelihood: number;  // P(signal | outcome)
    weight: number;      // Signal importance (0-1)
}

export interface MarketState {
    marketId: string;
    question: string;
    currentPrice: number;     // Market's YES price (0-1)
    priorEstimate: number;    // Our prior belief (0-1)
    posteriorEstimate: number; // Updated belief after signals
    signals: Signal[];
    edge: number;             // posterior - currentPrice
    confidence: number;       // How confident we are (0-1)
    lastUpdated: number;
}

export interface BayesianConfig {
    basePrior: number;        // Default prior when no info (0.5)
    minConfidence: number;    // Minimum confidence to trade
    decayRate: number;        // How fast old signals lose weight
    maxSignals: number;       // Max signals to track per market
}

const DEFAULT_CONFIG: BayesianConfig = {
    basePrior: 0.5,
    minConfidence: 0.3,
    decayRate: 0.1,          // 10% decay per hour
    maxSignals: 50,
};

export class BayesianEngine {
    private config: BayesianConfig;
    private markets: Map<string, MarketState> = new Map();

    constructor(config: Partial<BayesianConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Initialize or get market state
     */
    getMarket(marketId: string, question?: string, currentPrice?: number): MarketState {
        let state = this.markets.get(marketId);
        
        if (!state) {
            state = {
                marketId,
                question: question || marketId,
                currentPrice: currentPrice || 0.5,
                priorEstimate: this.config.basePrior,
                posteriorEstimate: this.config.basePrior,
                signals: [],
                edge: 0,
                confidence: 0,
                lastUpdated: Date.now(),
            };
            this.markets.set(marketId, state);
        }

        if (currentPrice !== undefined) {
            state.currentPrice = currentPrice;
        }

        return state;
    }

    /**
     * Add a signal and update posterior estimate
     * 
     * Bayes' Theorem in log-space:
     * log(P(H|D)) = log(P(D|H)) + log(P(H)) - log(P(D))
     */
    addSignal(marketId: string, signal: Omit<Signal, 'timestamp'>): MarketState {
        const state = this.getMarket(marketId);
        
        const fullSignal: Signal = {
            ...signal,
            timestamp: Date.now(),
        };

        state.signals.push(fullSignal);

        // Trim old signals
        if (state.signals.length > this.config.maxSignals) {
            state.signals = state.signals.slice(-this.config.maxSignals);
        }

        // Recalculate posterior
        this.updatePosterior(state);

        return state;
    }

    /**
     * Update posterior estimate using all signals
     */
    private updatePosterior(state: MarketState): void {
        const now = Date.now();
        
        // Start with log-prior
        let logOdds = this.toLogOdds(state.priorEstimate);
        let totalWeight = 0;

        for (const signal of state.signals) {
            // Apply time decay to signal weight
            const ageHours = (now - signal.timestamp) / (1000 * 60 * 60);
            const decayedWeight = signal.weight * Math.exp(-this.config.decayRate * ageHours);

            if (decayedWeight < 0.01) continue; // Skip negligible signals

            // Update log-odds with signal
            // log(P(H|D)/P(~H|D)) += weight * log(P(D|H)/P(D|~H))
            const likelihoodRatio = signal.likelihood / (1 - signal.likelihood);
            logOdds += decayedWeight * Math.log(likelihoodRatio);
            totalWeight += decayedWeight;
        }

        // Convert back to probability
        state.posteriorEstimate = this.fromLogOdds(logOdds);
        
        // Clamp to valid range
        state.posteriorEstimate = Math.max(0.01, Math.min(0.99, state.posteriorEstimate));

        // Calculate edge and confidence
        state.edge = state.posteriorEstimate - state.currentPrice;
        state.confidence = Math.min(1, totalWeight / 5); // Scale confidence by signal count
        state.lastUpdated = now;
    }

    /**
     * Get trading recommendation
     */
    analyze(marketId: string): {
        recommendation: 'BUY_YES' | 'BUY_NO' | 'NO_TRADE';
        edge: number;
        confidence: number;
        kellyFraction: number;
        reasoning: string;
    } {
        const state = this.getMarket(marketId);
        this.updatePosterior(state);

        const absEdge = Math.abs(state.edge);
        const direction = state.edge > 0 ? 'YES' : 'NO';

        // Kelly criterion: f* = (bp - q) / b
        // where b = odds, p = win prob, q = 1-p
        // Simplified for binary markets: f* = edge / variance
        const variance = state.posteriorEstimate * (1 - state.posteriorEstimate);
        const kellyFraction = absEdge / Math.max(variance, 0.01);

        let recommendation: 'BUY_YES' | 'BUY_NO' | 'NO_TRADE' = 'NO_TRADE';
        let reasoning = '';

        if (state.confidence < this.config.minConfidence) {
            reasoning = `Low confidence (${(state.confidence * 100).toFixed(0)}%). Need more signals.`;
        } else if (absEdge < 0.03) {
            reasoning = `Edge too small (${(absEdge * 100).toFixed(1)}%). Not worth the fees.`;
        } else {
            recommendation = state.edge > 0 ? 'BUY_YES' : 'BUY_NO';
            reasoning = `${(absEdge * 100).toFixed(1)}% edge on ${direction}. ` +
                        `Our estimate: ${(state.posteriorEstimate * 100).toFixed(0)}% vs ` +
                        `market: ${(state.currentPrice * 100).toFixed(0)}%`;
        }

        return {
            recommendation,
            edge: state.edge,
            confidence: state.confidence,
            kellyFraction: Math.min(kellyFraction, 0.25), // Cap at 25%
            reasoning,
        };
    }

    /**
     * Bulk update market price
     */
    updatePrice(marketId: string, newPrice: number): void {
        const state = this.getMarket(marketId);
        state.currentPrice = newPrice;
        this.updatePosterior(state);
    }

    /**
     * Convert probability to log-odds
     */
    private toLogOdds(p: number): number {
        const clamped = Math.max(0.001, Math.min(0.999, p));
        return Math.log(clamped / (1 - clamped));
    }

    /**
     * Convert log-odds back to probability
     */
    private fromLogOdds(logOdds: number): number {
        return 1 / (1 + Math.exp(-logOdds));
    }

    /**
     * Export state for persistence
     */
    export(): MarketState[] {
        return Array.from(this.markets.values());
    }

    /**
     * Import state from persistence
     */
    import(states: MarketState[]): void {
        for (const state of states) {
            this.markets.set(state.marketId, state);
        }
    }
}

/**
 * Signal generators for common data sources
 */
export const SignalGenerators = {
    /**
     * Generate signal from sentiment score (-1 to 1)
     */
    fromSentiment(name: string, sentiment: number, weight = 0.5): Omit<Signal, 'timestamp'> {
        // Convert sentiment (-1 to 1) to likelihood (0 to 1)
        const likelihood = (sentiment + 1) / 2;
        return { name, likelihood, weight };
    },

    /**
     * Generate signal from poll result
     */
    fromPoll(name: string, yesPercent: number, sampleSize: number): Omit<Signal, 'timestamp'> {
        // Weight based on sample size (diminishing returns)
        const weight = Math.min(1, Math.log10(sampleSize) / 4);
        return { name, likelihood: yesPercent / 100, weight };
    },

    /**
     * Generate signal from expert prediction
     */
    fromExpert(name: string, prediction: number, credibility = 0.7): Omit<Signal, 'timestamp'> {
        return { name, likelihood: prediction, weight: credibility };
    },

    /**
     * Generate signal from price movement
     */
    fromPriceMove(name: string, priceChange: number): Omit<Signal, 'timestamp'> {
        // Price moving up = market thinks more likely
        // Dampen extreme moves
        const dampened = Math.tanh(priceChange * 5);
        const likelihood = 0.5 + dampened * 0.3;
        return { name, likelihood, weight: 0.3 };
    },
};
