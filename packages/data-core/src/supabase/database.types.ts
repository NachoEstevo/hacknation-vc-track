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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          country_code: string | null
          created_at: string
          description: string | null
          id: string
          linkedin_url: string | null
          location: string | null
          name: string
          normalized_domain: string | null
          organization_type: string | null
          primary_industry: string | null
          size_band: string | null
          stable_key: string
          updated_at: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          name: string
          normalized_domain?: string | null
          organization_type?: string | null
          primary_industry?: string | null
          size_band?: string | null
          stable_key: string
          updated_at?: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          name?: string
          normalized_domain?: string | null
          organization_type?: string | null
          primary_industry?: string | null
          size_band?: string | null
          stable_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_founders: {
        Row: {
          company_id: string
          confidence: number
          created_at: string
          current_title: string | null
          founder_id: string
          id: string
          relationship_state: string
          resolution_reason: string
          source_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          confidence: number
          created_at?: string
          current_title?: string | null
          founder_id: string
          id?: string
          relationship_state: string
          resolution_reason: string
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          confidence?: number
          created_at?: string
          current_title?: string | null
          founder_id?: string
          id?: string
          relationship_state?: string
          resolution_reason?: string
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_founders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_founders_founder_id_fkey"
            columns: ["founder_id"]
            isOneToOne: false
            referencedRelation: "founders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_founders_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "company_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      company_sources: {
        Row: {
          captured_at: string
          company_id: string
          content_hash: string | null
          created_at: string
          external_id: string | null
          id: string
          raw_payload: Json
          source_type: string
          source_url: string | null
          verification_state: string
        }
        Insert: {
          captured_at: string
          company_id: string
          content_hash?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          raw_payload: Json
          source_type: string
          source_url?: string | null
          verification_state?: string
        }
        Update: {
          captured_at?: string
          company_id?: string
          content_hash?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          raw_payload?: Json
          source_type?: string
          source_url?: string | null
          verification_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_runs: {
        Row: {
          company_id: string | null
          completed_at: string | null
          connector: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          requested_by: string | null
          result_summary: Json | null
          started_at: string | null
          status: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          connector: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          requested_by?: string | null
          result_summary?: Json | null
          started_at?: string | null
          status: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          connector?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          requested_by?: string | null
          result_summary?: Json | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          captured_at: string
          company_id: string
          content_hash: string
          created_at: string
          evidence_type: string
          excerpt: string | null
          founder_id: string | null
          id: string
          private_object_path: string | null
          source_id: string | null
          source_url: string | null
          structured_payload: Json | null
          verification_state: string
          visibility: string
        }
        Insert: {
          captured_at: string
          company_id: string
          content_hash: string
          created_at?: string
          evidence_type: string
          excerpt?: string | null
          founder_id?: string | null
          id?: string
          private_object_path?: string | null
          source_id?: string | null
          source_url?: string | null
          structured_payload?: Json | null
          verification_state?: string
          visibility?: string
        }
        Update: {
          captured_at?: string
          company_id?: string
          content_hash?: string
          created_at?: string
          evidence_type?: string
          excerpt?: string | null
          founder_id?: string | null
          id?: string
          private_object_path?: string | null
          source_id?: string | null
          source_url?: string | null
          structured_payload?: Json | null
          verification_state?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_founder_id_fkey"
            columns: ["founder_id"]
            isOneToOne: false
            referencedRelation: "founders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "company_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_identities: {
        Row: {
          captured_at: string
          created_at: string
          external_id: string | null
          founder_id: string
          id: string
          profile_url: string | null
          provider: string
          raw_payload: Json | null
          username: string | null
          verification_state: string
        }
        Insert: {
          captured_at: string
          created_at?: string
          external_id?: string | null
          founder_id: string
          id?: string
          profile_url?: string | null
          provider: string
          raw_payload?: Json | null
          username?: string | null
          verification_state?: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          external_id?: string | null
          founder_id?: string
          id?: string
          profile_url?: string | null
          provider?: string
          raw_payload?: Json | null
          username?: string | null
          verification_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "founder_identities_founder_id_fkey"
            columns: ["founder_id"]
            isOneToOne: false
            referencedRelation: "founders"
            referencedColumns: ["id"]
          },
        ]
      }
      founders: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
