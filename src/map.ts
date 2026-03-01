/**
 * Map Visualization for Allo
 * 
 * V2.2: Generate interactive HTML maps from spatial recall results.
 * Uses Leaflet.js for rendering.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import type { SpatialResult } from '@terronex/engram';
import type { AlloMemory } from './allo.js';

export interface MapOptions {
    title?: string;
    zoom?: number;
    output?: string;
    open?: boolean;
}

interface MapMarker {
    lat: number;
    lng: number;
    label: string;
    content: string;
    distance?: number;
}

// Union type for both Engram SpatialResult and Allo AlloMemory
type MapInput = SpatialResult | AlloMemory;

/**
 * Generate an HTML map from spatial results or memories
 */
export async function generateMap(
    results: MapInput[],
    center: { x: number; y: number },
    options: MapOptions = {}
): Promise<string> {
    const {
        title = 'Allo Spatial Results',
        zoom = 5,
        output = path.join(process.cwd(), 'allo-map.html'),
        open = true
    } = options;

    // Convert results to markers (handle both SpatialResult and AlloMemory)
    const markers: MapMarker[] = results
        .filter(r => {
            // Check if it's AlloMemory or SpatialResult
            if ('position' in r) return r.position !== undefined;
            if ('node' in r) return (r as SpatialResult).node.position !== undefined;
            return false;
        })
        .map(r => {
            // Handle AlloMemory
            if ('content' in r && typeof r.content === 'string') {
                const mem = r as AlloMemory;
                return {
                    lat: mem.position!.x,
                    lng: mem.position!.y,
                    label: extractLabel(mem.content),
                    content: mem.content.slice(0, 200),
                    distance: undefined
                };
            }
            // Handle SpatialResult
            const sr = r as SpatialResult;
            const data = sr.node.content.data;
            const content = typeof data === 'string' ? data : new TextDecoder().decode(data);
            return {
                lat: sr.node.position!.x,
                lng: sr.node.position!.y,
                label: extractLabel(content),
                content: content.slice(0, 200),
                distance: sr.distance
            };
        });

    // Generate HTML
    const html = generateHTML(title, center, markers, zoom);
    
    // Write file
    await fs.writeFile(output, html, 'utf-8');
    
    // Open in browser
    if (open) {
        openInBrowser(output);
    }
    
    return output;
}

/**
 * Extract a short label from content
 */
function extractLabel(content: string): string {
    const firstSentence = content.split(/[.!?]/)[0].trim();
    
    // If it's "X is the capital of Y", extract just "X"
    const capitalMatch = firstSentence.match(/^(\w+)\s+is\s+the\s+capital/i);
    if (capitalMatch) return capitalMatch[1];
    
    // Otherwise take first 3 words
    const words = firstSentence.split(/\s+/).slice(0, 3);
    return words.join(' ');
}

/**
 * Format distance for display
 */
function formatDistance(km: number | undefined): string {
    if (km === undefined) return '';
    if (km < 1) return `${Math.round(km * 1000)}m`;
    if (km < 100) return `${Math.round(km)}km`;
    return `${Math.round(km / 10) * 10}km`;
}

/**
 * Generate the HTML document
 */
function generateHTML(
    title: string,
    center: { x: number; y: number },
    markers: MapMarker[],
    zoom: number
): string {
    const markersJSON = JSON.stringify(markers.map(m => ({
        lat: m.lat,
        lng: m.lng,
        popup: `<strong>${escapeHtml(m.label)}</strong>${m.distance ? ` <em>(${formatDistance(m.distance)})</em>` : ''}<br><p style="max-width:250px;font-size:12px;">${escapeHtml(m.content)}...</p>`
    })));

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        #header {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            padding: 16px 24px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        #header h1 { font-size: 20px; font-weight: 500; }
        #header .count { 
            background: rgba(255,255,255,0.15); 
            padding: 4px 10px; 
            border-radius: 12px; 
            font-size: 13px; 
        }
        #map { height: calc(100vh - 60px); width: 100%; }
        .leaflet-popup-content-wrapper {
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .leaflet-popup-content { margin: 12px 16px; }
        .leaflet-popup-content strong { color: #1a1a2e; }
        .leaflet-popup-content em { color: #666; font-size: 11px; }
    </style>
</head>
<body>
    <div id="header">
        <h1>${escapeHtml(title)}</h1>
        <span class="count">${markers.length} results</span>
    </div>
    <div id="map"></div>
    
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        const map = L.map('map').setView([${center.x}, ${center.y}], ${zoom});
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        
        // Add center marker
        L.circleMarker([${center.x}, ${center.y}], {
            radius: 8,
            fillColor: '#e74c3c',
            color: '#c0392b',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(map).bindPopup('<strong>Search Center</strong>');
        
        // Add result markers
        const markers = ${markersJSON};
        const bounds = [[${center.x}, ${center.y}]];
        
        markers.forEach((m, i) => {
            const marker = L.marker([m.lat, m.lng]).addTo(map);
            marker.bindPopup(m.popup);
            bounds.push([m.lat, m.lng]);
        });
        
        // Fit bounds if we have markers
        if (markers.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    </script>
</body>
</html>`;
}

/**
 * Escape HTML entities
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Open file in default browser
 */
function openInBrowser(filepath: string): void {
    const platform = process.platform;
    let cmd: string;
    
    if (platform === 'darwin') {
        cmd = `open "${filepath}"`;
    } else if (platform === 'win32') {
        cmd = `start "" "${filepath}"`;
    } else {
        // Linux - try xdg-open, then sensible-browser, then firefox
        cmd = `xdg-open "${filepath}" 2>/dev/null || sensible-browser "${filepath}" 2>/dev/null || firefox "${filepath}"`;
    }
    
    exec(cmd, (err) => {
        if (err) {
            console.log(`Map saved to: ${filepath}`);
            console.log('Open it in your browser to view.');
        }
    });
}
