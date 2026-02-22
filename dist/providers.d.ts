export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}
export interface ChatParams {
    model: string;
    messages: ChatMessage[];
    system?: string;
    maxTokens?: number;
}
export interface ChatResponse {
    content: string;
    tokensIn: number;
    tokensOut: number;
    model: string;
    provider: string;
}
export interface EmbeddingProvider {
    name: string;
    embed(text: string): Promise<Float32Array>;
    dims: number;
}
export interface LLMProvider {
    name: string;
    chat(params: ChatParams): Promise<ChatResponse>;
}
export interface ProviderConfig {
    embeddings: {
        provider: string;
        model: string;
    };
    llm?: {
        provider: string;
        model: string;
    };
    keys: Record<string, string>;
    ollamaUrl: string;
}
export declare function loadConfig(): Promise<ProviderConfig>;
export declare function saveConfig(config: ProviderConfig): Promise<void>;
export declare function getDefaultConfig(): ProviderConfig;
export declare function configExists(): boolean;
export declare class AnthropicLLM implements LLMProvider {
    name: string;
    private apiKey;
    private isOAuth;
    constructor(apiKey: string);
    chat(params: ChatParams): Promise<ChatResponse>;
}
export declare class OpenAILLM implements LLMProvider {
    name: string;
    private apiKey;
    private baseUrl;
    constructor(name: string, apiKey: string, baseUrl?: string);
    chat(params: ChatParams): Promise<ChatResponse>;
}
export declare class OllamaLLM implements LLMProvider {
    name: string;
    private baseUrl;
    constructor(baseUrl?: string);
    chat(params: ChatParams): Promise<ChatResponse>;
    listModels(): Promise<string[]>;
    static isAvailable(baseUrl?: string): Promise<boolean>;
}
export declare class GeminiLLM implements LLMProvider {
    name: string;
    private apiKey;
    constructor(apiKey: string);
    chat(params: ChatParams): Promise<ChatResponse>;
}
export declare class OllamaEmbeddings implements EmbeddingProvider {
    name: string;
    dims: number;
    private baseUrl;
    private model;
    constructor(model?: string, baseUrl?: string, dims?: number);
    embed(text: string): Promise<Float32Array>;
}
export declare function createLLM(config: ProviderConfig): LLMProvider | null;
/**
 * Validate that a key works for the given provider.
 */
export declare function validateKey(provider: string, key: string, baseUrl?: string): Promise<boolean>;
