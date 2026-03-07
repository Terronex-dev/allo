# Trading Mathematics — Core Principles

*Extracted from Quantitative Research Division — Prediction Markets Desk*

---

## 1. LMSR Cost Function

The Logarithmic Market Scoring Rule governs how prediction markets price beliefs:

```
C(q) = b · ln(Σ e^(qi/b))
```

Where:
- `b` = liquidity parameter (market depth)
- Larger `b` = more liquidity, tighter spreads, higher max loss for market maker

**Maximum market maker loss:**
```
Lmax = b · ln(n)
```

For binary markets (n=2) with b=100,000: Lmax ≈ $69,315

---

## 2. Price Function (Softmax)

The instantaneous price of outcome i:

```
pi(q) = e^(qi/b) / Σ e^(qj/b)
```

**Critical insight:** This is *identical* to the softmax function in neural network classifiers.

> "The market is a neural network that prices beliefs."

Properties:
- Σpi = 1 (prices sum to 1)
- pi ∈ (0, 1) for all i (all prices between 0 and 1)

---

## 3. Bayes' Theorem — Core Update Rule

How to update beliefs given new data:

```
P(H|D) = P(D|H) · P(H) / P(D)
       = likelihood × prior / evidence
```

> **"The traders who update fastest and most accurately win. Period."**

This is the fundamental truth of prediction markets. Speed AND accuracy.

---

## 4. Sequential Bayesian Updating

For a stream of data points D1, D2, ..., Dt:

```
P(H|D1,...,Dt) ∝ P(H) · Π P(Dk|H)
```

In log-space (numerically stable):
```
log P(H|D) = log P(H) + Σ log P(Dk|H) - log Z
```

Where Z is the normalizing constant.

**Use log-space to avoid numerical underflow with many updates.**

---

## 5. Expected Value — Position Sizing

Expected value of a position at market price p with true probability p̂:

```
EV = p̂ · (1-p) - (1-p̂) · p = p̂ - p
```

This is your **edge**. If EV ≤ 0, don't trade.

---

## 6. Update Cycle Latency (Production Reference)

| Component | Avg Latency | p99 |
|-----------|-------------|-----|
| Data ingestion (API/websocket) | 120ms | 340ms |
| Bayesian posterior computation | 15ms | 28ms |
| LMSR price comparison | 3ms | 8ms |
| Order execution (CLOB) | 690ms | 1400ms |
| **Total cycle** | **828ms** | **1776ms** |

You're competing against systems that update in under 1 second.

---

## 7. Critical Rules

### NEVER full Kelly on short-term markets
> "NEVER full Kelly on 5min markets!"

Short-term markets have:
- Higher variance
- Less time for edge to realize
- More noise in signals

Use fractional Kelly (1/4 to 1/2) for markets resolving < 24 hours.

### The Market Prices Beliefs
The market IS a belief aggregator. When you trade, you're saying:
> "I believe the market is wrong by X%"

If you don't have information the market doesn't, you probably don't have edge.

### Speed Matters
The latency table shows professional systems run full cycles in ~800ms.
- If you're updating beliefs manually, you're too slow
- Automate signal processing
- Automate Bayesian updates
- Only execution can be discretionary

---

## Philosophy

1. **Markets are neural networks** — They aggregate information through price
2. **Bayesian thinking is mandatory** — Update beliefs with evidence, not emotion
3. **Edge = true probability - market price** — No edge = no trade
4. **Speed AND accuracy win** — Fast wrong is worse than slow right
5. **Fractional Kelly protects capital** — Never full Kelly, especially short-term
6. **Fees are real** — Subtract them from edge before calculating

---

*These principles are non-negotiable. Violating them means losing money.*
