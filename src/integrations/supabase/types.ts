export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      api_registry: {
        Row: {
          api_key_env: string | null;
          category: string | null;
          created_at: string;
          endpoint_url: string;
          id: string;
          is_active: boolean | null;
          last_checked_at: string | null;
          metadata: Json | null;
          service_name: string;
          status: string | null;
          updated_at: string;
        };
        Insert: {
          api_key_env?: string | null;
          category?: string | null;
          created_at?: string;
          endpoint_url: string;
          id?: string;
          is_active?: boolean | null;
          last_checked_at?: string | null;
          metadata?: Json | null;
          service_name: string;
          status?: string | null;
          updated_at?: string;
        };
        Update: {
          api_key_env?: string | null;
          category?: string | null;
          created_at?: string;
          endpoint_url?: string;
          id?: string;
          is_active?: boolean | null;
          last_checked_at?: string | null;
          metadata?: Json | null;
          service_name?: string;
          status?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      chess_rules: {
        Row: {
          affected_pieces: string[] | null;
          ai_model: string | null;
          assets: Json | null;
          category: string;
          complexity_level: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          generation_duration_ms: number | null;
          id: string;
          is_functional: boolean | null;
          priority: number | null;
          prompt: string | null;
          prompt_key: string | null;
          rule_id: string;
          rule_json: Json;
          rule_name: string;
          source: Database["public"]["Enums"]["rule_source"];
          status: string;
          tags: string[] | null;
          updated_at: string;
          usage_count: number | null;
          validation_notes: string | null;
        };
        Insert: {
          affected_pieces?: string[] | null;
          ai_model?: string | null;
          assets?: Json | null;
          category: string;
          complexity_level?: string | null;
          created_at?: string;
          created_by?: string | null;
          description: string;
          generation_duration_ms?: number | null;
          id?: string;
          is_functional?: boolean | null;
          priority?: number | null;
          prompt?: string | null;
          prompt_key?: string | null;
          rule_id: string;
          rule_json: Json;
          rule_name: string;
          source?: Database["public"]["Enums"]["rule_source"];
          status?: string;
          tags?: string[] | null;
          updated_at?: string;
          usage_count?: number | null;
          validation_notes?: string | null;
        };
        Update: {
          affected_pieces?: string[] | null;
          ai_model?: string | null;
          assets?: Json | null;
          category?: string;
          complexity_level?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          generation_duration_ms?: number | null;
          id?: string;
          is_functional?: boolean | null;
          priority?: number | null;
          prompt?: string | null;
          prompt_key?: string | null;
          rule_id?: string;
          rule_json?: Json;
          rule_name?: string;
          source?: Database["public"]["Enums"]["rule_source"];
          status?: string;
          tags?: string[] | null;
          updated_at?: string;
          usage_count?: number | null;
          validation_notes?: string | null;
        };
        Relationships: [];
      };
      custom_chess_rules: {
        Row: {
          affected_pieces: string[];
          category: string;
          conditions: Json | null;
          created_at: string;
          description: string;
          effects: Json | null;
          id: string;
          is_active: boolean | null;
          priority: number | null;
          rule_id: string;
          rule_name: string;
          tags: string[] | null;
          trigger: string;
          updated_at: string;
          usage_count: number | null;
          user_id: string | null;
          validation_rules: Json | null;
        };
        Insert: {
          affected_pieces: string[];
          category: string;
          conditions?: Json | null;
          created_at?: string;
          description: string;
          effects?: Json | null;
          id?: string;
          is_active?: boolean | null;
          priority?: number | null;
          rule_id: string;
          rule_name: string;
          tags?: string[] | null;
          trigger: string;
          updated_at?: string;
          usage_count?: number | null;
          user_id?: string | null;
          validation_rules?: Json | null;
        };
        Update: {
          affected_pieces?: string[];
          category?: string;
          conditions?: Json | null;
          created_at?: string;
          description?: string;
          effects?: Json | null;
          id?: string;
          is_active?: boolean | null;
          priority?: number | null;
          rule_id?: string;
          rule_name?: string;
          tags?: string[] | null;
          trigger?: string;
          updated_at?: string;
          usage_count?: number | null;
          user_id?: string | null;
          validation_rules?: Json | null;
        };
        Relationships: [];
      };
      lobbies: {
        Row: {
          active_rules: string[] | null;
          created_at: string;
          creator_id: string | null;
          game_state: Json | null;
          id: string;
          is_active: boolean | null;
          max_players: number | null;
          mode: string | null;
          name: string;
          opponent_id: string | null;
          opponent_name: string | null;
          status: string | null;
          updated_at: string;
        };
        Insert: {
          active_rules?: string[] | null;
          created_at?: string;
          creator_id?: string | null;
          game_state?: Json | null;
          id?: string;
          is_active?: boolean | null;
          max_players?: number | null;
          mode?: string | null;
          name: string;
          opponent_id?: string | null;
          opponent_name?: string | null;
          status?: string | null;
          updated_at?: string;
        };
        Update: {
          active_rules?: string[] | null;
          created_at?: string;
          creator_id?: string | null;
          game_state?: Json | null;
          id?: string;
          is_active?: boolean | null;
          max_players?: number | null;
          mode?: string | null;
          name?: string;
          opponent_id?: string | null;
          opponent_name?: string | null;
          status?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      preset_rules: {
        Row: {
          category: string;
          complexity_level: string | null;
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          is_functional: boolean | null;
          prompt_example: string | null;
          rule_id: string;
          rule_json: Json;
          rule_name: string;
          tags: string[] | null;
          updated_at: string;
          validation_notes: string | null;
          version: string | null;
        };
        Insert: {
          category: string;
          complexity_level?: string | null;
          created_at?: string;
          created_by?: string | null;
          description: string;
          id?: string;
          is_functional?: boolean | null;
          prompt_example?: string | null;
          rule_id: string;
          rule_json: Json;
          rule_name: string;
          tags?: string[] | null;
          updated_at?: string;
          validation_notes?: string | null;
          version?: string | null;
        };
        Update: {
          category?: string;
          complexity_level?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          is_functional?: boolean | null;
          prompt_example?: string | null;
          rule_id?: string;
          rule_json?: Json;
          rule_name?: string;
          tags?: string[] | null;
          updated_at?: string;
          validation_notes?: string | null;
          version?: string | null;
        };
        Relationships: [];
      };
      rules_lobby: {
        Row: {
          ai_model: string | null;
          assets: Json | null;
          created_at: string;
          created_by: string | null;
          generation_duration_ms: number | null;
          id: string;
          prompt: string;
          prompt_key: string | null;
          rule_json: Json;
          status: string;
          updated_at: string;
        };
        Insert: {
          ai_model?: string | null;
          assets?: Json | null;
          created_at?: string;
          created_by?: string | null;
          generation_duration_ms?: number | null;
          id?: string;
          prompt: string;
          prompt_key?: string | null;
          rule_json: Json;
          status?: string;
          updated_at?: string;
        };
        Update: {
          ai_model?: string | null;
          assets?: Json | null;
          created_at?: string;
          created_by?: string | null;
          generation_duration_ms?: number | null;
          id?: string;
          prompt?: string;
          prompt_key?: string | null;
          rule_json?: Json;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tournament_matches: {
        Row: {
          completed_at: string | null;
          created_at: string;
          game_data: Json | null;
          id: string;
          player1_id: string;
          player1_name: string | null;
          player2_id: string | null;
          player2_name: string | null;
          result: string | null;
          round: number;
          started_at: string | null;
          status: string;
          table_number: number | null;
          tournament_id: string;
          updated_at: string;
          variant_rules: string[] | null;
          winner_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          game_data?: Json | null;
          id?: string;
          player1_id: string;
          player1_name?: string | null;
          player2_id?: string | null;
          player2_name?: string | null;
          result?: string | null;
          round?: number;
          started_at?: string | null;
          status?: string;
          table_number?: number | null;
          tournament_id: string;
          updated_at?: string;
          variant_rules?: string[] | null;
          winner_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          game_data?: Json | null;
          id?: string;
          player1_id?: string;
          player1_name?: string | null;
          player2_id?: string | null;
          player2_name?: string | null;
          result?: string | null;
          round?: number;
          started_at?: string | null;
          status?: string;
          table_number?: number | null;
          tournament_id?: string;
          updated_at?: string;
          variant_rules?: string[] | null;
          winner_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournament_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_matches_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      tournament_registrations: {
        Row: {
          avatar_url: string | null;
          current_match_id: string | null;
          display_name: string | null;
          draws: number | null;
          id: string;
          is_waiting: boolean | null;
          joined_at: string | null;
          last_active_at: string | null;
          losses: number | null;
          match_id: string | null;
          points: number | null;
          rating: number | null;
          registered_at: string;
          score: number | null;
          status: string;
          tournament_id: string;
          updated_at: string;
          user_id: string;
          wins: number | null;
        };
        Insert: {
          avatar_url?: string | null;
          current_match_id?: string | null;
          display_name?: string | null;
          draws?: number | null;
          id?: string;
          is_waiting?: boolean | null;
          joined_at?: string | null;
          last_active_at?: string | null;
          losses?: number | null;
          match_id?: string | null;
          points?: number | null;
          rating?: number | null;
          registered_at?: string;
          score?: number | null;
          status?: string;
          tournament_id: string;
          updated_at?: string;
          user_id: string;
          wins?: number | null;
        };
        Update: {
          avatar_url?: string | null;
          current_match_id?: string | null;
          display_name?: string | null;
          draws?: number | null;
          id?: string;
          is_waiting?: boolean | null;
          joined_at?: string | null;
          last_active_at?: string | null;
          losses?: number | null;
          match_id?: string | null;
          points?: number | null;
          rating?: number | null;
          registered_at?: string;
          score?: number | null;
          status?: string;
          tournament_id?: string;
          updated_at?: string;
          user_id?: string;
          wins?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_current_match_id_fkey";
            columns: ["current_match_id"];
            isOneToOne: false;
            referencedRelation: "tournament_matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_registrations_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "tournament_matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournament_overview";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey";
            columns: ["tournament_id"];
            isOneToOne: false;
            referencedRelation: "tournaments";
            referencedColumns: ["id"];
          },
        ];
      };
      tournaments: {
        Row: {
          created_at: string;
          description: string | null;
          ends_at: string;
          id: string;
          max_participants: number | null;
          starts_at: string;
          status: string;
          title: string;
          updated_at: string;
          variant_lobby_id: string | null;
          variant_name: string;
          variant_rules: string[];
          variant_source: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          ends_at: string;
          id?: string;
          max_participants?: number | null;
          starts_at: string;
          status?: string;
          title: string;
          updated_at?: string;
          variant_lobby_id?: string | null;
          variant_name: string;
          variant_rules?: string[];
          variant_source?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          ends_at?: string;
          id?: string;
          max_participants?: number | null;
          starts_at?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          variant_lobby_id?: string | null;
          variant_name?: string;
          variant_rules?: string[];
          variant_source?: string | null;
        };
        Relationships: [];
      };
      user_games: {
        Row: {
          accuracy: number | null;
          analysis_overview: Json | null;
          coach_summary: string | null;
          created_at: string;
          duration_seconds: number | null;
          id: string;
          metadata: Json | null;
          move_history: Json;
          opponent_name: string | null;
          opponent_type: string;
          player_color: string;
          result: string;
          starting_board: Json | null;
          time_control: string | null;
          total_moves: number | null;
          user_id: string;
          variant_name: string | null;
        };
        Insert: {
          accuracy?: number | null;
          analysis_overview?: Json | null;
          coach_summary?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          metadata?: Json | null;
          move_history: Json;
          opponent_name?: string | null;
          opponent_type: string;
          player_color: string;
          result: string;
          starting_board?: Json | null;
          time_control?: string | null;
          total_moves?: number | null;
          user_id: string;
          variant_name?: string | null;
        };
        Update: {
          accuracy?: number | null;
          analysis_overview?: Json | null;
          coach_summary?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          metadata?: Json | null;
          move_history?: Json;
          opponent_name?: string | null;
          opponent_type?: string;
          player_color?: string;
          result?: string;
          starting_board?: Json | null;
          time_control?: string | null;
          total_moves?: number | null;
          user_id?: string;
          variant_name?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      ai_rules_view: {
        Row: {
          affected_pieces: string[] | null;
          ai_model: string | null;
          assets: Json | null;
          category: string | null;
          complexity_level: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          generation_duration_ms: number | null;
          id: string | null;
          is_functional: boolean | null;
          priority: number | null;
          prompt: string | null;
          prompt_key: string | null;
          rule_id: string | null;
          rule_json: Json | null;
          rule_name: string | null;
          source: Database["public"]["Enums"]["rule_source"] | null;
          status: string | null;
          tags: string[] | null;
          updated_at: string | null;
          usage_count: number | null;
          validation_notes: string | null;
        };
        Insert: {
          affected_pieces?: string[] | null;
          ai_model?: string | null;
          assets?: Json | null;
          category?: string | null;
          complexity_level?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          generation_duration_ms?: number | null;
          id?: string | null;
          is_functional?: boolean | null;
          priority?: number | null;
          prompt?: string | null;
          prompt_key?: string | null;
          rule_id?: string | null;
          rule_json?: Json | null;
          rule_name?: string | null;
          source?: Database["public"]["Enums"]["rule_source"] | null;
          status?: string | null;
          tags?: string[] | null;
          updated_at?: string | null;
          usage_count?: number | null;
          validation_notes?: string | null;
        };
        Update: {
          affected_pieces?: string[] | null;
          ai_model?: string | null;
          assets?: Json | null;
          category?: string | null;
          complexity_level?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          generation_duration_ms?: number | null;
          id?: string | null;
          is_functional?: boolean | null;
          priority?: number | null;
          prompt?: string | null;
          prompt_key?: string | null;
          rule_id?: string | null;
          rule_json?: Json | null;
          rule_name?: string | null;
          source?: Database["public"]["Enums"]["rule_source"] | null;
          status?: string | null;
          tags?: string[] | null;
          updated_at?: string | null;
          usage_count?: number | null;
          validation_notes?: string | null;
        };
        Relationships: [];
      };
      custom_rules: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          name: string;
          rule_metadata: Json;
          status: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: number;
          name: string;
          rule_metadata: Json;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: number;
          name?: string;
          rule_metadata?: Json;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      custom_rules_view: {
        Row: {
          affected_pieces: string[] | null;
          ai_model: string | null;
          assets: Json | null;
          category: string | null;
          complexity_level: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          generation_duration_ms: number | null;
          id: string | null;
          is_functional: boolean | null;
          priority: number | null;
          prompt: string | null;
          prompt_key: string | null;
          rule_id: string | null;
          rule_json: Json | null;
          rule_name: string | null;
          source: Database["public"]["Enums"]["rule_source"] | null;
          status: string | null;
          tags: string[] | null;
          updated_at: string | null;
          usage_count: number | null;
          validation_notes: string | null;
        };
        Insert: {
          affected_pieces?: string[] | null;
          ai_model?: string | null;
          assets?: Json | null;
          category?: string | null;
          complexity_level?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          generation_duration_ms?: number | null;
          id?: string | null;
          is_functional?: boolean | null;
          priority?: number | null;
          prompt?: string | null;
          prompt_key?: string | null;
          rule_id?: string | null;
          rule_json?: Json | null;
          rule_name?: string | null;
          source?: Database["public"]["Enums"]["rule_source"] | null;
          status?: string | null;
          tags?: string[] | null;
          updated_at?: string | null;
          usage_count?: number | null;
          validation_notes?: string | null;
        };
        Update: {
          affected_pieces?: string[] | null;
          ai_model?: string | null;
          assets?: Json | null;
          category?: string | null;
          complexity_level?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          generation_duration_ms?: number | null;
          id?: string | null;
          is_functional?: boolean | null;
          priority?: number | null;
          prompt?: string | null;
          prompt_key?: string | null;
          rule_id?: string | null;
          rule_json?: Json | null;
          rule_name?: string | null;
          source?: Database["public"]["Enums"]["rule_source"] | null;
          status?: string | null;
          tags?: string[] | null;
          updated_at?: string | null;
          usage_count?: number | null;
          validation_notes?: string | null;
        };
        Relationships: [];
      };
      preset_rules_view: {
        Row: {
          affected_pieces: string[] | null;
          ai_model: string | null;
          assets: Json | null;
          category: string | null;
          complexity_level: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          generation_duration_ms: number | null;
          id: string | null;
          is_functional: boolean | null;
          priority: number | null;
          prompt: string | null;
          prompt_key: string | null;
          rule_id: string | null;
          rule_json: Json | null;
          rule_name: string | null;
          source: Database["public"]["Enums"]["rule_source"] | null;
          status: string | null;
          tags: string[] | null;
          updated_at: string | null;
          usage_count: number | null;
          validation_notes: string | null;
        };
        Insert: {
          affected_pieces?: string[] | null;
          ai_model?: string | null;
          assets?: Json | null;
          category?: string | null;
          complexity_level?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          generation_duration_ms?: number | null;
          id?: string | null;
          is_functional?: boolean | null;
          priority?: number | null;
          prompt?: string | null;
          prompt_key?: string | null;
          rule_id?: string | null;
          rule_json?: Json | null;
          rule_name?: string | null;
          source?: Database["public"]["Enums"]["rule_source"] | null;
          status?: string | null;
          tags?: string[] | null;
          updated_at?: string | null;
          usage_count?: number | null;
          validation_notes?: string | null;
        };
        Update: {
          affected_pieces?: string[] | null;
          ai_model?: string | null;
          assets?: Json | null;
          category?: string | null;
          complexity_level?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          generation_duration_ms?: number | null;
          id?: string | null;
          is_functional?: boolean | null;
          priority?: number | null;
          prompt?: string | null;
          prompt_key?: string | null;
          rule_id?: string | null;
          rule_json?: Json | null;
          rule_name?: string | null;
          source?: Database["public"]["Enums"]["rule_source"] | null;
          status?: string | null;
          tags?: string[] | null;
          updated_at?: string | null;
          usage_count?: number | null;
          validation_notes?: string | null;
        };
        Relationships: [];
      };
      tournament_overview: {
        Row: {
          active_match_count: number | null;
          completed_match_count: number | null;
          created_at: string | null;
          description: string | null;
          ends_at: string | null;
          id: string | null;
          max_participants: number | null;
          player_count: number | null;
          starts_at: string | null;
          status: string | null;
          title: string | null;
          updated_at: string | null;
          variant_lobby_id: string | null;
          variant_name: string | null;
          variant_rules: string[] | null;
          variant_source: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      rule_source: "preset" | "custom" | "ai_generated";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      rule_source: ["preset", "custom", "ai_generated"],
    },
  },
} as const;
