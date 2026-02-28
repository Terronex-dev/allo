/**
 * Engram v2.0.0
 * 
 * Neural memory format for AI systems - hierarchical, temporal, multi-modal
 * V2: Graph extensions with typed links, spatial positions, and auto-linking
 * 
 * @packageDocumentation
 */

// Types
export * from './types';
export type { HNSWConfig } from './types';
export { DEFAULT_HNSW_CONFIG, DEFAULT_EMBEDDING_CONFIG } from './types';

// Core
export {
  generateId,
  MemoryTree,
  getDecayTier,
  touchNode,
  isExpired,
  cosineSimilarity,
  searchNodes,
  searchNodesHNSW,
  searchNodesBruteForce,
  createNode,
  createLink
} from './core';

// V2: Graph extensions
export {
  MemoryGraph,
  Position
} from './graph';

// I/O
export {
  writeEngram,
  readEngram,
  writeEngramFile,
  readEngramFile,
  ensureEngramExtension,
  StreamingWriter,
  migrateV2toEngram,
  WriteOptions,
  ReadOptions,
  ENGRAM_EXTENSION
} from './io';

// Version info
export const VERSION = '2.0.0';
export const FORMAT_VERSION = [2, 0] as const;
