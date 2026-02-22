import { Allo, AlloMemory } from '../src/allo';
import fs from 'node:fs/promises';
import path from 'node:path';

const TEST_FILE = 'test-memory.engram';
const TEST_FILES_DIR = 'test_allo_files';

async function cleanup() {
    try { await fs.unlink(TEST_FILE); } catch {}
    try { await fs.rm(TEST_FILES_DIR, { recursive: true, force: true }); } catch {}
    try { await fs.rm('allo_files', { recursive: true, force: true }); } catch {}
}

async function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`  FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`  PASS: ${msg}`);
    }
}

async function testAddTextAndRecall() {
    console.log('\n--- Test: addText + recall ---');
    await cleanup();

    const allo = new Allo({ memoryFile: TEST_FILE });
    await allo.initialize();

    const id = await allo.addText('The Ebbinghaus forgetting curve describes memory decay over time.');
    assert(typeof id === 'string' && id.length > 0, 'addText returns a non-empty ID');

    const id2 = await allo.addText('HNSW indexing enables fast approximate nearest neighbor search.');
    assert(id !== id2, 'Each memory gets a unique ID');

    const results = await allo.recall('memory decay');
    assert(results.length > 0, 'recall returns results for a relevant query');
    assert(results[0].type === 'text', 'Result type is text');
    assert(results[0].content.includes('Ebbinghaus') || results[0].content.includes('HNSW'),
        'Result content is one of the added memories');

    await cleanup();
}

async function testSaveAndLoad() {
    console.log('\n--- Test: save + load round-trip ---');
    await cleanup();

    const allo1 = new Allo({ memoryFile: TEST_FILE });
    await allo1.initialize();

    await allo1.addText('Persistent memory survives restarts.', undefined, ['test', 'persistence']);
    await allo1.addText('Second memory for validation.');
    const { nodeCount, fileSizeMB } = await allo1.save();

    assert(nodeCount === 2, `Saved 2 nodes (got ${nodeCount})`);
    // File exists and has content (may round to 0.00 MB for tiny files)
    const fileStats = await fs.stat(TEST_FILE);
    assert(fileStats.size > 0, `File has content (${fileStats.size} bytes)`);

    // Load into a fresh instance
    const allo2 = new Allo({ memoryFile: TEST_FILE });
    await allo2.initialize();

    const results = await allo2.recall('persistent memory', 5);
    assert(results.length > 0, 'Loaded instance can recall saved memories');

    await cleanup();
}

async function testParentChild() {
    console.log('\n--- Test: parent-child hierarchy ---');
    await cleanup();

    const allo = new Allo({ memoryFile: TEST_FILE });
    await allo.initialize();

    const parentId = await allo.addText('Parent topic: Neural memory formats');
    const childId = await allo.addText('Child topic: Engram uses HNSW indexing', parentId);

    assert(parentId !== childId, 'Parent and child have different IDs');

    const { nodeCount } = await allo.save();
    assert(nodeCount === 2, `Tree has 2 nodes (got ${nodeCount})`);

    await cleanup();
}

async function testAddFile() {
    console.log('\n--- Test: addFile ---');
    await cleanup();

    // Create a test file
    const testFilePath = path.join(TEST_FILES_DIR, 'test.txt');
    await fs.mkdir(TEST_FILES_DIR, { recursive: true });
    await fs.writeFile(testFilePath, 'This is a test document for Allo.');

    const allo = new Allo({ memoryFile: TEST_FILE });
    await allo.initialize();

    const id = await allo.addFile(testFilePath, 'A test document', undefined, ['test', 'file']);
    assert(typeof id === 'string' && id.length > 0, 'addFile returns a non-empty ID');

    const results = await allo.recall('test document');
    assert(results.length > 0, 'Can recall file memories');
    assert(results[0].type === 'text', 'Text file stored as text content type');

    await cleanup();
}

async function testTags() {
    console.log('\n--- Test: tags ---');
    await cleanup();

    const allo = new Allo({ memoryFile: TEST_FILE });
    await allo.initialize();

    await allo.addText('Tagged memory', undefined, ['important', 'test']);
    const results = await allo.recall('tagged memory');

    assert(results.length > 0, 'Can recall tagged memory');
    assert(results[0].tags.includes('important'), 'Tags are preserved');
    assert(results[0].tags.includes('test'), 'Multiple tags preserved');

    await cleanup();
}

async function testEmptyRecall() {
    console.log('\n--- Test: empty recall ---');
    await cleanup();

    const allo = new Allo({ memoryFile: TEST_FILE });
    await allo.initialize();

    const results = await allo.recall('anything at all');
    assert(results.length === 0, 'Empty brain returns no results');

    await cleanup();
}

async function testAlloMemoryShape() {
    console.log('\n--- Test: AlloMemory shape ---');
    await cleanup();

    const allo = new Allo({ memoryFile: TEST_FILE });
    await allo.initialize();

    await allo.addText('Shape validation memory');
    const results = await allo.recall('shape validation');

    if (results.length > 0) {
        const mem = results[0];
        assert(typeof mem.id === 'string', 'id is string');
        assert(typeof mem.type === 'string', 'type is string');
        assert(typeof mem.content === 'string', 'content is string');
        assert(typeof mem.timestamp === 'number', 'timestamp is number');
        assert(Array.isArray(mem.tags), 'tags is array');
        assert(['hot', 'warm', 'cold', 'archive'].includes(mem.tier), 'tier is valid');
    } else {
        assert(false, 'Expected at least one result');
    }

    await cleanup();
}

async function main() {
    console.log('=== Allo Test Suite ===');

    await testAddTextAndRecall();
    await testSaveAndLoad();
    await testParentChild();
    await testAddFile();
    await testTags();
    await testEmptyRecall();
    await testAlloMemoryShape();

    console.log('\n=== Tests complete ===');
}

main().catch(err => {
    console.error('Test suite crashed:', err);
    process.exitCode = 1;
});
