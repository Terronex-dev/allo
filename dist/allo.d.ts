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
export declare class Allo {
    private tree;
    config: Required<AlloConfig>;
    private embedder;
    private isInitialized;
    constructor(config?: AlloConfig);
    private createTree;
    initialize(): Promise<void>;
    load(): Promise<void>;
    save(): Promise<{
        nodeCount: number;
        fileSizeMB: number;
    }>;
    /** Read-only stats — does NOT save/overwrite the file */
    getStats(): {
        nodeCount: number;
        fileSizeMB: number;
    };
    addText(text: string, parentId?: string, tags?: string[]): Promise<string>;
    addFile(filePath: string, caption: string, parentId?: string, tags?: string[]): Promise<string>;
    recall(query: string, limit?: number, minScore?: number): Promise<AlloMemory[]>;
    /** Brute-force cosine similarity search — reliable for small datasets */
    private bruteForceSearch;
    private cosineSimilarity;
    /**
     * Insert a node into the tree, optionally linking it to a parent.
     * We always use tree.add() because tree.addChild() internally re-invokes
     * createNode which only handles text content.
     */
    private insertNode;
    private toAlloMemory;
    /**
     * Map a MIME type to the closest Engram ContentType.
     * ContentType = 'text' | 'image' | 'audio' | 'code' | 'summary'
     * For video/documents we cast since the binary format is extensible
     * even though the TS type is strict.
     */
    private mapMimeToContentType;
    /** Get all memories without search (for stats, export, etc.) */
    getAll(): AlloMemory[];
    private ensureInitialized;
    private generateEmbedding;
}
export default Allo;
