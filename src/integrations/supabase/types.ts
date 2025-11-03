export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_details: Json | null
          action_type: string
          created_at: string
          error_message: string | null
          id: string
          status: string
          user_id: string | null
        }
        Insert: {
          action_details?: Json | null
          action_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          status: string
          user_id?: string | null
        }
        Update: {
          action_details?: Json | null
          action_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_history: {
        Row: {
          actions_taken: Json | null
          ai_analysis: Json | null
          ai_reasoning: string | null
          applied_label: string[] | null
          body_summary: string | null
          created_at: string
          draft_created: boolean | null
          draft_id: string | null
          gmail_message_id: string
          id: string
          label_validation_status: string | null
          priority_score: number | null
          processed_at: string
          received_at: string
          rule_reinforcement_status: string | null
          rule_reinforcement_suggestion: string | null
          sender: string
          subject: string | null
          suggested_new_label: string | null
          user_id: string
          whatsapp_notified: boolean | null
        }
        Insert: {
          actions_taken?: Json | null
          ai_analysis?: Json | null
          ai_reasoning?: string | null
          applied_label?: string[] | null
          body_summary?: string | null
          created_at?: string
          draft_created?: boolean | null
          draft_id?: string | null
          gmail_message_id: string
          id?: string
          label_validation_status?: string | null
          priority_score?: number | null
          processed_at?: string
          received_at: string
          rule_reinforcement_status?: string | null
          rule_reinforcement_suggestion?: string | null
          sender: string
          subject?: string | null
          suggested_new_label?: string | null
          user_id: string
          whatsapp_notified?: boolean | null
        }
        Update: {
          actions_taken?: Json | null
          ai_analysis?: Json | null
          ai_reasoning?: string | null
          applied_label?: string[] | null
          body_summary?: string | null
          created_at?: string
          draft_created?: boolean | null
          draft_id?: string | null
          gmail_message_id?: string
          id?: string
          label_validation_status?: string | null
          priority_score?: number | null
          processed_at?: string
          received_at?: string
          rule_reinforcement_status?: string | null
          rule_reinforcement_suggestion?: string | null
          sender?: string
          subject?: string | null
          suggested_new_label?: string | null
          user_id?: string
          whatsapp_notified?: boolean | null
        }
        Relationships: []
      }
      email_rules: {
        Row: {
          auto_action: string | null
          auto_reply: boolean | null
          create_draft: boolean | null
          created_at: string
          exclude_marketing: boolean | null
          exclude_newsletters: boolean | null
          id: string
          is_active: boolean
          keywords: string[] | null
          label_to_apply: string | null
          notify_urgent: boolean | null
          priority: string | null
          response_template: string | null
          rule_order: number
          sender_pattern: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_action?: string | null
          auto_reply?: boolean | null
          create_draft?: boolean | null
          created_at?: string
          exclude_marketing?: boolean | null
          exclude_newsletters?: boolean | null
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          label_to_apply?: string | null
          notify_urgent?: boolean | null
          priority?: string | null
          response_template?: string | null
          rule_order?: number
          sender_pattern?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_action?: string | null
          auto_reply?: boolean | null
          create_draft?: boolean | null
          created_at?: string
          exclude_marketing?: boolean | null
          exclude_newsletters?: boolean | null
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          label_to_apply?: string | null
          notify_urgent?: boolean | null
          priority?: string | null
          response_template?: string | null
          rule_order?: number
          sender_pattern?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_summaries: {
        Row: {
          created_at: string | null
          id: string
          period_end: string
          period_start: string
          sent_at: string | null
          summary_content: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          period_end: string
          period_start: string
          sent_at?: string | null
          summary_content?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          sent_at?: string | null
          summary_content?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_summary_schedules: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          schedule_times: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          schedule_times?: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          schedule_times?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      gmail_sync_state: {
        Row: {
          created_at: string
          last_synced_at: string
          sync_in_progress: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_synced_at?: string
          sync_in_progress?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_synced_at?: string
          sync_in_progress?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_api_configs: {
        Row: {
          created_at: string
          gmail_credentials: Json | null
          google_sheets_id: string | null
          id: string
          updated_at: string
          user_id: string
          whatsapp_api_token: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_recipient_number: string | null
          whatsapp_threshold: number | null
        }
        Insert: {
          created_at?: string
          gmail_credentials?: Json | null
          google_sheets_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
          whatsapp_api_token?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_recipient_number?: string | null
          whatsapp_threshold?: number | null
        }
        Update: {
          created_at?: string
          gmail_credentials?: Json | null
          google_sheets_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          whatsapp_api_token?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_recipient_number?: string | null
          whatsapp_threshold?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
