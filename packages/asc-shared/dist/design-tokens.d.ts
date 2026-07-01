/**
 * Design Tokens - Shared between Plugin and Dashboard
 * These define the visual identity (colors, sizes, variants)
 * but each app implements its own components using these values.
 */
export declare const COLORS: {
    readonly primary: "#007aff";
    readonly primaryHover: "#3399ff";
    readonly primaryActive: "#0056b3";
    readonly secondary: "#2e3048";
    readonly secondaryHover: "#3a3d5c";
    readonly bgDark: "#0e1021";
    readonly bgCard: "#15172e";
    readonly bgInput: "#222436";
    readonly textPrimary: "#ffffff";
    readonly textSecondary: "#9499a6";
    readonly textMuted: "#6b7280";
    readonly border: "#2e3048";
    readonly borderHover: "#3a3d5c";
    readonly success: "#22c55e";
    readonly warning: "#f59e0b";
    readonly danger: "#ef4444";
    readonly dangerHover: "#dc2626";
    readonly accent: "#007aff";
    readonly accentHover: "#3399ff";
};
export declare const BUTTON_VARIANTS: {
    readonly primary: {
        readonly bg: "#007aff";
        readonly bgHover: "#3399ff";
        readonly text: "#ffffff";
    };
    readonly secondary: {
        readonly bg: "#2e3048";
        readonly bgHover: "#3a3d5c";
        readonly text: "#ffffff";
    };
    readonly ghost: {
        readonly bg: "transparent";
        readonly bgHover: "#2e3048";
        readonly text: "#007aff";
    };
    readonly danger: {
        readonly bg: "#ef4444";
        readonly bgHover: "#dc2626";
        readonly text: "#ffffff";
    };
};
export declare const BUTTON_SIZES: {
    readonly sm: {
        readonly px: 12;
        readonly py: 6;
        readonly fontSize: 12;
        readonly borderRadius: 8;
    };
    readonly md: {
        readonly px: 16;
        readonly py: 10;
        readonly fontSize: 14;
        readonly borderRadius: 10;
    };
    readonly lg: {
        readonly px: 20;
        readonly py: 14;
        readonly fontSize: 16;
        readonly borderRadius: 12;
    };
};
export declare const INPUT_STYLES: {
    readonly bg: "#222436";
    readonly border: "#2e3048";
    readonly borderFocus: "#007aff";
    readonly text: "#ffffff";
    readonly placeholder: "#9499a6";
    readonly borderRadius: 8;
    readonly padding: {
        readonly x: 12;
        readonly y: 10;
    };
};
export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;
//# sourceMappingURL=design-tokens.d.ts.map