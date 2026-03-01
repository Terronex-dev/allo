# Engram

> **Neural Memory Format for AI Systems**  
> High-performance hierarchical, temporal, multi-modal memory format inspired by biological memory traces

[![npm version](https://img.shields.io/npm/v/@terronex/engram.svg)](https://www.npmjs.com/package/@terronex/engram)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

## What's New in V2

**Engram V2** transforms the memory format from a **tree** to a **graph**:

```typescript
import { MemoryTree, MemoryGraph, createLink } from '@terronex/engram';

const tree = new MemoryTree(nodes);
const graph = new MemoryGraph(tree);

// Create typed relationships
graph.addLink(createLink(studyId, claimId, 'supports'));
graph.addLink(createLink(finding1, finding2, 'contradicts'));

// Query the graph
const evidence = graph.getLinkedNodes(claimId, 'supports');
const path = graph.findPath(ideaA, conclusionB);
const nearby = graph.getNeighborhood(nodeId, 2);

// Auto-link similar content
graph.autoLinkSimilar(0.85);
```

| Feature | V1 | V2 |
|---------|----|----|
| Semantic search | ✓ | ✓ |
| Hierarchical tree | ✓ | ✓ |
| **Typed links** | ✗ | ✓ |
| **Graph traversal** | ✗ | ✓ |
| **Spatial positions** | ✗ | ✓ |
| **Confidence scores** | ✗ | ✓ |

See [SPEC_V2.md](SPEC_V2.md) for the full specification.

## What's New in V2.1: Spatial Intelligence

**V2.1** makes spatial positions queryable — find memories by location, not just meaning:

```typescript
import { spatialRecall, findNearby, haversineDistance } from '@terronex/engram';

// Find memories within 500km of Paris
const nearby = spatialRecall(tree, {
  center: { x: 48.8566, y: 2.3522 },  // lat/lon
  radius: 500,                         // km
  metric: 'haversine'
});

// Hybrid: semantic + spatial
const results = spatialRecall(tree, {
  center: { x: 48.8566, y: 2.3522 },
  radius: 100,
  metric: 'haversine',
  queryEmbedding: searchVector  // optional semantic filter
});

// Find memories near another memory
const related = findNearby(tree, memoryId, 10);

// Distance calculations
const km = haversineDistance(lat1, lon1, lat2, lon2);
```

| Feature | V2.0 | V2.1 |
|---------|------|------|
| Typed links | ✓ | ✓ |
| Graph traversal | ✓ | ✓ |
| Store positions | ✓ | ✓ |
| **Query by distance** | ✗ | ✓ |
| **Geo queries (Haversine)** | ✗ | ✓ |
| **Hybrid semantic+spatial** | ✗ | ✓ |

## What is Engram?

Engram is a revolutionary neural memory format designed specifically for AI applications that need to store, organize, and retrieve complex, multi-modal information with temporal intelligence. Named after biological memory traces in neuroscience, Engram combines:

- **Hierarchical Memory**: Tree-structured organization with parent-child relationships
- **Temporal Intelligence**: Built-in time decay and relevance scoring
- **Multi-Modal Support**: Text, images, audio, code, and custom data types
- **Semantic Search**: Vector embeddings with quality-aware ranking
- **Entity Relationships**: Automatic entity recognition and linking
- **Privacy-First**: Optional end-to-end encryption with local storage
- **Portable**: Single-file format that works offline

## Key Features

### Intelligent Memory Organization

```typescript
interface MemoryNode {
  id: string;
  parentId: string | null;     // Hierarchical structure
  children: string[];
  depth: number;
  path: string;               // Full tree path
  
  content: NodeContent;       // Multi-modal content
  embedding?: Float32Array;   // Semantic vectors
  
  temporal: TemporalInfo;     // Time-based intelligence
  quality: QualityInfo;       // Confidence scoring
  metadata: NodeMetadata;     // Custom attributes
}
```

### Temporal Decay System

Memories automatically age and decay based on access patterns:

- **HOT** (0-7 days): Maximum search priority, full detail
- **WARM** (7-30 days): High priority, optimized storage
- **COLD** (30-90 days): Lower priority, summarized content  
- **ARCHIVE** (90+ days): Minimal priority, compressed storage

### HNSW High-Performance Search

**NEW in v1.0.0**: Lightning-fast approximate nearest neighbor search:

- **Sub-millisecond search** (~0.3ms vs 120ms brute force)
- **400x performance improvement** for large datasets
- **O(log n) complexity** vs O(n) brute force
- **Automatic fallback** to brute force when HNSW not configured
- **99.9%+ accuracy** with massive speed gains

### Rich Relationship Modeling

```typescript
type LinkType = 
  | 'related' | 'references' | 'contradicts' | 'supersedes'
  | 'elaborates' | 'summarizes' | 'causes' | 'follows';
```

## V2 Graph Extensions

### MemoryGraph Class

Build knowledge graphs on top of your memory tree:

```typescript
import { MemoryTree, MemoryGraph, createLink } from '@terronex/engram';

// Create graph from existing tree
const tree = new MemoryTree(nodes);
const graph = new MemoryGraph(tree);

// Add typed relationships
graph.addLink(createLink(sourceId, targetId, 'supports', { confidence: 0.9 }));
graph.addLink(createLink(nodeA, nodeB, 'contradicts'));
graph.addLink(createLink(step2, step1, 'follows'));
```

### Graph Traversal

Navigate your knowledge graph:

```typescript
// Get all nodes linked to a given node
const linked = graph.getLinkedNodes(nodeId);

// Filter by link type
const evidence = graph.getLinkedNodes(claimId, 'supports');
const conflicts = graph.getContradicting(claimId);

// Find shortest path between nodes
const path = graph.findPath(startId, endId);
// Returns: [startNode, intermediate1, intermediate2, endNode]

// Get neighborhood (all nodes within N hops)
const nearby = graph.getNeighborhood(nodeId, 2);
```

### Auto-Linking

Automatically discover relationships based on embedding similarity:

```typescript
// Link all nodes with >85% similarity
const newLinks = graph.autoLinkSimilar(0.85);
console.log(`Created ${newLinks.length} new links`);
```

### Spatial Positions

Store 2D/3D coordinates for visualization:

```typescript
// Pin a node's position
graph.setPosition(nodeId, { x: 100, y: 200, pinned: true });

// Get position
const pos = graph.getPosition(nodeId);

// Get only pinned positions (for saving)
const pinned = graph.getPinnedPositions();
```

### Confidence Scores

Rate memory reliability:

```typescript
node.confidence = 0.95;  // Very reliable
node.confidence = 0.3;   // Questionable
```

### Link Types

| Type | Meaning |
|------|---------|
| `related` | General association |
| `supports` | Evidence for a claim |
| `contradicts` | Conflicts with |
| `follows` | Temporal/logical sequence |
| `derived_from` | Created from source |
| `similar_to` | Auto-generated from embeddings |

## Installation

```bash
npm install @terronex/engram
```

## Quick Start

```typescript
import { MemoryTree, writeEngram, readEngram, writeEngramFile, readEngramFile, createNode, DEFAULT_HNSW_CONFIG } from '@terronex/engram';

// Create a memory tree with HNSW for high-performance search
const hnswConfig = {
  ...DEFAULT_HNSW_CONFIG,
  numDimensions: 384, // Your embedding dimensions
  maxElements: 10000
};

const tree = new MemoryTree([], hnswConfig);

// Add nodes with hierarchical organization
const parentNode = createNode({
  id: 'doc-1',
  content: {
    type: 'text',
    data: 'Project Overview: Building an AI assistant...'
  },
  temporal: {
    created: Date.now(),
    modified: Date.now(),
    accessed: Date.now(),
    decayTier: 'hot'
  },
  quality: {
    score: 0.95,
    confidence: 0.9,
    source: 'direct'
  }
});

tree.add(parentNode);

// Add child node
const childNode = createNode({
  id: 'doc-1-section-1',
  content: {
    type: 'text', 
    data: 'Technical Requirements: The system should support...'
  },
  // ... other properties
});

tree.addChild('doc-1', childNode);

// Save to engram format
const fileData = await writeEngram({
  header: {
    version: [3, 0],
    created: Date.now(),
    modified: Date.now(),
    security: { encrypted: false, algorithm: 'none', kdf: 'none', integrity: new Uint8Array() },
    metadata: { source: 'my-app', description: 'Project documentation' },
    schema: { 
      embeddingModel: 'all-MiniLM-L6-v2',
      embeddingDims: 384,
      chunkStrategy: 'paragraph',
      modalities: ['text']
    },
    stats: { totalChunks: 2, totalTokens: 150, rootNodes: 1, maxDepth: 2, entityCount: 0, linkCount: 0 }
  },
  nodes: tree.getAll(),
  entities: [],
  links: []
});

// Write to file (automatic .engram extension)
await writeEngramFile('my-memory', fileData);  // Creates 'my-memory.engram'

// Read back
const loadedFile = await readEngramFile('my-memory.engram');
const loadedTree = new MemoryTree(loadedFile.nodes);

// Alternative: Manual approach (still supported)
// await fs.writeFile('my-memory.engram', await writeEngram(fileData));
// const loaded = await readEngram(await fs.readFile('my-memory.engram'));

// Search with temporal relevance
const results = searchNodes(loadedTree.getAll(), {
  query: 'AI assistant requirements',
  topK: 5,
  minScore: 0.7,
  timeDecay: 0.1
});
```

## Advanced Usage

### Multi-Modal Content

```typescript
// Text content
const textNode = createNode({
  content: {
    type: 'text',
    data: 'This is a text document...',
    language: 'en',
    tokens: 25
  }
});

// Image content  
const imageNode = createNode({
  content: {
    type: 'image',
    data: imageBuffer,
    mimeType: 'image/jpeg'
  }
});

// Code content
const codeNode = createNode({
  content: {
    type: 'code', 
    data: 'function hello() { return "world"; }',
    language: 'javascript',
    tokens: 12
  }
});
```

### Encryption & Security

```typescript
const secureFile = await writeEngram(data, {
  encrypt: true,
  password: 'my-secret-password'
});

// File is encrypted with AES-256-GCM + Argon2ID key derivation
```

### Entity Recognition & Linking

```typescript
import { Entity, MemoryLink, createLink } from '@terronex/engram';

// Define entities
const entities: Entity[] = [
  {
    id: 'person-1',
    type: 'person',
    name: 'Dr. Jane Smith',
    aliases: ['Jane Smith', 'J. Smith'],
    properties: { role: 'lead researcher' },
    mentions: [{ nodeId: 'doc-1', span: [45, 58], confidence: 0.95 }],
    relationships: []
  }
];

// Create relationships
const link = createLink({
  sourceId: 'doc-1',
  targetId: 'doc-2', 
  type: 'references',
  confidence: 0.9,
  bidirectional: false
});
```

## Industry Applications

Engram's unique architecture makes it ideal for:

- **Healthcare**: Patient records with temporal progression and multi-modal data
- **Legal**: Case management with evidence hierarchies and citation networks
- **Financial**: Investment research with market data and temporal analysis
- **Research**: Academic literature with citation networks and methodology tracking
- **Manufacturing**: IoT sensor data with predictive maintenance intelligence
- **Smart Cities**: Urban analytics with multi-modal city data integration

## Architecture & Performance

### Production Validation

Engram has been successfully deployed in production systems:

- **93.3% recall accuracy** (vs. industry standard 60-80%)
- **~0.3ms HNSW search time** (400x faster than brute force)
- **<120ms brute force fallback** for systems without HNSW
- **340+ session transcripts** processed in real-world deployment
- **Excellent scaling** to millions of nodes with HNSW indexing

### Technical Specifications

- **Format**: MessagePack binary serialization
- **Encryption**: AES-256-GCM with Argon2ID KDF
- **Embeddings**: Float32Array, any dimensionality
- **Content Types**: Text, Image, Audio, Code + extensible
- **Tree Depth**: Unlimited hierarchical nesting
- **Search Methods**: Semantic, hierarchical, temporal, entity-based
- **Streaming**: Delta operations for real-time updates

## API Reference

### Core Classes

#### `MemoryTree`
Main class for managing hierarchical memory structures.

```typescript
class MemoryTree {
  constructor(nodes?: MemoryNode[])
  
  // Basic operations
  get(id: string): MemoryNode | undefined
  getAll(): MemoryNode[]
  add(node: MemoryNode): string
  update(id: string, updates: Partial<MemoryNode>): void
  delete(id: string, cascade?: boolean): void
  
  // Tree navigation
  getParent(id: string): MemoryNode | null
  getChildren(id: string): MemoryNode[]
  getSiblings(id: string): MemoryNode[]
  getAncestors(id: string): MemoryNode[]
  getDescendants(id: string): MemoryNode[]
  
  // Tree modification
  addChild(parentId: string, node: Omit<MemoryNode, 'parentId' | 'depth' | 'path'>): string
  moveNode(nodeId: string, newParentId: string | null): void
  copySubtree(nodeId: string, newParentId: string | null): string
}
```

#### File I/O Functions

```typescript
// Write Engram file
function writeEngram(
  file: EngramFile, 
  options?: WriteOptions
): Promise<Buffer>

// Read Engram file  
function readEngram(
  buffer: Buffer, 
  options?: ReadOptions
): Promise<EngramFile>

// Streaming writer for large datasets
class StreamingWriter {
  constructor(options: WriteOptions)
  writeHeader(header: EngramHeader): Promise<void>
  writeNode(node: MemoryNode): Promise<void>
  writeEntity(entity: Entity): Promise<void>
  writeLink(link: MemoryLink): Promise<void>
  finalize(): Promise<Buffer>
}
```

### Search & Query

```typescript
// Search nodes with advanced options
function searchNodes(
  nodes: MemoryNode[],
  options: SearchOptions
): SearchResult[]

interface SearchOptions {
  query: string;
  topK?: number;
  minScore?: number;
  filters?: SearchFilters;
  timeDecay?: number;
  includeArchived?: boolean;
}
```

### Utility Functions

```typescript
// Temporal intelligence
function getDecayTier(node: MemoryNode, config?: DecayConfig): DecayTier
function touchNode(node: MemoryNode): void
function isExpired(node: MemoryNode, config?: DecayConfig): boolean

// Quality assessment
function cosineSimilarity(a: Float32Array, b: Float32Array): number

// Node creation helpers
function createNode(nodeData: Partial<MemoryNode>): MemoryNode
function createLink(linkData: Partial<MemoryLink>): MemoryLink
```

## Roadmap

### Shipped

| Version | Features |
|---------|----------|
| **V1.0** | Hierarchical memory, temporal decay, HNSW search, encryption |
| **V2.0** | Typed links, graph traversal, auto-linking, confidence scores |
| **V2.1** | Spatial intelligence (spatialRecall, findNearby, Haversine/Euclidean) |

### Coming

| Version | Features |
|---------|----------|
| **V2.2** | Map visualization, spatial teaching mode |
| **V3.0** | UMAP/t-SNE auto-layout, 3D visualization |

Multi-language SDKs available: [Python](https://github.com/Terronex-dev/engram-py), [Rust](https://github.com/Terronex-dev/engram-rs), [Go](https://github.com/Terronex-dev/engram-go)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/Terronex-dev/engram.git
cd engram
npm install
npm run build
npm test
```

### Running Tests

```bash
npm run test           # Run tests once
npm run test:watch     # Watch mode
npm run test:coverage  # With coverage report
```

## Testing Documentation

Comprehensive testing results, performance benchmarks, and reliability metrics are available in [TESTING.md](TESTING.md).

**Key Metrics:**
- 28/28 tests passing (100% success rate)
- Sub-millisecond search times (0.23-0.5ms average)
- 400x performance improvement over brute force
- 93.3% recall accuracy
- Zero memory leaks detected

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Documentation**: [GitHub Wiki](https://github.com/Terronex-dev/engram/wiki)
- **Bug Reports**: [GitHub Issues](https://github.com/Terronex-dev/engram/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Terronex-dev/engram/discussions)
- **Contact**: contact@terronex.dev

## Related Projects

- **Desktop Tools**: Visual memory exploration and management applications
- **Professional CLI**: Advanced tools and utilities for enterprise use
- **[Engram Lite](https://github.com/Terronex-dev/engram-lite)**: Lightweight CLI for basic operations

---

**Developed by Terronex**

*Engram: Neural memory format for the AI era.*

## Disclaimer

This software is provided as-is under the MIT license. It is under active development and has not undergone a third-party security audit. The encryption implementation (AES-256-GCM with argon2id/PBKDF2) has not been independently verified.

Do not use this software as the sole protection for sensitive data without your own due diligence. The authors and Terronex are not liable for data loss, security breaches, or any damages arising from the use of this software. See LICENSE for full terms.
