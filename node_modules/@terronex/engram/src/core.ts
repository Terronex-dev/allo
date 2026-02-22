/**
 * Engram Core Implementation
 * 
 * Reader, Writer, and Tree operations for .engram files
 */

import { 
  MemoryNode, 
  MemoryLink,
  DecayTier,
  DEFAULT_DECAY_CONFIG,
  DecayConfig,
  SearchOptions,
  SearchResult,
  HNSWConfig
} from './types';
import { HierarchicalNSW } from 'hnswlib-node';

// ============== CONSTANTS ==============

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============== ID GENERATION ==============

let idCounter = 0;

export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const counter = (idCounter++).toString(36).padStart(4, '0');
  return `${timestamp}-${random}-${counter}`;
}

// ============== TREE OPERATIONS ==============

export class MemoryTree {
  private nodes: Map<string, MemoryNode> = new Map();
  private rootIds: Set<string> = new Set();
  private hnswIndex: HierarchicalNSW | null = null;
  private idToLabel: Map<string, number> = new Map(); // Maps node ID to HNSW label
  private labelToId: Map<number, string> = new Map(); // Maps HNSW label to node ID
  private nextLabel: number = 0;
  private hnswConfig: HNSWConfig | null = null;
  
  constructor(nodes: MemoryNode[] = [], hnswConfig?: HNSWConfig) {
    // Initialize HNSW if config provided
    if (hnswConfig) {
      this.initializeHNSW(hnswConfig);
    }
    
    for (const node of nodes) {
      this.nodes.set(node.id, node);
      if (!node.parentId) {
        this.rootIds.add(node.id);
      }
      
      // Add to HNSW index if embedding exists
      if (this.hnswIndex && node.embedding) {
        this.addToHNSW(node.id, node.embedding);
      }
    }
  }
  
  private initializeHNSW(config: HNSWConfig): void {
    this.hnswConfig = config;
    this.hnswIndex = new HierarchicalNSW(
      config.space,
      config.numDimensions
    );
    
    if (config.maxElements) {
      this.hnswIndex.initIndex(
        config.maxElements,
        config.M,
        config.efConstruction,
        config.randomSeed,
        config.allowReplaceDeleted
      );
    }
  }
  
  private addToHNSW(nodeId: string, embedding: Float32Array): void {
    if (!this.hnswIndex) return;
    
    const label = this.nextLabel++;
    this.idToLabel.set(nodeId, label);
    this.labelToId.set(label, nodeId);
    
    // Convert Float32Array to regular Array for hnswlib-node
    const embeddingArray = Array.from(embedding);
    this.hnswIndex.addPoint(embeddingArray, label);
  }
  
  private removeFromHNSW(nodeId: string): void {
    if (!this.hnswIndex) return;
    
    const label = this.idToLabel.get(nodeId);
    if (label !== undefined) {
      this.hnswIndex.markDelete(label);
      this.idToLabel.delete(nodeId);
      this.labelToId.delete(label);
    }
  }
  
  // Basic operations
  
  get(id: string): MemoryNode | undefined {
    return this.nodes.get(id);
  }
  
  getAll(): MemoryNode[] {
    return Array.from(this.nodes.values());
  }
  
  getRoots(): MemoryNode[] {
    return Array.from(this.rootIds).map(id => this.nodes.get(id)!);
  }
  
  size(): number {
    return this.nodes.size;
  }
  
  // Tree navigation
  
  getParent(id: string): MemoryNode | null {
    const node = this.nodes.get(id);
    if (!node?.parentId) return null;
    return this.nodes.get(node.parentId) || null;
  }
  
  getChildren(id: string): MemoryNode[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    return node.children.map(cid => this.nodes.get(cid)!).filter(Boolean);
  }
  
  getSiblings(id: string): MemoryNode[] {
    const node = this.nodes.get(id);
    if (!node) return [];
    
    const parentId = node.parentId;
    if (!parentId) {
      // Root siblings
      return Array.from(this.rootIds)
        .filter(rid => rid !== id)
        .map(rid => this.nodes.get(rid)!);
    }
    
    const parent = this.nodes.get(parentId);
    if (!parent) return [];
    
    return parent.children
      .filter(cid => cid !== id)
      .map(cid => this.nodes.get(cid)!)
      .filter(Boolean);
  }
  
  getAncestors(id: string): MemoryNode[] {
    const ancestors: MemoryNode[] = [];
    let current = this.nodes.get(id);
    
    while (current?.parentId) {
      const parent = this.nodes.get(current.parentId);
      if (!parent) break;
      ancestors.push(parent);
      current = parent;
    }
    
    return ancestors;
  }
  
  getDescendants(id: string): MemoryNode[] {
    const descendants: MemoryNode[] = [];
    const queue = [id];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const node = this.nodes.get(currentId);
      if (!node) continue;
      
      for (const childId of node.children) {
        const child = this.nodes.get(childId);
        if (child) {
          descendants.push(child);
          queue.push(childId);
        }
      }
    }
    
    return descendants;
  }
  
  // Tree modification
  
  add(node: MemoryNode): string {
    this.nodes.set(node.id, node);
    
    if (!node.parentId) {
      this.rootIds.add(node.id);
    } else {
      const parent = this.nodes.get(node.parentId);
      if (parent && !parent.children.includes(node.id)) {
        parent.children.push(node.id);
      }
    }
    
    // Add to HNSW index if embedding exists
    if (node.embedding) {
      this.addToHNSW(node.id, node.embedding);
    }
    
    return node.id;
  }
  
  addChild(parentId: string, partialNode: Partial<MemoryNode> & { content: MemoryNode['content'] }): string {
    const parent = this.nodes.get(parentId);
    if (!parent) throw new Error(`Parent ${parentId} not found`);
    
    // Leverage createNode to initialize with defaults, then override with parent-specific info
    const childNode = createNode(partialNode.content.data as string, { // createNode expects string content
      type: partialNode.content.type,
      tags: partialNode.metadata?.tags,
      metadata: partialNode.metadata?.custom,
      // parentId and other tree-specific properties will be set next
    });

    // Manually set tree-specific properties derived from the parent
    childNode.parentId = parentId;
    childNode.depth = parent.depth + 1;
    childNode.path = `${parent.path}/${childNode.id}`;
    childNode.children = []; // Ensure it's an empty array initially for a new child

    // Merge any other properties from partialNode
    Object.assign(childNode, partialNode);
    
    return this.add(childNode);
  }
  
  update(id: string, updates: Partial<MemoryNode>): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node ${id} not found`);
    
    // Update modified time
    const updated = {
      ...node,
      ...updates,
      temporal: {
        ...node.temporal,
        ...updates.temporal,
        modified: Date.now()
      }
    };
    
    this.nodes.set(id, updated);
  }
  
  delete(id: string, cascade: boolean = false): void {
    const node = this.nodes.get(id);
    if (!node) return;
    
    // Remove from HNSW index first
    this.removeFromHNSW(id);
    
    if (cascade) {
      // Delete all descendants
      for (const descendant of this.getDescendants(id)) {
        this.removeFromHNSW(descendant.id);
        this.nodes.delete(descendant.id);
      }
    } else {
      // Reparent children to grandparent
      for (const childId of node.children) {
        const child = this.nodes.get(childId);
        if (child) {
          child.parentId = node.parentId;
          if (node.parentId) {
            const grandparent = this.nodes.get(node.parentId);
            if (grandparent) {
              grandparent.children.push(childId);
            }
          } else {
            this.rootIds.add(childId);
          }
        }
      }
    }
    
    // Remove from parent's children
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter(cid => cid !== id);
      }
    } else {
      this.rootIds.delete(id);
    }
    
    this.nodes.delete(id);
  }
  
  move(id: string, newParentId: string | null): void {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node ${id} not found`);
    
    // Remove from old parent
    if (node.parentId) {
      const oldParent = this.nodes.get(node.parentId);
      if (oldParent) {
        oldParent.children = oldParent.children.filter(cid => cid !== id);
      }
    } else {
      this.rootIds.delete(id);
    }
    
    // Add to new parent
    if (newParentId) {
      const newParent = this.nodes.get(newParentId);
      if (!newParent) throw new Error(`New parent ${newParentId} not found`);
      newParent.children.push(id);
      node.parentId = newParentId;
      node.depth = newParent.depth + 1;
      node.path = `${newParent.path}/${id}`;
    } else {
      node.parentId = null;
      node.depth = 0;
      node.path = `/${id}`;
      this.rootIds.add(id);
    }
    
    // Update descendants' depths and paths
    this.updateDescendantPaths(id);
  }
  
  private updateDescendantPaths(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    
    for (const childId of node.children) {
      const child = this.nodes.get(childId);
      if (child) {
        child.depth = node.depth + 1;
        child.path = `${node.path}/${childId}`;
        this.updateDescendantPaths(childId);
      }
    }
  }
  
  // Search
  
  findByPath(path: string): MemoryNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.path === path) return node;
    }
    return undefined;
  }
  
  findByDepth(depth: number): MemoryNode[] {
    return Array.from(this.nodes.values()).filter(n => n.depth === depth);
  }
  
  findByTag(tag: string): MemoryNode[] {
    return Array.from(this.nodes.values()).filter(
      n => n.metadata.tags?.includes(tag)
    );
  }
  
  // HNSW utility methods
  
  hasHNSWIndex(): boolean {
    return this.hnswIndex !== null;
  }
  
  searchHNSW(queryEmbedding: Float32Array, k: number): Array<{nodeId: string, distance: number}> {
    if (!this.hnswIndex) {
      throw new Error('HNSW index not initialized');
    }
    
    // Convert Float32Array to regular Array for hnswlib-node
    const queryArray = Array.from(queryEmbedding);
    const searchResults = this.hnswIndex.searchKnn(queryArray, k);
    
    return searchResults.neighbors.map((label: number, index: number) => ({
      nodeId: this.labelToId.get(label) || '',
      distance: searchResults.distances[index]
    })).filter(result => result.nodeId !== '');
  }
  
  buildHNSWIndex(config: HNSWConfig): void {
    // Initialize HNSW if not already done
    if (!this.hnswIndex) {
      this.initializeHNSW(config);
    }
    
    // Add all existing nodes with embeddings
    for (const node of this.nodes.values()) {
      if (node.embedding && !this.idToLabel.has(node.id)) {
        this.addToHNSW(node.id, node.embedding);
      }
    }
  }
  
  getHNSWStats(): {totalElements: number, currentCount: number} | null {
    if (!this.hnswIndex) return null;
    
    return {
      totalElements: this.hnswIndex.getMaxElements(),
      currentCount: this.hnswIndex.getCurrentCount()
    };
  }
}

// ============== TEMPORAL OPERATIONS ==============

export function getDecayTier(
  node: MemoryNode, 
  config: DecayConfig = DEFAULT_DECAY_CONFIG
): DecayTier {
  const daysSinceAccess = (Date.now() - node.temporal.accessed) / MS_PER_DAY;
  
  if (daysSinceAccess < config.hotThresholdDays) return 'hot';
  if (daysSinceAccess < config.warmThresholdDays) return 'warm';
  if (daysSinceAccess < config.coldThresholdDays) return 'cold';
  return 'archive';
}

export function touchNode(node: MemoryNode): MemoryNode {
  return {
    ...node,
    temporal: {
      ...node.temporal,
      accessed: Date.now()
    }
  };
}

export function isExpired(node: MemoryNode): boolean {
  if (!node.temporal.expires) return false;
  return Date.now() > node.temporal.expires;
}

// ============== SEARCH ==============

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) throw new Error('Vectors must have same length');
  
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Assumes normalized vectors
}

export function searchNodes(
  tree: MemoryTree,
  queryEmbedding: Float32Array,
  options: SearchOptions
): SearchResult[] {
  // Use HNSW search if available, otherwise fall back to brute force
  if (tree.hasHNSWIndex()) {
    return searchNodesHNSW(tree, queryEmbedding, options);
  } else {
    return searchNodesBruteForce(tree, queryEmbedding, options);
  }
}

export function searchNodesHNSW(
  tree: MemoryTree,
  queryEmbedding: Float32Array,
  options: SearchOptions
): SearchResult[] {
  const {
    topK = 10,
    minScore = 0.5,
    filters,
    timeDecay = 0,
    includeArchived = false
  } = options;
  
  // Get initial candidates from HNSW (get more than topK to account for filtering)
  const searchK = Math.max(topK * 3, 100);
  const candidates = tree.searchHNSW(queryEmbedding, searchK);
  
  const results: SearchResult[] = [];
  
  for (const candidate of candidates) {
    const node = tree.get(candidate.nodeId);
    if (!node || !node.embedding) continue;
    
    // Apply filters
    if (filters) {
      if (filters.types && !filters.types.includes(node.content.type)) continue;
      if (filters.tags && !filters.tags.some(t => node.metadata.tags?.includes(t))) continue;
      if (filters.decayTiers && !filters.decayTiers.includes(node.temporal.decayTier)) continue;
      if (filters.paths && !filters.paths.some(p => node.path.startsWith(p))) continue;
      if (filters.dateRange) {
        const [start, end] = filters.dateRange;
        if (node.temporal.created < start || node.temporal.created > end) continue;
      }
    }
    
    // Skip archived unless requested
    if (!includeArchived && node.temporal.decayTier === 'archive') continue;
    
    // Use distance from HNSW, convert to similarity
    let score = 1.0 - candidate.distance; // Assuming cosine distance, convert to similarity
    
    // Apply time decay
    if (timeDecay > 0) {
      const daysSinceAccess = (Date.now() - node.temporal.accessed) / MS_PER_DAY;
      const decayFactor = Math.exp(-timeDecay * daysSinceAccess);
      score *= decayFactor;
    }
    
    // Boost by quality score
    score *= (0.5 + 0.5 * node.quality.score);
    
    if (score >= minScore) {
      results.push({ node, score });
    }
  }
  
  // Sort by score and return top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

export function searchNodesBruteForce(
  tree: MemoryTree,
  queryEmbedding: Float32Array,
  options: SearchOptions
): SearchResult[] {
  const {
    topK = 10,
    minScore = 0.5,
    filters,
    timeDecay = 0,
    includeArchived = false
  } = options;
  
  const results: SearchResult[] = [];
  
  for (const node of tree.getAll()) {
    // Skip if no embedding
    if (!node.embedding) continue;
    
    // Apply filters
    if (filters) {
      if (filters.types && !filters.types.includes(node.content.type)) continue;
      if (filters.tags && !filters.tags.some(t => node.metadata.tags?.includes(t))) continue;
      if (filters.decayTiers && !filters.decayTiers.includes(node.temporal.decayTier)) continue;
      if (filters.paths && !filters.paths.some(p => node.path.startsWith(p))) continue;
      if (filters.dateRange) {
        const [start, end] = filters.dateRange;
        if (node.temporal.created < start || node.temporal.created > end) continue;
      }
    }
    
    // Skip archived unless requested
    if (!includeArchived && node.temporal.decayTier === 'archive') continue;
    
    // Compute similarity
    let score = cosineSimilarity(queryEmbedding, node.embedding);
    
    // Apply time decay
    if (timeDecay > 0) {
      const daysSinceAccess = (Date.now() - node.temporal.accessed) / MS_PER_DAY;
      const decayFactor = Math.exp(-timeDecay * daysSinceAccess);
      score *= decayFactor;
    }
    
    // Boost by quality score
    score *= (0.5 + 0.5 * node.quality.score);
    
    if (score >= minScore) {
      results.push({ node, score });
    }
  }
  
  // Sort by score and return top K
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ============== FACTORY ==============

export function createNode(
  content: string,
  options: {
    type?: MemoryNode['content']['type'];
    parentId?: string | null;
    tags?: string[];
    metadata?: Record<string, unknown>;
  } = {}
): MemoryNode {
  const id = generateId();
  const now = Date.now();
  
  return {
    id,
    parentId: options.parentId ?? null,
    children: [],
    depth: 0,
    path: `/${id}`,
    
    content: {
      type: options.type ?? 'text',
      data: content,
      tokens: Math.ceil(content.length / 4) // rough estimate
    },
    
    temporal: {
      created: now,
      modified: now,
      accessed: now,
      decayTier: 'hot'
    },
    
    quality: {
      score: 0.5,
      confidence: 1.0,
      source: 'direct'
    },
    
    metadata: {
      tags: options.tags,
      custom: options.metadata
    }
  };
}

export function createLink(
  sourceId: string,
  targetId: string,
  type: MemoryLink['type'],
  options: {
    confidence?: number;
    bidirectional?: boolean;
    createdBy?: MemoryLink['createdBy'];
  } = {}
): MemoryLink {
  return {
    id: generateId(),
    sourceId,
    targetId,
    type,
    confidence: options.confidence ?? 0.8,
    bidirectional: options.bidirectional ?? true,
    created: Date.now(),
    createdBy: options.createdBy ?? 'system'
  };
}
