/**
 * Engram File I/O
 * 
 * Reading and writing .engram files with optional encryption
 */

import { encode, decode } from 'msgpackr';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { writeFile, readFile } from 'fs/promises';
import {
  EngramFile,
  EngramHeader,
  MemoryNode,
  Entity,
  MemoryLink,
  Delta,
  SecurityConfig
} from './types';

// ============== CONSTANTS ==============

const MAGIC = Buffer.from('ENGRAM');
const VERSION_MAJOR = 1;
const VERSION_MINOR = 0;
export const ENGRAM_EXTENSION = '.engram';
const HEADER_OFFSET = 12; // magic(6) + version(2) + headerLen(4)

// ============== UTILITIES ==============

/**
 * Ensures a filename has the .engram extension
 * @param filename - Input filename
 * @returns Filename with .engram extension
 */
export function ensureEngramExtension(filename: string): string {
  if (filename.toLowerCase().endsWith(ENGRAM_EXTENSION)) {
    return filename;
  }
  return filename + ENGRAM_EXTENSION;
}

// ============== WRITER ==============

export interface WriteOptions {
  encrypt?: boolean;
  password?: string;
  sign?: boolean;
  privateKey?: Buffer;
}

export async function writeEngram(
  file: EngramFile,
  options: WriteOptions = {}
): Promise<Buffer> {
  // Encode payload
  const payload = encode({
    nodes: file.nodes,
    entities: file.entities,
    links: file.links,
    deltas: file.deltas
  });
  
  let finalPayload = payload;
  let security: SecurityConfig;
  
  if (options.encrypt && options.password) {
    // Encrypt the payload
    const encrypted = await encryptPayload(payload, options.password);
    finalPayload = encrypted.ciphertext;
    
    security = {
      encrypted: true,
      algorithm: 'aes-256-gcm',
      kdf: 'argon2id',
      salt: encrypted.salt,
      nonce: encrypted.nonce,
      integrity: hashPayload(finalPayload)
    };
  } else {
    security = {
      encrypted: false,
      algorithm: 'none',
      kdf: 'none',
      integrity: hashPayload(finalPayload)
    };
  }
  
  // Build header
  const header: EngramHeader = {
    ...file.header,
    security,
    modified: Date.now()
  };
  
  const headerBytes = encode(header);
  const headerLen = headerBytes.length;
  
  // Build final buffer
  const totalLen = HEADER_OFFSET + headerLen + finalPayload.length;
  const output = Buffer.alloc(totalLen);
  
  // Write magic
  MAGIC.copy(output, 0);
  
  // Write version
  output[6] = VERSION_MAJOR;
  output[7] = VERSION_MINOR;
  
  // Write header length
  output.writeUInt32LE(headerLen, 8);
  
  // Write header
  Buffer.from(headerBytes).copy(output, HEADER_OFFSET);
  
  // Write payload
  Buffer.from(finalPayload).copy(output, HEADER_OFFSET + headerLen);
  
  return output;
}

/**
 * Convenience function to write an Engram file to disk with automatic .engram extension
 * @param filename - Output filename (extension will be added if missing)
 * @param file - Engram file data
 * @param options - Write options
 * @returns Promise resolving to the actual filename written
 */
export async function writeEngramFile(
  filename: string,
  file: EngramFile,
  options: WriteOptions = {}
): Promise<string> {
  const finalFilename = ensureEngramExtension(filename);
  const buffer = await writeEngram(file, options);
  await writeFile(finalFilename, buffer);
  return finalFilename;
}

/**
 * Convenience function to read an Engram file from disk
 * @param filename - Input filename
 * @param options - Read options
 * @returns Promise resolving to the parsed Engram file
 */
export async function readEngramFile(
  filename: string,
  options: ReadOptions = {}
): Promise<EngramFile> {
  const buffer = await readFile(filename);
  return readEngram(buffer, options);
}

// ============== READER ==============

export interface ReadOptions {
  password?: string;
  verifyIntegrity?: boolean;
}

export async function readEngram(
  data: Buffer,
  options: ReadOptions = {}
): Promise<EngramFile> {
  // Verify magic
  if (!data.subarray(0, 6).equals(MAGIC)) {
    throw new Error('Invalid Engram file: bad magic bytes');
  }
  
  // Check version
  const majorVersion = data[6];
  const minorVersion = data[7];
  
  if (majorVersion !== VERSION_MAJOR) {
    if (majorVersion === 2) {
      throw new Error('This is a v2 file. Use migrateV2toEngram() first.');
    }
    throw new Error(`Unsupported version: ${majorVersion}.${minorVersion}`);
  }
  
  // Read header length
  const headerLen = data.readUInt32LE(8);
  
  // Read header
  const headerBytes = data.subarray(HEADER_OFFSET, HEADER_OFFSET + headerLen);
  const header: EngramHeader = decode(headerBytes);
  
  // Read payload
  let payloadBytes = data.subarray(HEADER_OFFSET + headerLen);
  
  // Verify integrity
  if (options.verifyIntegrity !== false) {
    const expectedHash = Buffer.from(header.security.integrity);
    const actualHash = hashPayload(payloadBytes);
    
    if (!expectedHash.equals(actualHash)) {
      throw new Error('Integrity check failed: file may be corrupted or tampered');
    }
  }
  
  // Decrypt if needed
  if (header.security.encrypted) {
    if (!options.password) {
      throw new Error('File is encrypted. Provide a password.');
    }
    
    payloadBytes = await decryptPayload(
      payloadBytes,
      options.password,
      header.security.salt!,
      header.security.nonce!
    );
  }
  
  // Decode payload
  const payload = decode(payloadBytes) as {
    nodes: MemoryNode[];
    entities: Entity[];
    links: MemoryLink[];
    deltas?: Delta[];
  };
  
  return {
    header,
    nodes: payload.nodes,
    entities: payload.entities,
    links: payload.links,
    deltas: payload.deltas
  };
}

// ============== ENCRYPTION ==============

interface EncryptResult {
  ciphertext: Buffer;
  salt: Uint8Array;
  nonce: Uint8Array;
}

async function encryptPayload(
  payload: Buffer,
  password: string
): Promise<EncryptResult> {
  // Generate salt and nonce
  const salt = randomBytes(32);
  const nonce = randomBytes(12);
  
  // Derive key using simple PBKDF2 (use argon2 in production)
  const key = await deriveKey(password, salt);
  
  // Encrypt with AES-256-GCM
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(payload),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  
  // Append tag to ciphertext
  const ciphertext = Buffer.concat([encrypted, tag]);
  
  return {
    ciphertext,
    salt: new Uint8Array(salt),
    nonce: new Uint8Array(nonce)
  };
}

async function decryptPayload(
  ciphertext: Buffer,
  password: string,
  salt: Uint8Array,
  nonce: Uint8Array
): Promise<Buffer> {
  // Derive key
  const key = await deriveKey(password, Buffer.from(salt));
  
  // Extract tag (last 16 bytes)
  const tag = ciphertext.subarray(-16);
  const encrypted = ciphertext.subarray(0, -16);
  
  // Decrypt
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce));
  decipher.setAuthTag(tag);
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  // Simple PBKDF2 - replace with argon2 in production
  const { pbkdf2Sync } = await import('crypto');
  return pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

function hashPayload(payload: Buffer | Uint8Array): Buffer {
  return createHash('sha256').update(payload).digest();
}

// ============== STREAMING WRITER ==============

export class StreamingWriter {
  private nodes: Map<string, MemoryNode> = new Map();
  private entities: Map<string, Entity> = new Map();
  private links: Map<string, MemoryLink> = new Map();
  private deltas: Delta[] = [];
  private checkpointPosition = 0;
  
  async append(node: MemoryNode): Promise<string> {
    this.nodes.set(node.id, node);
    this.deltas.push({
      id: `delta-${Date.now()}`,
      timestamp: Date.now(),
      operation: 'add',
      node
    });
    return node.id;
  }
  
  async update(nodeId: string, updates: Partial<MemoryNode>): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    
    const updated = { ...node, ...updates };
    this.nodes.set(nodeId, updated);
    
    this.deltas.push({
      id: `delta-${Date.now()}`,
      timestamp: Date.now(),
      operation: 'update',
      nodeId,
      updates
    });
  }
  
  async delete(nodeId: string): Promise<void> {
    this.nodes.delete(nodeId);
    this.deltas.push({
      id: `delta-${Date.now()}`,
      timestamp: Date.now(),
      operation: 'delete',
      nodeId
    });
  }
  
  async addLink(link: MemoryLink): Promise<void> {
    this.links.set(link.id, link);
    this.deltas.push({
      id: `delta-${Date.now()}`,
      timestamp: Date.now(),
      operation: 'link',
      link
    });
  }
  
  async checkpoint(): Promise<void> {
    // Mark checkpoint position
    this.checkpointPosition = this.deltas.length;
  }
  
  async compact(): Promise<void> {
    // Clear deltas, keeping only current state
    this.deltas = [];
    this.checkpointPosition = 0;
  }
  
  getPosition(): number {
    return this.deltas.length;
  }
  
  getState(): { nodes: MemoryNode[]; entities: Entity[]; links: MemoryLink[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      entities: Array.from(this.entities.values()),
      links: Array.from(this.links.values())
    };
  }
  
  getDeltasSince(position: number): Delta[] {
    return this.deltas.slice(position);
  }
}

// ============== MIGRATION ==============

interface AifBinV2 {
  version: number;
  created: number;
  chunks: Array<{
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
  }>;
}

export function migrateV2toEngram(v2Data: AifBinV2): EngramFile {
  const now = Date.now();
  
  const nodes: MemoryNode[] = v2Data.chunks.map((chunk, i) => ({
    id: `migrated-${i}-${now}`,
    parentId: null,
    children: [],
    depth: 0,
    path: `/${i}`,
    
    content: {
      type: 'text' as const,
      data: chunk.content,
      tokens: Math.ceil(chunk.content.length / 4)
    },
    
    embedding: new Float32Array(chunk.embedding),
    
    temporal: {
      created: v2Data.created,
      modified: v2Data.created,
      accessed: now,
      decayTier: 'warm' as const
    },
    
    quality: {
      score: 0.5,
      confidence: 1.0,
      source: 'direct' as const
    },
    
    metadata: {
      custom: chunk.metadata,
      tags: ['migrated-from-v2']
    }
  }));
  
  return {
    header: {
      version: [1, 0],
      created: v2Data.created,
      modified: now,
      
      security: {
        encrypted: false,
        algorithm: 'none',
        kdf: 'none',
        integrity: Buffer.alloc(32) // Will be computed on write
      },
      
      metadata: {
        source: 'migration',
        tags: ['migrated-from-v2']
      },
      
      schema: {
        embeddingModel: 'unknown',
        embeddingDims: nodes[0]?.embedding?.length || 384,
        chunkStrategy: 'paragraph',
        modalities: ['text']
      },
      
      stats: {
        totalChunks: nodes.length,
        totalTokens: nodes.reduce((sum, n) => sum + (n.content.tokens || 0), 0),
        rootNodes: nodes.length,
        maxDepth: 0,
        entityCount: 0,
        linkCount: 0
      }
    },
    nodes,
    entities: [],
    links: []
  };
}
