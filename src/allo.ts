import fs from 'node:fs/promises';
import path from 'node:path';
import {
    MemoryTree, createNode, writeEngramFile, readEngramFile, searchNodes, touchNode,
    DEFAULT_HNSW_CONFIG, MemoryNode, EngramFile, ContentType, SearchOptions,
    generateId as engramGenerateId, SearchResult
} from '@terronex/engram';
import { pipeline, env } from '@xenova/transformers';
import mime from 'mime-types';
import {
    consolidate as traceLiteConsolidate,
    forget as traceLiteForget,
    type Memory as TraceLiteMemory,
    type ConsolidateConfig,
    type ConsolidationReport,
    type Summarizer,
} from '@terronex/engram-trace-lite';

env.allowRemoteModels = false;
env.localModelPath = path.join(process.cwd(), 'models/');

export interface AlloConfig {
    memoryFile?: string;
    password?: string;
    embeddingModel?: string;
    maxEmbeddedFileSize?: number;
    externalStoragePath?: string;
    persona?: string;
    readOnly?: boolean;
}

export interface AlloMemory {
    id: string;
    type: string;
    content: string;
    timestamp: number;
    tags: string[];
    score?: number;
    tier: 'hot' | 'warm' | 'cold' | 'archive';
}

const HNSW_DIMS = 384;

export class Allo {
    private tree: MemoryTree;
    public config: Required<AlloConfig>;
    private embedder: any = null;
    private isInitialized = false;

    constructor(config: AlloConfig = {}) {
        this.config = {
            memoryFile: config.memoryFile || 'allo-memory.engram',
            password: config.password || '',
            embeddingModel: config.embeddingModel || 'Xenova/all-MiniLM-L6-v2',
            maxEmbeddedFileSize: config.maxEmbeddedFileSize || 25,
            externalStoragePath: config.externalStoragePath || path.join(process.cwd(), 'allo_files'),
            persona: config.persona || '',
            readOnly: config.readOnly || false,
            ...config,
        };
        this.tree = this.createTree();
    }

    private createTree(nodes: MemoryNode[] = []): MemoryTree {
        const hnswConfig = {
            ...DEFAULT_HNSW_CONFIG,
            numDimensions: HNSW_DIMS,
            maxElements: 1_000_000,
            space: 'cosine' as const,
        };
        return new MemoryTree(nodes, hnswConfig);
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        try {
            this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
        } catch {
            console.warn(`Could not load local model. Attempting download...`);
            env.allowRemoteModels = true;
            try {
                this.embedder = await pipeline('feature-extraction', this.config.embeddingModel);
                console.log('Model downloaded successfully.');
            } catch {
                console.error('Failed to download embedding model. Using random embeddings.');
            }
            env.allowRemoteModels = false;
        }
        await fs.mkdir(this.config.externalStoragePath, { recursive: true });
        await this.load();
        this.isInitialized = true;
    }

    async load(): Promise<void> {
        try {
            const engramFile = await readEngramFile(this.config.memoryFile, {
                password: this.config.password,
            });
            // Fix Float32Array deserialization: msgpackr stores typed arrays as
            // raw bytes, so embeddings come back as Uint8Array/Buffer of 4x length.
            // Convert them back to Float32Array.
            for (const node of engramFile.nodes) {
                if (node.embedding && !(node.embedding instanceof Float32Array)) {
                    const raw = node.embedding as unknown;
                    if (Array.isArray(raw)) {
                        node.embedding = new Float32Array(raw as number[]);
                    } else if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
                        // Fallback: try to interpret raw bytes as float32
                        const src = raw as Uint8Array;
                        const aligned = new ArrayBuffer(src.byteLength);
                        new Uint8Array(aligned).set(src);
                        node.embedding = new Float32Array(aligned);
                    }
                }
            }
            this.tree = this.createTree(engramFile.nodes);
            // Auto-detect persona from file metadata
            const meta = engramFile.header?.metadata as any;
            if (meta?.persona && !this.config.persona) {
                this.config.persona = meta.persona;
            }
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                console.error('Memory load error:', error.message);
            }
        }
    }

    async save(): Promise<{ nodeCount: number; fileSizeMB: number }> {
        if (this.config.readOnly) {
            // Read-only brains don't save — just return current stats
            return this.getStats();
        }
        // Convert Float32Array embeddings to number[] for msgpackr serialization.
        // msgpackr corrupts Float32Array data during encode/decode.
        const nodes = this.tree.getAll().map(node => {
            if (node.embedding instanceof Float32Array) {
                return { ...node, embedding: Array.from(node.embedding) as any };
            }
            return node;
        });
        const oldest = nodes.length > 0
            ? nodes.reduce((a, b) => a.temporal.created < b.temporal.created ? a : b)
            : undefined;

        const engramFile: EngramFile = {
            header: {
                created: oldest?.temporal.created || Date.now(),
                modified: Date.now(),
                version: [1, 0],
                security: {
                    encrypted: !!this.config.password,
                    algorithm: this.config.password ? 'aes-256-gcm' : 'none',
                    kdf: this.config.password ? 'argon2id' : 'none',
                    integrity: new Uint8Array(),
                },
                metadata: {
                    source: '@terronex/allo v1.0.0',
                    description: this.config.persona
                        ? `${this.config.persona} — Neural Memory Brain`
                        : 'Personal AI memory powered by Engram',
                    ...(this.config.persona ? { persona: this.config.persona } : {}),
                },
                schema: {
                    embeddingModel: this.config.embeddingModel,
                    embeddingDims: HNSW_DIMS,
                    chunkStrategy: 'semantic',
                    modalities: ['text', 'image', 'audio', 'code'],
                },
                stats: {
                    totalChunks: nodes.length,
                    totalTokens: nodes.reduce((t, n) =>
                        t + (typeof n.content.data === 'string' ? Math.ceil(n.content.data.length / 4) : 10), 0),
                    rootNodes: this.tree.getRoots().length,
                    maxDepth: Math.max(0, ...nodes.map(n => n.depth)),
                    entityCount: 0,
                    linkCount: 0,
                },
            },
            nodes,
            entities: [],
            links: [],
            deltas: [],
        };

        await writeEngramFile(this.config.memoryFile, engramFile, {
            password: this.config.password,
            encrypt: !!this.config.password,
        });
        const stats = await fs.stat(this.config.memoryFile);
        return {
            nodeCount: nodes.length,
            fileSizeMB: parseFloat((stats.size / 1048576).toFixed(2)),
        };
    }

    /** Read-only stats — does NOT save/overwrite the file */
    getStats(): { nodeCount: number; fileSizeMB: number } {
        const nodes = this.tree ? this.getAll() : [];
        return {
            nodeCount: nodes.length,
            fileSizeMB: 0, // Unknown without disk stat; use save() for accurate size
        };
    }

    async addText(text: string, parentId?: string, tags: string[] = []): Promise<string> {
        if (this.config.readOnly) throw new Error('This brain is read-only. Cannot add memories.');
        await this.ensureInitialized();
        const embedding = await this.generateEmbedding(text);
        // createNode only accepts { type?, parentId?, tags?, metadata? }
        const node = createNode(text, { tags, metadata: { charCount: text.length } });
        node.embedding = embedding;
        this.insertNode(node, parentId);
        return node.id;
    }

    async addFile(filePath: string, caption: string, parentId?: string, tags: string[] = []): Promise<string> {
        if (this.config.readOnly) throw new Error('This brain is read-only. Cannot add memories.');
        await this.ensureInitialized();
        const stats = await fs.stat(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';
        const contentType = this.mapMimeToContentType(mimeType);

        let data: Buffer | string;
        let isExternal = false;
        let storagePath = filePath;

        if (fileSizeMB > this.config.maxEmbeddedFileSize) {
            isExternal = true;
            const extName = `${engramGenerateId()}-${path.basename(filePath)}`;
            storagePath = path.join(this.config.externalStoragePath, extName);
            await fs.copyFile(filePath, storagePath);
            data = `ref:${storagePath}`;
        } else {
            data = await fs.readFile(filePath);
        }

        const embedding = await this.generateEmbedding(`${caption} ${path.basename(filePath)}`);
        const id = engramGenerateId();
        const now = Date.now();

        // Build MemoryNode directly — createNode only handles text
        const node: MemoryNode = {
            id,
            parentId: null,
            children: [],
            depth: 0,
            path: `/${id}`,
            content: {
                type: contentType,
                data,
                mimeType,
            },
            embedding,
            temporal: { created: now, modified: now, accessed: now, decayTier: 'hot' },
            quality: { score: 0.8, confidence: 0.8, source: 'direct' },
            metadata: {
                tags,
                custom: { caption, originalPath: filePath, isExternal, fileSizeMB },
            },
        };

        this.insertNode(node, parentId);
        return node.id;
    }

    async recall(query: string, limit = 8, minScore = 0.15): Promise<AlloMemory[]> {
        await this.ensureInitialized();
        const size = this.tree.size();
        if (size === 0) return [];

        const queryEmbedding = await this.generateEmbedding(query);
        const effectiveLimit = Math.min(limit, size);

        let results: SearchResult[];

        // For small datasets (<100 nodes), HNSW graph connectivity is poor.
        // Use brute-force cosine similarity instead for reliable results.
        if (size < 100) {
            results = this.bruteForceSearch(queryEmbedding, effectiveLimit, minScore);
        } else {
            const options: SearchOptions = {
                query,
                topK: effectiveLimit,
                minScore,
                timeDecay: 0.2,
            };
            results = searchNodes(this.tree, queryEmbedding, options);
        }

        // Touch accessed nodes (touchNode returns a new object)
        for (const result of results) {
            const touched = touchNode(result.node);
            this.tree.update(result.node.id, { temporal: touched.temporal });
        }

        return results.map(r => this.toAlloMemory(r.node, r.score));
    }

    /** Brute-force cosine similarity search — reliable for small datasets */
    private bruteForceSearch(queryEmb: Float32Array, limit: number, minScore: number): SearchResult[] {
        const nodes = this.tree.getAll();
        const scored: SearchResult[] = [];

        for (const node of nodes) {
            if (!node.embedding) continue;
            const emb = node.embedding instanceof Float32Array
                ? node.embedding
                : new Float32Array(node.embedding as any);
            const score = this.cosineSimilarity(queryEmb, emb);
            if (score >= minScore) {
                scored.push({ node, score });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit);
    }

    private cosineSimilarity(a: Float32Array, b: Float32Array): number {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // === Internal helpers ===

    /**
     * Insert a node into the tree, optionally linking it to a parent.
     * We always use tree.add() because tree.addChild() internally re-invokes
     * createNode which only handles text content.
     */
    private insertNode(node: MemoryNode, parentId?: string): void {
        if (parentId) {
            const parent = this.tree.get(parentId);
            if (parent) {
                node.parentId = parentId;
                node.depth = parent.depth + 1;
                node.path = `${parent.path}/${node.id}`;
            }
        }
        this.tree.add(node);
    }

    private toAlloMemory(node: MemoryNode, score?: number): AlloMemory {
        let content: string;
        if (node.content.type === 'text' && typeof node.content.data === 'string') {
            content = node.content.data;
        } else {
            const meta = node.metadata.custom as Record<string, any> | undefined;
            const caption = meta?.caption || path.basename(meta?.originalPath || 'Untitled');
            content = `[${node.content.type.toUpperCase()}] ${caption}`;
        }

        return {
            id: node.id,
            type: node.content.type,
            content,
            timestamp: node.temporal.created,
            tags: node.metadata.tags || [],
            score,
            tier: node.temporal.decayTier,
        };
    }

    /**
     * Map a MIME type to the closest Engram ContentType.
     * ContentType = 'text' | 'image' | 'audio' | 'code' | 'summary'
     * For video/documents we cast since the binary format is extensible
     * even though the TS type is strict.
     */
    private mapMimeToContentType(mimeType: string): ContentType {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('audio/')) return 'audio';
        if (mimeType.startsWith('text/')) return 'text';
        // Video and documents aren't in the base ContentType union,
        // but the binary format handles them fine. Cast for TS.
        if (mimeType.startsWith('video/')) return 'video' as ContentType;
        return 'text'; // fallback — store as text with mimeType for context
    }

    /** Get all memories without search (for stats, export, etc.) */
    getAll(): AlloMemory[] {
        return this.tree.getAll().map(node => this.toAlloMemory(node));
    }

    // =========================================================================
    // Consolidation (powered by @terronex/engram-trace-lite)
    // =========================================================================

    /**
     * Run memory consolidation: decay tiers, remove duplicates,
     * cluster and summarize related memories, archive old content.
     *
     * Summarization requires a Summarizer (any LLM). Without one,
     * decay + dedup + archive still run.
     */
    async consolidate(
        config?: ConsolidateConfig,
        summarizer?: Summarizer,
    ): Promise<ConsolidationReport> {
        if (this.config.readOnly) throw new Error('This brain is read-only. Cannot consolidate.');
        await this.ensureInitialized();
        const nodes = this.tree.getAll();
        if (nodes.length === 0) {
            return {
                timestamp: new Date().toISOString(),
                durationMs: 0,
                before: { total: 0, byTier: { hot: 0, warm: 0, cold: 0, archive: 0 } },
                after: { total: 0, byTier: { hot: 0, warm: 0, cold: 0, archive: 0 } },
                decayed: 0, deduplicated: 0, clustersFound: 0, summarized: 0, archived: 0,
            };
        }

        // Convert MemoryNode[] to TraceLiteMemory[]
        const memories: TraceLiteMemory[] = nodes.map(n => ({
            id: n.id,
            content: typeof n.content.data === 'string' ? n.content.data : '[binary]',
            embedding: n.embedding instanceof Float32Array
                ? n.embedding
                : new Float32Array(n.embedding as any),
            tags: n.metadata.tags || [],
            importance: n.quality.score,
            tier: n.temporal.decayTier as TraceLiteMemory['tier'],
            createdAt: new Date(n.temporal.created).toISOString(),
            lastAccessed: new Date(n.temporal.accessed).toISOString(),
            accessCount: (n.metadata.custom as any)?.accessCount ?? 0,
            metadata: n.metadata.custom as Record<string, unknown> | undefined,
        }));

        // Run consolidation
        const { memories: consolidated, report } = await traceLiteConsolidate(
            memories, config, summarizer,
        );

        // Rebuild tree from consolidated memories
        this.rebuildTree(consolidated);

        // Auto-save after consolidation
        if (!this.config.readOnly) {
            await this.save();
        }

        return report;
    }

    /**
     * Forget memories semantically matching a query.
     * Returns the number of memories removed.
     */
    async forget(query: string, threshold = 0.7): Promise<number> {
        if (this.config.readOnly) throw new Error('This brain is read-only. Cannot forget.');
        await this.ensureInitialized();

        const queryEmbedding = await this.generateEmbedding(query);
        const nodes = this.tree.getAll();

        const memories: TraceLiteMemory[] = nodes.map(n => ({
            id: n.id,
            content: typeof n.content.data === 'string' ? n.content.data : '[binary]',
            embedding: n.embedding instanceof Float32Array
                ? n.embedding
                : new Float32Array(n.embedding as any),
            tags: n.metadata.tags || [],
            importance: n.quality.score,
            tier: n.temporal.decayTier as TraceLiteMemory['tier'],
            createdAt: new Date(n.temporal.created).toISOString(),
            lastAccessed: new Date(n.temporal.accessed).toISOString(),
            accessCount: (n.metadata.custom as any)?.accessCount ?? 0,
        }));

        const { memories: survivors, forgotten } = traceLiteForget(
            memories, queryEmbedding, threshold,
        );

        if (forgotten > 0) {
            this.rebuildTree(survivors);
            if (!this.config.readOnly) await this.save();
        }

        return forgotten;
    }

    /**
     * Rebuild the internal MemoryTree from TraceLite Memory[].
     * Maps consolidated memories back to MemoryNode format.
     */
    private rebuildTree(memories: TraceLiteMemory[]): void {
        const nodes: MemoryNode[] = memories.map(m => ({
            id: m.id,
            parentId: null,
            children: [],
            depth: 0,
            path: `/${m.id}`,
            content: { type: 'text' as ContentType, data: m.content },
            embedding: m.embedding,
            temporal: {
                created: new Date(m.createdAt).getTime(),
                modified: Date.now(),
                accessed: new Date(m.lastAccessed).getTime(),
                decayTier: m.tier,
            },
            quality: { score: m.importance, confidence: 0.8, source: 'direct' },
            metadata: {
                tags: m.tags,
                custom: { ...m.metadata, accessCount: m.accessCount },
            },
        }));

        this.tree = this.createTree(nodes);
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.isInitialized) await this.initialize();
    }

    private async generateEmbedding(text: string): Promise<Float32Array> {
        if (!this.embedder) {
            return new Float32Array(HNSW_DIMS).map(() => Math.random() - 0.5);
        }
        try {
            const output = await this.embedder(text, { pooling: 'mean', normalize: true });
            return new Float32Array(output.data);
        } catch {
            console.warn('Embedding generation failed, using random fallback.');
            return new Float32Array(HNSW_DIMS).map(() => Math.random() - 0.5);
        }
    }
}

export default Allo;
