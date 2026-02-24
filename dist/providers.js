/**
 * Allo Provider System
 *
 * Multi-provider LLM + embedding support with OAuth, API keys, and local models.
 * Adapted from Rex's battle-tested provider architecture.
 */
import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const CONFIG_DIR = path.join(process.env.HOME || '~', '.allo');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
// ============== Config Management ==============
export async function loadConfig() {
    try {
        const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return getDefaultConfig();
    }
}
export async function saveConfig(config) {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}
export function getDefaultConfig() {
    return {
        embeddings: { provider: 'local', model: 'Xenova/all-MiniLM-L6-v2' },
        llm: undefined,
        keys: {},
        ollamaUrl: 'http://localhost:11434',
    };
}
export function configExists() {
    return existsSync(CONFIG_FILE);
}
// ============== Anthropic Provider (API key + OAuth) ==============
export class AnthropicLLM {
    name = 'anthropic';
    apiKey;
    isOAuth;
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.isOAuth = apiKey.includes('sk-ant-oat');
    }
    async chat(params) {
        const messages = params.messages
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content }));
        const headers = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };
        if (this.isOAuth) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
            headers['anthropic-beta'] = 'oauth-2025-04-20';
        }
        else {
            headers['x-api-key'] = this.apiKey;
        }
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: params.model,
                max_tokens: params.maxTokens || 4096,
                system: params.system,
                messages,
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Anthropic ${res.status}: ${err}`);
        }
        const data = await res.json();
        const content = data.content
            ?.filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n') || '';
        return {
            content,
            tokensIn: data.usage?.input_tokens || 0,
            tokensOut: data.usage?.output_tokens || 0,
            model: params.model,
            provider: 'anthropic',
        };
    }
}
// ============== OpenAI-compatible Provider ==============
export class OpenAILLM {
    name;
    apiKey;
    baseUrl;
    constructor(name, apiKey, baseUrl = 'https://api.openai.com/v1') {
        this.name = name;
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    async chat(params) {
        const messages = [];
        if (params.system)
            messages.push({ role: 'system', content: params.system });
        messages.push(...params.messages);
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: params.model,
                messages,
                max_tokens: params.maxTokens || 4096,
            }),
        });
        if (!res.ok)
            throw new Error(`${this.name} ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return {
            content: data.choices?.[0]?.message?.content || '',
            tokensIn: data.usage?.prompt_tokens || 0,
            tokensOut: data.usage?.completion_tokens || 0,
            model: params.model,
            provider: this.name,
        };
    }
}
// ============== Ollama Provider ==============
export class OllamaLLM {
    name = 'ollama';
    baseUrl;
    constructor(baseUrl = 'http://localhost:11434') {
        this.baseUrl = baseUrl;
    }
    async chat(params) {
        const messages = [];
        if (params.system)
            messages.push({ role: 'system', content: params.system });
        messages.push(...params.messages);
        const res = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: params.model, messages, stream: false }),
        });
        if (!res.ok)
            throw new Error(`Ollama ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return {
            content: data.message?.content || '',
            tokensIn: data.prompt_eval_count || 0,
            tokensOut: data.eval_count || 0,
            model: params.model,
            provider: 'ollama',
        };
    }
    async listModels() {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`);
            if (!res.ok)
                return [];
            const data = await res.json();
            return (data.models || []).map((m) => m.name);
        }
        catch {
            return [];
        }
    }
    static async isAvailable(baseUrl = 'http://localhost:11434') {
        try {
            const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
            return res.ok;
        }
        catch {
            return false;
        }
    }
}
// ============== Google Gemini Provider ==============
export class GeminiLLM {
    name = 'google';
    apiKey;
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async chat(params) {
        const contents = params.messages
            .filter(m => m.role !== 'system')
            .map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));
        const body = { contents };
        if (params.system) {
            body.systemInstruction = { parts: [{ text: params.system }] };
        }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok)
            throw new Error(`Gemini ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return {
            content: data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('\n') || '',
            tokensIn: data.usageMetadata?.promptTokenCount || 0,
            tokensOut: data.usageMetadata?.candidatesTokenCount || 0,
            model: params.model,
            provider: 'google',
        };
    }
}
// ============== Ollama Embeddings ==============
export class OllamaEmbeddings {
    name = 'ollama';
    dims;
    baseUrl;
    model;
    constructor(model = 'nomic-embed-text', baseUrl = 'http://localhost:11434', dims = 768) {
        this.model = model;
        this.baseUrl = baseUrl;
        this.dims = dims;
    }
    async embed(text) {
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: this.model, prompt: text }),
        });
        if (!res.ok)
            throw new Error(`Ollama embeddings ${res.status}: ${await res.text()}`);
        const data = await res.json();
        return new Float32Array(data.embedding);
    }
}
// ============== Provider Factory ==============
export function createLLM(config) {
    if (!config.llm)
        return null;
    const { provider, model } = config.llm;
    switch (provider) {
        case 'anthropic': {
            const key = config.keys.anthropic || detectAnthropicKey();
            if (!key)
                return null;
            return new AnthropicLLM(key);
        }
        case 'openai': {
            const key = config.keys.openai || process.env.OPENAI_API_KEY;
            if (!key)
                return null;
            return new OpenAILLM('openai', key);
        }
        case 'google': {
            const key = config.keys.google || process.env.GEMINI_API_KEY;
            if (!key)
                return null;
            return new GeminiLLM(key);
        }
        case 'ollama':
            return new OllamaLLM(config.ollamaUrl);
        default:
            return null;
    }
}
// ============== Key Detection ==============
/**
 * Try to find an Anthropic key from env, OpenClaw auth, or Claude CLI config.
 */
function detectAnthropicKey() {
    // 1. Env var
    if (process.env.ANTHROPIC_API_KEY)
        return process.env.ANTHROPIC_API_KEY;
    // 2. OpenClaw auth profiles
    try {
        const authPath = path.join(process.env.HOME || '', '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json');
        if (existsSync(authPath)) {
            const data = JSON.parse(readFileSync(authPath, 'utf-8'));
            const profiles = data.profiles || {};
            for (const [, profile] of Object.entries(profiles)) {
                if (profile.provider === 'anthropic' && profile.token) {
                    return profile.token;
                }
            }
        }
    }
    catch { }
    // 3. Claude CLI OAuth token
    try {
        const claudeConfig = path.join(process.env.HOME || '', '.claude', 'config.json');
        if (existsSync(claudeConfig)) {
            const data = JSON.parse(readFileSync(claudeConfig, 'utf-8'));
            if (data.oauthToken)
                return data.oauthToken;
        }
    }
    catch { }
    return undefined;
}
/**
 * Validate that a key works for the given provider.
 */
export async function validateKey(provider, key, baseUrl) {
    try {
        switch (provider) {
            case 'anthropic': {
                // Use a lightweight models list request instead of a chat call.
                // OAuth tokens need Bearer auth + beta header.
                const isOAuth = key.includes('sk-ant-oat');
                const headers = {
                    'anthropic-version': '2023-06-01',
                };
                if (isOAuth) {
                    headers['Authorization'] = `Bearer ${key}`;
                    headers['anthropic-beta'] = 'oauth-2025-04-20';
                }
                else {
                    headers['x-api-key'] = key;
                }
                // POST a minimal message — models endpoint may not exist for all auth types
                const res = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'claude-haiku-3-5-20241022',
                        max_tokens: 1,
                        messages: [{ role: 'user', content: 'hi' }],
                    }),
                });
                // 200 = works, 400 = auth works but bad request (still valid key)
                // 401/403 = bad key
                return res.status !== 401 && res.status !== 403;
            }
            case 'openai': {
                const res = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` },
                });
                return res.ok;
            }
            case 'google': {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
                return res.ok;
            }
            case 'ollama':
                return OllamaLLM.isAvailable(baseUrl);
            default:
                return false;
        }
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=providers.js.map