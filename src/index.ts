/**
 * Allo - Your Neural Memory Assistant
 *
 * "The different kind of AI memory that grows with you"
 *
 * @packageDocumentation
 */

export { Allo, AlloConfig, AlloMemory } from './allo.js';
export type { ConsolidateConfig, ConsolidationReport, Summarizer } from '@terronex/engram-trace-lite';
export {
    ProviderConfig, LLMProvider, EmbeddingProvider, ChatMessage, ChatResponse,
    AnthropicLLM, OpenAILLM, OllamaLLM, GeminiLLM, OllamaEmbeddings,
    loadConfig, saveConfig, createLLM, validateKey,
} from './providers.js';
export { theme, HEADER, banner } from './theme.js';
export { discoverBrains, ensureBrainsDir, BrainInfo, getBrainsDir } from './brains.js';

// Re-export key types from engram
export { MemoryNode, EngramFile } from '@terronex/engram';

export const VERSION = '1.0.0';
