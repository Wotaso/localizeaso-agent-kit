export type Json = string | number | boolean | null | {
    [key: string]: Json | undefined;
} | Json[];
export type Database = {
    __InternalSupabase: {
        PostgrestVersion: "14.1";
    };
    public: {
        Tables: {
            ai_usage: {
                Row: {
                    created_at: string | null;
                    id: string;
                    input_tokens: number;
                    output_tokens: number;
                    period_start: string;
                    total_tokens: number;
                    updated_at: string | null;
                    user_id: string;
                };
                Insert: {
                    created_at?: string | null;
                    id?: string;
                    input_tokens?: number;
                    output_tokens?: number;
                    period_start: string;
                    total_tokens?: number;
                    updated_at?: string | null;
                    user_id: string;
                };
                Update: {
                    created_at?: string | null;
                    id?: string;
                    input_tokens?: number;
                    output_tokens?: number;
                    period_start?: string;
                    total_tokens?: number;
                    updated_at?: string | null;
                    user_id?: string;
                };
                Relationships: [];
            };
            asc_aso_keywords: {
                Row: {
                    app_id: string;
                    created_at: string | null;
                    deleted_at: string | null;
                    difficulty: number | null;
                    id: string;
                    is_preferred: boolean;
                    keyword: string;
                    keyword_english: string | null;
                    locale: string;
                    popularity: number | null;
                    updated_at: string | null;
                    user_id: string;
                };
                Insert: {
                    app_id: string;
                    created_at?: string | null;
                    deleted_at?: string | null;
                    difficulty?: number | null;
                    id?: string;
                    is_preferred?: boolean;
                    keyword: string;
                    keyword_english?: string | null;
                    locale: string;
                    popularity?: number | null;
                    updated_at?: string | null;
                    user_id: string;
                };
                Update: {
                    app_id?: string;
                    created_at?: string | null;
                    deleted_at?: string | null;
                    difficulty?: number | null;
                    id?: string;
                    is_preferred?: boolean;
                    keyword?: string;
                    keyword_english?: string | null;
                    locale?: string;
                    popularity?: number | null;
                    updated_at?: string | null;
                    user_id?: string;
                };
                Relationships: [];
            };
            asc_app_metadata_settings: {
                Row: {
                    app_id: string;
                    app_name: string | null;
                    create_instructions: string | null;
                    optimize_instructions: string | null;
                    whats_new_text: string | null;
                    app_title_casing: string;
                    app_title_style: string;
                    created_at: string;
                    id: string;
                    updated_at: string;
                    update_instructions: string | null;
                    user_id: string;
                };
                Insert: {
                    app_id: string;
                    app_name?: string | null;
                    create_instructions?: string | null;
                    optimize_instructions?: string | null;
                    whats_new_text?: string | null;
                    app_title_casing?: string;
                    app_title_style?: string;
                    created_at?: string;
                    id?: string;
                    updated_at?: string;
                    update_instructions?: string | null;
                    user_id: string;
                };
                Update: {
                    app_id?: string;
                    app_name?: string | null;
                    create_instructions?: string | null;
                    optimize_instructions?: string | null;
                    whats_new_text?: string | null;
                    app_title_casing?: string;
                    app_title_style?: string;
                    created_at?: string;
                    id?: string;
                    updated_at?: string;
                    update_instructions?: string | null;
                    user_id?: string;
                };
                Relationships: [];
            };
            asc_credentials: {
                Row: {
                    created_at: string | null;
                    issuer_id: string;
                    key_id: string;
                    private_key_ciphertext: string;
                    private_key_iv: string;
                    private_key_tag: string;
                    updated_at: string | null;
                    user_id: string;
                };
                Insert: {
                    created_at?: string | null;
                    issuer_id: string;
                    key_id: string;
                    private_key_ciphertext: string;
                    private_key_iv: string;
                    private_key_tag: string;
                    updated_at?: string | null;
                    user_id: string;
                };
                Update: {
                    created_at?: string | null;
                    issuer_id?: string;
                    key_id?: string;
                    private_key_ciphertext?: string;
                    private_key_iv?: string;
                    private_key_tag?: string;
                    updated_at?: string | null;
                    user_id?: string;
                };
                Relationships: [];
            };
            asc_drafts: {
                Row: {
                    app_id: string;
                    created_at: string | null;
                    fields: Json;
                    id: string;
                    locale: string;
                    updated_at: string | null;
                    user_id: string;
                };
                Insert: {
                    app_id: string;
                    created_at?: string | null;
                    fields?: Json;
                    id?: string;
                    locale: string;
                    updated_at?: string | null;
                    user_id: string;
                };
                Update: {
                    app_id?: string;
                    created_at?: string | null;
                    fields?: Json;
                    id?: string;
                    locale?: string;
                    updated_at?: string | null;
                    user_id?: string;
                };
                Relationships: [];
            };
            asc_push_jobs: {
                Row: {
                    app_id: string;
                    created_at: string | null;
                    dry_run: boolean;
                    error: string | null;
                    id: string;
                    payload: Json | null;
                    result: Json | null;
                    status: string;
                    updated_at: string | null;
                    user_id: string;
                };
                Insert: {
                    app_id: string;
                    created_at?: string | null;
                    dry_run?: boolean;
                    error?: string | null;
                    id?: string;
                    payload?: Json | null;
                    result?: Json | null;
                    status: string;
                    updated_at?: string | null;
                    user_id: string;
                };
                Update: {
                    app_id?: string;
                    created_at?: string | null;
                    dry_run?: boolean;
                    error?: string | null;
                    id?: string;
                    payload?: Json | null;
                    result?: Json | null;
                    status?: string;
                    updated_at?: string | null;
                    user_id?: string;
                };
                Relationships: [];
            };
            feedback: {
                Row: {
                    created_at: string;
                    id: string;
                    message: string;
                    screen_name: string;
                    source: string;
                    user_id: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    message: string;
                    screen_name: string;
                    source: string;
                    user_id: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    message?: string;
                    screen_name?: string;
                    source?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            figma_localized_frames: {
                Row: {
                    app_id: string;
                    created_at: string | null;
                    figma_file_key: string;
                    frame_height: number | null;
                    frame_width: number | null;
                    frame_x: number | null;
                    frame_y: number | null;
                    id: string;
                    locale: string;
                    localized_frame_id: string;
                    localized_frame_name: string;
                    source_frame_id: string;
                    source_frame_name: string;
                    updated_at: string | null;
                    user_id: string;
                };
                Insert: {
                    app_id: string;
                    created_at?: string | null;
                    figma_file_key: string;
                    frame_height?: number | null;
                    frame_width?: number | null;
                    frame_x?: number | null;
                    frame_y?: number | null;
                    id?: string;
                    locale: string;
                    localized_frame_id: string;
                    localized_frame_name: string;
                    source_frame_id: string;
                    source_frame_name: string;
                    updated_at?: string | null;
                    user_id: string;
                };
                Update: {
                    app_id?: string;
                    created_at?: string | null;
                    figma_file_key?: string;
                    frame_height?: number | null;
                    frame_width?: number | null;
                    frame_x?: number | null;
                    frame_y?: number | null;
                    id?: string;
                    locale?: string;
                    localized_frame_id?: string;
                    localized_frame_name?: string;
                    source_frame_id?: string;
                    source_frame_name?: string;
                    updated_at?: string | null;
                    user_id?: string;
                };
                Relationships: [];
            };
            profiles: {
                Row: {
                    created_at: string | null;
                    email_verified: boolean;
                    email_verified_at: string | null;
                    id: string;
                    is_paid: boolean;
                    paddle_current_period_end: string | null;
                    paddle_customer_id: string | null;
                    paddle_last_event_at: string | null;
                    paddle_next_billed_at: string | null;
                    paddle_price_id: string | null;
                    paddle_status: string | null;
                    paddle_subscription_id: string | null;
                    paddle_trial_end: string | null;
                    paddle_updated_at: string | null;
                };
                Insert: {
                    created_at?: string | null;
                    email_verified?: boolean;
                    email_verified_at?: string | null;
                    id: string;
                    is_paid?: boolean;
                    paddle_current_period_end?: string | null;
                    paddle_customer_id?: string | null;
                    paddle_last_event_at?: string | null;
                    paddle_next_billed_at?: string | null;
                    paddle_price_id?: string | null;
                    paddle_status?: string | null;
                    paddle_subscription_id?: string | null;
                    paddle_trial_end?: string | null;
                    paddle_updated_at?: string | null;
                };
                Update: {
                    created_at?: string | null;
                    email_verified?: boolean;
                    email_verified_at?: string | null;
                    id?: string;
                    is_paid?: boolean;
                    paddle_current_period_end?: string | null;
                    paddle_customer_id?: string | null;
                    paddle_last_event_at?: string | null;
                    paddle_next_billed_at?: string | null;
                    paddle_price_id?: string | null;
                    paddle_status?: string | null;
                    paddle_subscription_id?: string | null;
                    paddle_trial_end?: string | null;
                    paddle_updated_at?: string | null;
                };
                Relationships: [];
            };
            user_acquisition: {
                Row: {
                    created_at: string;
                    id: string;
                    landing_path: string | null;
                    referrer: string | null;
                    user_id: string;
                    utm_campaign: string | null;
                    utm_content: string | null;
                    utm_medium: string | null;
                    utm_source: string | null;
                    utm_term: string | null;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    landing_path?: string | null;
                    referrer?: string | null;
                    user_id: string;
                    utm_campaign?: string | null;
                    utm_content?: string | null;
                    utm_medium?: string | null;
                    utm_source?: string | null;
                    utm_term?: string | null;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    landing_path?: string | null;
                    referrer?: string | null;
                    user_id?: string;
                    utm_campaign?: string | null;
                    utm_content?: string | null;
                    utm_medium?: string | null;
                    utm_source?: string | null;
                    utm_term?: string | null;
                };
                Relationships: [];
            };
            user_settings: {
                Row: {
                    analytics_opt_out: boolean;
                    created_at: string;
                    updated_at: string;
                    user_id: string;
                };
                Insert: {
                    analytics_opt_out?: boolean;
                    created_at?: string;
                    updated_at?: string;
                    user_id: string;
                };
                Update: {
                    analytics_opt_out?: boolean;
                    created_at?: string;
                    updated_at?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            waitlist: {
                Row: {
                    consent_text_version: string;
                    created_at: string;
                    email: string;
                    id: string;
                    status: string;
                    unsubscribe_token_hash: string;
                    unsubscribed_at: string | null;
                };
                Insert: {
                    consent_text_version: string;
                    created_at?: string;
                    email: string;
                    id?: string;
                    status?: string;
                    unsubscribe_token_hash: string;
                    unsubscribed_at?: string | null;
                };
                Update: {
                    consent_text_version?: string;
                    created_at?: string;
                    email?: string;
                    id?: string;
                    status?: string;
                    unsubscribe_token_hash?: string;
                    unsubscribed_at?: string | null;
                };
                Relationships: [];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            increment_ai_usage: {
                Args: {
                    p_input_tokens: number;
                    p_output_tokens: number;
                    p_period_start: string;
                    p_user_id: string;
                };
                Returns: undefined;
            };
            mark_email_verified: {
                Args: {
                    p_email_verified_at?: string | null;
                };
                Returns: undefined;
            };
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];
export type Tables<DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
    Row: infer R;
} ? R : never : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
    Row: infer R;
} ? R : never : never;
export type TablesInsert<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I;
} ? I : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I;
} ? I : never : never;
export type TablesUpdate<DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | {
    schema: keyof DatabaseWithoutInternals;
}, TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never = never> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U;
} ? U : never : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U;
} ? U : never : never;
export type Enums<DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | {
    schema: keyof DatabaseWithoutInternals;
}, EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never = never> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName] : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never;
export type CompositeTypes<PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | {
    schema: keyof DatabaseWithoutInternals;
}, CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"] : never = never> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName] : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions] : never;
export declare const Constants: {
    readonly public: {
        readonly Enums: {};
    };
};
export {};
//# sourceMappingURL=supabase.types.d.ts.map