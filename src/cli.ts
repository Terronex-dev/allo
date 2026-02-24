#!/usr/bin/env node

/**
 * Allo CLI — Your Neural Memory Assistant
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Allo } from './allo.js';
import { theme, HEADER, HEADER_COMPACT, banner, separator, box, tierLabel } from './theme.js';
import { loadConfig, configExists, createLLM, ProviderConfig } from './providers.js';
import { runOnboarding } from './onboarding.js';
import { discoverBrains, ensureBrainsDir, BrainInfo } from './brains.js';

const VERSION = '1.0.0';

let allo: Allo;
let config: ProviderConfig;
let activeBrainPath: string | undefined;

async function ensureSetup(): Promise<ProviderConfig> {
    if (!config) {
        if (!configExists()) {
            config = await runOnboarding();
        } else {
            config = await loadConfig();
        }
    }
    return config;
}

async function getAllo(options?: { file?: string; persona?: string; readOnly?: boolean }): Promise<Allo> {
    const requestedFile = options?.file;
    // If switching brains (different file), reset the instance
    if (allo && requestedFile && requestedFile !== activeBrainPath) {
        allo = null as any;
    }
    if (!allo) {
        const cfg = await ensureSetup();
        const memFile = requestedFile || (cfg as any).memoryFile || 'allo-memory.engram';
        const password = (cfg as any).password || '';
        const spinner = ora(theme.muted('Waking up Allo...')).start();
        try {
            allo = new Allo({
                memoryFile: memFile,
                password,
                persona: options?.persona,
                readOnly: options?.readOnly,
            });
            await allo.initialize();
            activeBrainPath = memFile;
            spinner.succeed(theme.success('Allo is ready!'));
        } catch (e: any) {
            spinner.fail(theme.error(`Failed to start: ${e.message}`));
            process.exit(1);
        }
    }
    return allo;
}

// ============== Interactive Menu ==============

async function interactiveMenu(): Promise<void> {
    const cfg = await ensureSetup();
    let a = await getAllo();
    let { nodeCount } = a.getStats();

    console.clear();
    console.log(banner(VERSION, nodeCount, 0));

    const isReadOnly = a.config.readOnly;
    const personaName = a.config.persona;

    while (true) {
        const brainLabel = personaName
            ? theme.accent(`  [${personaName}]`)
            : '';

        const choices: any[] = [];
        if (!isReadOnly) {
            choices.push({ name: theme.success('❯ Remember something'), value: 'remember' });
        }
        choices.push({ name: theme.accent('  Recall a memory'), value: 'recall' });
        if (cfg.llm) {
            choices.push({ name: theme.primary('  Chat' + (personaName ? ` with ${personaName}` : ' with your memories')), value: 'chat' });
        }
        if (!isReadOnly) {
            choices.push({ name: theme.white('  Forget a memory'), value: 'forget' });
            choices.push({ name: theme.white('  Consolidate brain'), value: 'consolidate' });
        }
        choices.push(
            { name: theme.white('  Switch brain'), value: 'switch' },
            { name: theme.white('  Browse memory tree'), value: 'browse' },
            { name: theme.muted('  Stats & health'), value: 'stats' },
            { name: theme.muted('  Settings'), value: 'settings' },
            { name: theme.dim('  Exit'), value: 'exit' },
        );

        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: theme.primaryBold('What would you like to do?') + brainLabel,
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
                    console.log(banner(VERSION, stats.nodeCount, 0));
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
                console.log(theme.dim('\n  Tree browser coming soon.\n'));
                break;
            case 'exit':
                console.log(theme.muted('\n  See you later. 🦖\n'));
                process.exit(0);
        }
    }
}

async function doBrainSwitch(cfg: ProviderConfig): Promise<Allo | null> {
    ensureBrainsDir();
    const brains = discoverBrains((cfg as any).memoryFile);

    const choices: any[] = brains.map(b => {
        const label = b.persona ? `${b.name} [${b.persona}]` : b.name;
        const meta = `${b.sizeMB} MB`;
        const active = b.path === activeBrainPath ? theme.success(' (active)') : '';
        return {
            name: `${theme.white(label)} ${theme.dim(meta)}${active}`,
            value: b.path,
        };
    });

    choices.push(
        { name: theme.accent('+ Load a .engram file by path'), value: '__custom__' },
        { name: theme.dim('  Cancel'), value: '__cancel__' },
    );

    const { brainPath } = await inquirer.prompt([{
        type: 'list',
        name: 'brainPath',
        message: theme.primaryBold('Switch brain:'),
        choices,
    }]);

    if (brainPath === '__cancel__') return null;

    let filePath = brainPath;
    if (brainPath === '__custom__') {
        const { customPath } = await inquirer.prompt([{
            type: 'input',
            name: 'customPath',
            message: theme.white('Path to .engram file:'),
        }]);
        if (!customPath) return null;
        filePath = customPath;
    }

    // Ask if this is a persona brain
    const brain = brains.find(b => b.path === filePath);
    let persona: string | undefined;
    let readOnly = false;

    const { brainType } = await inquirer.prompt([{
        type: 'list',
        name: 'brainType',
        message: theme.white('Brain type:'),
        choices: [
            { name: theme.success('Personal memory') + theme.dim(' — read/write, your memories'), value: 'personal' },
            { name: theme.accent('Persona brain') + theme.dim(' — read-only, chat as someone'), value: 'persona' },
        ],
    }]);

    if (brainType === 'persona') {
        readOnly = true;
        const { personaName } = await inquirer.prompt([{
            type: 'input',
            name: 'personaName',
            message: theme.white('Who is this brain? (e.g., "Nikola Tesla"):'),
            default: brain?.persona || '',
        }]);
        persona = personaName || undefined;
    }

    // Switch
    allo = null as any;
    return getAllo({ file: filePath, persona, readOnly });
}

async function doRemember(a: Allo): Promise<void> {
    const { text } = await inquirer.prompt([{
        type: 'input',
        name: 'text',
        message: theme.white('What should I remember?'),
    }]);
    if (!text) return;

    const { tags } = await inquirer.prompt([{
        type: 'input',
        name: 'tags',
        message: theme.muted('Tags (comma-separated, or enter to skip):'),
    }]);

    const spinner = ora(theme.muted('Committing to memory...')).start();
    const tagList = tags ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
    const id = await a.addText(text, undefined, tagList);
    const { nodeCount, fileSizeMB } = await a.save();
    spinner.succeed(theme.success(`Remembered!`) + theme.dim(` ID: ${id}`));
    console.log(theme.dim(`  Brain: ${nodeCount} memories (${fileSizeMB} MB)\n`));
}

function truncate(text: string, maxLen: number): string {
    // Collapse whitespace and newlines, then truncate
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen - 1) + '…';
}

function formatDate(ts: number): string {
    const d = new Date(ts);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatFullDate(ts: number): string {
    return new Date(ts).toLocaleString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });
}

function decayEstimate(tier: string, importance: number, accessed: number): string {
    const thresholds: Record<string, number> = { hot: 7, warm: 30, cold: 365 };
    const base = thresholds[tier];
    if (!base) return 'permanent';
    const importMult = 1 + (importance * 2);
    const accessBoost = Math.min(accessed * 0.5, 5);
    const effective = Math.round((base + accessBoost) * importMult);
    return `~${effective} days`;
}

function wordWrap(text: string, width: number, indent: string): string {
    const lines: string[] = [];
    for (const rawLine of text.split('\n')) {
        if (rawLine.length <= width) {
            lines.push(indent + rawLine);
            continue;
        }
        let remaining = rawLine;
        while (remaining.length > width) {
            let breakAt = remaining.lastIndexOf(' ', width);
            if (breakAt <= 0) breakAt = width;
            lines.push(indent + remaining.slice(0, breakAt));
            remaining = remaining.slice(breakAt).trimStart();
        }
        if (remaining) lines.push(indent + remaining);
    }
    return lines.join('\n');
}

import type { AlloMemory } from './allo.js';

function printMemoryDetail(idx: number, mem: AlloMemory): void {
    const tier = tierLabel[mem.tier] || mem.tier;
    const score = mem.score !== undefined ? `${(mem.score * 100).toFixed(0)}%` : '-';
    const sep = theme.dim('  ' + '─'.repeat(62));

    console.log('');
    console.log(sep);
    console.log(theme.primaryBold(`  Memory #${idx + 1}`) + theme.dim(` — ${mem.id}`));
    console.log(sep);
    console.log(`  ${theme.white('Relevance:')}   ${theme.accent(score)}`);
    console.log(`  ${theme.white('Tier:')}        [${tier}] ${theme.dim('(decay in ' + decayEstimate(mem.tier, mem.importance, mem.accessed) + ')')}`);
    console.log(`  ${theme.white('Type:')}        ${theme.dim(mem.type)}`);
    console.log(`  ${theme.white('Created:')}     ${theme.dim(formatFullDate(mem.timestamp))}`);
    console.log(`  ${theme.white('Modified:')}    ${theme.dim(formatFullDate(mem.modified))}`);
    console.log(`  ${theme.white('Accessed:')}    ${theme.dim(String(mem.accessed) + ' times')}${mem.lastAccessed ? theme.dim(', last ' + formatFullDate(mem.lastAccessed)) : ''}`);
    console.log(`  ${theme.white('Importance:')}  ${theme.dim(mem.importance.toFixed(2))}  ${theme.white('Confidence:')} ${theme.dim(mem.confidence.toFixed(2))}  ${theme.white('Source:')} ${theme.dim(mem.source)}`);
    if (mem.parentId) {
        console.log(`  ${theme.white('Parent:')}      ${theme.dim(mem.parentId)} ${theme.dim('(depth ' + mem.depth + ')')}`);
    }
    if (mem.tags.length > 0) {
        console.log(`  ${theme.white('Tags:')}        ${theme.dim(mem.tags.join(', '))}`);
    }
    console.log(`  ${theme.white('Words:')}       ${theme.dim(String(mem.wordCount))}`);
    console.log(sep);
    console.log(theme.white(wordWrap(mem.content, 72, '  ')));
    console.log(sep);
    console.log('');
}

async function doRecall(a: Allo): Promise<void> {
    const { query } = await inquirer.prompt([{
        type: 'input',
        name: 'query',
        message: theme.white('What are you looking for?'),
    }]);
    if (!query) return;

    const spinner = ora(theme.muted('Searching...')).start();
    const results = await a.recall(query, 8);
    spinner.stop();

    if (results.length === 0) {
        console.log(theme.dim('\n  Nothing comes to mind for that query.\n'));
        return;
    }

    // Compact list view
    while (true) {
        console.log(theme.accent(`\n  Found ${results.length} memor${results.length === 1 ? 'y' : 'ies'}:\n`));
        results.forEach((mem, i) => {
            const tier = tierLabel[mem.tier] || mem.tier;
            const score = mem.score !== undefined ? `${(mem.score * 100).toFixed(0)}%` : '';
            const date = formatDate(mem.timestamp);
            const tags = mem.tags.length > 0 ? theme.dim(` [${mem.tags.join(', ')}]`) : '';
            const preview = truncate(mem.content, 72);
            console.log(`  ${theme.primaryBold(`${i + 1}.`)} [${tier}] ${theme.dim(score.padEnd(4))} ${theme.white(preview)}`);
            console.log(`     ${theme.dim(date)}${tags}`);
        });

        // Interactive selection
        const { selection } = await inquirer.prompt([{
            type: 'input',
            name: 'selection',
            message: theme.muted(`View [1-${results.length}], or Enter to go back:`),
        }]);

        if (!selection) break;

        const idx = parseInt(selection) - 1;
        if (idx >= 0 && idx < results.length) {
            printMemoryDetail(idx, results[idx]);
        } else {
            console.log(theme.dim('  Invalid selection.'));
        }
    }
    console.log('');
}

async function doChat(a: Allo, persona?: string): Promise<void> {
    const llm = createLLM(config);
    if (!llm) {
        console.log(theme.error('\n  No LLM configured. Run allo setup to add one.\n'));
        return;
    }

    const chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    let systemPrompt: string;
    let chatLabel: string;

    if (persona) {
        systemPrompt = `You ARE ${persona}. You are speaking as ${persona} in first person. Your knowledge comes from your own published works, patents, lectures, and autobiography — the excerpts provided below are YOUR writings and experiences. Speak naturally as yourself, with your personality, opinions, and voice. Reference your actual inventions, experiences, and ideas. If asked something outside your knowledge, say so honestly. Do not break character.\n\nYour writings and knowledge:\n`;
        chatLabel = persona.split(' ').pop() || persona;
        console.log(theme.accent(`\n  You are now speaking with ${persona}.`));
        console.log(theme.dim('  Their published works are the knowledge base.'));
    } else {
        systemPrompt = `You are Allo, a neural memory assistant. Answer based on the user's memories below. Be concise and helpful.\n\nRelevant memories:\n`;
        chatLabel = 'Allo';
        console.log(theme.accent('\n  Chat mode — your memories are the context.'));
    }
    console.log(theme.dim('  Type "exit" to leave.\n'));

    while (true) {
        const { input } = await inquirer.prompt([{
            type: 'input',
            name: 'input',
            message: theme.primary('You:'),
        }]);

        if (!input || input.toLowerCase() === 'exit') break;

        // Recall relevant memories
        const spinner = ora(theme.muted('Thinking...')).start();
        const memories = await a.recall(input, 8);
        const context = memories.length > 0
            ? memories.map(m => `[${m.tier}] ${m.content}`).join('\n')
            : 'No relevant memories found.';

        chatHistory.push({ role: 'user', content: input });

        try {
            const response = await llm.chat({
                model: config.llm!.model,
                system: systemPrompt + context,
                messages: chatHistory.slice(-10), // Keep last 10 messages for context
            });
            spinner.stop();

            chatHistory.push({ role: 'assistant', content: response.content });

            console.log(theme.accent(`\n  ${chatLabel}: `) + response.content);
            console.log(theme.dim(`  (${response.tokensIn + response.tokensOut} tokens)\n`));
        } catch (e: any) {
            spinner.fail(theme.error(`LLM error: ${e.message}`));
            chatHistory.pop(); // Remove the failed user message
        }
    }
}

async function doForget(a: Allo): Promise<void> {
    const { query } = await inquirer.prompt([{
        type: 'input',
        name: 'query',
        message: theme.white('What should I forget?'),
    }]);
    if (!query) return;

    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: theme.error(`Forget all memories matching "${query}"? This cannot be undone.`),
        default: false,
    }]);
    if (!confirm) {
        console.log(theme.dim('\n  Nothing forgotten.\n'));
        return;
    }

    const spinner = ora(theme.muted('Forgetting...')).start();
    const forgotten = await a.forget(query);
    if (forgotten > 0) {
        spinner.succeed(theme.success(`Forgotten ${forgotten} memor${forgotten === 1 ? 'y' : 'ies'}.`));
    } else {
        spinner.info(theme.dim('No matching memories found.'));
    }
    console.log('');
}

async function doConsolidate(a: Allo, cfg: ProviderConfig): Promise<void> {
    const { nodeCount } = a.getStats();
    console.log(theme.accent(`\n  Consolidating ${nodeCount} memories...\n`));

    // Build summarizer from configured LLM (if available)
    let summarizer: import('@terronex/engram-trace-lite').Summarizer | undefined;
    if (cfg.llm) {
        const { createLLM: makeLLM } = await import('./providers.js');
        const llm = makeLLM(cfg);
        if (llm) {
            summarizer = {
                summarize: async (texts: string[]) => {
                    const response = await llm.chat({
                        model: cfg.llm!.model,
                        system: 'You are a memory consolidation system. Combine the following related memories into a single concise summary. Preserve all key facts and decisions. Remove redundancy. Output only the summary.',
                        messages: [{ role: 'user', content: texts.join('\n---\n') }],
                    });
                    return response.content;
                },
            };
        }
    }

    const spinner = ora(theme.muted('Running consolidation pipeline...')).start();
    const report = await a.consolidate(undefined, summarizer);
    spinner.succeed(theme.success('Consolidation complete!'));

    console.log('');
    console.log(`  ${theme.white('Decayed:')}       ${report.decayed} memories aged to next tier`);
    console.log(`  ${theme.white('Deduplicated:')}  ${report.deduplicated} duplicates removed`);
    if (report.clustersFound > 0) {
        console.log(`  ${theme.white('Clusters:')}      ${report.clustersFound} found, ${report.summarized} memories merged`);
    }
    console.log(`  ${theme.white('Archived:')}      ${report.archived} old memories truncated`);
    console.log(`  ${theme.white('Result:')}        ${report.before.total} → ${report.after.total} memories`);
    console.log(`  ${theme.white('Duration:')}      ${report.durationMs}ms`);
    console.log('');
}

async function doStats(a: Allo): Promise<void> {
    const { nodeCount, fileSizeMB } = await a.save();
    const all = a.getAll();

    const tiers = { hot: 0, warm: 0, cold: 0, archive: 0 };
    for (const mem of all) {
        if (mem.tier in tiers) tiers[mem.tier as keyof typeof tiers]++;
    }

    console.log('');
    console.log(theme.primaryBold('  Brain Health Report'));
    console.log(separator(30));
    console.log(`  ${theme.white('File:')}      ${theme.dim(a.config.memoryFile)}`);
    console.log(`  ${theme.white('Memories:')}  ${theme.primaryBold(String(nodeCount))}`);
    console.log(`  ${theme.white('Size:')}      ${theme.dim(fileSizeMB + ' MB')}`);
    console.log(`  ${theme.white('Model:')}     ${theme.dim(a.config.embeddingModel)}`);
    if (a.config.persona) {
        console.log(`  ${theme.white('Persona:')}   ${theme.accent(a.config.persona)}`);
    }
    if (a.config.readOnly) {
        console.log(`  ${theme.white('Mode:')}      ${theme.dim('Read-only')}`);
    }
    if (config?.llm) {
        console.log(`  ${theme.white('LLM:')}       ${theme.dim(config.llm.provider + '/' + config.llm.model)}`);
    }
    console.log('');
    if (nodeCount > 0) {
        const bar = (count: number, total: number) => {
            const pct = total > 0 ? count / total : 0;
            const filled = Math.round(pct * 20);
            return '█'.repeat(filled) + '░'.repeat(20 - filled);
        };
        const total = tiers.hot + tiers.warm + tiers.cold + tiers.archive;
        console.log(`  ${tierLabel.hot}     ${bar(tiers.hot, total)} ${tiers.hot}`);
        console.log(`  ${tierLabel.warm}    ${bar(tiers.warm, total)} ${tiers.warm}`);
        console.log(`  ${tierLabel.cold}    ${bar(tiers.cold, total)} ${tiers.cold}`);
        console.log(`  ${tierLabel.archive} ${bar(tiers.archive, total)} ${tiers.archive}`);
    }
    console.log('');
}

async function doSettings(): Promise<void> {
    const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: theme.white('Settings:'),
        choices: [
            { name: 'Re-run setup wizard', value: 'setup' },
            { name: 'View current config', value: 'view' },
            { name: theme.dim('Back'), value: 'back' },
        ],
    }]);

    if (action === 'setup') {
        config = await runOnboarding();
    } else if (action === 'view') {
        const cfg = await loadConfig();
        console.log('');
        console.log(theme.dim(JSON.stringify(cfg, (k, v) => {
            if (k === 'anthropic' || k === 'openai' || k === 'google') {
                return typeof v === 'string' ? v.slice(0, 8) + '...' : v;
            }
            return v;
        }, 2)));
        console.log('');
    }
}

// ============== CLI Commands ==============

const program = new Command();

program
    .name('allo')
    .description(theme.primary('Allo 🦖') + ' — Your Neural Memory Assistant')
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
        const spinner = ora(theme.muted('Committing to memory...')).start();
        const tags = options.tags.split(',').filter(Boolean);
        const id = await a.addText(text, options.parent, tags);
        const { nodeCount, fileSizeMB } = await a.save();
        spinner.succeed(theme.success(`Remembered!`) + theme.dim(` ID: ${id}`));
        console.log(theme.dim(`  Brain: ${nodeCount} memories (${fileSizeMB} MB)`));
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
            const answers = await inquirer.prompt([{
                type: 'input',
                name: 'caption',
                message: theme.white(`Describe "${path.basename(filePath)}":`),
            }]);
            caption = answers.caption;
        }
        if (!caption) {
            console.log(theme.error('Caption required.'));
            return;
        }
        const spinner = ora(theme.muted(`Ingesting "${path.basename(filePath)}"...`)).start();
        const tags = options.tags.split(',').filter(Boolean);
        const id = await a.addFile(filePath, caption, options.parent, tags);
        const { nodeCount, fileSizeMB } = await a.save();
        spinner.succeed(theme.success(`File stored!`) + theme.dim(` ID: ${id}`));
        console.log(theme.dim(`  Brain: ${nodeCount} memories (${fileSizeMB} MB)`));
    });

program
    .command('recall <query>')
    .description('Search your memories')
    .option('-l, --limit <number>', 'Max results', '8')
    .option('-f, --file <path>', 'Memory file path')
    .option('-b, --brief', 'One-line summaries only (no interactive selection)')
    .action(async (query, options) => {
        const a = await getAllo(options);
        const spinner = ora(theme.muted(`Searching for "${query}"...`)).start();
        const memories = await a.recall(query, parseInt(options.limit));
        spinner.stop();

        if (memories.length === 0) {
            console.log(theme.dim('Nothing comes to mind for that query.'));
            return;
        }

        // Always show compact list first
        console.log(theme.accent(`\nFound ${memories.length} memor${memories.length === 1 ? 'y' : 'ies'}:\n`));
        memories.forEach((mem, i) => {
            const tier = tierLabel[mem.tier] || mem.tier;
            const score = mem.score !== undefined ? `${(mem.score * 100).toFixed(0)}%` : '';
            const date = formatDate(mem.timestamp);
            const tags = mem.tags.length > 0 ? theme.dim(` [${mem.tags.join(', ')}]`) : '';
            const preview = truncate(mem.content, 72);
            console.log(`${theme.primaryBold(`${i + 1}.`)} [${tier}] ${theme.dim(score.padEnd(4))} ${theme.white(preview)}`);
            console.log(`   ${theme.dim(date)}${tags}`);
        });

        if (options.brief) {
            console.log('');
            return;
        }

        // Interactive selection loop
        while (true) {
            const { selection } = await inquirer.prompt([{
                type: 'input',
                name: 'selection',
                message: theme.muted(`View [1-${memories.length}], or Enter to exit:`),
            }]);

            if (!selection) break;

            const idx = parseInt(selection) - 1;
            if (idx >= 0 && idx < memories.length) {
                printMemoryDetail(idx, memories[idx]);
            } else {
                console.log(theme.dim('Invalid selection.'));
            }
        }
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
        config = await runOnboarding();
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
            const { confirm } = await inquirer.prompt([{
                type: 'confirm',
                name: 'confirm',
                message: theme.error(`Forget all memories matching "${query}"? This cannot be undone.`),
                default: false,
            }]);
            if (!confirm) {
                console.log(theme.dim('Nothing forgotten.'));
                return;
            }
        }
        const spinner = ora(theme.muted('Forgetting...')).start();
        const forgotten = await a.forget(query, parseFloat(options.threshold));
        if (forgotten > 0) {
            spinner.succeed(theme.success(`Forgotten ${forgotten} memor${forgotten === 1 ? 'y' : 'ies'}.`));
        } else {
            spinner.info(theme.dim('No matching memories found.'));
        }
    });

program
    .command('demo')
    .description('Guided demo of Allo capabilities')
    .action(async () => {
        console.log(banner(VERSION));
        console.log(theme.primaryBold('  Demo Mode\n'));

        const demoFile = 'allo-demo.engram';
        const a = new Allo({ memoryFile: demoFile });
        await a.initialize();

        console.log(theme.white('  1. Adding memories...'));
        const rootId = await a.addText('Allo is a neural memory assistant built on Engram.', undefined, ['core']);
        await a.addText('Engram uses HNSW indexing for fast semantic search.', rootId, ['tech']);
        await a.addText('Memories decay over time: hot, warm, cold, archive.', rootId, ['tech']);
        console.log(theme.success('     Added 3 memories.\n'));

        console.log(theme.white('  2. Recalling memories about "search"...'));
        const results = await a.recall('semantic search performance', 3);
        results.forEach((mem, i) => {
            console.log(theme.dim(`     ${i + 1}. ${mem.content}`));
        });

        console.log(theme.white('\n  3. Saving brain...'));
        const { nodeCount, fileSizeMB } = await a.save();
        console.log(theme.success(`     Saved ${nodeCount} memories (${fileSizeMB} MB)\n`));

        try { await fs.unlink(demoFile); } catch {}
        try { await fs.rm('allo_files', { recursive: true, force: true }); } catch {}

        console.log(theme.primaryBold('  Demo complete! 🦖\n'));
    });

// Default: interactive menu when no command given
if (process.argv.length <= 2) {
    interactiveMenu().catch(e => {
        console.error(theme.error(e.message));
        process.exit(1);
    });
} else {
    program.parse();
}
