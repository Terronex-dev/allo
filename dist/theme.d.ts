export declare const theme: {
    primary: import("chalk").ChalkInstance;
    primaryBold: import("chalk").ChalkInstance;
    primaryDim: import("chalk").ChalkInstance;
    success: import("chalk").ChalkInstance;
    successBold: import("chalk").ChalkInstance;
    accent: import("chalk").ChalkInstance;
    accentBold: import("chalk").ChalkInstance;
    error: import("chalk").ChalkInstance;
    errorBold: import("chalk").ChalkInstance;
    muted: import("chalk").ChalkInstance;
    dim: import("chalk").ChalkInstance;
    bold: import("chalk").ChalkInstance;
    white: import("chalk").ChalkInstance;
    whiteBold: import("chalk").ChalkInstance;
};
export declare const tierColor: {
    hot: import("chalk").ChalkInstance;
    warm: import("chalk").ChalkInstance;
    cold: import("chalk").ChalkInstance;
    archive: import("chalk").ChalkInstance;
};
export declare const tierLabel: Record<string, string>;
export declare const HEADER: string;
export declare const HEADER_COMPACT: string;
export declare function banner(version: string, memoryCount?: number, sizeMB?: number): string;
export declare function separator(width?: number): string;
export declare function box(content: string, title?: string): string;
