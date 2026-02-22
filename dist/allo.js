"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Allo = void 0;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const engram_1 = require("@terronex/engram");
const transformers_1 = require("@xenova/transformers");
const mime_types_1 = __importDefault(require("mime-types"));
transformers_1.env.allowRemoteModels = false;
transformers_1.env.localModelPath = node_path_1.default.join(process.cwd(), 'models/');
const HNSW_DIMS = 384;
class Allo {
    tree;
    config;
    embedder = null;
    isInitialized = false;
    constructor(config = {}) {
        this.config = {
            memoryFile: config.memoryFile || 'allo-memory.engram',
            password: config.password || '',
            embeddingModel: config.embeddingModel || 'Xenova/all-MiniLM-L6-v2',
            maxEmbeddedFileSize: config.maxEmbeddedFileSize || 25,
            externalStoragePath: config.externalStoragePath || node_path_1.default.join(process.cwd(), 'allo_files'),
            ...config,
        };
        this.tree = this.createTree();
    }
    createTree(nodes = []) {
        const hnswConfig = {
            ...engram_1.DEFAULT_HNSW_CONFIG,
            numDimensions: HNSW_DIMS,
            maxElements: 1_000_000,
            space: 'cosine',
        };
        return new engram_1.MemoryTree(nodes, hnswConfig);
    }
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            this.embedder = await (0, transformers_1.pipeline)('feature-extraction', this.config.embeddingModel);
        }
        catch {
            console.warn(`Could not load local model. Attempting download...`);
            transformers_1.env.allowRemoteModels = true;
            try {
                this.embedder = await (0, transformers_1.pipeline)('feature-extraction', this.config.embeddingModel);
                console.log('Model downloaded successfully.');
            }
            catch {
                console.error('Failed to download embedding model. Using random embeddings.');
            }
            transformers_1.env.allowRemoteModels = false;
        }
        await promises_1.default.mkdir(this.config.externalStoragePath, { recursive: true });
        await this.load();
        this.isInitialized = true;
    }
    async load() {
        try {
            const engramFile = await (0, engram_1.readEngramFile)(this.config.memoryFile, {
                password: this.config.password,
            });
            // Fix Float32Array deserialization: msgpackr stores typed arrays as
            // raw bytes, so embeddings come back as Uint8Array/Buffer of 4x length.
            // Convert them back to Float32Array.
            for (const node of engramFile.nodes) {
                if (node.embedding && !(node.embedding instanceof Float32Array)) {
                    const raw = node.embedding;
                    if (Array.isArray(raw)) {
                        node.embedding = new Float32Array(raw);
                    }
                    else if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
                        // Fallback: try to interpret raw bytes as float32
                        const src = raw;
                        const aligned = new ArrayBuffer(src.byteLength);
                        new Uint8Array(aligned).set(src);
                        node.embedding = new Float32Array(aligned);
                    }
                }
            }
            this.tree = this.createTree(engramFile.nodes);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                console.error('Memory load error:', error.message);
            }
        }
    }
    async save() {
        // Convert Float32Array embeddings to number[] for msgpackr serialization.
        // msgpackr corrupts Float32Array data during encode/decode.
        const nodes = this.tree.getAll().map(node => {
            if (node.embedding instanceof Float32Array) {
                return { ...node, embedding: Array.from(node.embedding) };
            }
            return node;
        });
        const oldest = nodes.length > 0
            ? nodes.reduce((a, b) => a.temporal.created < b.temporal.created ? a : b)
            : undefined;
        const engramFile = {
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
                    description: 'Personal AI memory powered by Engram',
                },
                schema: {
                    embeddingModel: this.config.embeddingModel,
                    embeddingDims: HNSW_DIMS,
                    chunkStrategy: 'semantic',
                    modalities: ['text', 'image', 'audio', 'code'],
                },
                stats: {
                    totalChunks: nodes.length,
                    totalTokens: nodes.reduce((t, n) => t + (typeof n.content.data === 'string' ? Math.ceil(n.content.data.length / 4) : 10), 0),
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
        await (0, engram_1.writeEngramFile)(this.config.memoryFile, engramFile, {
            password: this.config.password,
            encrypt: !!this.config.password,
        });
        const stats = await promises_1.default.stat(this.config.memoryFile);
        return {
            nodeCount: nodes.length,
            fileSizeMB: parseFloat((stats.size / 1048576).toFixed(2)),
        };
    }
    async addText(text, parentId, tags = []) {
        await this.ensureInitialized();
        const embedding = await this.generateEmbedding(text);
        // createNode only accepts { type?, parentId?, tags?, metadata? }
        const node = (0, engram_1.createNode)(text, { tags, metadata: { charCount: text.length } });
        node.embedding = embedding;
        this.insertNode(node, parentId);
        return node.id;
    }
    async addFile(filePath, caption, parentId, tags = []) {
        await this.ensureInitialized();
        const stats = await promises_1.default.stat(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        const mimeType = mime_types_1.default.lookup(filePath) || 'application/octet-stream';
        const contentType = this.mapMimeToContentType(mimeType);
        let data;
        let isExternal = false;
        let storagePath = filePath;
        if (fileSizeMB > this.config.maxEmbeddedFileSize) {
            isExternal = true;
            const extName = `${(0, engram_1.generateId)()}-${node_path_1.default.basename(filePath)}`;
            storagePath = node_path_1.default.join(this.config.externalStoragePath, extName);
            await promises_1.default.copyFile(filePath, storagePath);
            data = `ref:${storagePath}`;
        }
        else {
            data = await promises_1.default.readFile(filePath);
        }
        const embedding = await this.generateEmbedding(`${caption} ${node_path_1.default.basename(filePath)}`);
        const id = (0, engram_1.generateId)();
        const now = Date.now();
        // Build MemoryNode directly — createNode only handles text
        const node = {
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
    async recall(query, limit = 8) {
        await this.ensureInitialized();
        const size = this.tree.size();
        if (size === 0)
            return [];
        const queryEmbedding = await this.generateEmbedding(query);
        const effectiveLimit = Math.min(limit, size);
        const options = {
            query,
            topK: effectiveLimit,
            minScore: 0.3,
            timeDecay: 0.2,
        };
        const results = (0, engram_1.searchNodes)(this.tree, queryEmbedding, options);
        // Touch accessed nodes (touchNode returns a new object)
        for (const result of results) {
            const touched = (0, engram_1.touchNode)(result.node);
            this.tree.update(result.node.id, { temporal: touched.temporal });
        }
        return results.map(r => this.toAlloMemory(r.node, r.score));
    }
    // === Internal helpers ===
    /**
     * Insert a node into the tree, optionally linking it to a parent.
     * We always use tree.add() because tree.addChild() internally re-invokes
     * createNode which only handles text content.
     */
    insertNode(node, parentId) {
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
    toAlloMemory(node, score) {
        let content;
        if (node.content.type === 'text' && typeof node.content.data === 'string') {
            content = node.content.data;
        }
        else {
            const meta = node.metadata.custom;
            const caption = meta?.caption || node_path_1.default.basename(meta?.originalPath || 'Untitled');
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
    mapMimeToContentType(mimeType) {
        if (mimeType.startsWith('image/'))
            return 'image';
        if (mimeType.startsWith('audio/'))
            return 'audio';
        if (mimeType.startsWith('text/'))
            return 'text';
        // Video and documents aren't in the base ContentType union,
        // but the binary format handles them fine. Cast for TS.
        if (mimeType.startsWith('video/'))
            return 'video';
        return 'text'; // fallback — store as text with mimeType for context
    }
    /** Get all memories without search (for stats, export, etc.) */
    getAll() {
        return this.tree.getAll().map(node => this.toAlloMemory(node));
    }
    async ensureInitialized() {
        if (!this.isInitialized)
            await this.initialize();
    }
    async generateEmbedding(text) {
        if (!this.embedder) {
            return new Float32Array(HNSW_DIMS).map(() => Math.random() - 0.5);
        }
        try {
            const output = await this.embedder(text, { pooling: 'mean', normalize: true });
            return new Float32Array(output.data);
        }
        catch {
            console.warn('Embedding generation failed, using random fallback.');
            return new Float32Array(HNSW_DIMS).map(() => Math.random() - 0.5);
        }
    }
}
exports.Allo = Allo;
exports.default = Allo;
//# sourceMappingURL=allo.js.map