/**
 * Allo Onboarding — First-run setup wizard
 */
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import { theme, HEADER, separator } from './theme';
import {
    ProviderConfig, saveConfig, getDefaultConfig,
    OllamaLLM, validateKey,
} from './providers';

export async function runOnboarding(): Promise<ProviderConfig> {
    const config = getDefaultConfig();

    console.log(HEADER);
    console.log(theme.primaryBold('  Welcome to Allo!\n'));
    console.log(theme.muted("  Let's set up your neural memory in about 60 seconds.\n"));
    console.log(separator(50));

    // Step 1: Memory file location
    console.log('');
    const { memoryPath } = await inquirer.prompt([{
        type: 'input',
        name: 'memoryPath',
        message: theme.white('Where should your brain live?'),
        default: path.join(process.cwd(), 'allo-memory.engram'),
    }]);

    // Step 2: Encryption
    const { encrypt } = await inquirer.prompt([{
        type: 'confirm',
        name: 'encrypt',
        message: theme.white('Encrypt your memories? (recommended)'),
        default: false,
    }]);

    let password = '';
    if (encrypt) {
        const { pass } = await inquirer.prompt([{
            type: 'password',
            name: 'pass',
            message: theme.white('Enter a passphrase:'),
            mask: '*',
        }]);
        password = pass;
    }

    // Step 3: Embedding provider
    console.log('\n' + separator(50));
    console.log(theme.accentBold('\n  Embedding Provider\n'));
    console.log(theme.dim('  Embeddings power semantic search — finding memories by meaning.\n'));

    const { embeddingChoice } = await inquirer.prompt([{
        type: 'list',
        name: 'embeddingChoice',
        message: theme.white('Which embedding provider?'),
        choices: [
            { name: `${theme.success('Local')} — Xenova/transformers (free, private, no setup)`, value: 'local' },
            { name: `${theme.accent('Ollama')} — nomic-embed-text (free, better quality)`, value: 'ollama' },
            { name: `${theme.primary('OpenAI')} — text-embedding-3-small (paid, best quality)`, value: 'openai' },
        ],
    }]);

    if (embeddingChoice === 'ollama') {
        const spinner = ora(theme.muted('Checking Ollama...')).start();
        const available = await OllamaLLM.isAvailable();
        if (available) {
            const ollama = new OllamaLLM();
            const models = await ollama.listModels();
            const hasNomic = models.some(m => m.includes('nomic-embed'));
            spinner.succeed(theme.success(`Ollama found! ${models.length} models available`));
            if (hasNomic) {
                config.embeddings = { provider: 'ollama', model: 'nomic-embed-text' };
                console.log(theme.dim('  Using nomic-embed-text for embeddings'));
            } else {
                console.log(theme.primary('  nomic-embed-text not found. Run: ollama pull nomic-embed-text'));
                config.embeddings = { provider: 'ollama', model: 'nomic-embed-text' };
            }
        } else {
            spinner.warn(theme.error('Ollama not running. Falling back to local embeddings.'));
            console.log(theme.dim('  Start Ollama: ollama serve'));
        }
    } else if (embeddingChoice === 'openai') {
        const { key } = await inquirer.prompt([{
            type: 'password',
            name: 'key',
            message: theme.white('OpenAI API key:'),
            mask: '*',
        }]);
        config.keys.openai = key;
        config.embeddings = { provider: 'openai', model: 'text-embedding-3-small' };
    }
    // else: keep default local

    // Step 4: LLM provider (for smart recall, chat, summarization)
    console.log('\n' + separator(50));
    console.log(theme.accentBold('\n  AI Provider (optional)\n'));
    console.log(theme.dim('  An LLM enables smart recall, chat, and auto-summarization.\n'));

    const { llmChoice } = await inquirer.prompt([{
        type: 'list',
        name: 'llmChoice',
        message: theme.white('Set up an AI provider?'),
        choices: [
            { name: `${theme.accent('Anthropic')} — Claude (API key or OAuth)`, value: 'anthropic' },
            { name: `${theme.success('Ollama')} — Local models (free, private)`, value: 'ollama' },
            { name: `${theme.primary('OpenAI')} — GPT-4o (API key)`, value: 'openai' },
            { name: `${chalk.yellow('Google')} — Gemini (API key)`, value: 'google' },
            { name: theme.muted('Skip for now (embedding-only recall)'), value: 'skip' },
        ],
    }]);

    if (llmChoice === 'anthropic') {
        await setupAnthropic(config);
    } else if (llmChoice === 'openai') {
        await setupOpenAI(config);
    } else if (llmChoice === 'google') {
        await setupGoogle(config);
    } else if (llmChoice === 'ollama') {
        await setupOllama(config);
    }

    // Save config
    console.log('\n' + separator(50));
    const spinner = ora(theme.muted('Saving configuration...')).start();
    // Store memory path and password in config (extend the config type)
    (config as any).memoryFile = memoryPath;
    if (password) (config as any).password = password;
    await saveConfig(config);
    spinner.succeed(theme.success('Configuration saved to ~/.allo/config.json'));

    console.log('');
    console.log(theme.primaryBold('  🦖 You\'re all set!\n'));
    console.log(theme.white('  Try these commands:'));
    console.log(theme.dim('    allo remember "Your first memory"'));
    console.log(theme.dim('    allo recall "what do I remember?"'));
    console.log(theme.dim('    allo chat'));
    console.log('');

    return config;
}

// ============== Provider Setup Helpers ==============

async function setupAnthropic(config: ProviderConfig): Promise<void> {
    const { authMethod } = await inquirer.prompt([{
        type: 'list',
        name: 'authMethod',
        message: theme.white('Authentication method:'),
        choices: [
            { name: `${theme.accent('OAuth')} — Sign in with your Anthropic account (recommended)`, value: 'oauth' },
            { name: `${theme.muted('API Key')} — Enter an API key manually`, value: 'apikey' },
            { name: `${theme.muted('Auto-detect')} — Check env vars and Claude CLI`, value: 'auto' },
        ],
    }]);

    if (authMethod === 'oauth') {
        console.log('');
        console.log(theme.accent('  Anthropic OAuth Setup'));
        console.log(theme.dim('  ─────────────────────'));
        console.log('');
        console.log(theme.white('  To authenticate with OAuth:'));
        console.log(theme.dim('  1. Run: npx @anthropic-ai/claude-code auth'));
        console.log(theme.dim('  2. Follow the browser prompts to sign in'));
        console.log(theme.dim('  3. Copy the OAuth token (starts with sk-ant-oat-...)'));
        console.log('');

        const { token } = await inquirer.prompt([{
            type: 'password',
            name: 'token',
            message: theme.white('Paste OAuth token:'),
            mask: '*',
        }]);

        if (token) {
            const spinner = ora(theme.muted('Validating OAuth token...')).start();
            const valid = await validateKey('anthropic', token);
            if (valid) {
                spinner.succeed(theme.success('OAuth token verified!'));
                config.keys.anthropic = token;
                config.llm = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
            } else {
                spinner.fail(theme.error('OAuth token validation failed. Check the token and try again.'));
            }
        }
    } else if (authMethod === 'apikey') {
        const { key } = await inquirer.prompt([{
            type: 'password',
            name: 'key',
            message: theme.white('Anthropic API key:'),
            mask: '*',
        }]);

        if (key) {
            const spinner = ora(theme.muted('Validating API key...')).start();
            const valid = await validateKey('anthropic', key);
            if (valid) {
                spinner.succeed(theme.success('API key verified!'));
                config.keys.anthropic = key;
                config.llm = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
            } else {
                spinner.fail(theme.error('API key validation failed.'));
            }
        }
    } else {
        // Auto-detect
        const spinner = ora(theme.muted('Searching for Anthropic credentials...')).start();
        const envKey = process.env.ANTHROPIC_API_KEY;
        if (envKey) {
            spinner.succeed(theme.success('Found ANTHROPIC_API_KEY in environment'));
            config.keys.anthropic = envKey;
            config.llm = { provider: 'anthropic', model: 'claude-sonnet-4-20250514' };
        } else {
            spinner.warn(theme.error('No Anthropic credentials found. Set ANTHROPIC_API_KEY or use OAuth.'));
        }
    }

    // Model selection if provider was configured
    if (config.llm?.provider === 'anthropic') {
        const { model } = await inquirer.prompt([{
            type: 'list',
            name: 'model',
            message: theme.white('Default Claude model:'),
            choices: [
                { name: 'Claude Sonnet 4 (balanced)', value: 'claude-sonnet-4-20250514' },
                { name: 'Claude Opus 4 (most capable)', value: 'claude-opus-4-20250514' },
                { name: 'Claude Haiku 3.5 (fastest, cheapest)', value: 'claude-haiku-3-5-20241022' },
            ],
        }]);
        config.llm.model = model;
    }
}

async function setupOpenAI(config: ProviderConfig): Promise<void> {
    const key = config.keys.openai || process.env.OPENAI_API_KEY;
    if (key) {
        console.log(theme.dim('  Using existing OpenAI key'));
        config.keys.openai = key;
    } else {
        const { apiKey } = await inquirer.prompt([{
            type: 'password',
            name: 'apiKey',
            message: theme.white('OpenAI API key:'),
            mask: '*',
        }]);
        config.keys.openai = apiKey;
    }
    config.llm = { provider: 'openai', model: 'gpt-4o' };
}

async function setupGoogle(config: ProviderConfig): Promise<void> {
    const key = process.env.GEMINI_API_KEY;
    if (key) {
        console.log(theme.dim('  Using existing GEMINI_API_KEY'));
        config.keys.google = key;
    } else {
        const { apiKey } = await inquirer.prompt([{
            type: 'password',
            name: 'apiKey',
            message: theme.white('Google AI Studio API key:'),
            mask: '*',
        }]);
        config.keys.google = apiKey;
    }
    config.llm = { provider: 'google', model: 'gemini-2.5-flash' };
}

async function setupOllama(config: ProviderConfig): Promise<void> {
    const spinner = ora(theme.muted('Checking Ollama...')).start();
    const available = await OllamaLLM.isAvailable();

    if (!available) {
        spinner.fail(theme.error('Ollama not running.'));
        console.log(theme.dim('  Install: https://ollama.com'));
        console.log(theme.dim('  Start:   ollama serve'));
        return;
    }

    const ollama = new OllamaLLM();
    const models = await ollama.listModels();
    spinner.succeed(theme.success(`Ollama running — ${models.length} models available`));

    if (models.length === 0) {
        console.log(theme.dim('  Pull a model: ollama pull llama3.2'));
        config.llm = { provider: 'ollama', model: 'llama3.2' };
        return;
    }

    const { model } = await inquirer.prompt([{
        type: 'list',
        name: 'model',
        message: theme.white('Select a model:'),
        choices: models.map(m => ({ name: m, value: m })),
    }]);

    config.llm = { provider: 'ollama', model };
}
