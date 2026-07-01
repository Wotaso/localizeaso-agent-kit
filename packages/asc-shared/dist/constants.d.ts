export declare const APP_STORE_LOCALES: {
    code: string;
    name: string;
}[];
export declare const LOCALE_TO_REGION_CODE: Record<string, string>;
export declare const ASC_LOCALE_ALIASES: Record<string, string>;
export declare const FULL_EDIT_MODE: readonly ["PREPARE_FOR_SUBMISSION", "METADATA_REJECTED", "WAITING_FOR_EXPORT_COMPLIANCE", "REJECTED", "DEVELOPER_REJECTED"];
export declare const CAN_CREATE_NEW_VERSION: readonly ["READY_FOR_DISTRIBUTION"];
export declare const APP_TITLE_STYLE_VALUES: readonly ["appname_colon_main_keyword", "main_keyword_colon_appname", "main_keyword_dash_appname", "appname_dash_main_keyword", "main_keywords_only"];
export type AppTitleStyle = (typeof APP_TITLE_STYLE_VALUES)[number];
export declare const DEFAULT_APP_TITLE_STYLE: AppTitleStyle;
export declare const APP_TITLE_CASING_VALUES: readonly ["language_optimized", "capitalize_each_word", "all_lowercase"];
export type AppTitleCasing = (typeof APP_TITLE_CASING_VALUES)[number];
export declare const DEFAULT_APP_TITLE_CASING: AppTitleCasing;
//# sourceMappingURL=constants.d.ts.map