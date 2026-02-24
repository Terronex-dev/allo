/**
 * Allo Theme — Consistent color scheme and branding
 *
 * Palette: Amber primary, green success, purple accent, coral error
 */
import chalk from 'chalk';
// Brand colors (256-color approximations that work in most terminals)
export const theme = {
    // Primary — amber/orange
    primary: chalk.hex('#FF9F43'),
    primaryBold: chalk.hex('#FF9F43').bold,
    primaryDim: chalk.hex('#E17D32'),
    // Success — deep green
    success: chalk.hex('#2ED573'),
    successBold: chalk.hex('#2ED573').bold,
    // Accent — soft purple (neural/AI feel)
    accent: chalk.hex('#A55EEA'),
    accentBold: chalk.hex('#A55EEA').bold,
    // Error — coral red
    error: chalk.hex('#FF6B6B'),
    errorBold: chalk.hex('#FF6B6B').bold,
    // Muted — warm gray
    muted: chalk.hex('#A4A4A4'),
    dim: chalk.hex('#636E72'),
    // Text
    bold: chalk.bold,
    white: chalk.white,
    whiteBold: chalk.white.bold,
};
// Tier colors
export const tierColor = {
    hot: chalk.hex('#FF6B6B'), // coral
    warm: chalk.hex('#FF9F43'), // amber
    cold: chalk.hex('#74B9FF'), // light blue
    archive: chalk.hex('#636E72'), // dim gray
};
export const tierLabel = {
    hot: tierColor.hot('HOT'),
    warm: tierColor.warm('WARM'),
    cold: tierColor.cold('COLD'),
    archive: tierColor.archive('ARCHIVE'),
};
// ASCII header
export const HEADER = theme.primary(`
     _    _ _       
    / \\  | | | ___  
   / _ \\ | | |/ _ \\ 
  / ___ \\| | | (_) |
 /_/   \\_\\_|_|\\___/  🦖
`);
export const HEADER_COMPACT = theme.primaryBold('Allo 🦖');
export function banner(version, memoryCount, sizeMB) {
    const lines = [HEADER];
    lines.push(theme.muted(` Neural Memory — v${version}`));
    if (memoryCount !== undefined) {
        lines.push(theme.dim(` ${memoryCount} memories${sizeMB ? ` (${sizeMB} MB)` : ''}`));
    }
    lines.push('');
    return lines.join('\n');
}
export function separator(width = 40) {
    return theme.dim('─'.repeat(width));
}
export function box(content, title) {
    const lines = content.split('\n');
    const maxLen = Math.max(...lines.map(l => stripAnsi(l).length), title ? stripAnsi(title).length + 2 : 0);
    const w = maxLen + 4;
    const top = title
        ? theme.dim('┌─ ') + theme.primaryBold(title) + theme.dim(' ' + '─'.repeat(Math.max(0, w - stripAnsi(title).length - 5)) + '┐')
        : theme.dim('┌' + '─'.repeat(w - 2) + '┐');
    const bottom = theme.dim('└' + '─'.repeat(w - 2) + '┘');
    const body = lines.map(line => {
        const pad = maxLen - stripAnsi(line).length;
        return theme.dim('│ ') + line + ' '.repeat(pad) + theme.dim(' │');
    }).join('\n');
    return `${top}\n${body}\n${bottom}`;
}
function stripAnsi(str) {
    return str.replace(/\u001b\[[0-9;]*m/g, '');
}
//# sourceMappingURL=theme.js.map