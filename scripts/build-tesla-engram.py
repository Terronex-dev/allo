#!/usr/bin/env python3
"""
Build tesla.engram — Nikola Tesla's complete published works as a neural memory file.
Chunks text semantically and ingests via Allo CLI.
"""
import os
import re
import subprocess
import sys

CORPUS_DIR = os.path.expanduser("~/clawd/allo/tesla-corpus")
OUTPUT_FILE = os.path.expanduser("~/tesla.engram")
CHUNK_SIZE = 400  # words per chunk (sweet spot for embeddings)
OVERLAP = 50  # word overlap between chunks

# Source files with metadata
SOURCES = [
    # (filename, source_label, tags)
    ("my-inventions-full.txt", "My Inventions (1919 Autobiography)", "autobiography,personal,inventions"),
    ("increasing-human-energy.txt", "The Problem of Increasing Human Energy (1900)", "essay,energy,philosophy,science"),
    ("on-light-1893.txt", "On Light and Other High Frequency Phenomena (1893)", "lecture,physics,light,high-frequency"),
    ("Nikola_Tesla.grok.txt", "Nikola Tesla — Biography", "biography,life,career"),
    ("Tesla_coil.grok.txt", "Tesla Coil — Technical Reference", "tesla-coil,invention,high-voltage"),
    ("Alternating_current.grok.txt", "Alternating Current — Technical Reference", "ac,electricity,power"),
    ("Wardenclyffe_Tower.grok.txt", "Wardenclyffe Tower — Project History", "wardenclyffe,wireless,energy-transmission"),
    ("Tesla_turbine.grok.txt", "Tesla Turbine — Technical Reference", "turbine,mechanical,invention"),
    ("Polyphase_system.grok.txt", "Polyphase System — Technical Reference", "polyphase,ac,motors,power"),
    ("Rotating_magnetic_field.grok.txt", "Rotating Magnetic Field — Technical Reference", "magnetic-field,ac,motors"),
    ("Teslas_oscillator.grok.txt", "Tesla's Oscillator — Technical Reference", "oscillator,mechanical,resonance"),
    ("Induction_motor.grok.txt", "Induction Motor — Technical Reference", "induction-motor,ac,invention"),
    ("List_of_Nikola_Tesla_patents.grok.txt", "Tesla Patents — Complete List", "patents,inventions,legal"),
    ("Nikola_Tesla_in_popular_culture.grok.txt", "Tesla in Popular Culture", "culture,legacy,media"),
]


def clean_text(text: str) -> str:
    """Remove wiki markup, HTML artifacts, and noise."""
    # Remove reference numbers like [1], [2]
    text = re.sub(r'\[\d+\]', '', text)
    # Remove image references
    text = re.sub(r'!\[.*?\]\[.*?\]', '', text)
    # Remove CSS/HTML artifacts
    text = re.sub(r'\.mw-parser-output[^{]*\{[^}]+\}', '', text)
    # Remove navigation/menu artifacts
    text = re.sub(r'(Main menu|Jump to content|Search|Appearance|Donate|Create account|Log in|Personal tools)[\s\n]*', '', text)
    # Remove repeated whitespace
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()


def chunk_text(text: str, source_label: str, chunk_size: int = CHUNK_SIZE, overlap: int = OVERLAP):
    """Split text into overlapping chunks by paragraph boundaries."""
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip() and len(p.strip()) > 50]
    
    chunks = []
    current_words = []
    current_para_start = 0
    
    for para in paragraphs:
        words = para.split()
        current_words.extend(words)
        
        while len(current_words) >= chunk_size:
            chunk = ' '.join(current_words[:chunk_size])
            chunks.append(f"[{source_label}] {chunk}")
            current_words = current_words[chunk_size - overlap:]
    
    # Don't forget the last chunk
    if current_words and len(current_words) > 30:
        chunk = ' '.join(current_words)
        chunks.append(f"[{source_label}] {chunk}")
    
    return chunks


def main():
    all_chunks = []
    
    print("=" * 60)
    print("  Building tesla.engram — The Mind of Nikola Tesla")
    print("=" * 60)
    print()
    
    for filename, label, tags in SOURCES:
        fpath = os.path.join(CORPUS_DIR, filename)
        if not os.path.exists(fpath):
            print(f"  SKIP: {filename} (not found)")
            continue
        
        with open(fpath) as f:
            text = f.read()
        
        if len(text) < 1000:
            print(f"  SKIP: {filename} (too small: {len(text)} chars)")
            continue
        
        text = clean_text(text)
        chunks = chunk_text(text, label)
        all_chunks.extend([(c, tags) for c in chunks])
        print(f"  {filename}: {len(text):,} chars -> {len(chunks)} chunks")
    
    print(f"\n  Total: {len(all_chunks)} chunks to ingest")
    print(f"  Estimated time: ~{len(all_chunks) * 2}s ({len(all_chunks) * 2 // 60}m)\n")
    
    # Delete old file if exists
    if os.path.exists(OUTPUT_FILE):
        os.remove(OUTPUT_FILE)
        print(f"  Removed old {OUTPUT_FILE}")
    
    # Ingest via allo remember
    success = 0
    errors = 0
    for i, (chunk, tags) in enumerate(all_chunks):
        if i % 25 == 0:
            pct = (i / len(all_chunks)) * 100
            print(f"  [{i}/{len(all_chunks)}] ({pct:.0f}%) — {success} ingested, {errors} errors")
        
        # Escape quotes for shell
        safe_chunk = chunk.replace("'", "'\\''")
        safe_tags = tags.replace("'", "'\\''")
        
        cmd = f"allo remember '{safe_chunk}' --tags '{safe_tags}' --file '{OUTPUT_FILE}'"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            success += 1
        else:
            errors += 1
            if errors <= 3:
                print(f"    ERROR at chunk {i}: {result.stderr[:100]}")
    
    print(f"\n{'=' * 60}")
    print(f"  Done! {success}/{len(all_chunks)} chunks ingested")
    print(f"  File: {OUTPUT_FILE}")
    print(f"{'=' * 60}")
    
    # Show stats
    subprocess.run(f"allo stats --file '{OUTPUT_FILE}'", shell=True)


if __name__ == "__main__":
    main()
