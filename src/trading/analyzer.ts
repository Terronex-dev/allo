/**
 * Market Analyzer — LLM-powered market analysis
 * 
 * Uses Claude to:
 * - Understand market questions
 * - Interpret news and signals
 * - Estimate probabilities
 * - Explain trading decisions
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, type LLMProvider, type ChatMessage } from '../providers.js';
import { tradingMemory } from './memory.js';

const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge');

export interface MarketAnalysis {
    question: string;
    marketPrice: number;
    estimatedProbability: number;
    confidence: number;
    edge: number;
    recommendation: 'BUY_YES' | 'BUY_NO' | 'HOLD';
    reasoning: string;
    signals: string[];
    risks: string[];
}

export interface AnalyzerConfig {
    llm: LLMProvider;
    maxTokens?: number;
}

export class MarketAnalyzer {
    private llm: LLMProvider;
    private maxTokens: number;
    private tradingRules: string = '';
    private tradingMath: string = '';

    constructor(config: AnalyzerConfig) {
        this.llm = config.llm;
        this.maxTokens = config.maxTokens || 1024;
    }

    /**
     * Load trading knowledge from files
     */
    async loadKnowledge(): Promise<void> {
        try {
            this.tradingRules = await fs.readFile(
                path.join(KNOWLEDGE_DIR, 'trading-rules.md'),
                'utf-8'
            );
            this.tradingMath = await fs.readFile(
                path.join(KNOWLEDGE_DIR, 'trading-mathematics.md'),
                'utf-8'
            );
        } catch {
            console.warn('Could not load trading knowledge files');
        }
    }

    /**
     * Analyze a market and provide recommendation
     */
    async analyze(params: {
        question: string;
        marketPrice: number;
        volume24h: number;
        endDate: Date;
        news?: string[];
        relatedMarkets?: { question: string; price: number }[];
    }): Promise<MarketAnalysis> {
        const { question, marketPrice, volume24h, endDate, news, relatedMarkets } = params;

        // Get relevant memories
        const memories = await tradingMemory.recallForMarket(question, 5);
        const lessons = await tradingMemory.recallLessons(question.split(' ')[0], 3);

        // Build context
        const hoursUntilResolution = (endDate.getTime() - Date.now()) / (1000 * 60 * 60);
        
        const systemPrompt = `You are Allo Trade, an expert prediction market analyst. Your sole purpose is to make money and avoid losses.

## Trading Knowledge
${this.tradingRules}

## Mathematical Foundation
${this.tradingMath}

## Core Rules
1. NEVER trade without edge > fees (1.5%)
2. Estimate probabilities based on evidence, not gut
3. Be honest about uncertainty — low confidence = no trade
4. Preservation > profit — if unsure, hold

Respond in JSON format only.`;

        const userPrompt = `Analyze this prediction market:

**Question:** ${question}
**Current Price:** ${(marketPrice * 100).toFixed(1)}% YES
**24h Volume:** $${volume24h.toLocaleString()}
**Resolves In:** ${hoursUntilResolution.toFixed(1)} hours

${news && news.length > 0 ? `**Recent News:**\n${news.map(n => `- ${n}`).join('\n')}` : ''}

${relatedMarkets && relatedMarkets.length > 0 ? `**Related Markets:**\n${relatedMarkets.map(m => `- ${m.question}: ${(m.price * 100).toFixed(0)}%`).join('\n')}` : ''}

${memories.length > 0 ? `**Relevant Memories:**\n${memories.join('\n')}` : ''}

${lessons.length > 0 ? `**Lessons Learned:**\n${lessons.join('\n')}` : ''}

Provide your analysis as JSON:
{
    "estimatedProbability": <0.0-1.0>,
    "confidence": <0.0-1.0>,
    "recommendation": "BUY_YES" | "BUY_NO" | "HOLD",
    "reasoning": "<2-3 sentences explaining your estimate>",
    "signals": ["<signal 1>", "<signal 2>", ...],
    "risks": ["<risk 1>", "<risk 2>", ...]
}`;

        try {
            const response = await this.llm.chat({
                model: 'claude-sonnet-4-20250514',
                messages: [
                    { role: 'user', content: userPrompt }
                ],
                system: systemPrompt,
                maxTokens: this.maxTokens,
            });

            // Parse JSON response
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);
            const edge = parsed.estimatedProbability - marketPrice;

            return {
                question,
                marketPrice,
                estimatedProbability: parsed.estimatedProbability,
                confidence: parsed.confidence,
                edge,
                recommendation: parsed.recommendation,
                reasoning: parsed.reasoning,
                signals: parsed.signals || [],
                risks: parsed.risks || [],
            };
        } catch (err: any) {
            console.error('Analysis failed:', err.message);
            
            // Return conservative fallback
            return {
                question,
                marketPrice,
                estimatedProbability: marketPrice, // No edge
                confidence: 0,
                edge: 0,
                recommendation: 'HOLD',
                reasoning: `Analysis failed: ${err.message}. Holding is the safe choice.`,
                signals: [],
                risks: ['Analysis error — cannot assess market'],
            };
        }
    }

    /**
     * Explain a trade decision
     */
    async explainTrade(trade: {
        question: string;
        side: 'YES' | 'NO';
        entryPrice: number;
        amount: number;
        edge: number;
        confidence: number;
    }): Promise<string> {
        const prompt = `Explain this trade decision in 2-3 sentences:

Market: ${trade.question}
Position: ${trade.side} at ${(trade.entryPrice * 100).toFixed(1)}%
Size: $${trade.amount.toFixed(2)}
Edge: ${(trade.edge * 100).toFixed(1)}%
Confidence: ${(trade.confidence * 100).toFixed(0)}%

Be concise and focus on the key reasoning.`;

        try {
            const response = await this.llm.chat({
                model: 'claude-sonnet-4-20250514',
                messages: [{ role: 'user', content: prompt }],
                maxTokens: 256,
            });
            return response.content;
        } catch {
            return `Betting ${trade.side} with ${(trade.edge * 100).toFixed(1)}% edge at ${(trade.confidence * 100).toFixed(0)}% confidence.`;
        }
    }

    /**
     * Generate post-trade lesson
     */
    async generateLesson(trade: {
        question: string;
        side: 'YES' | 'NO';
        entryPrice: number;
        exitPrice: number;
        pnl: number;
        signals: string[];
    }): Promise<string> {
        const outcome = trade.pnl >= 0 ? 'won' : 'lost';
        
        const prompt = `Generate a brief lesson from this ${outcome} trade:

Market: ${trade.question}
Position: ${trade.side}
Entry: ${(trade.entryPrice * 100).toFixed(1)}%
Exit: ${(trade.exitPrice * 100).toFixed(1)}%
P&L: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}
Signals used: ${trade.signals.join(', ')}

One sentence lesson that could help future trades:`;

        try {
            const response = await this.llm.chat({
                model: 'claude-sonnet-4-20250514',
                messages: [{ role: 'user', content: prompt }],
                maxTokens: 128,
            });
            return response.content.trim();
        } catch {
            return `${outcome === 'won' ? 'Successful' : 'Failed'} ${trade.side} trade on ${trade.question.slice(0, 30)}...`;
        }
    }
}
