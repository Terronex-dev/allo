/**
 * Allo Developer Demo
 *
 * Shows how to use Allo programmatically as a library.
 * Run: npx ts-node examples/demo.ts
 */
import { Allo } from '../src/allo';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEMO_FILE = 'demo-brain.engram';

async function main() {
    console.log('Allo Developer Demo\n');

    // 1. Initialize
    console.log('1. Creating a new brain...');
    const brain = new Allo({ memoryFile: DEMO_FILE });
    await brain.initialize();
    console.log('   Done.\n');

    // 2. Add text memories with hierarchy
    console.log('2. Adding memories...');
    const rootId = await brain.addText(
        'Allo is a neural memory assistant built on the Engram format.',
        undefined,
        ['project', 'core'],
    );
    console.log(`   Root memory: ${rootId}`);

    const childId = await brain.addText(
        'Engram uses HNSW indexing for sub-millisecond semantic search.',
        rootId,
        ['tech', 'performance'],
    );
    console.log(`   Child memory: ${childId}`);

    await brain.addText(
        'Temporal decay tiers: hot, warm, cold, archive.',
        rootId,
        ['tech', 'memory'],
    );

    // 3. Add a file memory
    const demoFile = path.join(__dirname, '_demo_sample.txt');
    await fs.writeFile(demoFile, 'Sample document content for the Allo demo.');
    await brain.addFile(demoFile, 'A sample document about Allo', rootId, ['docs']);
    console.log('   Added 4 memories (3 text + 1 file).\n');

    // 4. Recall
    console.log('3. Recalling "fast search"...');
    const results = await brain.recall('fast search performance', 3);
    for (const mem of results) {
        const score = mem.score ? `${(mem.score * 100).toFixed(0)}%` : '';
        console.log(`   [${mem.tier.toUpperCase()}] ${mem.content} ${score}`);
    }
    console.log('');

    // 5. Get all memories
    console.log('4. All memories:');
    const all = brain.getAll();
    for (const mem of all) {
        const tags = mem.tags.length > 0 ? ` (${mem.tags.join(', ')})` : '';
        console.log(`   - ${mem.content}${tags}`);
    }
    console.log('');

    // 6. Save
    console.log('5. Saving brain...');
    const { nodeCount, fileSizeMB } = await brain.save();
    console.log(`   Saved ${nodeCount} memories (${fileSizeMB} MB)\n`);

    // 7. Load into a fresh instance to prove persistence
    console.log('6. Loading brain into a fresh instance...');
    const brain2 = new Allo({ memoryFile: DEMO_FILE });
    await brain2.initialize();
    const reloaded = brain2.getAll();
    console.log(`   Loaded ${reloaded.length} memories from disk.\n`);

    // Cleanup
    await fs.unlink(DEMO_FILE).catch(() => {});
    await fs.unlink(demoFile).catch(() => {});
    await fs.rm('allo_files', { recursive: true, force: true }).catch(() => {});

    console.log('Demo complete.');
}

main().catch(console.error);
