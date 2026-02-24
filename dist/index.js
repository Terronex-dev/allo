/**
 * Allo - Your Neural Memory Assistant
 *
 * "The different kind of AI memory that grows with you"
 *
 * @packageDocumentation
 */
export { Allo } from './allo.js';
export { AnthropicLLM, OpenAILLM, OllamaLLM, GeminiLLM, OllamaEmbeddings, loadConfig, saveConfig, createLLM, validateKey, } from './providers.js';
export { theme, HEADER, banner } from './theme.js';
export { discoverBrains, ensureBrainsDir, getBrainsDir } from './brains.js';
export const VERSION = '1.0.0';
//# sourceMappingURL=index.js.map