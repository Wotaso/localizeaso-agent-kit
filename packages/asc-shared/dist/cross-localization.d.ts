export type CrossLocalizationTier = 'primary_exact' | 'primary_language' | 'target_exact' | 'target_language' | 'cross_exact' | 'cross_language';
export declare const CROSS_LOCALIZATION_TIER_WEIGHT: Record<CrossLocalizationTier, number>;
export declare function resolveCrossLocalizedLocales(args: {
    targetLocale: string;
    primaryLocale?: string | null;
}): {
    primaryLocale: string;
    targetLocale: string;
    crossExactLocales: Set<string>;
    crossLanguageCodes: Set<string>;
};
export declare function resolveCrossLocalizationTier(args: {
    keywordLocale: string;
    targetLocale: string;
    primaryLocale?: string | null;
    includeCrossLocalization?: boolean;
}): CrossLocalizationTier | null;
export declare function selectCrossLocalizedRows<T extends {
    locale: string;
}>(rows: T[] | undefined, args: {
    targetLocale: string;
    primaryLocale?: string | null;
    includeCrossLocalization?: boolean;
}): {
    row: T;
    tier: CrossLocalizationTier;
    weight: number;
}[];
//# sourceMappingURL=cross-localization.d.ts.map