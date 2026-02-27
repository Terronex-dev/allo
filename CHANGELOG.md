# Changelog

## 1.1.0 (2026-02-27)

### Features

- Model switcher in Settings menu -- switch LLM provider and model without re-running setup
- Auto-detects installed Ollama models via API
- Lists current Anthropic models: Opus 4.6, Sonnet 4.6, Haiku 4.5, Opus 4.5, Sonnet 4
- Lists OpenAI models: GPT-4o, GPT-4o Mini, o3
- Lists Google models: Gemini 2.5 Pro, Gemini 2.5 Flash
- Embedding model switcher: Local Xenova and Ollama embed models
- Add API keys inline from Settings (no full setup re-run needed)
- Shows active model indicator and greys out providers without keys
- Warning when switching embedding models about re-embedding needs
- Config saved immediately on switch

## 1.0.0 (2026-02-24)

### Features

- Core memory system: addText, addFile, recall, forget, save
- Semantic search with 384-dim MiniLM embeddings (brute-force + HNSW)
- Temporal decay tiers: hot, warm, cold, archive
- Auto-deduplication on addText (cosine similarity > 0.92)
- Memory consolidation pipeline via @terronex/engram-trace-lite
- Interactive CLI with menu, recall, chat, browse, consolidate, forget
- Compact recall view with select-to-view detail cards
- Memory browser: browse by tag, date, tier, recent, or tree hierarchy
- Rich detail view: relevance, tier, decay estimate, access count, importance, word count
- Paginated list navigation with prev/next
- Four LLM providers: Anthropic (OAuth + API key), OpenAI, Google Gemini, Ollama
- Persona mode: load any .engram brain as read-only, chat in character
- Brain switching and discovery from ~/.allo/brains/
- Onboarding wizard for first-run setup
- Multi-modal support: text, images, audio, code, documents
- File attachment storage with external file management
- Local embeddings by default (Xenova/all-MiniLM-L6-v2, no API key needed)
- Programmatic API: Allo class with full TypeScript types
- ESM module system (NodeNext)
- 22/22 tests passing

### Performance

- 96.5% recall accuracy across 399 queries
- 1.6ms average recall latency, 609 queries/sec
- P95: 2ms, P99: 7ms
- Zero crashes on adversarial inputs
