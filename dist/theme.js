"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEADER_COMPACT = exports.HEADER = exports.tierLabel = exports.tierColor = exports.theme = void 0;
exports.banner = banner;
exports.separator = separator;
exports.box = box;
/**
 * Allo Theme — Consistent color scheme and branding
 *
 * Palette: Amber primary, green success, purple accent, coral error
 */
const chalk_1 = __importDefault(require("chalk"));
// Brand colors (256-color approximations that work in most terminals)
exports.theme = {
    // Primary — amber/orange
    primary: chalk_1.default.hex('#FF9F43'),
    primaryBold: chalk_1.default.hex('#FF9F43').bold,
    primaryDim: chalk_1.default.hex('#E17D32'),
    // Success — deep green
    success: chalk_1.default.hex('#2ED573'),
    successBold: chalk_1.default.hex('#2ED573').bold,
    // Accent — soft purple (neural/AI feel)
    accent: chalk_1.default.hex('#A55EEA'),
    accentBold: chalk_1.default.hex('#A55EEA').bold,
    // Error — coral red
    error: chalk_1.default.hex('#FF6B6B'),
    errorBold: chalk_1.default.hex('#FF6B6B').bold,
    // Muted — warm gray
    muted: chalk_1.default.hex('#A4A4A4'),
    dim: chalk_1.default.hex('#636E72'),
    // Text
    bold: chalk_1.default.bold,
    white: chalk_1.default.white,
    whiteBold: chalk_1.default.white.bold,
};
// Tier colors
exports.tierColor = {
    hot: chalk_1.default.hex('#FF6B6B'), // coral
    warm: chalk_1.default.hex('#FF9F43'), // amber
    cold: chalk_1.default.hex('#74B9FF'), // light blue
    archive: chalk_1.default.hex('#636E72'), // dim gray
};
exports.tierLabel = {
    hot: exports.tierColor.hot('HOT'),
    warm: exports.tierColor.warm('WARM'),
    cold: exports.tierColor.cold('COLD'),
    archive: exports.tierColor.archive('ARCHIVE'),
};
// ASCII header
exports.HEADER = exports.theme.primary(`
     _    _ _       
    / \\  | | | ___  
   / _ \\ | | |/ _ \\ 
  / ___ \\| | | (_) |
 /_/   \\_\\_|_|\\___/  🦖
`);
exports.HEADER_COMPACT = exports.theme.primaryBold('Allo 🦖');
function banner(version, memoryCount, sizeMB) {
    const lines = [exports.HEADER];
    lines.push(exports.theme.muted(` Neural Memory — v${version}`));
    if (memoryCount !== undefined) {
        lines.push(exports.theme.dim(` ${memoryCount} memories${sizeMB ? ` (${sizeMB} MB)` : ''}`));
    }
    lines.push('');
    return lines.join('\n');
}
function separator(width = 40) {
    return exports.theme.dim('─'.repeat(width));
}
function box(content, title) {
    const lines = content.split('\n');
    const maxLen = Math.max(...lines.map(l => stripAnsi(l).length), title ? stripAnsi(title).length + 2 : 0);
    const w = maxLen + 4;
    const top = title
        ? exports.theme.dim('┌─ ') + exports.theme.primaryBold(title) + exports.theme.dim(' ' + '─'.repeat(Math.max(0, w - stripAnsi(title).length - 5)) + '┐')
        : exports.theme.dim('┌' + '─'.repeat(w - 2) + '┐');
    const bottom = exports.theme.dim('└' + '─'.repeat(w - 2) + '┘');
    const body = lines.map(line => {
        const pad = maxLen - stripAnsi(line).length;
        return exports.theme.dim('│ ') + line + ' '.repeat(pad) + exports.theme.dim(' │');
    }).join('\n');
    return `${top}\n${body}\n${bottom}`;
}
function stripAnsi(str) {
    return str.replace(/\u001b\[[0-9;]*m/g, '');
}
//# sourceMappingURL=theme.js.map