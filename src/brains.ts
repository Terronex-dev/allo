/**
 * Brain Library — Discover and manage .engram brain files
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface BrainInfo {
    name: string;
    path: string;
    sizeMB: number;
    persona?: string;
    isReadOnly: boolean;
}

const BRAINS_DIR = path.join(os.homedir(), '.allo', 'brains');

/** Ensure ~/.allo/brains/ exists */
export function ensureBrainsDir(): string {
    if (!fs.existsSync(BRAINS_DIR)) {
        fs.mkdirSync(BRAINS_DIR, { recursive: true });
    }
    return BRAINS_DIR;
}

/** Scan for .engram files in known locations */
export function discoverBrains(configMemoryFile?: string): BrainInfo[] {
    const found = new Map<string, BrainInfo>();
    
    const searchDirs = [
        os.homedir(),
        BRAINS_DIR,
    ];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (!file.endsWith('.engram')) continue;
                const fullPath = path.join(dir, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (!stat.isFile()) continue;

                    // Try to peek at metadata for persona
                    let persona: string | undefined;
                    try {
                        // Read first few KB to check for persona in metadata
                        // The engram format starts with 'ENGRAM' magic bytes
                        // We'll do a quick parse attempt
                        const { readEngramFile } = require('@terronex/engram');
                        const engramData = readEngramFile(fullPath, {});
                        // This is async, but we need sync for discovery...
                        // We'll detect persona later during load
                    } catch { /* ignore parse errors */ }

                    const name = file.replace('.engram', '');
                    const displayName = name.split('-').map(
                        w => w.charAt(0).toUpperCase() + w.slice(1)
                    ).join(' ');

                    found.set(fullPath, {
                        name: displayName,
                        path: fullPath,
                        sizeMB: parseFloat((stat.size / 1048576).toFixed(2)),
                        persona,
                        isReadOnly: false,
                    });
                } catch { /* skip unreadable files */ }
            }
        } catch { /* skip unreadable dirs */ }
    }

    // Add configured memory file if not already found
    if (configMemoryFile) {
        const resolved = path.resolve(configMemoryFile);
        if (fs.existsSync(resolved) && !found.has(resolved)) {
            const stat = fs.statSync(resolved);
            const name = path.basename(resolved, '.engram');
            found.set(resolved, {
                name: name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                path: resolved,
                sizeMB: parseFloat((stat.size / 1048576).toFixed(2)),
                isReadOnly: false,
            });
        }
    }

    return Array.from(found.values());
}

/** Get the brains directory path */
export function getBrainsDir(): string {
    return BRAINS_DIR;
}
