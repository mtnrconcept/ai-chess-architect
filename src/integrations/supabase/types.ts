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
      custom_chess_rules: {
        Row: {
          affected_pieces: string[]
          category: string
          conditions: Json | null
          created_at: string
          description: string
          effects: Json | null
          id: string
          is_active: boolean | null
          priority: number | null
          rule_id: string
          rule_name: string
          tags: string[] | null
          trigger: string
          updated_at: string
          usage_count: number | null
          user_id: string | null
          validation_rules: Json | null
        }
        Insert: {
          affected_pieces: string[]
          category: string
          conditions?: Json | null
          created_at?: string
          description: string
          effects?: Json | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          rule_id: string
          rule_name: string
          tags?: string[] | null
          trigger: string
          updated_at?: string
          usage_count?: number | null
          user_id?: string | null
          validation_rules?: Json | null
        }
        Update: {
          affected_pieces?: string[]
          category?: string
          conditions?: Json | null
          created_at?: string
          description?: string
          effects?: Json | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          rule_id?: string
          rule_name?: string
          tags?: string[] | null
          trigger?: string
          updated_at?: string
          usage_count?: number | null
          user_id?: string | null
          validation_rules?: Json | null
        }
        Relationships: []
      }
      lobbies: {
        Row: {
          active_rules: string[] | null
          created_at: string
          creator_id: string | null
          game_state: Json | null
          id: string
          is_active: boolean | null
          max_players: number | null
          mode: string
          name: string
          opponent_id: string | null
          opponent_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active_rules?: string[] | null
          created_at?: string
          creator_id?: string | null
          game_state?: Json | null
          id?: string
          is_active?: boolean | null
          max_players?: number | null
          mode?: string
          name: string
          opponent_id?: string | null
          opponent_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active_rules?: string[] | null
          created_at?: string
          creator_id?: string | null
          game_state?: Json | null
          id?: string
          is_active?: boolean | null
          max_players?: number | null
          mode?: string
          name?: string
          opponent_id?: string | null
          opponent_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tournament_leaderboard: {
        Row: {
          avatar_url: string | null
          draws: number
          joined_at: string
          last_active_at: string
          losses: number
          points: number
          tournament_id: string
          user_id: string
          wins: number
          display_name: string | null
        }
        Relationships: []
      }
      tournament_matches: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          lobby_id: string | null
          player1_id: string
          player2_id: string | null
          reported_by: string | null
          result: string | null
          started_at: string | null
          status: string
          table_number: number | null
          tournament_id: string
          updated_at: string
          variant_rules: string[] | null
          winner_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lobby_id?: string | null
          player1_id: string
          player2_id?: string | null
          reported_by?: string | null
          result?: string | null
          started_at?: string | null
          status?: string
          table_number?: number | null
          tournament_id: string
          updated_at?: string
          variant_rules?: string[] | null
          winner_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lobby_id?: string | null
          player1_id?: string
          player2_id?: string | null
          reported_by?: string | null
          result?: string | null
          started_at?: string | null
          status?: string
          table_number?: number | null
          tournament_id?: string
          updated_at?: string
          variant_rules?: string[] | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_matches_lobby_id_fkey"
            columns: ["lobby_id"]
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          }
        ]
      }
      tournament_overview: {
        Row: {
          active_match_count: number
          completed_match_count: number
          created_at: string
          description: string | null
          end_time: string
          id: string
          name: string
          player_count: number
          start_time: string
          status: string
          updated_at: string
          variant_lobby_id: string | null
          variant_name: string
          variant_rules: string[]
          variant_source: string | null
        }
        Relationships: []
      }
      tournament_registrations: {
        Row: {
          avatar_url: string | null
          current_match_id: string | null
          draws: number
          id: string
          is_waiting: boolean
          joined_at: string
          last_active_at: string
          losses: number
          points: number
          tournament_id: string
          user_id: string
          wins: number
          display_name: string | null
        }
        Insert: {
          avatar_url?: string | null
          current_match_id?: string | null
          draws?: number
          id?: string
          is_waiting?: boolean
          joined_at?: string
          last_active_at?: string
          losses?: number
          points?: number
          tournament_id: string
          user_id: string
          wins?: number
          display_name?: string | null
        }
        Update: {
          avatar_url?: string | null
          current_match_id?: string | null
          draws?: number
          id?: string
          is_waiting?: boolean
          joined_at?: string
          last_active_at?: string
          losses?: number
          points?: number
          tournament_id?: string
          user_id?: string
          wins?: number
          display_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_current_match_fkey"
            columns: ["current_match_id"]
            referencedRelation: "tournament_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          }
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          description: string | null
          end_time: string
          id: string
          name: string
          start_time: string
          status: string
          updated_at: string
          variant_lobby_id: string | null
          variant_name: string
          variant_rules: string[]
          variant_source: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_time: string
          id?: string
          name: string
          start_time: string
          status?: string
          updated_at?: string
          variant_lobby_id?: string | null
          variant_name: string
          variant_rules: string[]
          variant_source?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          end_time?: string
          id?: string
          name?: string
          start_time?: string
          status?: string
          updated_at?: string
          variant_lobby_id?: string | null
          variant_name?: string
          variant_rules?: string[]
          variant_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_variant_lobby_id_fkey"
            columns: ["variant_lobby_id"]
            referencedRelation: "lobbies"
            referencedColumns: ["id"]
          }
        ]
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
