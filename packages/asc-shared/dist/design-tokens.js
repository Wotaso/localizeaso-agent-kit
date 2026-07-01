/**
 * Design Tokens - Shared between Plugin and Dashboard
 * These define the visual identity (colors, sizes, variants)
 * but each app implements its own components using these values.
 */
// App Store Blue Color Palette
export const COLORS = {
    // Primary (App Store Blue)
    primary: '#007aff',
    primaryHover: '#3399ff',
    primaryActive: '#0056b3',
    // Secondary (Slate)
    secondary: '#2e3048',
    secondaryHover: '#3a3d5c',
    // Backgrounds
    bgDark: '#0e1021',
    bgCard: '#15172e',
    bgInput: '#222436',
    // Text
    textPrimary: '#ffffff',
    textSecondary: '#9499a6',
    textMuted: '#6b7280',
    // Borders
    border: '#2e3048',
    borderHover: '#3a3d5c',
    // Semantic
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    dangerHover: '#dc2626',
    // Accents
    accent: '#007aff',
    accentHover: '#3399ff',
};
// Button Variants
export const BUTTON_VARIANTS = {
    primary: {
        bg: COLORS.primary,
        bgHover: COLORS.primaryHover,
        text: COLORS.textPrimary,
    },
    secondary: {
        bg: COLORS.secondary,
        bgHover: COLORS.secondaryHover,
        text: COLORS.textPrimary,
    },
    ghost: {
        bg: 'transparent',
        bgHover: COLORS.secondary,
        text: COLORS.primary,
    },
    danger: {
        bg: COLORS.danger,
        bgHover: COLORS.dangerHover,
        text: COLORS.textPrimary,
    },
};
// Button Sizes
export const BUTTON_SIZES = {
    sm: { px: 12, py: 6, fontSize: 12, borderRadius: 8 },
    md: { px: 16, py: 10, fontSize: 14, borderRadius: 10 },
    lg: { px: 20, py: 14, fontSize: 16, borderRadius: 12 },
};
// Input Styles
export const INPUT_STYLES = {
    bg: COLORS.bgInput,
    border: COLORS.border,
    borderFocus: COLORS.primary,
    text: COLORS.textPrimary,
    placeholder: COLORS.textSecondary,
    borderRadius: 8,
    padding: { x: 12, y: 10 },
};
