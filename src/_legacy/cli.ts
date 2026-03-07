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
import { loadConfig, saveConfig, configExists, createLLM, ProviderConfig } from './providers.js';
import { runOnboarding } from './onboarding.js';
import { discoverBrains, ensureBrainsDir, BrainInfo } from './brains.js';
import { generateMap } from './map.js';

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
                await doBrowse(a);
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

    // Compact list view — print once
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

    // Interactive selection loop
    while (true) {
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

async function doBrowse(a: Allo): Promise<void> {
    const all = a.getAll();
    if (all.length === 0) {
        console.log(theme.dim('\n  No memories yet.\n'));
        return;
    }

    while (true) {
        const { mode } = await inquirer.prompt([{
            type: 'list',
            name: 'mode',
            message: theme.primaryBold('Browse by:'),
            choices: [
                { name: theme.accent('  By tag'), value: 'tags' },
                { name: theme.accent('  By date'), value: 'date' },
                { name: theme.accent('  By tier'), value: 'tier' },
                { name: theme.accent('  Recent memories'), value: 'recent' },
                { name: theme.accent('  Tree view') + theme.dim(' (parent/child)'), value: 'tree' },
                { name: theme.dim('  Back'), value: 'back' },
            ],
        }]);

        if (mode === 'back') break;

        if (mode === 'tags') {
            await browseByTag(a, all);
        } else if (mode === 'date') {
            await browseByDate(a, all);
        } else if (mode === 'tier') {
            await browseByTier(a, all);
        } else if (mode === 'recent') {
            await browseRecent(a, all);
        } else if (mode === 'tree') {
            const hasChildren = all.some(m => m.parentId);
            if (!hasChildren) {
                console.log(theme.dim('\n  All memories are flat (no parent-child links).'));
                console.log(theme.dim('  Use --parent <id> when remembering to build hierarchy.\n'));
            } else {
                await browseTree(a, all);
            }
        }
    }
}

async function browseByTag(a: Allo, all: AlloMemory[]): Promise<void> {
    const tagCounts = new Map<string, number>();
    all.forEach(m => m.tags.forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)));
    const untagged = all.filter(m => m.tags.length === 0).length;

    const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0 && untagged === 0) {
        console.log(theme.dim('\n  No tags found.\n'));
        return;
    }

    const choices = sorted.map(([tag, count]) => ({
        name: `${theme.accent(tag)} ${theme.dim(`(${count})`)}`,
        value: tag,
    }));
    if (untagged > 0) {
        choices.push({ name: `${theme.dim('(untagged)')} ${theme.dim(`(${untagged})`)}`, value: '__untagged__' });
    }
    choices.push({ name: theme.dim('Back'), value: '__back__' });

    const { tag } = await inquirer.prompt([{
        type: 'list',
        name: 'tag',
        message: theme.white(`Tags (${sorted.length} found):`),
        choices,
        pageSize: 15,
    }]);

    if (tag === '__back__') return;

    const filtered = tag === '__untagged__'
        ? all.filter(m => m.tags.length === 0)
        : all.filter(m => m.tags.includes(tag));

    // Sort by date descending
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    await showMemoryList(filtered, `Tag: ${tag}`);
}

async function browseByDate(a: Allo, all: AlloMemory[]): Promise<void> {
    // Group by YYYY-MM-DD
    const groups = new Map<string, AlloMemory[]>();
    all.forEach(m => {
        const d = new Date(m.timestamp).toISOString().slice(0, 10);
        if (!groups.has(d)) groups.set(d, []);
        groups.get(d)!.push(m);
    });

    const dates = [...groups.keys()].sort().reverse();
    const choices = dates.slice(0, 30).map(d => ({
        name: `${theme.white(d)} ${theme.dim(`(${groups.get(d)!.length} memories)`)}`,
        value: d,
    }));
    choices.push({ name: theme.dim('Back'), value: '__back__' });

    const { date } = await inquirer.prompt([{
        type: 'list',
        name: 'date',
        message: theme.white(`Dates (${dates.length} days, showing latest 30):`),
        choices,
        pageSize: 15,
    }]);

    if (date === '__back__') return;

    const filtered = groups.get(date) || [];
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    await showMemoryList(filtered, date);
}

async function browseByTier(a: Allo, all: AlloMemory[]): Promise<void> {
    const tiers = ['hot', 'warm', 'cold', 'archive'] as const;
    const counts = { hot: 0, warm: 0, cold: 0, archive: 0 };
    all.forEach(m => { if (m.tier in counts) counts[m.tier as keyof typeof counts]++; });

    const choices = tiers
        .filter(t => counts[t] > 0)
        .map(t => ({
            name: `${tierLabel[t]} ${theme.dim(`(${counts[t]})`)}`,
            value: t,
        }));
    choices.push({ name: theme.dim('Back'), value: '__back__' as any });

    const { tier } = await inquirer.prompt([{
        type: 'list',
        name: 'tier',
        message: theme.white('Select tier:'),
        choices,
    }]);

    if (tier === '__back__') return;

    const filtered = all.filter(m => m.tier === tier);
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    await showMemoryList(filtered, `Tier: ${tier}`);
}

async function browseRecent(a: Allo, all: AlloMemory[]): Promise<void> {
    const sorted = [...all].sort((a, b) => b.timestamp - a.timestamp).slice(0, 25);
    await showMemoryList(sorted, 'Recent (latest 25)');
}

async function browseTree(a: Allo, all: AlloMemory[]): Promise<void> {
    const roots = all.filter(m => !m.parentId);
    const childMap = new Map<string, AlloMemory[]>();
    all.forEach(m => {
        if (m.parentId) {
            if (!childMap.has(m.parentId)) childMap.set(m.parentId, []);
            childMap.get(m.parentId)!.push(m);
        }
    });

    // Show roots that have children first
    const rootsWithKids = roots.filter(r => childMap.has(r.id));
    const display = rootsWithKids.length > 0 ? rootsWithKids : roots.slice(0, 25);

    console.log(theme.accent(`\n  Memory tree (${roots.length} roots, showing ${display.length}):\n`));
    display.forEach((root, i) => {
        const preview = truncate(root.content, 60);
        console.log(`  ${theme.primaryBold(`${i + 1}.`)} ${theme.white(preview)}`);
        const kids = childMap.get(root.id) || [];
        kids.slice(0, 5).forEach(child => {
            const cp = truncate(child.content, 55);
            console.log(`     ${theme.dim('└─')} ${theme.dim(cp)}`);
        });
        if (kids.length > 5) {
            console.log(`     ${theme.dim(`   ... and ${kids.length - 5} more children`)}`);
        }
    });
    console.log('');
}

async function showMemoryList(memories: AlloMemory[], label: string): Promise<void> {
    if (memories.length === 0) {
        console.log(theme.dim('\n  No memories in this group.\n'));
        return;
    }

    const pageSize = 15;
    let page = 0;
    const totalPages = Math.ceil(memories.length / pageSize);

    while (true) {
        const start = page * pageSize;
        const slice = memories.slice(start, start + pageSize);

        console.log(theme.accent(`\n  ${label}`) + theme.dim(` — ${memories.length} memories (page ${page + 1}/${totalPages})\n`));
        slice.forEach((mem, i) => {
            const tier = tierLabel[mem.tier] || mem.tier;
            const score = mem.score !== undefined ? `${(mem.score * 100).toFixed(0)}%` : '';
            const date = formatDate(mem.timestamp);
            const tags = mem.tags.length > 0 ? theme.dim(` [${mem.tags.join(', ')}]`) : '';
            const preview = truncate(mem.content, 72);
            const num = start + i + 1;
            console.log(`  ${theme.primaryBold(`${num}.`)} [${tier}] ${score ? theme.dim(score.padEnd(4)) + ' ' : ''}${theme.white(preview)}`);
            console.log(`     ${theme.dim(date)}${tags}`);
        });

        // Build prompt options
        const opts: string[] = [`1-${start + slice.length}`];
        if (page > 0) opts.push('[p]rev');
        if (page < totalPages - 1) opts.push('[n]ext');
        opts.push('Enter=back');

        const { selection } = await inquirer.prompt([{
            type: 'input',
            name: 'selection',
            message: theme.muted(`View ${opts.join(', ')}:`),
        }]);

        if (!selection) break;
        if (selection.toLowerCase() === 'n' && page < totalPages - 1) { page++; continue; }
        if (selection.toLowerCase() === 'p' && page > 0) { page--; continue; }

        const idx = parseInt(selection) - 1;
        if (idx >= 0 && idx < memories.length) {
            printMemoryDetail(idx, memories[idx]);
        }
    }
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
    let summarizer: import('@terronex/engram-trace').Summarizer | undefined;
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
    while (true) {
        const llmLabel = config.llm
            ? `${config.llm.provider}/${config.llm.model}`
            : 'None configured';
        const embLabel = `${config.embeddings.provider}/${config.embeddings.model}`;

        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: theme.white('Settings:'),
            choices: [
                { name: theme.primary(`  Switch LLM`) + theme.dim(` (current: ${llmLabel})`), value: 'llm' },
                { name: theme.primary(`  Switch embeddings`) + theme.dim(` (current: ${embLabel})`), value: 'embeddings' },
                { name: theme.muted('  Re-run setup wizard'), value: 'setup' },
                { name: theme.muted('  View current config'), value: 'view' },
                { name: theme.dim('  Back'), value: 'back' },
            ],
        }]);

        if (action === 'back') break;

        if (action === 'llm') {
            await doSwitchLLM();
        } else if (action === 'embeddings') {
            await doSwitchEmbeddings();
        } else if (action === 'setup') {
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
}

async function doSwitchLLM(): Promise<void> {
    // Detect available Ollama models
    let ollamaModels: string[] = [];
    try {
        const ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
        const res = await fetch(`${ollamaUrl}/api/tags`);
        if (res.ok) {
            const data = await res.json() as any;
            ollamaModels = (data.models || [])
                .map((m: any) => m.name)
                .filter((n: string) => !n.includes('embed'));
        }
    } catch {}

    const choices: any[] = [];

    // Ollama models (auto-detected)
    if (ollamaModels.length > 0) {
        for (const model of ollamaModels) {
            const active = config.llm?.provider === 'ollama' && config.llm?.model === model;
            choices.push({
                name: theme.white(`  Ollama: ${model}`) + (active ? theme.success(' (active)') : ''),
                value: { provider: 'ollama', model },
            });
        }
    } else {
        choices.push({
            name: theme.dim('  Ollama: not running'),
            value: null,
            disabled: true,
        });
    }

    // Anthropic models
    const anthropicModels = [
        { id: 'claude-opus-4-6-20250205', label: 'Opus 4.6 (most intelligent)' },
        { id: 'claude-sonnet-4-6-20250217', label: 'Sonnet 4.6 (fast + capable)' },
        { id: 'claude-haiku-4-5-20251015', label: 'Haiku 4.5 (fastest, cheapest)' },
        { id: 'claude-opus-4-5-20251124', label: 'Opus 4.5 (deep reasoning)' },
        { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4 (balanced)' },
    ];
    const hasAnthropic = !!config.keys?.anthropic;
    for (const m of anthropicModels) {
        const active = config.llm?.provider === 'anthropic' && config.llm?.model === m.id;
        choices.push({
            name: (hasAnthropic ? theme.white : theme.dim)(`  Anthropic: ${m.label}`) + (active ? theme.success(' (active)') : ''),
            value: hasAnthropic ? { provider: 'anthropic', model: m.id } : null,
            disabled: hasAnthropic ? false : 'no API key',
        });
    }

    // OpenAI models
    const openaiModels = [
        { id: 'gpt-4o', label: 'GPT-4o (flagship)' },
        { id: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, cheap)' },
        { id: 'o3', label: 'o3 (reasoning)' },
    ];
    const hasOpenAI = !!config.keys?.openai;
    for (const m of openaiModels) {
        const active = config.llm?.provider === 'openai' && config.llm?.model === m.id;
        choices.push({
            name: (hasOpenAI ? theme.white : theme.dim)(`  OpenAI: ${m.label}`) + (active ? theme.success(' (active)') : ''),
            value: hasOpenAI ? { provider: 'openai', model: m.id } : null,
            disabled: hasOpenAI ? false : 'no API key',
        });
    }

    // Google models
    const googleModels = [
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (fast)' },
    ];
    const hasGoogle = !!config.keys?.google;
    for (const m of googleModels) {
        const active = config.llm?.provider === 'google' && config.llm?.model === m.id;
        choices.push({
            name: (hasGoogle ? theme.white : theme.dim)(`  Google: ${m.label}`) + (active ? theme.success(' (active)') : ''),
            value: hasGoogle ? { provider: 'google', model: m.id } : null,
            disabled: hasGoogle ? false : 'no API key',
        });
    }

    // Add API key option
    choices.push(
        { name: theme.accent('  + Add API key'), value: 'add-key' },
        { name: theme.dim('  Cancel'), value: 'cancel' },
    );

    const { selected } = await inquirer.prompt([{
        type: 'list',
        name: 'selected',
        message: theme.primaryBold('Switch LLM:'),
        choices,
        pageSize: 20,
    }]);

    if (selected === 'cancel' || selected === null) return;

    if (selected === 'add-key') {
        const { provider } = await inquirer.prompt([{
            type: 'list',
            name: 'provider',
            message: theme.white('Provider:'),
            choices: [
                { name: 'Anthropic', value: 'anthropic' },
                { name: 'OpenAI', value: 'openai' },
                { name: 'Google', value: 'google' },
            ],
        }]);
        const { key } = await inquirer.prompt([{
            type: 'password',
            name: 'key',
            message: theme.white(`API key for ${provider}:`),
            mask: '*',
        }]);
        if (key) {
            config.keys[provider] = key;
            await saveConfig(config);
            console.log(theme.success(`\n  API key saved for ${provider}.\n`));
        }
        return;
    }

    config.llm = selected;
    await saveConfig(config);
    console.log(theme.success(`\n  LLM switched to ${selected.provider}/${selected.model}\n`));
}

async function doSwitchEmbeddings(): Promise<void> {
    const choices: any[] = [
        {
            name: theme.white('  Local: Xenova/all-MiniLM-L6-v2 (384 dims, no API needed)'),
            value: { provider: 'local', model: 'Xenova/all-MiniLM-L6-v2' },
        },
    ];

    // Check for Ollama embedding models
    try {
        const ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
        const res = await fetch(`${ollamaUrl}/api/tags`);
        if (res.ok) {
            const data = await res.json() as any;
            const embedModels = (data.models || [])
                .map((m: any) => m.name)
                .filter((n: string) => n.includes('embed') || n.includes('nomic'));
            for (const model of embedModels) {
                choices.push({
                    name: theme.white(`  Ollama: ${model}`),
                    value: { provider: 'ollama', model },
                });
            }
        }
    } catch {}

    choices.push({ name: theme.dim('  Cancel'), value: 'cancel' });

    const { selected } = await inquirer.prompt([{
        type: 'list',
        name: 'selected',
        message: theme.primaryBold('Switch embeddings:'),
        choices,
    }]);

    if (selected === 'cancel') return;

    const oldModel = config.embeddings.model;
    config.embeddings = selected;
    await saveConfig(config);

    if (oldModel !== selected.model) {
        console.log(theme.accent(`\n  Embeddings switched to ${selected.provider}/${selected.model}`));
        console.log(theme.accent('  WARNING: Changing embedding models means existing memories'));
        console.log(theme.accent('  will need re-embedding for accurate search results.\n'));
    } else {
        console.log(theme.success(`\n  Embeddings: ${selected.provider}/${selected.model}\n`));
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
    .option('-m, --map', 'Show results on interactive map (requires spatial data)')
    .option('--lat <number>', 'Center latitude for map', '0')
    .option('--lng <number>', 'Center longitude for map', '0')
    .option('--radius <number>', 'Search radius in km for spatial query', '1000')
    .action(async (query, options) => {
        const a = await getAllo(options);
        
        // Map mode: use spatial recall
        if (options.map) {
            const lat = parseFloat(options.lat);
            const lng = parseFloat(options.lng);
            const radius = parseFloat(options.radius);
            
            const spinner = ora(theme.muted(`Spatial search within ${radius}km...`)).start();
            
            // Use spatialRecall if center is specified, otherwise regular recall
            let results;
            if (lat !== 0 || lng !== 0) {
                results = await a.spatialRecall(
                    { x: lat, y: lng },
                    radius,
                    { metric: 'haversine', query }
                );
            } else {
                // Regular recall, then filter for spatial data
                const memories = await a.recall(query, parseInt(options.limit));
                results = memories
                    .filter(m => m.position)
                    .map(m => ({
                        node: {
                            id: m.id,
                            content: { data: m.content, type: 'text' as const },
                            position: m.position
                        },
                        distance: 0
                    }));
                    
                if (results.length === 0) {
                    spinner.stop();
                    console.log(theme.error('No spatial data found. Add positions with: allo position <id> --lat <lat> --lng <lng>'));
                    return;
                }
                
                // Calculate center from results
                const avgLat = results.reduce((sum, r) => sum + r.node.position!.x, 0) / results.length;
                const avgLng = results.reduce((sum, r) => sum + r.node.position!.y, 0) / results.length;
                options.lat = avgLat;
                options.lng = avgLng;
            }
            
            spinner.stop();
            
            if (results.length === 0) {
                console.log(theme.dim('No spatial results found.'));
                return;
            }
            
            console.log(theme.accent(`\nFound ${results.length} spatial result${results.length === 1 ? '' : 's'}`));
            
            const mapPath = await generateMap(
                results as any,
                { x: parseFloat(options.lat), y: parseFloat(options.lng) },
                { title: `Allo: "${query}"` }
            );
            
            console.log(theme.success(`Map generated: ${mapPath}`));
            return;
        }
        
        // Regular recall mode
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
    .command('browse')
    .description('Browse your memory tree by tag, date, tier, or hierarchy')
    .option('-f, --file <path>', 'Memory file path')
    .action(async (options) => {
        const a = await getAllo(options);
        await doBrowse(a);
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
