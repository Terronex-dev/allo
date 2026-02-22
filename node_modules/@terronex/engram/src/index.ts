/**
 * Engram v1.0.4
 * 
 * Neural memory format for AI systems - hierarchical, temporal, multi-modal
 * 
 * @packageDocumentation
 */

// Types
export * from './types';
export type { HNSWConfig } from './types';
export { DEFAULT_HNSW_CONFIG } from './types';

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
export const VERSION = '1.0.4';
export const FORMAT_VERSION = [1, 0] as const;
