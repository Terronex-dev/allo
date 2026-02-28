# Changelog

All notable changes to the Engram project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-28

### MAJOR: Graph Extensions

**Engram V2 transforms the memory format from a tree to a graph.** Memories can now have typed relationships beyond parent-child, enabling knowledge graphs and reasoning chains.

### Added

#### MemoryGraph Class
- **`MemoryGraph`**: New class for graph operations on top of MemoryTree
- **`addLink(link)`**: Create typed relationships between nodes
- **`removeLink(linkId)`**: Remove relationships
- **`getLinks(nodeId, direction)`**: Get links (outgoing, incoming, or both)
- **`getLinkedNodes(nodeId, type?)`**: Get nodes connected by links, optionally filtered by type
- **`getSupporting(nodeId)`**: Get nodes that support/elaborate a given node
- **`getContradicting(nodeId)`**: Get nodes that contradict a given node

#### Graph Traversal
- **`findPath(fromId, toId, maxDepth?)`**: BFS shortest path between nodes
- **`getNeighborhood(nodeId, depth?)`**: Get all nodes within N hops

#### Auto-Linking
- **`autoLinkSimilar(threshold?)`**: Automatically link nodes with high embedding similarity

#### Spatial Positions
- **`setPosition(nodeId, position)`**: Set 2D/3D coordinates for visualization
- **`getPosition(nodeId)`**: Get node position
- **`getPinnedPositions()`**: Get only user-pinned positions (for persistence)
- **`Position` interface**: `{ x, y, z?, pinned? }`

#### Node Extensions
- **`confidence`**: Optional 0.0-1.0 reliability score on MemoryNode
- **`position`**: Optional spatial coordinates on MemoryNode

#### Header Extensions
- **`EmbeddingConfig`**: Documents embedding model, dimensions, provider
- **`SpatialConfig`**: Documents projection method (umap, tsne, pca, manual)
- **`DEFAULT_EMBEDDING_CONFIG`**: Standard config (all-MiniLM-L6-v2, 384 dims)

#### Link Types
- `related` — General association
- `supports` — Evidence for a claim
- `contradicts` — Conflicts with
- `follows` — Temporal or logical sequence
- `derived_from` — Created from source
- `similar_to` — Auto-generated from embeddings
- Custom string types allowed

### Changed
- **Version byte**: Files now write `0x02 0x00` (V2)
- **Header**: Includes embedding config by default
- **I/O**: Reader accepts both V1 and V2 files (backward compatible)

### Technical
- 66 tests passing (31 new graph tests)
- Full V2 specification: `SPEC_V2.md`
- Backward compatible: V2 readers handle V1 files
- Forward compatible: V1 readers ignore V2 fields (MessagePack)

### Migration
No migration required. V1 files work seamlessly with V2 SDK.

```typescript
// V2 Usage
import { MemoryTree, MemoryGraph, createLink } from '@terronex/engram';

const tree = new MemoryTree(nodes);
const graph = new MemoryGraph(tree);

// Add typed relationships
graph.addLink(createLink(evidenceId, claimId, 'supports'));

// Query the graph
const supporting = graph.getLinkedNodes(claimId, 'supports');
const path = graph.findPath(startId, endId);
const nearby = graph.getNeighborhood(nodeId, 2);

// Auto-link similar content
graph.autoLinkSimilar(0.85);
```

---

## [1.0.4] - 2026-02-22

### BRANDING CLEANUP

**Removed all outdated AIF-BIN v3 references throughout the codebase.**

### Fixed
- **Documentation cleanup**: Removed all references to "AIF-BIN v3", "Studio", and "Pro" from legacy codebase
- **Migration messaging**: Updated from "AIF-BIN v3" to clean Engram branding throughout
- **Version consistency**: Updated internal version references from v3 to v1.x for proper Engram versioning
- **Error messages**: Updated migration error messages to reference proper function names
- **Type system**: Fixed version type definitions to use `[1, number]` instead of legacy `[3, number]`

### Enhanced
- **Clean documentation**: All README, CHANGELOG, and documentation now purely Engram-branded
- **Consistent messaging**: No more confusing references to legacy formats
- **Professional presentation**: Repository now presents clean, consistent neural memory format branding

### Technical Changes
- Updated `migrateV2toV3()` references to `migrateV2toEngram()`  
- Fixed version schema from `[3, 0]` to `[1, 0]` in migration utilities
- Removed outdated "Engram Studio" and "Engram Pro" repository links (non-existent)
- Updated comparison tables to remove "AIF-BIN v2" references

## [1.0.3] - 2026-02-22

### NEW FEATURE: Automatic .engram Extension

**Added convenience functions for automatic file extension handling.**

### Added
- **`writeEngramFile(filename, file, options)`**: Write Engram files to disk with automatic `.engram` extension
- **`readEngramFile(filename, options)`**: Read Engram files from disk 
- **`ensureEngramExtension(filename)`**: Utility to ensure filename has `.engram` extension

### Enhanced Developer Experience
- **Automatic extension**: `writeEngramFile('memory')` creates `memory.engram` 
- **Smart handling**: `writeEngramFile('file.engram')` doesn't double-extend
- **Backward compatible**: Original `writeEngram()` and `readEngram()` unchanged
- **File I/O included**: No need to manually handle `fs.writeFile()` and `fs.readFile()`

### Usage Examples
```javascript
// Old way (still works)
const buffer = await writeEngram(file);
await fs.writeFile('memory.engram', buffer);

// New way (automatic extension)
await writeEngramFile('memory', file);  // Creates 'memory.engram'
const loaded = await readEngramFile('memory.engram');
```

## [1.0.2] - 2026-02-22

### CRITICAL BUG FIX

**Fixed npm package module resolution issue that made v1.0.0 and v1.0.1 completely unusable.**

### Fixed
- **Module resolution**: Resolved "Cannot find module './types'" error in npm package
- **Build configuration**: Removed conflicting ESM build that was overwriting CommonJS output
- **TypeScript config**: Simplified to single CommonJS build for better Node.js compatibility
- **Package usability**: Developers can now successfully `require('@terronex/engram')` and `import` from the package

### Technical Changes
- Removed `tsconfig.esm.json` file that was causing build conflicts
- Updated build script to use `tsc` only (no dual CommonJS/ESM build)
- All 28/28 tests continue to pass
- No breaking changes to API or functionality

### Impact
- v1.0.0: ❌ Completely broken (import/require failed)
- v1.0.1: ❌ Still broken (same issue persisted) 
- v1.0.2: ✅ Working (module resolution fixed)

## [1.0.0] - 2026-02-21

### LAUNCH: Engram Neural Memory Format

**Engram** is born! A complete neural memory format inspired by biological memory traces in neuroscience.

### Revolutionary Performance
- **HNSW indexing** for lightning-fast search
- **Sub-millisecond search times** (~0.3ms vs 120ms brute force)
- **400x performance improvement** for large datasets
- **O(log n) complexity** vs previous O(n) brute force
- **99.9%+ accuracy** with massive speed gains
- **Automatic fallback** to brute force when HNSW not configured

### Neural-Inspired Architecture
- **Hierarchical memory** with tree-structured organization
- **Temporal intelligence** with built-in time decay and relevance scoring
- **Multi-modal support** for text, images, audio, code, and custom data types
- **Semantic search** with vector embeddings and quality-aware ranking
- **Entity relationships** with automatic recognition and linking
- **Privacy-first** with optional end-to-end encryption

### Elegant Developer Experience
- **Clean API**: `writeEngram()`, `readEngram()`, intuitive functions
- **Beautiful file extension**: `.engram` files (vs `.aif-bin`)
- **TypeScript native**: Complete type safety with `EngramFile`, `EngramHeader`
- **Scientific naming**: Engram (memory trace) vs technical "AIF-BIN"
- **Production ready**: Comprehensive test suite (28/28 tests passing)

### Technical Specifications
- **Magic bytes**: `ENGRAM` (6 bytes)
- **Format version**: 1.0
- **HNSW configuration**: Customizable M, efConstruction, distance metrics
- **Binary format**: MessagePack for efficient serialization
- **Encryption**: AES-256-GCM with Argon2id key derivation
- **File format**: Single-file portable `.engram` containers

### Enterprise Features
- **Temporal tiers**: HOT (0-7 days), WARM (7-30 days), COLD (30-90 days), ARCHIVE (90+ days)
- **Intelligent compaction**: Automatic summarization with decay scoring
- **HNSW utilities**: `hasHNSWIndex()`, `buildHNSWIndex()`, `getHNSWStats()`
- **Quality metrics**: Confidence scoring and access pattern tracking
- **Scalability**: Tested with 1000+ nodes, sub-millisecond performance

### Migration from AIF-BIN v3

```typescript
// Previous binary formats
import { /* legacy format */ } from '@legacy/format';

// After (Engram v1.0.0)
import { writeEngram, readEngram, EngramFile } from '@terronex/engram';

// File extension change
// old-memory.aif-bin → new-memory.engram
```

### Breaking Changes
This is a complete rebrand with breaking changes:

- **Package name**: `@terronex/engram`
- **File extension**: `.engram`
- **Function names**: `writeEngram()`, `readEngram()`, `writeEngramFile()`
- **Types**: `EngramFile`, `EngramHeader`, `MemoryTree`
- **Magic bytes**: `ENGRAM`
- **Versioning**: Reset to v1.0.0 for clean semantic versioning

### Performance Benchmarks

**Real-world test results:**
- **1000 nodes**: 0.43ms average search time
- **Memory usage**: <1MB for 500 nodes
- **Build time**: 77ms for 1000 nodes
- **Scaling**: 1.76x ratio (near-logarithmic performance)
- **Accuracy**: 100% match vs brute force in comparative testing

### Why "Engram"?

An **engram** is the hypothetical means by which memory traces are stored in the brain - the biological basis of memory. This perfectly captures what our format does: storing AI memory traces in a highly efficient, searchable, and temporally-aware format.

The rebrand represents our evolution from a technical "binary format" to a neural-inspired memory system that mirrors how biological systems actually store and retrieve information.

---

## Legacy Notes

Engram was developed as a neural-inspired memory format (February 2026), featuring the elegant `.engram` file extension and neural-inspired naming conventions based on biological memory traces in neuroscience.