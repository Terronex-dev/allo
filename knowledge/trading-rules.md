# Trading Rules — Practical Application

*Derived from LMSR theory and Bayesian signal processing*

---

## Entry Rules

### 1. Edge Must Exist
```
Edge = Your probability estimate - Market price
```

**Minimum edge after fees: 5%**

If you think YES is 60% likely and market says 50%, your edge is 10%.
After 1.5% fees, net edge is 8.5%. That's tradeable.

If edge < fees, you lose money on average. Don't trade.

### 2. Confidence Must Be High
Your probability estimate has uncertainty. Only trade when confident:

| Confidence Level | Action |
|-----------------|--------|
| < 50% | Don't trade |
| 50-70% | Small position (1/4 Kelly) |
| 70-85% | Medium position (1/2 Kelly) |
| > 85% | Full fractional Kelly |

### 3. Information Edge Required
Ask: "Why do I know something the market doesn't?"

Valid edges:
- News not yet priced in (you saw it first)
- Domain expertise (you understand the topic better)
- Mathematical mispricing (market odds don't add up)

Not edges:
- "I feel like YES"
- "It's been going up"
- "Everyone says..."

---

## Position Sizing Rules

### Fractional Kelly Formula
```
Position = (Edge / Variance) × Kelly Fraction × Bankroll
```

Where:
- Edge = true prob - market price
- Variance = price × (1 - price)
- Kelly Fraction = 0.25 for short-term, 0.5 for medium-term

### Never Risk More Than 2% Per Trade
Even if Kelly says bet 10%, cap at 2% of bankroll per position.

### Resolution Time Adjustment
| Time to Resolution | Max Kelly Fraction |
|-------------------|-------------------|
| < 1 hour | 0.1 (10%) |
| 1-6 hours | 0.15 |
| 6-24 hours | 0.25 |
| 1-7 days | 0.5 |
| > 7 days | 0.5 |

Short-term = more variance = smaller bets.

---

## Exit Rules

### Stop Loss
Exit if position loses 40% of entry value.
```
Stop price = Entry price × 0.6 (if betting YES)
Stop price = Entry price × 1.4 (if betting NO)
```

### Take Profit
Exit if position gains 50% OR edge disappears.

### Time-Based Exit
Exit 1 hour before market resolution unless extremely confident.
Liquidity dies near resolution.

---

## Bayesian Update Rules

### When to Update Beliefs
1. **News breaks** — Immediately recalculate probability
2. **Price moves 5%+** — Market knows something, investigate
3. **Correlated market moves** — Related events affect your market

### How to Update
```
New belief = Old belief × Likelihood of new evidence
```

In practice:
- Strong evidence FOR: multiply by 1.5-2x
- Weak evidence FOR: multiply by 1.1-1.2x
- Neutral evidence: no change
- Weak evidence AGAINST: multiply by 0.8-0.9x
- Strong evidence AGAINST: multiply by 0.5-0.7x

Then renormalize so probabilities sum to 1.

---

## Risk Management Rules

### Daily Loss Limit: 4% of Bankroll
If daily losses hit 4%, stop trading for the day.
Tomorrow is a new day with new opportunities.

### Consecutive Loss Limit: 3
After 3 losses in a row:
1. Stop trading
2. Review what went wrong
3. Only resume when you understand why

### Cash Reserve: 30%
Never deploy more than 70% of bankroll.
Opportunities require capital.

### Max Positions: 10
Focus beats scatter. Don't spread too thin.

---

## Speed Rules

### Target Latencies
- Signal detection: < 5 seconds
- Probability update: < 1 second  
- Trade decision: < 10 seconds
- Order submission: < 2 seconds

If you're slower, you're trading on stale information.

### Automate What You Can
- Price monitoring: automated
- News ingestion: automated
- Bayesian updates: automated
- Trade execution: semi-automated (approve/reject)

---

## The Meta-Rule

> **If in doubt, don't trade.**

Capital preservation beats profit seeking.
There will always be another opportunity.
Losing money is permanent.
