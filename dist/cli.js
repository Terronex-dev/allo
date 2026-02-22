#!/usr/bin/env node
"use strict";
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
const VERSION = '1.0.0';
let allo;
let config;
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
    if (!allo) {
        const cfg = await ensureSetup();
        const memFile = options?.file || cfg.memoryFile || 'allo-memory.engram';
        const password = cfg.password || '';
        const spinner = (0, ora_1.default)(theme_1.theme.muted('Waking up Allo...')).start();
        try {
            allo = new allo_1.Allo({ memoryFile: memFile, password });
            await allo.initialize();
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
    const a = await getAllo();
    const { nodeCount, fileSizeMB } = await a.save();
    console.clear();
    console.log((0, theme_1.banner)(VERSION, nodeCount, fileSizeMB));
    while (true) {
        const { action } = await inquirer_1.default.prompt([{
                type: 'list',
                name: 'action',
                message: theme_1.theme.primaryBold('What would you like to do?'),
                choices: [
                    { name: theme_1.theme.success('❯ Remember something'), value: 'remember' },
                    { name: theme_1.theme.accent('  Recall a memory'), value: 'recall' },
                    ...(cfg.llm ? [{ name: theme_1.theme.primary('  Chat with your memories'), value: 'chat' }] : []),
                    { name: theme_1.theme.white('  Browse memory tree'), value: 'browse' },
                    { name: theme_1.theme.muted('  Stats & health'), value: 'stats' },
                    { name: theme_1.theme.muted('  Settings'), value: 'settings' },
                    { name: theme_1.theme.dim('  Exit'), value: 'exit' },
                ],
            }]);
        switch (action) {
            case 'remember':
                await doRemember(a);
                break;
            case 'recall':
                await doRecall(a);
                break;
            case 'chat':
                await doChat(a);
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
async function doChat(a) {
    const llm = (0, providers_1.createLLM)(config);
    if (!llm) {
        console.log(theme_1.theme.error('\n  No LLM configured. Run allo setup to add one.\n'));
        return;
    }
    console.log(theme_1.theme.accent('\n  Chat mode — your memories are the context.'));
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
        const memories = await a.recall(input, 5);
        const context = memories.length > 0
            ? memories.map(m => `[${m.tier}] ${m.content}`).join('\n')
            : 'No relevant memories found.';
        try {
            const response = await llm.chat({
                model: config.llm.model,
                system: `You are Allo, a neural memory assistant. Answer based on the user's memories below. Be concise and helpful.\n\nRelevant memories:\n${context}`,
                messages: [{ role: 'user', content: input }],
            });
            spinner.stop();
            console.log(theme_1.theme.accent('\n  Allo: ') + response.content);
            console.log(theme_1.theme.dim(`  (${response.tokensIn + response.tokensOut} tokens)\n`));
        }
        catch (e) {
            spinner.fail(theme_1.theme.error(`LLM error: ${e.message}`));
        }
    }
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
    .action(async (options) => {
    await getAllo(options);
    await doChat(allo);
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