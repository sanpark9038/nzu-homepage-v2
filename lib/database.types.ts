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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      eloboard_matches: {
        Row: {
          created_at: string | null
          id: string
          is_win: boolean | null
          map: string | null
          match_date: string | null
          note: string | null
          opponent_entity_id: string | null
          opponent_name: string
          opponent_race: string | null
          player_name: string
          result_text: string | null
          gender: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_win?: boolean | null
          map?: string | null
          match_date?: string | null
          note?: string | null
          opponent_entity_id?: string | null
          opponent_name: string
          opponent_race?: string | null
          player_name: string
          result_text?: string | null
          gender?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_win?: boolean | null
          map?: string | null
          match_date?: string | null
          note?: string | null
          opponent_entity_id?: string | null
          opponent_name?: string
          opponent_race?: string | null
          player_name?: string
          result_text?: string | null
          gender?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          created_at: string
          event_name: string | null
          id: string
          is_university_battle: boolean | null
          map_name: string | null
          match_date: string | null
          player1_id: string
          player2_id: string
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          event_name?: string | null
          id?: string
          is_university_battle?: boolean | null
          map_name?: string | null
          match_date?: string | null
          player1_id: string
          player2_id: string
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string | null
          id?: string
          is_university_battle?: boolean | null
          map_name?: string | null
          match_date?: string | null
          player1_id?: string
          player2_id?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_media: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          type: string
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          type: string
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          type?: string
          url?: string
        }
        Relationships: []
      }
      board_posts: {
        Row: {
          author_name: string
          author_provider: string | null
          author_provider_user_id: string | null
          category: string | null
          content: string
          created_at: string | null
          download_url: string | null
          id: string
          image_url: string | null
          published: boolean | null
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          author_name: string
          author_provider?: string | null
          author_provider_user_id?: string | null
          category?: string | null
          content: string
          created_at?: string | null
          download_url?: string | null
          id?: string
          image_url?: string | null
          published?: boolean | null
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          author_name?: string
          author_provider?: string | null
          author_provider_user_id?: string | null
          category?: string | null
          content?: string
          created_at?: string | null
          download_url?: string | null
          id?: string
          image_url?: string | null
          published?: boolean | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      players: {
        Row: {
          broadcast_title: string | null
          broadcast_url: string | null
          channel_profile_image_url: string | null
          created_at: string | null
          detailed_stats: Json | null
          elo_point: number | null
          eloboard_id: string | null
          id: string
          is_live: boolean | null
          last_synced_at: string | null
          live_thumbnail_url: string | null
          match_history: Json | null
          name: string
          nickname: string | null
          photo_url: string | null
          race: string
          soop_id: string | null
          tier: string
          tier_rank: number | null
          total_losses: number | null
          total_wins: number | null
          university: string | null
          win_rate: number | null
          gender: string | null
          last_checked_at: string | null
          last_match_at: string | null
          last_changed_at: string | null
          check_priority: string | null
          check_interval_days: number | null
        }
        Insert: {
          broadcast_title?: string | null
          broadcast_url?: string | null
          channel_profile_image_url?: string | null
          created_at?: string | null
          detailed_stats?: Json | null
          elo_point?: number | null
          eloboard_id?: string | null
          id?: string
          is_live?: boolean | null
          last_synced_at?: string | null
          live_thumbnail_url?: string | null
          match_history?: Json | null
          name: string
          nickname?: string | null
          photo_url?: string | null
          race: string
          soop_id?: string | null
          tier: string
          tier_rank?: number | null
          total_losses?: number | null
          total_wins?: number | null
          university?: string | null
          win_rate?: number | null
          gender?: string | null
          last_checked_at?: string | null
          last_match_at?: string | null
          last_changed_at?: string | null
          check_priority?: string | null
          check_interval_days?: number | null
        }
        Update: {
          broadcast_title?: string | null
          broadcast_url?: string | null
          channel_profile_image_url?: string | null
          created_at?: string | null
          detailed_stats?: Json | null
          elo_point?: number | null
          eloboard_id?: string | null
          id?: string
          is_live?: boolean | null
          last_synced_at?: string | null
          live_thumbnail_url?: string | null
          match_history?: Json | null
          name?: string
          nickname?: string | null
          photo_url?: string | null
          race?: string
          soop_id?: string | null
          tier?: string
          tier_rank?: number | null
          total_losses?: number | null
          total_wins?: number | null
          university?: string | null
          win_rate?: number | null
          gender?: string | null
          last_checked_at?: string | null
          last_match_at?: string | null
          last_changed_at?: string | null
          check_priority?: string | null
          check_interval_days?: number | null
        }
        Relationships: []
      }
      roster_admin_corrections: {
        Row: {
          entity_id: string
          excluded: boolean
          exclusion_reason: string | null
          manual_lock: boolean
          manual_mode: string | null
          name: string | null
          note: string | null
          race: string | null
          resume_requested_at: string | null
          team_code: string | null
          team_name: string | null
          tier: string | null
          updated_at: string
          wr_id: number | null
        }
        Insert: {
          entity_id: string
          excluded?: boolean
          exclusion_reason?: string | null
          manual_lock?: boolean
          manual_mode?: string | null
          name?: string | null
          note?: string | null
          race?: string | null
          resume_requested_at?: string | null
          team_code?: string | null
          team_name?: string | null
          tier?: string | null
          updated_at?: string
          wr_id?: number | null
        }
        Update: {
          entity_id?: string
          excluded?: boolean
          exclusion_reason?: string | null
          manual_lock?: boolean
          manual_mode?: string | null
          name?: string | null
          note?: string | null
          race?: string | null
          resume_requested_at?: string | null
          team_code?: string | null
          team_name?: string | null
          tier?: string | null
          updated_at?: string
          wr_id?: number | null
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
