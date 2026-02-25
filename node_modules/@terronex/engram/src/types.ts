/**
 * Engram Core Types
 * 
 * Neural memory format for AI systems - hierarchical, temporal, multi-modal
 */

// ============== HEADER ==============

export interface EngramHeader {
  version: [1, number];
  created: number;
  modified: number;
  
  security: SecurityConfig;
  metadata: FileMetadata;
  schema: SchemaConfig;
  stats: FileStats;
}

export interface SecurityConfig {
  encrypted: boolean;
  algorithm: 'aes-256-gcm' | 'none';
  kdf: 'argon2id' | 'pbkdf2' | 'none';
  salt?: Uint8Array;
  nonce?: Uint8Array;
  integrity: Uint8Array;
  signature?: Uint8Array;
}

export interface FileMetadata {
  source: string;
  description?: string;
  tags?: string[];
  author?: string;
}

export interface SchemaConfig {
  embeddingModel: string;
  embeddingDims: number;
  chunkStrategy: 'paragraph' | 'sentence' | 'fixed' | 'semantic';
  modalities: Modality[];
}

export interface FileStats {
  totalChunks: number;
  totalTokens: number;
  rootNodes: number;
  maxDepth: number;
  entityCount: number;
  linkCount: number;
}

// ============== NODES ==============

export type Modality = 'text' | 'image' | 'audio' | 'code';
export type DecayTier = 'hot' | 'warm' | 'cold' | 'archive';
export type QualitySource = 'direct' | 'inferred' | 'summarized';
export type ContentType = 'text' | 'image' | 'audio' | 'code' | 'summary';

export interface MemoryNode {
  id: string;
  
  // Hierarchy
  parentId: string | null;
  children: string[];
  depth: number;
  path: string;
  
  // Content
  content: NodeContent;
  
  // Embedding
  embedding?: Float32Array;
  embeddingModel?: string;
  
  // Temporal
  temporal: TemporalInfo;
  
  // Quality
  quality: QualityInfo;
  
  // Metadata
  metadata: NodeMetadata;
}

export interface NodeContent {
  type: ContentType;
  data: string | Uint8Array;
  mimeType?: string;
  language?: string;
  tokens?: number;
  
  // For summaries
  originalLength?: number;
  originalHash?: string;
  
  // For references
  ref?: ExternalRef;
}

export interface ExternalRef {
  type: 'file' | 'url';
  path: string;
  hash?: string;
}

export interface TemporalInfo {
  created: number;
  modified: number;
  accessed: number;
  expires?: number;
  decayTier: DecayTier;
}

export interface QualityInfo {
  score: number;
  confidence: number;
  source: QualitySource;
  verified?: boolean;
}

export interface NodeMetadata {
  sourceFile?: string;
  sourceLine?: number;
  tags?: string[];
  custom?: Record<string, unknown>;
}

// ============== ENTITIES ==============

export type EntityType = 'person' | 'place' | 'organization' | 'concept' | 'event' | 'document';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  aliases?: string[];
  
  properties: Record<string, unknown>;
  
  mentions: EntityMention[];
  relationships: EntityRelationship[];
}

export interface EntityMention {
  nodeId: string;
  span: [number, number];
  confidence: number;
}

export interface EntityRelationship {
  targetId: string;
  type: string;
  properties?: Record<string, unknown>;
}

// ============== LINKS ==============

export type LinkType = 
  | 'related' 
  | 'references' 
  | 'contradicts' 
  | 'supersedes' 
  | 'elaborates' 
  | 'summarizes' 
  | 'causes' 
  | 'follows';

export type LinkCreator = 'user' | 'agent' | 'system';

export interface MemoryLink {
  id: string;
  sourceId: string;
  targetId: string;
  
  type: LinkType;
  confidence: number;
  bidirectional: boolean;
  
  created: number;
  createdBy: LinkCreator;
  
  metadata?: Record<string, unknown>;
}

// ============== DELTAS (STREAMING) ==============

export type DeltaOperation = 'add' | 'update' | 'delete' | 'link' | 'unlink';

export interface Delta {
  id: string;
  timestamp: number;
  operation: DeltaOperation;
  
  node?: MemoryNode;
  nodeId?: string;
  updates?: Partial<MemoryNode>;
  link?: MemoryLink;
}

// ============== FILE STRUCTURE ==============

export interface EngramFile {
  header: EngramHeader;
  nodes: MemoryNode[];
  entities: Entity[];
  links: MemoryLink[];
  deltas?: Delta[];
}

// ============== CONFIG ==============

export interface DecayConfig {
  hotThresholdDays: number;
  warmThresholdDays: number;
  coldThresholdDays: number;
  archiveThresholdDays: number;
  summarizeOnCold: boolean;
  deleteOnExpire: boolean;
}

export const DEFAULT_DECAY_CONFIG: DecayConfig = {
  hotThresholdDays: 7,
  warmThresholdDays: 30,
  coldThresholdDays: 90,
  archiveThresholdDays: 365,
  summarizeOnCold: true,
  deleteOnExpire: false
};

// ============== HNSW CONFIG ==============

export interface HNSWConfig {
  space: 'l2' | 'cosine' | 'ip'; // Distance metric
  numDimensions: number;         // Embedding dimensions
  maxElements?: number;          // Maximum number of elements
  M?: number;                    // Number of bi-directional links for each node (default: 16)
  efConstruction?: number;       // Size of dynamic candidate list (default: 200)
  randomSeed?: number;           // Random seed for reproducibility
  allowReplaceDeleted?: boolean; // Allow replacing deleted elements
}

export const DEFAULT_HNSW_CONFIG: Partial<HNSWConfig> = {
  space: 'cosine',
  maxElements: 10000,
  M: 16,
  efConstruction: 200,
  allowReplaceDeleted: true
};

// ============== SEARCH ==============

export interface SearchOptions {
  query: string;
  topK?: number;
  minScore?: number;
  filters?: SearchFilters;
  timeDecay?: number;
  includeArchived?: boolean;
}

export interface SearchFilters {
  types?: ContentType[];
  tags?: string[];
  dateRange?: [number, number];
  decayTiers?: DecayTier[];
  paths?: string[];
  entities?: string[];
}

export interface SearchResult {
  node: MemoryNode;
  score: number;
  highlights?: string[];
}
