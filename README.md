# Allo — Your Neural Memory Assistant

**The different kind of AI memory that grows with you.**

[![npm version](https://img.shields.io/npm/v/@terronex/allo.svg)](https://www.npmjs.com/package/@terronex/allo)
[![Powered by Engram](https://img.shields.io/badge/Powered%20by-Engram-ef4444)](https://github.com/Terronex-dev/engram)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-22%2F22-2ed573)]()

Allo is a personal memory system for humans and AI agents. It stores everything you tell it in a single `.engram` file, finds relevant memories using semantic search, and gets smarter over time through temporal decay — recent memories are vivid, old ones fade to summaries, just like a real brain.

Built on the [Engram](https://github.com/Terronex-dev/engram) neural memory format.

---

## Quick Start

```bash
npm install -g @terronex/allo

# First run walks you through setup
allo

# Or jump straight in
allo remember "The meeting with Sarah went well — she approved the Q3 budget"
allo recall "budget approval"
```

## What It Does

**Remember** anything — text, files, images, documents:
```bash
allo remember "HNSW indexing gives us 400x faster search"
allo remember-file ./research-paper.pdf --caption "Ebbinghaus forgetting curve study"
```

**Recall** by meaning, not keywords:
```bash
allo recall "fast search algorithms"
# Returns: "HNSW indexing gives us 400x faster search" (85%)
```

**Chat** with your memories (requires an LLM provider):
```bash
allo chat
# You: What do I know about search performance?
# Allo: Based on your memories, HNSW indexing provides 400x faster search...
```

**Track** your brain's health:
```bash
allo stats
```
```
Brain Health Report
──────────────────────────────
  File:      ~/allo-memory.engram
  Memories:  847
  Size:      2.3 MB
  Model:     Xenova/all-MiniLM-L6-v2
  LLM:       anthropic/claude-sonnet-4

  HOT     ████████░░░░░░░░░░░░ 124
  WARM    ██████████████░░░░░░ 283
  COLD    ████████████████████ 312
  ARCHIVE ████████░░░░░░░░░░░░ 128
```

## How Memory Works

Allo uses Ebbinghaus-inspired temporal decay. Every memory starts **hot** and naturally cools over time:

| Tier | Age | Behavior |
|------|-----|----------|
| **HOT** | 0-7 days | Full detail, boosted in search |
| **WARM** | 7-30 days | Full detail, normal ranking |
| **COLD** | 30-90 days | Candidates for summarization |
| **ARCHIVE** | 90+ days | Compressed, still searchable |

Accessing a memory reheats it. Frequently recalled memories stay hot forever.

## AI Providers

Allo works with multiple AI providers for smart recall and chat. Set up during onboarding or anytime with `allo setup`.

| Provider | Auth | Use Case |
|----------|------|----------|
| **Local** (default) | None | Embeddings via Xenova/transformers — free, private |
| **Ollama** | None | Local LLM + embeddings — free, private |
| **Anthropic** | API key or OAuth | Claude for chat and smart recall |
| **OpenAI** | API key | GPT-4o for chat and smart recall |
| **Google** | API key | Gemini for chat and smart recall |

### Anthropic OAuth

Allo supports Anthropic OAuth tokens for keyless authentication:

```bash
# Get an OAuth token
npx @anthropic-ai/claude-code auth

# Paste it during allo setup — tokens starting with sk-ant-oat- are auto-detected
allo setup
```

## Programmatic Usage

```typescript
import { Allo } from '@terronex/allo';

const brain = new Allo({
  memoryFile: 'agent-brain.engram',
  password: 'optional-encryption-passphrase',
});

await brain.initialize();

// Store memories
const id = await brain.addText('Project deadline is March 15th', undefined, ['work', 'deadline']);
await brain.addFile('./diagram.png', 'System architecture diagram', id);

// Recall by meaning
const results = await brain.recall('when is the deadline?');
// [{ content: 'Project deadline is March 15th', tier: 'hot', score: 0.87, ... }]

// Get everything (for stats, export, etc.)
const all = brain.getAll();

// Persist
await brain.save();
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `allo` | Interactive menu (no args) |
| `allo remember [text]` | Add a text memory |
| `allo remember-file <path>` | Add a file memory |
| `allo recall <query>` | Semantic search |
| `allo chat` | Chat with your memories |
| `allo stats` | Brain health report |
| `allo setup` | Configure providers |
| `allo demo` | Guided demo |

### Options

```
-t, --tags <tags>     Comma-separated tags
-p, --parent <id>     Parent memory ID (creates hierarchy)
-f, --file <path>     Use a specific .engram file
-l, --limit <n>       Max recall results (default: 8)
```

## Architecture

```
┌─────────────────────────────────────────┐
│  CLI / Interactive Menu                 │
├─────────────────────────────────────────┤
│  Allo Core                              │
│  ┌───────────┐ ┌──────────┐ ┌────────┐ │
│  │ addText   │ │ recall   │ │ save   │ │
│  │ addFile   │ │ getAll   │ │ load   │ │
│  └───────────┘ └──────────┘ └────────┘ │
├─────────────────────────────────────────┤
│  Providers                              │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Anthropic│ │ Ollama   │ │ OpenAI  │ │
│  │ (+ OAuth)│ │ (local)  │ │ Gemini  │ │
│  └──────────┘ └──────────┘ └─────────┘ │
├─────────────────────────────────────────┤
│  @terronex/engram                       │
│  HNSW Index · MemoryTree · Encryption   │
│  MessagePack · Temporal Decay           │
├─────────────────────────────────────────┤
│  allo-memory.engram (single file)       │
└─────────────────────────────────────────┘
```

## Configuration

Stored in `~/.allo/config.json`:

```json
{
  "embeddings": { "provider": "local", "model": "Xenova/all-MiniLM-L6-v2" },
  "llm": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" },
  "keys": { "anthropic": "sk-ant-..." },
  "ollamaUrl": "http://localhost:11434",
  "memoryFile": "~/allo-memory.engram"
}
```

## Why Allo?

Most AI memory is just a vector database with extra steps. Allo is different:

- **One file** — no database server, no cloud dependency. Copy your brain to a USB stick.
- **Temporal decay** — memories fade naturally. No manual cleanup. No infinite context bloat.
- **Hierarchical** — memories form trees, not flat lists. Context is preserved.
- **Multi-modal** — text, images, audio, code, documents. All in one file.
- **Encrypted** — AES-256-GCM with Argon2id key derivation. Your memories are yours.
- **Local-first** — embeddings run on your machine. No data leaves unless you choose a cloud LLM.

> "The first single-file format that actually tries to behave like a real human long-term memory instead of just being a fancy vector dump." — Grok

## Technical Details

For the deep dive into how the Engram format works, including the full `MemoryNode` schema, HNSW configuration, temporal decay algorithms, and 5-year brain projections, see [GROK_ANALYSIS.md](GROK_ANALYSIS.md).

## License

MIT - Terronex 2026
