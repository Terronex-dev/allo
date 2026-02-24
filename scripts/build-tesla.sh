#!/bin/bash
# Download Tesla's complete published works for tesla.engram
set -e

CORPUS=~/clawd/allo/tesla-corpus
mkdir -p "$CORPUS"

echo "=== Downloading Nikola Tesla's Published Works ==="

# My Inventions (6 chapters) - Wikisource
echo "[1/10] My Inventions — Autobiography (6 chapters)..."
for i in I II III IV V VI; do
    echo "  Chapter $i..."
    curl -sL "https://en.wikisource.org/w/index.php?title=My_Inventions/Chapter_${i}&action=raw" > "$CORPUS/my-inventions-ch-${i}.txt" 2>/dev/null || true
done

# Experiments with Alternate Currents of High Potential and High Frequency (1892 lecture)
echo "[2/10] Experiments with Alternate Currents (1892 lecture)..."
curl -sL "https://en.wikisource.org/w/index.php?title=Experiments_with_Alternate_Currents_of_High_Potential_and_High_Frequency&action=raw" > "$CORPUS/experiments-ac-1892.txt" 2>/dev/null || true

# The Problem of Increasing Human Energy (1900, Century Magazine)
echo "[3/10] The Problem of Increasing Human Energy (1900)..."
curl -sL "https://en.wikisource.org/w/index.php?title=The_Problem_of_Increasing_Human_Energy&action=raw" > "$CORPUS/increasing-human-energy.txt" 2>/dev/null || true

# On Light and Other High Frequency Phenomena (1893)
echo "[4/10] On Light and Other High Frequency Phenomena (1893)..."
curl -sL "https://en.wikisource.org/w/index.php?title=On_Light_and_Other_High_Frequency_Phenomena&action=raw" > "$CORPUS/on-light-1893.txt" 2>/dev/null || true

# High Frequency Oscillators for Electro-Therapeutic and Other Purposes (1898)
echo "[5/10] High Frequency Oscillators (1898)..."
curl -sL "https://en.wikisource.org/w/index.php?title=High_Frequency_Oscillators_for_Electro-Therapeutic_and_Other_Purposes&action=raw" > "$CORPUS/hf-oscillators-1898.txt" 2>/dev/null || true

# Tesla's articles from various sources
echo "[6/10] The Transmission of Electrical Energy Without Wires (1904)..."
curl -sL "https://en.wikisource.org/w/index.php?title=The_Transmission_of_Electrical_Energy_Without_Wires&action=raw" > "$CORPUS/wireless-energy-1904.txt" 2>/dev/null || true

echo "[7/10] Talking With Planets (1901)..."
curl -sL "https://en.wikisource.org/w/index.php?title=Talking_With_Planets&action=raw" > "$CORPUS/talking-with-planets-1901.txt" 2>/dev/null || true

echo "[8/10] Tesla patents from archive.org..."
curl -sL "https://en.wikisource.org/w/index.php?title=Nikola_Tesla_bibliography&action=raw" > "$CORPUS/bibliography.txt" 2>/dev/null || true

# A New System of Alternate Current Motors and Transformers (1888 AIEE paper)
echo "[9/10] New System of AC Motors (1888 AIEE)..."
curl -sL "https://en.wikisource.org/w/index.php?title=A_New_System_of_Alternate_Current_Motors_and_Transformers&action=raw" > "$CORPUS/ac-motors-1888.txt" 2>/dev/null || true

# The True Wireless (1919)
echo "[10/10] The True Wireless (1919)..."
curl -sL "https://en.wikisource.org/w/index.php?title=The_True_Wireless&action=raw" > "$CORPUS/true-wireless-1919.txt" 2>/dev/null || true

echo ""
echo "=== Download complete ==="
echo "Files:"
ls -lh "$CORPUS"/*.txt 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
echo ""
echo "Total size:"
du -sh "$CORPUS"
