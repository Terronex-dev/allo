"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOnboarding = runOnboarding;
/**
 * Allo Onboarding — First-run setup wizard
 */
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const node_path_1 = __importDefault(require("node:path"));
const theme_1 = require("./theme");
const providers_1 = require("./providers");
async function runOnboarding() {
    const config = (0, providers_1.getDefaultConfig)();
    console.log(theme_1.HEADER);
    console.log(theme_1.theme.primaryBold('  Welcome to Allo!\n'));
    console.log(theme_1.theme.muted("  Let's set up your neural memory in about 60 seconds.\n"));
    console.log((0, theme_1.separator)(50));
    // Step 1: Memory file location
    console.log('');
    const { memoryPath } = await inquirer_1.default.prompt([{
            type: 'input',
            name: 'memoryPath',
            message: theme_1.theme.white('Where should your brain live?'),
            default: node_path_1.default.join(process.cwd(), 'allo-memory.engram'),
        }]);
    // Step 2: Encryption
    const { encrypt } = await inquirer_1.default.prompt([{
            type: 'confirm',
            name: 'encrypt',
            message: theme_1.theme.white('Encrypt your memories? (recommended)'),
            default: false,
        }]);
    let password = '';
    if (encrypt) {
        const { pass } = await inquirer_1.default.prompt([{
                type: 'password',
                name: 'pass',
                message: theme_1.theme.white('Enter a passphrase:'),
                mask: '*',
            }]);
        password = pass;
    }
    // Step 3: Embedding provider
    console.log('\n' + (0, theme_1.separator)(50));
    console.log(theme_1.theme.accentBold('\n  Embedding Provider\n'));
    console.log(theme_1.theme.dim('  Embeddings power semantic search — finding memories by meaning.\n'));
    const { embeddingChoice } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'embeddingChoice',
            message: theme_1.theme.white('Which embedding provider?'),
            choices: [
                { name: `${theme_1.theme.success('Local')} — Xenova/transformers (free, private, no setup)`, value: 'local' },
                { name: `${theme_1.theme.accent('Ollama')} — nomic-embed-text (free, better quality)`, value: 'ollama' },
                { name: `${theme_1.theme.primary('OpenAI')} — text-embedding-3-small (paid, best quality)`, value: 'openai' },
            ],
        }]);
    if (embeddingChoice === 'ollama') {
        const spinner = (0, ora_1.default)(theme_1.theme.muted('Checking Ollama...')).start();
        const available = await providers_1.OllamaLLM.isAvailable();
        if (available) {
            const ollama = new providers_1.OllamaLLM();
            const models = await ollama.listModels();
            const hasNomic = models.some(m => m.includes('nomic-embed'));
            spinner.succeed(theme_1.theme.success(`Ollama found! ${models.length} models available`));
            if (hasNomic) {
                config.embeddings = { provider: 'ollama', model: 'nomic-embed-text' };
                console.log(theme_1.theme.dim('  Using nomic-embed-text for embeddings'));
            }
            else {
                console.log(theme_1.theme.primary('  nomic-embed-text not found. Run: ollama pull nomic-embed-text'));
                config.embeddings = { provider: 'ollama', model: 'nomic-embed-text' };
            }
        }
        else {
            spinner.warn(theme_1.theme.error('Ollama not running. Falling back to local embeddings.'));
            console.log(theme_1.theme.dim('  Start Ollama: ollama serve'));
        }
    }
    else if (embeddingChoice === 'openai') {
        const { key } = await inquirer_1.default.prompt([{
                type: 'password',
                name: 'key',
                message: theme_1.theme.white('OpenAI API key:'),
                mask: '*',
            }]);
        config.keys.openai = key;
        config.embeddings = { provider: 'openai', model: 'text-embedding-3-small' };
    }
    // else: keep default local
    // Step 4: LLM provider (for smart recall, chat, summarization)
    console.log('\n' + (0, theme_1.separator)(50));
    console.log(theme_1.theme.accentBold('\n  AI Provider (optional)\n'));
    console.log(theme_1.theme.dim('  An LLM enables smart recall, chat, and auto-summarization.\n'));
    const { llmChoice } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'llmChoice',
            message: theme_1.theme.white('Set up an AI provider?'),
            choices: [
                { name: `${theme_1.theme.accent('Anthropic')} — Claude (API key or OAuth)`, value: 'anthropic' },
                { name: `${theme_1.theme.success('Ollama')} — Local models (free, private)`, value: 'ollama' },
                { name: `${theme_1.theme.primary('OpenAI')} — GPT-4o (API key)`, value: 'openai' },
                { name: `${chalk_1.default.yellow('Google')} — Gemini (API key)`, value: 'google' },
                { name: theme_1.theme.muted('Skip for now (embedding-only recall)'), value: 'skip' },
            ],
        }]);
    if (llmChoice === 'anthropic') {
        await setupAnthropic(config);
    }
    else if (llmChoice === 'openai') {
        await setupOpenAI(config);
    }
    else if (llmChoice === 'google') {
        await setupGoogle(config);
    }
    else if (llmChoice === 'ollama') {
        await setupOllama(config);
    }
    // Save config
    console.log('\n' + (0, theme_1.separator)(50));
    const spinner = (0, ora_1.default)(theme_1.theme.muted('Saving configuration...')).start();
    // Store memory path and password in config (extend the config type)
    config.memoryFile = memoryPath;
    if (password)
        config.password = password;
    await (0, providers_1.saveConfig)(config);
    spinner.succeed(theme_1.theme.success('Configuration saved to ~/.allo/config.json'));
    console.log('');
    console.log(theme_1.theme.primaryBold('  🦖 You\'re all set!\n'));
    console.log(theme_1.theme.white('  Try these commands:'));
    console.log(theme_1.theme.dim('    allo remember "Your first memory"'));
    console.log(theme_1.theme.dim('    allo recall "what do I remember?"'));
    console.log(theme_1.theme.dim('    allo chat'));
    console.log('');
    return config;
}
// ============== Provider Setup Helpers ==============
async function setupAnthropic(config) {
    const { authMethod } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'authMethod',
            message: theme_1.theme.white('Authentication method:'),
            choices: [
                { name: `${theme_1.theme.accent('OAuth')} — Sign in with your Anthropic account (recommended)`, value: 'oauth' },
                { name: `${theme_1.theme.muted('API Key')} — Enter an API key manually`, value: 'apikey' },
                { name: `${theme_1.theme.muted('Auto-detect')} — Check env vars and Claude CLI`, value: 'auto' },
            ],
        }]);
    if (authMethod === 'oauth') {
        console.log('');
        console.log(theme_1.theme.accent('  Anthropic OAuth Setup'));
        console.log(theme_1.theme.dim('  ─────────────────────'));
        console.log('');
        console.log(theme_1.theme.white('  To authenticate with OAuth:'));
        console.log(theme_1.theme.dim('  1. Run: npx @anthropic-ai/claude-code auth'));
        console.log(theme_1.theme.dim('  2. Follow the browser prompts to sign in'));
        console.log(theme_1.theme.dim('  3. Copy the OAuth token (starts with sk-ant-oat-...)'));
        console.log('');
        const { token } = await inquirer_1.default.prompt([{
                type: 'password',
                name: 'token',
                message: theme_1.theme.white('Paste OAuth token:'),
                mask: '*',
            }]);
        if (token) {
            const spinner = (0, ora_1.default)(theme_1.theme.muted('Validating OAuth token...')).start();
            const valid = await (0, providers_1.validateKey)('anthropic', token);
            if (valid) {
                spinner.succeed(theme_1.theme.success('OAuth token verified!'));
                config.keys.anthropic = token;
                config.llm = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
            }
            else {
                spinner.fail(theme_1.theme.error('OAuth token validation failed. Check the token and try again.'));
            }
        }
    }
    else if (authMethod === 'apikey') {
        const { key } = await inquirer_1.default.prompt([{
                type: 'password',
                name: 'key',
                message: theme_1.theme.white('Anthropic API key:'),
                mask: '*',
            }]);
        if (key) {
            const spinner = (0, ora_1.default)(theme_1.theme.muted('Validating API key...')).start();
            const valid = await (0, providers_1.validateKey)('anthropic', key);
            if (valid) {
                spinner.succeed(theme_1.theme.success('API key verified!'));
                config.keys.anthropic = key;
                config.llm = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
            }
            else {
                spinner.fail(theme_1.theme.error('API key validation failed.'));
            }
        }
    }
    else {
        // Auto-detect
        const spinner = (0, ora_1.default)(theme_1.theme.muted('Searching for Anthropic credentials...')).start();
        const envKey = process.env.ANTHROPIC_API_KEY;
        if (envKey) {
            spinner.succeed(theme_1.theme.success('Found ANTHROPIC_API_KEY in environment'));
            config.keys.anthropic = envKey;
            config.llm = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
        }
        else {
            spinner.warn(theme_1.theme.error('No Anthropic credentials found. Set ANTHROPIC_API_KEY or use OAuth.'));
        }
    }
    // Model selection if provider was configured
    if (config.llm?.provider === 'anthropic') {
        const { model } = await inquirer_1.default.prompt([{
                type: 'list',
                name: 'model',
                message: theme_1.theme.white('Default Claude model:'),
                choices: [
                    { name: 'Claude Sonnet 4 (balanced)', value: 'claude-sonnet-4-20250514' },
                    { name: 'Claude Opus 4 (most capable)', value: 'claude-opus-4-20250514' },
                    { name: 'Claude Haiku 3.5 (fastest, cheapest)', value: 'claude-haiku-3-5-20241022' },
                ],
            }]);
        config.llm.model = model;
    }
}
async function setupOpenAI(config) {
    const key = config.keys.openai || process.env.OPENAI_API_KEY;
    if (key) {
        console.log(theme_1.theme.dim('  Using existing OpenAI key'));
        config.keys.openai = key;
    }
    else {
        const { apiKey } = await inquirer_1.default.prompt([{
                type: 'password',
                name: 'apiKey',
                message: theme_1.theme.white('OpenAI API key:'),
                mask: '*',
            }]);
        config.keys.openai = apiKey;
    }
    config.llm = { provider: 'openai', model: 'gpt-4o' };
}
async function setupGoogle(config) {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
        console.log(theme_1.theme.dim('  Using existing GEMINI_API_KEY'));
        config.keys.google = key;
    }
    else {
        const { apiKey } = await inquirer_1.default.prompt([{
                type: 'password',
                name: 'apiKey',
                message: theme_1.theme.white('Google AI Studio API key:'),
                mask: '*',
            }]);
        config.keys.google = apiKey;
    }
    config.llm = { provider: 'google', model: 'gemini-2.5-flash' };
}
async function setupOllama(config) {
    const spinner = (0, ora_1.default)(theme_1.theme.muted('Checking Ollama...')).start();
    const available = await providers_1.OllamaLLM.isAvailable();
    if (!available) {
        spinner.fail(theme_1.theme.error('Ollama not running.'));
        console.log(theme_1.theme.dim('  Install: https://ollama.com'));
        console.log(theme_1.theme.dim('  Start:   ollama serve'));
        return;
    }
    const ollama = new providers_1.OllamaLLM();
    const models = await ollama.listModels();
    spinner.succeed(theme_1.theme.success(`Ollama running — ${models.length} models available`));
    if (models.length === 0) {
        console.log(theme_1.theme.dim('  Pull a model: ollama pull llama3.2'));
        config.llm = { provider: 'ollama', model: 'llama3.2' };
        return;
    }
    const { model } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'model',
            message: theme_1.theme.white('Select a model:'),
            choices: models.map(m => ({ name: m, value: m })),
        }]);
    config.llm = { provider: 'ollama', model };
}
//# sourceMappingURL=onboarding.js.map