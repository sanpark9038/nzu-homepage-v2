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
          external_link_url: string | null
          id: string
          image_url: string | null
          published: boolean | null
          schedule_date: string | null
          schedule_display_name: string | null
          schedule_start_time: string | null
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
          external_link_url?: string | null
          id?: string
          image_url?: string | null
          published?: boolean | null
          schedule_date?: string | null
          schedule_display_name?: string | null
          schedule_start_time?: string | null
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
          external_link_url?: string | null
          id?: string
          image_url?: string | null
          published?: boolean | null
          schedule_date?: string | null
          schedule_display_name?: string | null
          schedule_start_time?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      board_comments: {
        Row: {
          id: string
          post_id: string
          author_id: string
          author_name: string
          content: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
        }
        Insert: {
          id?: string
          post_id: string
          author_id: string
          author_name: string
          content: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Update: {
          id?: string
          post_id?: string
          author_id?: string
          author_name?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_matches: {
        Row: {
          archived_at: string | null
          close_at: string
          created_at: string
          display_order: number
          entry_matchups: Json
          entry_order_status: string
          id: string
          match_type: string
          result_published_at: string | null
          result_team_code: string | null
          start_at: string
          start_time_tbd: boolean
          status: string
          team_a_code: string
          team_a_name: string | null
          team_a_player_ids: string[]
          team_b_code: string
          team_b_name: string | null
          team_b_player_ids: string[]
          team_mode: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          close_at: string
          created_at?: string
          display_order?: number
          entry_matchups?: Json
          entry_order_status?: string
          id?: string
          match_type?: string
          result_published_at?: string | null
          result_team_code?: string | null
          start_at: string
          start_time_tbd?: boolean
          status?: string
          team_a_code: string
          team_a_name?: string | null
          team_a_player_ids?: string[]
          team_b_code: string
          team_b_name?: string | null
          team_b_player_ids?: string[]
          team_mode?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          close_at?: string
          created_at?: string
          display_order?: number
          entry_matchups?: Json
          entry_order_status?: string
          id?: string
          match_type?: string
          result_published_at?: string | null
          result_team_code?: string | null
          start_at?: string
          start_time_tbd?: boolean
          status?: string
          team_a_code?: string
          team_a_name?: string | null
          team_a_player_ids?: string[]
          team_b_code?: string
          team_b_name?: string | null
          team_b_player_ids?: string[]
          team_mode?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      prediction_votes: {
        Row: {
          change_count: number
          created_at: string
          id: string
          match_id: string
          picked_player_id: string | null
          picked_team_code: string | null
          updated_at: string
          voter_avatar_url: string | null
          voter_display_name: string | null
          voter_id: string
          voter_provider: string | null
          voter_provider_user_id: string | null
        }
        Insert: {
          change_count?: number
          created_at?: string
          id?: string
          match_id: string
          picked_player_id?: string | null
          picked_team_code?: string | null
          updated_at?: string
          voter_avatar_url?: string | null
          voter_display_name?: string | null
          voter_id: string
          voter_provider?: string | null
          voter_provider_user_id?: string | null
        }
        Update: {
          change_count?: number
          created_at?: string
          id?: string
          match_id?: string
          picked_player_id?: string | null
          picked_team_code?: string | null
          updated_at?: string
          voter_avatar_url?: string | null
          voter_display_name?: string | null
          voter_id?: string
          voter_provider?: string | null
          voter_provider_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prediction_votes_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "prediction_matches"
            referencedColumns: ["id"]
          },
        ]
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
      soop_live_sync_runs: {
        Row: {
          id: string
          started_at: string
          finished_at: string | null
          status: string
          source: string | null
          players_total: number
          live_count: number
          offline_count: number
          changed_count: number
          unresolved_count: number
          page_limit: number | null
          pages_scanned: number | null
          error_message: string | null
          details: Json
        }
        Insert: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status: string
          source?: string | null
          players_total?: number
          live_count?: number
          offline_count?: number
          changed_count?: number
          unresolved_count?: number
          page_limit?: number | null
          pages_scanned?: number | null
          error_message?: string | null
          details?: Json
        }
        Update: {
          id?: string
          started_at?: string
          finished_at?: string | null
          status?: string
          source?: string | null
          players_total?: number
          live_count?: number
          offline_count?: number
          changed_count?: number
          unresolved_count?: number
          page_limit?: number | null
          pages_scanned?: number | null
          error_message?: string | null
          details?: Json
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
      board_visible_comment_counts: {
        Args: {
          post_ids: string[]
        }
        Returns: {
          post_id: string
          comment_count: number
        }[]
      }
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
