#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Allo CLI — Your Neural Memory Assistant
 */
const commander_1 = require("commander");
const ora_1 = __importDefault(require("ora"));
const inquirer_1 = __importDefault(require("inquirer"));
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const allo_1 = require("./allo");
const theme_1 = require("./theme");
const providers_1 = require("./providers");
const onboarding_1 = require("./onboarding");
const brains_1 = require("./brains");
const VERSION = '1.0.0';
let allo;
let config;
let activeBrainPath;
async function ensureSetup() {
    if (!config) {
        if (!(0, providers_1.configExists)()) {
            config = await (0, onboarding_1.runOnboarding)();
        }
        else {
            config = await (0, providers_1.loadConfig)();
        }
    }
    return config;
}
async function getAllo(options) {
    const requestedFile = options?.file;
    // If switching brains (different file), reset the instance
    if (allo && requestedFile && requestedFile !== activeBrainPath) {
        allo = null;
    }
    if (!allo) {
        const cfg = await ensureSetup();
        const memFile = requestedFile || cfg.memoryFile || 'allo-memory.engram';
        const password = cfg.password || '';
        const spinner = (0, ora_1.default)(theme_1.theme.muted('Waking up Allo...')).start();
        try {
            allo = new allo_1.Allo({
                memoryFile: memFile,
                password,
                persona: options?.persona,
                readOnly: options?.readOnly,
            });
            await allo.initialize();
            activeBrainPath = memFile;
            spinner.succeed(theme_1.theme.success('Allo is ready!'));
        }
        catch (e) {
            spinner.fail(theme_1.theme.error(`Failed to start: ${e.message}`));
            process.exit(1);
        }
    }
    return allo;
}
// ============== Interactive Menu ==============
async function interactiveMenu() {
    const cfg = await ensureSetup();
    let a = await getAllo();
    let { nodeCount } = a.getStats();
    console.clear();
    console.log((0, theme_1.banner)(VERSION, nodeCount, 0));
    const isReadOnly = a.config.readOnly;
    const personaName = a.config.persona;
    while (true) {
        const brainLabel = personaName
            ? theme_1.theme.accent(`  [${personaName}]`)
            : '';
        const choices = [];
        if (!isReadOnly) {
            choices.push({ name: theme_1.theme.success('❯ Remember something'), value: 'remember' });
        }
        choices.push({ name: theme_1.theme.accent('  Recall a memory'), value: 'recall' });
        if (cfg.llm) {
            choices.push({ name: theme_1.theme.primary('  Chat' + (personaName ? ` with ${personaName}` : ' with your memories')), value: 'chat' });
        }
        if (!isReadOnly) {
            choices.push({ name: theme_1.theme.white('  Forget a memory'), value: 'forget' });
            choices.push({ name: theme_1.theme.white('  Consolidate brain'), value: 'consolidate' });
        }
        choices.push({ name: theme_1.theme.white('  Switch brain'), value: 'switch' }, { name: theme_1.theme.white('  Browse memory tree'), value: 'browse' }, { name: theme_1.theme.muted('  Stats & health'), value: 'stats' }, { name: theme_1.theme.muted('  Settings'), value: 'settings' }, { name: theme_1.theme.dim('  Exit'), value: 'exit' });
        const { action } = await inquirer_1.default.prompt([{
                type: 'list',
                name: 'action',
                message: theme_1.theme.primaryBold('What would you like to do?') + brainLabel,
                choices,
            }]);
        switch (action) {
            case 'remember':
                await doRemember(a);
                break;
            case 'recall':
                await doRecall(a);
                break;
            case 'chat':
                await doChat(a, personaName);
                break;
            case 'switch': {
                const result = await doBrainSwitch(cfg);
                if (result) {
                    a = result;
                    const stats = a.getStats();
                    console.clear();
                    console.log((0, theme_1.banner)(VERSION, stats.nodeCount, 0));
                }
                break;
            }
            case 'forget':
                await doForget(a);
                break;
            case 'consolidate':
                await doConsolidate(a, cfg);
                break;
            case 'stats':
                await doStats(a);
                break;
            case 'settings':
                await doSettings();
                break;
            case 'browse':
                console.log(theme_1.theme.dim('\n  Tree browser coming soon.\n'));
                break;
            case 'exit':
                console.log(theme_1.theme.muted('\n  See you later. 🦖\n'));
                process.exit(0);
        }
    }
}
async function doBrainSwitch(cfg) {
    (0, brains_1.ensureBrainsDir)();
    const brains = (0, brains_1.discoverBrains)(cfg.memoryFile);
    const choices = brains.map(b => {
        const label = b.persona ? `${b.name} [${b.persona}]` : b.name;
        const meta = `${b.sizeMB} MB`;
        const active = b.path === activeBrainPath ? theme_1.theme.success(' (active)') : '';
        return {
            name: `${theme_1.theme.white(label)} ${theme_1.theme.dim(meta)}${active}`,
            value: b.path,
        };
    });
    choices.push({ name: theme_1.theme.accent('+ Load a .engram file by path'), value: '__custom__' }, { name: theme_1.theme.dim('  Cancel'), value: '__cancel__' });
    const { brainPath } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'brainPath',
            message: theme_1.theme.primaryBold('Switch brain:'),
            choices,
        }]);
    if (brainPath === '__cancel__')
        return null;
    let filePath = brainPath;
    if (brainPath === '__custom__') {
        const { customPath } = await inquirer_1.default.prompt([{
                type: 'input',
                name: 'customPath',
                message: theme_1.theme.white('Path to .engram file:'),
            }]);
        if (!customPath)
            return null;
        filePath = customPath;
    }
    // Ask if this is a persona brain
    const brain = brains.find(b => b.path === filePath);
    let persona;
    let readOnly = false;
    const { brainType } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'brainType',
            message: theme_1.theme.white('Brain type:'),
            choices: [
                { name: theme_1.theme.success('Personal memory') + theme_1.theme.dim(' — read/write, your memories'), value: 'personal' },
                { name: theme_1.theme.accent('Persona brain') + theme_1.theme.dim(' — read-only, chat as someone'), value: 'persona' },
            ],
        }]);
    if (brainType === 'persona') {
        readOnly = true;
        const { personaName } = await inquirer_1.default.prompt([{
                type: 'input',
                name: 'personaName',
                message: theme_1.theme.white('Who is this brain? (e.g., "Nikola Tesla"):'),
                default: brain?.persona || '',
            }]);
        persona = personaName || undefined;
    }
    // Switch
    allo = null;
    return getAllo({ file: filePath, persona, readOnly });
}
async function doRemember(a) {
    const { text } = await inquirer_1.default.prompt([{
            type: 'input',
            name: 'text',
            message: theme_1.theme.white('What should I remember?'),
        }]);
    if (!text)
        return;
    const { tags } = await inquirer_1.default.prompt([{
            type: 'input',
            name: 'tags',
            message: theme_1.theme.muted('Tags (comma-separated, or enter to skip):'),
        }]);
    const spinner = (0, ora_1.default)(theme_1.theme.muted('Committing to memory...')).start();
    const tagList = tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const id = await a.addText(text, undefined, tagList);
    const { nodeCount, fileSizeMB } = await a.save();
    spinner.succeed(theme_1.theme.success(`Remembered!`) + theme_1.theme.dim(` ID: ${id}`));
    console.log(theme_1.theme.dim(`  Brain: ${nodeCount} memories (${fileSizeMB} MB)\n`));
}
async function doRecall(a) {
    const { query } = await inquirer_1.default.prompt([{
            type: 'input',
            name: 'query',
            message: theme_1.theme.white('What are you looking for?'),
        }]);
    if (!query)
        return;
    const spinner = (0, ora_1.default)(theme_1.theme.muted('Searching...')).start();
    const results = await a.recall(query, 8);
    spinner.stop();
    if (results.length === 0) {
        console.log(theme_1.theme.dim('\n  Nothing comes to mind for that query.\n'));
        return;
    }
    console.log(theme_1.theme.accent(`\n  Found ${results.length} memor${results.length === 1 ? 'y' : 'ies'}:\n`));
    results.forEach((mem, i) => {
        const tier = theme_1.tierLabel[mem.tier] || mem.tier;
        const score = mem.score !== undefined ? theme_1.theme.dim(` ${(mem.score * 100).toFixed(0)}%`) : '';
        console.log(`  ${theme_1.theme.primaryBold(`${i + 1}.`)} [${tier}] ${theme_1.theme.white(mem.content)}${score}`);
        console.log(theme_1.theme.dim(`     ${new Date(mem.timestamp).toLocaleDateString()}`));
        if (mem.tags.length > 0) {
            console.log(theme_1.theme.dim(`     Tags: ${mem.tags.join(', ')}`));
        }
    });
    console.log('');
}
async function doChat(a, persona) {
    const llm = (0, providers_1.createLLM)(config);
    if (!llm) {
        console.log(theme_1.theme.error('\n  No LLM configured. Run allo setup to add one.\n'));
        return;
    }
    const chatHistory = [];
    let systemPrompt;
    let chatLabel;
    if (persona) {
        systemPrompt = `You ARE ${persona}. You are speaking as ${persona} in first person. Your knowledge comes from your own published works, patents, lectures, and autobiography — the excerpts provided below are YOUR writings and experiences. Speak naturally as yourself, with your personality, opinions, and voice. Reference your actual inventions, experiences, and ideas. If asked something outside your knowledge, say so honestly. Do not break character.\n\nYour writings and knowledge:\n`;
        chatLabel = persona.split(' ').pop() || persona;
        console.log(theme_1.theme.accent(`\n  You are now speaking with ${persona}.`));
        console.log(theme_1.theme.dim('  Their published works are the knowledge base.'));
    }
    else {
        systemPrompt = `You are Allo, a neural memory assistant. Answer based on the user's memories below. Be concise and helpful.\n\nRelevant memories:\n`;
        chatLabel = 'Allo';
        console.log(theme_1.theme.accent('\n  Chat mode — your memories are the context.'));
    }
    console.log(theme_1.theme.dim('  Type "exit" to leave.\n'));
    while (true) {
        const { input } = await inquirer_1.default.prompt([{
                type: 'input',
                name: 'input',
                message: theme_1.theme.primary('You:'),
            }]);
        if (!input || input.toLowerCase() === 'exit')
            break;
        // Recall relevant memories
        const spinner = (0, ora_1.default)(theme_1.theme.muted('Thinking...')).start();
        const memories = await a.recall(input, 8);
        const context = memories.length > 0
            ? memories.map(m => `[${m.tier}] ${m.content}`).join('\n')
            : 'No relevant memories found.';
        chatHistory.push({ role: 'user', content: input });
        try {
            const response = await llm.chat({
                model: config.llm.model,
                system: systemPrompt + context,
                messages: chatHistory.slice(-10), // Keep last 10 messages for context
            });
            spinner.stop();
            chatHistory.push({ role: 'assistant', content: response.content });
            console.log(theme_1.theme.accent(`\n  ${chatLabel}: `) + response.content);
            console.log(theme_1.theme.dim(`  (${response.tokensIn + response.tokensOut} tokens)\n`));
        }
        catch (e) {
            spinner.fail(theme_1.theme.error(`LLM error: ${e.message}`));
            chatHistory.pop(); // Remove the failed user message
        }
    }
}
async function doForget(a) {
    const { query } = await inquirer_1.default.prompt([{
            type: 'input',
            name: 'query',
            message: theme_1.theme.white('What should I forget?'),
        }]);
    if (!query)
        return;
    const { confirm } = await inquirer_1.default.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: theme_1.theme.error(`Forget all memories matching "${query}"? This cannot be undone.`),
            default: false,
        }]);
    if (!confirm) {
        console.log(theme_1.theme.dim('\n  Nothing forgotten.\n'));
        return;
    }
    const spinner = (0, ora_1.default)(theme_1.theme.muted('Forgetting...')).start();
    const forgotten = await a.forget(query);
    if (forgotten > 0) {
        spinner.succeed(theme_1.theme.success(`Forgotten ${forgotten} memor${forgotten === 1 ? 'y' : 'ies'}.`));
    }
    else {
        spinner.info(theme_1.theme.dim('No matching memories found.'));
    }
    console.log('');
}
async function doConsolidate(a, cfg) {
    const { nodeCount } = a.getStats();
    console.log(theme_1.theme.accent(`\n  Consolidating ${nodeCount} memories...\n`));
    // Build summarizer from configured LLM (if available)
    let summarizer;
    if (cfg.llm) {
        const { createLLM: makeLLM } = await Promise.resolve().then(() => __importStar(require('./providers')));
        const llm = makeLLM(cfg);
        if (llm) {
            summarizer = {
                summarize: async (texts) => {
                    const response = await llm.chat({
                        model: cfg.llm.model,
                        system: 'You are a memory consolidation system. Combine the following related memories into a single concise summary. Preserve all key facts and decisions. Remove redundancy. Output only the summary.',
                        messages: [{ role: 'user', content: texts.join('\n---\n') }],
                    });
                    return response.content;
                },
            };
        }
    }
    const spinner = (0, ora_1.default)(theme_1.theme.muted('Running consolidation pipeline...')).start();
    const report = await a.consolidate(undefined, summarizer);
    spinner.succeed(theme_1.theme.success('Consolidation complete!'));
    console.log('');
    console.log(`  ${theme_1.theme.white('Decayed:')}       ${report.decayed} memories aged to next tier`);
    console.log(`  ${theme_1.theme.white('Deduplicated:')}  ${report.deduplicated} duplicates removed`);
    if (report.clustersFound > 0) {
        console.log(`  ${theme_1.theme.white('Clusters:')}      ${report.clustersFound} found, ${report.summarized} memories merged`);
    }
    console.log(`  ${theme_1.theme.white('Archived:')}      ${report.archived} old memories truncated`);
    console.log(`  ${theme_1.theme.white('Result:')}        ${report.before.total} → ${report.after.total} memories`);
    console.log(`  ${theme_1.theme.white('Duration:')}      ${report.durationMs}ms`);
    console.log('');
}
async function doStats(a) {
    const { nodeCount, fileSizeMB } = await a.save();
    const all = a.getAll();
    const tiers = { hot: 0, warm: 0, cold: 0, archive: 0 };
    for (const mem of all) {
        if (mem.tier in tiers)
            tiers[mem.tier]++;
    }
    console.log('');
    console.log(theme_1.theme.primaryBold('  Brain Health Report'));
    console.log((0, theme_1.separator)(30));
    console.log(`  ${theme_1.theme.white('File:')}      ${theme_1.theme.dim(a.config.memoryFile)}`);
    console.log(`  ${theme_1.theme.white('Memories:')}  ${theme_1.theme.primaryBold(String(nodeCount))}`);
    console.log(`  ${theme_1.theme.white('Size:')}      ${theme_1.theme.dim(fileSizeMB + ' MB')}`);
    console.log(`  ${theme_1.theme.white('Model:')}     ${theme_1.theme.dim(a.config.embeddingModel)}`);
    if (a.config.persona) {
        console.log(`  ${theme_1.theme.white('Persona:')}   ${theme_1.theme.accent(a.config.persona)}`);
    }
    if (a.config.readOnly) {
        console.log(`  ${theme_1.theme.white('Mode:')}      ${theme_1.theme.dim('Read-only')}`);
    }
    if (config?.llm) {
        console.log(`  ${theme_1.theme.white('LLM:')}       ${theme_1.theme.dim(config.llm.provider + '/' + config.llm.model)}`);
    }
    console.log('');
    if (nodeCount > 0) {
        const bar = (count, total) => {
            const pct = total > 0 ? count / total : 0;
            const filled = Math.round(pct * 20);
            return '█'.repeat(filled) + '░'.repeat(20 - filled);
        };
        const total = tiers.hot + tiers.warm + tiers.cold + tiers.archive;
        console.log(`  ${theme_1.tierLabel.hot}     ${bar(tiers.hot, total)} ${tiers.hot}`);
        console.log(`  ${theme_1.tierLabel.warm}    ${bar(tiers.warm, total)} ${tiers.warm}`);
        console.log(`  ${theme_1.tierLabel.cold}    ${bar(tiers.cold, total)} ${tiers.cold}`);
        console.log(`  ${theme_1.tierLabel.archive} ${bar(tiers.archive, total)} ${tiers.archive}`);
    }
    console.log('');
}
async function doSettings() {
    const { action } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'action',
            message: theme_1.theme.white('Settings:'),
            choices: [
                { name: 'Re-run setup wizard', value: 'setup' },
                { name: 'View current config', value: 'view' },
                { name: theme_1.theme.dim('Back'), value: 'back' },
            ],
        }]);
    if (action === 'setup') {
        config = await (0, onboarding_1.runOnboarding)();
    }
    else if (action === 'view') {
        const cfg = await (0, providers_1.loadConfig)();
        console.log('');
        console.log(theme_1.theme.dim(JSON.stringify(cfg, (k, v) => {
            if (k === 'anthropic' || k === 'openai' || k === 'google') {
                return typeof v === 'string' ? v.slice(0, 8) + '...' : v;
            }
            return v;
        }, 2)));
        console.log('');
    }
}
// ============== CLI Commands ==============
const program = new commander_1.Command();
program
    .name('allo')
    .description(theme_1.theme.primary('Allo 🦖') + ' — Your Neural Memory Assistant')
    .version(VERSION);
program
    .command('remember [text]')
    .description('Add a text memory')
    .option('-t, --tags <tags>', 'Comma-separated tags', '')
    .option('-p, --parent <id>', 'Parent memory ID')
    .option('-f, --file <path>', 'Memory file path')
    .action(async (text, options) => {
    const a = await getAllo(options);
    if (!text) {
        await doRemember(a);
        return;
    }
    const spinner = (0, ora_1.default)(theme_1.theme.muted('Committing to memory...')).start();
    const tags = options.tags.split(',').filter(Boolean);
    const id = await a.addText(text, options.parent, tags);
    const { nodeCount, fileSizeMB } = await a.save();
    spinner.succeed(theme_1.theme.success(`Remembered!`) + theme_1.theme.dim(` ID: ${id}`));
    console.log(theme_1.theme.dim(`  Brain: ${nodeCount} memories (${fileSizeMB} MB)`));
});
program
    .command('remember-file <filePath>')
    .description('Add a file memory')
    .option('-c, --caption <caption>', 'Caption for the file')
    .option('-t, --tags <tags>', 'Comma-separated tags', '')
    .option('-p, --parent <id>', 'Parent memory ID')
    .option('-f, --file <path>', 'Memory file path')
    .action(async (filePath, options) => {
    const a = await getAllo(options);
    let caption = options.caption;
    if (!caption) {
        const answers = await inquirer_1.default.prompt([{
                type: 'input',
                name: 'caption',
                message: theme_1.theme.white(`Describe "${node_path_1.default.basename(filePath)}":`),
            }]);
        caption = answers.caption;
    }
    if (!caption) {
        console.log(theme_1.theme.error('Caption required.'));
        return;
    }
    const spinner = (0, ora_1.default)(theme_1.theme.muted(`Ingesting "${node_path_1.default.basename(filePath)}"...`)).start();
    const tags = options.tags.split(',').filter(Boolean);
    const id = await a.addFile(filePath, caption, options.parent, tags);
    const { nodeCount, fileSizeMB } = await a.save();
    spinner.succeed(theme_1.theme.success(`File stored!`) + theme_1.theme.dim(` ID: ${id}`));
    console.log(theme_1.theme.dim(`  Brain: ${nodeCount} memories (${fileSizeMB} MB)`));
});
program
    .command('recall <query>')
    .description('Search your memories')
    .option('-l, --limit <number>', 'Max results', '8')
    .option('-f, --file <path>', 'Memory file path')
    .action(async (query, options) => {
    const a = await getAllo(options);
    const spinner = (0, ora_1.default)(theme_1.theme.muted(`Searching for "${query}"...`)).start();
    const memories = await a.recall(query, parseInt(options.limit));
    spinner.stop();
    if (memories.length === 0) {
        console.log(theme_1.theme.dim('Nothing comes to mind for that query.'));
        return;
    }
    console.log(theme_1.theme.accent(`\nFound ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'}:\n`));
    memories.forEach((mem, i) => {
        const tier = theme_1.tierLabel[mem.tier] || mem.tier;
        const score = mem.score !== undefined ? theme_1.theme.dim(` ${(mem.score * 100).toFixed(0)}%`) : '';
        console.log(`${theme_1.theme.primaryBold(`${i + 1}.`)} [${tier}] ${theme_1.theme.white(mem.content)}${score}`);
        console.log(theme_1.theme.dim(`   ${new Date(mem.timestamp).toLocaleDateString()} | ID: ${mem.id}`));
        if (mem.tags.length > 0)
            console.log(theme_1.theme.dim(`   Tags: ${mem.tags.join(', ')}`));
        console.log('');
    });
});
program
    .command('chat')
    .description('Chat with your memories using AI')
    .option('-f, --file <path>', 'Memory file path')
    .option('--persona <name>', 'Embody a persona (e.g., "Nikola Tesla")')
    .action(async (options) => {
    await getAllo(options);
    await doChat(allo, options.persona);
});
program
    .command('stats')
    .description('Brain health report')
    .option('-f, --file <path>', 'Memory file path')
    .action(async (options) => {
    const a = await getAllo(options);
    await doStats(a);
});
program
    .command('setup')
    .description('Re-run the setup wizard')
    .action(async () => {
    config = await (0, onboarding_1.runOnboarding)();
});
program
    .command('consolidate')
    .description('Run memory consolidation (decay, dedup, cluster, summarize)')
    .option('-f, --file <path>', 'Memory file path')
    .action(async (options) => {
    const cfg = await ensureSetup();
    const a = await getAllo(options);
    await doConsolidate(a, cfg);
});
program
    .command('forget <query>')
    .description('Forget memories matching a semantic query')
    .option('-t, --threshold <number>', 'Similarity threshold (0-1)', '0.7')
    .option('-f, --file <path>', 'Memory file path')
    .option('--force', 'Skip confirmation prompt')
    .action(async (query, options) => {
    const a = await getAllo(options);
    if (!options.force) {
        const { confirm } = await inquirer_1.default.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: theme_1.theme.error(`Forget all memories matching "${query}"? This cannot be undone.`),
                default: false,
            }]);
        if (!confirm) {
            console.log(theme_1.theme.dim('Nothing forgotten.'));
            return;
        }
    }
    const spinner = (0, ora_1.default)(theme_1.theme.muted('Forgetting...')).start();
    const forgotten = await a.forget(query, parseFloat(options.threshold));
    if (forgotten > 0) {
        spinner.succeed(theme_1.theme.success(`Forgotten ${forgotten} memor${forgotten === 1 ? 'y' : 'ies'}.`));
    }
    else {
        spinner.info(theme_1.theme.dim('No matching memories found.'));
    }
});
program
    .command('demo')
    .description('Guided demo of Allo capabilities')
    .action(async () => {
    console.log((0, theme_1.banner)(VERSION));
    console.log(theme_1.theme.primaryBold('  Demo Mode\n'));
    const demoFile = 'allo-demo.engram';
    const a = new allo_1.Allo({ memoryFile: demoFile });
    await a.initialize();
    console.log(theme_1.theme.white('  1. Adding memories...'));
    const rootId = await a.addText('Allo is a neural memory assistant built on Engram.', undefined, ['core']);
    await a.addText('Engram uses HNSW indexing for fast semantic search.', rootId, ['tech']);
    await a.addText('Memories decay over time: hot, warm, cold, archive.', rootId, ['tech']);
    console.log(theme_1.theme.success('     Added 3 memories.\n'));
    console.log(theme_1.theme.white('  2. Recalling memories about "search"...'));
    const results = await a.recall('semantic search performance', 3);
    results.forEach((mem, i) => {
        console.log(theme_1.theme.dim(`     ${i + 1}. ${mem.content}`));
    });
    console.log(theme_1.theme.white('\n  3. Saving brain...'));
    const { nodeCount, fileSizeMB } = await a.save();
    console.log(theme_1.theme.success(`     Saved ${nodeCount} memories (${fileSizeMB} MB)\n`));
    try {
        await promises_1.default.unlink(demoFile);
    }
    catch { }
    try {
        await promises_1.default.rm('allo_files', { recursive: true, force: true });
    }
    catch { }
    console.log(theme_1.theme.primaryBold('  Demo complete! 🦖\n'));
});
// Default: interactive menu when no command given
if (process.argv.length <= 2) {
    interactiveMenu().catch(e => {
        console.error(theme_1.theme.error(e.message));
        process.exit(1);
    });
}
else {
    program.parse();
}
//# sourceMappingURL=cli.js.map