#!/usr/bin/env node
/**
 * Build tesla.engram — Nikola Tesla's complete published works.
 * Chunks text semantically, embeds, and saves to a single .engram file.
 */
const { Allo } = require('../dist/allo');
const fs = require('fs');
const path = require('path');

const CORPUS_DIR = path.join(__dirname, '..', 'tesla-corpus');
const OUTPUT_FILE = path.join(require('os').homedir(), 'tesla.engram');
const CHUNK_SIZE = 400; // words
const OVERLAP = 50;

const SOURCES = [
    // Primary sources — Tesla's own words
    ["my-inventions-full.txt", "My Inventions (1919 Autobiography)", "autobiography,personal,first-person"],
    ["increasing-human-energy.txt", "The Problem of Increasing Human Energy (1900)", "essay,energy,philosophy,first-person"],
    ["on-light-1893.txt", "On Light and High Frequency Phenomena (1893)", "lecture,physics,light,first-person"],
    ["The_True_Wireless.wiki.txt", "The True Wireless (1919)", "essay,wireless,radio,first-person"],
    // Comprehensive biography
    ["Nikola_Tesla.grok.txt", "Tesla Biography", "biography,life,career"],
    // Technical inventions
    ["Tesla_coil.grok.txt", "Tesla Coil", "tesla-coil,invention,high-voltage"],
    ["Alternating_current.grok.txt", "Alternating Current", "ac,electricity,power"],
    ["Polyphase_system.grok.txt", "Polyphase System", "polyphase,ac,motors"],
    ["Rotating_magnetic_field.grok.txt", "Rotating Magnetic Field", "magnetic-field,motors"],
    ["Induction_motor.grok.txt", "Induction Motor", "induction-motor,ac"],
    ["Tesla_turbine.grok.txt", "Tesla Turbine", "turbine,mechanical"],
    ["Teslas_oscillator.grok.txt", "Tesla's Oscillator", "oscillator,resonance"],
    // Wireless & energy transmission
    ["Wardenclyffe_Tower.grok.txt", "Wardenclyffe Tower", "wardenclyffe,wireless,energy"],
    ["World_Wireless_System.grok.txt", "World Wireless System", "wireless,global,communication"],
    ["Wireless_power_transfer.grok.txt", "Wireless Power Transfer", "wireless,energy,transmission"],
    ["Tesla_Experimental_Station.grok.txt", "Colorado Springs Laboratory", "colorado-springs,experiments,lab"],
    // Weapons & defense
    ["Teleforce.grok.txt", "Teleforce (Death Ray)", "teleforce,weapon,defense"],
    ["Death_ray.grok.txt", "Death Ray History", "death-ray,weapon,military"],
    // Legacy & history
    ["History_of_radio.grok.txt", "History of Radio", "radio,wireless,marconi"],
    ["Tesla_Science_Center_at_Wardenclyffe.grok.txt", "Tesla Science Center", "museum,legacy,wardenclyffe"],
    ["Nikola_Tesla_Museum.grok.txt", "Nikola Tesla Museum", "museum,legacy,belgrade"],
    ["Nikola_Tesla_in_popular_culture.grok.txt", "Tesla in Popular Culture", "culture,legacy,media"],
    // Patents
    ["List_of_Nikola_Tesla_patents.grok.txt", "Tesla Patents", "patents,inventions,legal"],
];

function cleanText(text) {
    text = text.replace(/\[\d+\]/g, '');
    text = text.replace(/!\[.*?\]\[.*?\]/g, '');
    text = text.replace(/\.mw-parser-output[^{]*\{[^}]+\}/g, '');
    text = text.replace(/(Main menu|Jump to content|Search|Appearance|Donate|Create account|Log in|Personal tools)[\s\n]*/g, '');
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/ {2,}/g, ' ');
    return text.trim();
}

function chunkText(text, sourceLabel) {
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 50);
    const chunks = [];
    let currentWords = [];

    for (const para of paragraphs) {
        currentWords.push(...para.split(/\s+/));

        while (currentWords.length >= CHUNK_SIZE) {
            const chunk = currentWords.slice(0, CHUNK_SIZE).join(' ');
            chunks.push(`[${sourceLabel}] ${chunk}`);
            currentWords = currentWords.slice(CHUNK_SIZE - OVERLAP);
        }
    }

    if (currentWords.length > 30) {
        chunks.push(`[${sourceLabel}] ${currentWords.join(' ')}`);
    }

    return chunks;
}

async function main() {
    console.log('='.repeat(60));
    console.log('  Building tesla.engram — The Mind of Nikola Tesla');
    console.log('='.repeat(60));
    console.log();

    // Collect all chunks
    const allChunks = [];
    for (const [filename, label, tags] of SOURCES) {
        const fpath = path.join(CORPUS_DIR, filename);
        if (!fs.existsSync(fpath)) {
            console.log(`  SKIP: ${filename} (not found)`);
            continue;
        }
        const text = cleanText(fs.readFileSync(fpath, 'utf-8'));
        if (text.length < 1000) {
            console.log(`  SKIP: ${filename} (too small)`);
            continue;
        }
        const chunks = chunkText(text, label);
        allChunks.push(...chunks.map(c => ({ text: c, tags: tags.split(',') })));
        console.log(`  ${filename}: ${text.length.toLocaleString()} chars -> ${chunks.length} chunks`);
    }

    console.log(`\n  Total: ${allChunks.length} chunks to ingest`);

    // Remove old file
    if (fs.existsSync(OUTPUT_FILE)) {
        fs.unlinkSync(OUTPUT_FILE);
        console.log(`  Removed old ${OUTPUT_FILE}`);
    }

    // Initialize Allo once (keeps embedding model warm)
    console.log('\n  Initializing Allo...');
    const allo = new Allo({ memoryFile: OUTPUT_FILE });
    await allo.initialize();
    console.log('  Allo ready!\n');

    // Ingest all chunks
    let success = 0;
    let errors = 0;
    const startTime = Date.now();

    for (let i = 0; i < allChunks.length; i++) {
        const { text, tags } = allChunks[i];

        if (i % 25 === 0) {
            const pct = ((i / allChunks.length) * 100).toFixed(0);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`  [${i}/${allChunks.length}] (${pct}%) — ${success} ok, ${errors} err — ${elapsed}s`);
        }

        try {
            await allo.addText(text, undefined, tags);
            success++;
        } catch (e) {
            errors++;
            if (errors <= 3) console.log(`    ERROR at ${i}: ${e.message}`);
        }
    }

    // Save
    console.log('\n  Saving tesla.engram...');
    const { nodeCount, fileSizeMB } = await allo.save();

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Done! ${success}/${allChunks.length} chunks ingested in ${totalTime}s`);
    console.log(`  File: ${OUTPUT_FILE}`);
    console.log(`  Size: ${fileSizeMB} MB | Memories: ${nodeCount}`);
    console.log(`${'='.repeat(60)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
