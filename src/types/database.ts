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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_generations: {
        Row: {
          brand_context_snapshot: Json
          completed_at: string | null
          content_id: string | null
          created_at: string
          credit_cost: number
          credit_ledger_id: string | null
          error_code: string | null
          error_message: string | null
          format: Database["public"]["Enums"]["content_format"] | null
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          history_snapshot: Json
          id: string
          model: string
          objective: string | null
          provider: string
          request_payload: Json
          result_asset_paths: string[]
          result_payload: Json | null
          result_text: string | null
          status: Database["public"]["Enums"]["ai_generation_status"]
          task_id: string | null
          theme_input: string
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          brand_context_snapshot?: Json
          completed_at?: string | null
          content_id?: string | null
          created_at?: string
          credit_cost: number
          credit_ledger_id?: string | null
          error_code?: string | null
          error_message?: string | null
          format?: Database["public"]["Enums"]["content_format"] | null
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          history_snapshot?: Json
          id?: string
          model: string
          objective?: string | null
          provider: string
          request_payload?: Json
          result_asset_paths?: string[]
          result_payload?: Json | null
          result_text?: string | null
          status?: Database["public"]["Enums"]["ai_generation_status"]
          task_id?: string | null
          theme_input: string
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          brand_context_snapshot?: Json
          completed_at?: string | null
          content_id?: string | null
          created_at?: string
          credit_cost?: number
          credit_ledger_id?: string | null
          error_code?: string | null
          error_message?: string | null
          format?: Database["public"]["Enums"]["content_format"] | null
          generation_type?: Database["public"]["Enums"]["ai_generation_type"]
          history_snapshot?: Json
          id?: string
          model?: string
          objective?: string | null
          provider?: string
          request_payload?: Json
          result_asset_paths?: string[]
          result_payload?: Json | null
          result_text?: string | null
          status?: Database["public"]["Enums"]["ai_generation_status"]
          task_id?: string | null
          theme_input?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generations_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_credit_ledger_id_fkey"
            columns: ["credit_ledger_id"]
            isOneToOne: false
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_operation_costs: {
        Row: {
          credit_cost: number
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          updated_at: string
        }
        Insert: {
          credit_cost: number
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          updated_at?: string
        }
        Update: {
          credit_cost?: number
          generation_type?: Database["public"]["Enums"]["ai_generation_type"]
          updated_at?: string
        }
        Relationships: []
      }
      ai_webhook_events: {
        Row: {
          created_at: string
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          signature: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload: Json
          processed_at?: string | null
          provider: string
          signature: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          signature?: string
          task_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          resource_id?: string | null
          resource_type?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_profiles: {
        Row: {
          audience: Json
          avatar_path: string | null
          company_name: string | null
          content_strategy: Json
          created_at: string
          description: string | null
          differentiators: string | null
          id: string
          instagram_handle: string | null
          location: string | null
          logo_path: string | null
          onboarding_completed_at: string | null
          onboarding_step: number
          primary_language: string
          problems_solved: string | null
          products: string | null
          secondary_logo_path: string | null
          segment: string | null
          services: string | null
          updated_at: string
          visual_identity: Json
          vocabulary: Json
          voice: Json
          website: string | null
          workspace_id: string
        }
        Insert: {
          audience?: Json
          avatar_path?: string | null
          company_name?: string | null
          content_strategy?: Json
          created_at?: string
          description?: string | null
          differentiators?: string | null
          id?: string
          instagram_handle?: string | null
          location?: string | null
          logo_path?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          primary_language?: string
          problems_solved?: string | null
          products?: string | null
          secondary_logo_path?: string | null
          segment?: string | null
          services?: string | null
          updated_at?: string
          visual_identity?: Json
          vocabulary?: Json
          voice?: Json
          website?: string | null
          workspace_id: string
        }
        Update: {
          audience?: Json
          avatar_path?: string | null
          company_name?: string | null
          content_strategy?: Json
          created_at?: string
          description?: string | null
          differentiators?: string | null
          id?: string
          instagram_handle?: string | null
          location?: string | null
          logo_path?: string | null
          onboarding_completed_at?: string | null
          onboarding_step?: number
          primary_language?: string
          problems_solved?: string | null
          products?: string | null
          secondary_logo_path?: string | null
          segment?: string | null
          services?: string | null
          updated_at?: string
          visual_identity?: Json
          vocabulary?: Json
          voice?: Json
          website?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_elements: {
        Row: {
          content: Json
          created_at: string
          height: number
          hidden: boolean
          id: string
          locked: boolean
          page_id: string
          position_x: number
          position_y: number
          rotation: number
          style: Json
          type: Database["public"]["Enums"]["content_element_type"]
          updated_at: string
          width: number
          z_index: number
        }
        Insert: {
          content?: Json
          created_at?: string
          height?: number
          hidden?: boolean
          id?: string
          locked?: boolean
          page_id: string
          position_x?: number
          position_y?: number
          rotation?: number
          style?: Json
          type: Database["public"]["Enums"]["content_element_type"]
          updated_at?: string
          width?: number
          z_index?: number
        }
        Update: {
          content?: Json
          created_at?: string
          height?: number
          hidden?: boolean
          id?: string
          locked?: boolean
          page_id?: string
          position_x?: number
          position_y?: number
          rotation?: number
          style?: Json
          type?: Database["public"]["Enums"]["content_element_type"]
          updated_at?: string
          width?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_elements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "content_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pages: {
        Row: {
          background_color: string
          content_id: string
          created_at: string
          height: number
          id: string
          position: number
          updated_at: string
          width: number
        }
        Insert: {
          background_color?: string
          content_id: string
          created_at?: string
          height?: number
          id?: string
          position?: number
          updated_at?: string
          width?: number
        }
        Update: {
          background_color?: string
          content_id?: string
          created_at?: string
          height?: number
          id?: string
          position?: number
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_pages_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          content_id: string
          created_at: string
          created_by: string | null
          id: string
          snapshot: Json
        }
        Insert: {
          content_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot: Json
        }
        Update: {
          content_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          deleted_at: string | null
          duplicated_from: string | null
          format: Database["public"]["Enums"]["content_format"]
          hashtags: string[]
          id: string
          origin: Database["public"]["Enums"]["content_origin"]
          published_at: string | null
          radar_opportunity_id: string | null
          rejection_reason: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          deleted_at?: string | null
          duplicated_from?: string | null
          format?: Database["public"]["Enums"]["content_format"]
          hashtags?: string[]
          id?: string
          origin?: Database["public"]["Enums"]["content_origin"]
          published_at?: string | null
          radar_opportunity_id?: string | null
          rejection_reason?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          cta?: string | null
          deleted_at?: string | null
          duplicated_from?: string | null
          format?: Database["public"]["Enums"]["content_format"]
          hashtags?: string[]
          id?: string
          origin?: Database["public"]["Enums"]["content_origin"]
          published_at?: string | null
          radar_opportunity_id?: string | null
          rejection_reason?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contents_duplicated_from_fkey"
            columns: ["duplicated_from"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contents_radar_opportunity_id_fkey"
            columns: ["radar_opportunity_id"]
            isOneToOne: false
            referencedRelation: "radar_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_accounts: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          account_id: string
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          operation: string
          reference_id: string | null
          reference_type: string | null
          workspace_id: string
        }
        Insert: {
          account_id: string
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          operation: string
          reference_id?: string | null
          reference_type?: string | null
          workspace_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          operation?: string
          reference_id?: string | null
          reference_type?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "credit_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_accounts: {
        Row: {
          access_token_encrypted: string | null
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          ig_user_id: string
          last_connected_at: string | null
          name: string | null
          profile_picture_url: string | null
          status: Database["public"]["Enums"]["instagram_account_status"]
          token_expires_at: string | null
          updated_at: string
          username: string | null
          workspace_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          ig_user_id: string
          last_connected_at?: string | null
          name?: string | null
          profile_picture_url?: string | null
          status?: Database["public"]["Enums"]["instagram_account_status"]
          token_expires_at?: string | null
          updated_at?: string
          username?: string | null
          workspace_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          ig_user_id?: string
          last_connected_at?: string | null
          name?: string | null
          profile_picture_url?: string | null
          status?: Database["public"]["Enums"]["instagram_account_status"]
          token_expires_at?: string | null
          updated_at?: string
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_handle_snapshots: {
        Row: {
          created_at: string
          expires_at: string
          fetched_at: string
          fields_availability: Json
          handle: string
          id: string
          ig_user_id: string | null
          media_snapshot: Json
          profile_snapshot: Json
        }
        Insert: {
          created_at?: string
          expires_at: string
          fetched_at?: string
          fields_availability?: Json
          handle: string
          id?: string
          ig_user_id?: string | null
          media_snapshot?: Json
          profile_snapshot?: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          fetched_at?: string
          fields_availability?: Json
          handle?: string
          id?: string
          ig_user_id?: string | null
          media_snapshot?: Json
          profile_snapshot?: Json
        }
        Relationships: []
      }
      instagram_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          state: string
          used_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          state: string
          used_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          state?: string
          used_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_oauth_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_publications: {
        Row: {
          attempt_count: number
          carousel_child_container_ids: string[]
          claimed_at: string | null
          content_id: string
          content_version_id: string | null
          created_at: string
          error_message: string | null
          id: string
          ig_container_id: string | null
          ig_media_id: string | null
          instagram_account_id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          next_retry_at: string | null
          permalink: string | null
          published_at: string | null
          rendered_asset_paths: string[]
          requested_by: string | null
          status: Database["public"]["Enums"]["instagram_publication_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          carousel_child_container_ids?: string[]
          claimed_at?: string | null
          content_id: string
          content_version_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ig_container_id?: string | null
          ig_media_id?: string | null
          instagram_account_id: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          next_retry_at?: string | null
          permalink?: string | null
          published_at?: string | null
          rendered_asset_paths?: string[]
          requested_by?: string | null
          status?: Database["public"]["Enums"]["instagram_publication_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          carousel_child_container_ids?: string[]
          claimed_at?: string | null
          content_id?: string
          content_version_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          ig_container_id?: string | null
          ig_media_id?: string | null
          instagram_account_id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          next_retry_at?: string | null
          permalink?: string | null
          published_at?: string | null
          rendered_asset_paths?: string[]
          requested_by?: string | null
          status?: Database["public"]["Enums"]["instagram_publication_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_publications_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_publications_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_publications_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_publications_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_webhook_events: {
        Row: {
          dedupe_key: string
          event_type: string
          id: string
          ig_user_id: string
          instagram_account_id: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          signature_verified: boolean
          workspace_id: string | null
        }
        Insert: {
          dedupe_key: string
          event_type: string
          id?: string
          ig_user_id: string
          instagram_account_id?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          signature_verified?: boolean
          workspace_id?: string | null
        }
        Update: {
          dedupe_key?: string
          event_type?: string
          id?: string
          ig_user_id?: string
          instagram_account_id?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          signature_verified?: boolean
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_webhook_events_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pre_onboarding_sessions: {
        Row: {
          ai_model: string | null
          ai_provider: string | null
          ai_usage: Json
          claimed_at: string | null
          claimed_by_user_id: string | null
          claimed_workspace_id: string | null
          created_at: string
          dna_preliminar: Json | null
          error_code: string | null
          error_message: string | null
          expires_at: string
          handle: string
          id: string
          ideias_preliminares: Json | null
          ip_hash: string
          snapshot_id: string | null
          status: string
          token_hash: string
          updated_at: string
          used_cached_snapshot: boolean
        }
        Insert: {
          ai_model?: string | null
          ai_provider?: string | null
          ai_usage?: Json
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          claimed_workspace_id?: string | null
          created_at?: string
          dna_preliminar?: Json | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          handle: string
          id?: string
          ideias_preliminares?: Json | null
          ip_hash: string
          snapshot_id?: string | null
          status?: string
          token_hash: string
          updated_at?: string
          used_cached_snapshot?: boolean
        }
        Update: {
          ai_model?: string | null
          ai_provider?: string | null
          ai_usage?: Json
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          claimed_workspace_id?: string | null
          created_at?: string
          dna_preliminar?: Json | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          handle?: string
          id?: string
          ideias_preliminares?: Json | null
          ip_hash?: string
          snapshot_id?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
          used_cached_snapshot?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pre_onboarding_sessions_claimed_workspace_id_fkey"
            columns: ["claimed_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pre_onboarding_sessions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "instagram_handle_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          trial_ends_at: string | null
          trial_started_at: string | null
          trial_status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      radar_cluster_signals: {
        Row: {
          cluster_id: string
          created_at: string
          signal_id: string
        }
        Insert: {
          cluster_id: string
          created_at?: string
          signal_id: string
        }
        Update: {
          cluster_id?: string
          created_at?: string
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "radar_cluster_signals_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "radar_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radar_cluster_signals_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "radar_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_clusters: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          last_seen_at: string
          primary_topic: string | null
          provider_diversity: number
          signal_count: number
          status: string
          theme_summary: string
          updated_at: string
          viral_score: number | null
          viral_score_breakdown: Json
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          primary_topic?: string | null
          provider_diversity?: number
          signal_count?: number
          status?: string
          theme_summary: string
          updated_at?: string
          viral_score?: number | null
          viral_score_breakdown?: Json
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          primary_topic?: string | null
          provider_diversity?: number
          signal_count?: number
          status?: string
          theme_summary?: string
          updated_at?: string
          viral_score?: number | null
          viral_score_breakdown?: Json
        }
        Relationships: []
      }
      radar_opportunities: {
        Row: {
          ai_generation_id: string | null
          brand_fit_breakdown: Json
          brand_fit_score: number
          cluster_id: string
          confidence: string
          created_at: string
          detected_at: string
          dismissed_reason: string | null
          expires_at: string | null
          id: string
          last_seen_at: string
          novelty_method: string
          novelty_score: number
          opportunity_score: number
          status: string
          suggested_angle: string | null
          suggested_format: Database["public"]["Enums"]["content_type"] | null
          suggested_title: string | null
          updated_at: string
          used_content_id: string | null
          workspace_id: string
        }
        Insert: {
          ai_generation_id?: string | null
          brand_fit_breakdown?: Json
          brand_fit_score: number
          cluster_id: string
          confidence: string
          created_at?: string
          detected_at?: string
          dismissed_reason?: string | null
          expires_at?: string | null
          id?: string
          last_seen_at?: string
          novelty_method?: string
          novelty_score: number
          opportunity_score: number
          status?: string
          suggested_angle?: string | null
          suggested_format?: Database["public"]["Enums"]["content_type"] | null
          suggested_title?: string | null
          updated_at?: string
          used_content_id?: string | null
          workspace_id: string
        }
        Update: {
          ai_generation_id?: string | null
          brand_fit_breakdown?: Json
          brand_fit_score?: number
          cluster_id?: string
          confidence?: string
          created_at?: string
          detected_at?: string
          dismissed_reason?: string | null
          expires_at?: string | null
          id?: string
          last_seen_at?: string
          novelty_method?: string
          novelty_score?: number
          opportunity_score?: number
          status?: string
          suggested_angle?: string | null
          suggested_format?: Database["public"]["Enums"]["content_type"] | null
          suggested_title?: string | null
          updated_at?: string
          used_content_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "radar_opportunities_ai_generation_id_fkey"
            columns: ["ai_generation_id"]
            isOneToOne: false
            referencedRelation: "ai_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radar_opportunities_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "radar_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radar_opportunities_used_content_id_fkey"
            columns: ["used_content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radar_opportunities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_provider_config: {
        Row: {
          cache_ttl_hours: number
          enabled: boolean
          max_signals_per_run: number
          notes: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          cache_ttl_hours?: number
          enabled?: boolean
          max_signals_per_run?: number
          notes?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          cache_ttl_hours?: number
          enabled?: boolean
          max_signals_per_run?: number
          notes?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      radar_runs: {
        Row: {
          ai_calls: number
          ai_usage: Json
          clusters_created: number
          clusters_updated: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          opportunities_created: number
          opportunities_updated: number
          providers_attempted: string[]
          providers_failed: Json
          providers_succeeded: string[]
          signals_collected: number
          signals_deduplicated: number
          started_at: string
          status: string
          workspaces_processed: number
        }
        Insert: {
          ai_calls?: number
          ai_usage?: Json
          clusters_created?: number
          clusters_updated?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          opportunities_created?: number
          opportunities_updated?: number
          providers_attempted?: string[]
          providers_failed?: Json
          providers_succeeded?: string[]
          signals_collected?: number
          signals_deduplicated?: number
          started_at?: string
          status?: string
          workspaces_processed?: number
        }
        Update: {
          ai_calls?: number
          ai_usage?: Json
          clusters_created?: number
          clusters_updated?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          opportunities_created?: number
          opportunities_updated?: number
          providers_attempted?: string[]
          providers_failed?: Json
          providers_succeeded?: string[]
          signals_collected?: number
          signals_deduplicated?: number
          started_at?: string
          status?: string
          workspaces_processed?: number
        }
        Relationships: []
      }
      radar_scoring_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      radar_signals: {
        Row: {
          author_handle: string | null
          author_name: string | null
          created_at: string
          expires_at: string
          external_id: string
          fetched_at: string
          id: string
          metrics: Json
          provider: string
          published_at: string | null
          raw_metadata: Json
          signal_type: string
          text_content: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          author_handle?: string | null
          author_name?: string | null
          created_at?: string
          expires_at: string
          external_id: string
          fetched_at?: string
          id?: string
          metrics?: Json
          provider: string
          published_at?: string | null
          raw_metadata?: Json
          signal_type: string
          text_content?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          author_handle?: string | null
          author_name?: string | null
          created_at?: string
          expires_at?: string
          external_id?: string
          fetched_at?: string
          id?: string
          metrics?: Json
          provider?: string
          published_at?: string | null
          raw_metadata?: Json
          signal_type?: string
          text_content?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radar_signals_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "radar_provider_config"
            referencedColumns: ["provider"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      discovery_usage_daily: {
        Row: {
          ai_failed: number | null
          ai_success: number | null
          cache_hits: number | null
          claimed_conversions: number | null
          day: string | null
          meta_calls: number | null
          total_ai_input_tokens: number | null
          total_ai_output_tokens: number | null
          total_estimated_cost_usd: number | null
          total_sessions: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_instagram_publications: {
        Args: { p_batch_limit?: number }
        Returns: {
          attempt_count: number
          carousel_child_container_ids: string[]
          claimed_at: string | null
          content_id: string
          content_version_id: string | null
          created_at: string
          error_message: string | null
          id: string
          ig_container_id: string | null
          ig_media_id: string | null
          instagram_account_id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          next_retry_at: string | null
          permalink: string | null
          published_at: string | null
          rendered_asset_paths: string[]
          requested_by: string | null
          status: Database["public"]["Enums"]["instagram_publication_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "instagram_publications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_expired_discovery_data: { Args: never; Returns: undefined }
      complete_instagram_publication: {
        Args: {
          p_ig_media_id: string
          p_permalink?: string
          p_publication_id: string
        }
        Returns: {
          attempt_count: number
          carousel_child_container_ids: string[]
          claimed_at: string | null
          content_id: string
          content_version_id: string | null
          created_at: string
          error_message: string | null
          id: string
          ig_container_id: string | null
          ig_media_id: string | null
          instagram_account_id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          next_retry_at: string | null
          permalink: string | null
          published_at: string | null
          rendered_asset_paths: string[]
          requested_by: string | null
          status: Database["public"]["Enums"]["instagram_publication_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "instagram_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_credits: {
        Args: {
          p_amount: number
          p_metadata?: Json
          p_operation: string
          p_reference_id?: string
          p_reference_type?: string
          p_workspace_id: string
        }
        Returns: {
          account_id: string
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          operation: string
          reference_id: string | null
          reference_type: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_instagram_publication: {
        Args: {
          p_error_code: string
          p_error_message: string
          p_next_retry_at?: string
          p_publication_id: string
          p_terminal: boolean
        }
        Returns: {
          attempt_count: number
          carousel_child_container_ids: string[]
          claimed_at: string | null
          content_id: string
          content_version_id: string | null
          created_at: string
          error_message: string | null
          id: string
          ig_container_id: string | null
          ig_media_id: string | null
          instagram_account_id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          next_retry_at: string | null
          permalink: string | null
          published_at: string | null
          rendered_asset_paths: string[]
          requested_by: string | null
          status: Database["public"]["Enums"]["instagram_publication_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "instagram_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      grant_credits: {
        Args: {
          p_amount: number
          p_metadata?: Json
          p_operation: string
          p_reference_id?: string
          p_reference_type?: string
          p_workspace_id: string
        }
        Returns: {
          account_id: string
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          operation: string
          reference_id: string | null
          reference_type: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_workspace_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["workspace_role"][]
          p_workspace_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      link_ai_generation_content: {
        Args: { p_content_id: string; p_generation_id: string }
        Returns: {
          brand_context_snapshot: Json
          completed_at: string | null
          content_id: string | null
          created_at: string
          credit_cost: number
          credit_ledger_id: string | null
          error_code: string | null
          error_message: string | null
          format: Database["public"]["Enums"]["content_format"] | null
          generation_type: Database["public"]["Enums"]["ai_generation_type"]
          history_snapshot: Json
          id: string
          model: string
          objective: string | null
          provider: string
          request_payload: Json
          result_asset_paths: string[]
          result_payload: Json | null
          result_text: string | null
          status: Database["public"]["Enums"]["ai_generation_status"]
          task_id: string | null
          theme_input: string
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "ai_generations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      link_radar_opportunity_content: {
        Args: { p_content_id: string; p_opportunity_id: string }
        Returns: undefined
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_resource_id?: string
          p_resource_type: string
          p_workspace_id: string
        }
        Returns: {
          action: string
          created_at: string
          id: string
          metadata: Json
          resource_id: string | null
          resource_type: string
          user_id: string | null
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      radar_compute_novelty: {
        Args: {
          p_lookback_days?: number
          p_theme_summary: string
          p_workspace_id: string
        }
        Returns: number
      }
      refund_ai_generation_system: {
        Args: { p_generation_id: string }
        Returns: {
          account_id: string
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          operation: string
          reference_id: string | null
          reference_type: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_failed_ai_generation: {
        Args: { p_generation_id: string }
        Returns: {
          account_id: string
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          operation: string
          reference_id: string | null
          reference_type: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "credit_ledger"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_radar_opportunity_status: {
        Args: {
          p_dismissed_reason?: string
          p_opportunity_id: string
          p_status: string
        }
        Returns: {
          ai_generation_id: string | null
          brand_fit_breakdown: Json
          brand_fit_score: number
          cluster_id: string
          confidence: string
          created_at: string
          detected_at: string
          dismissed_reason: string | null
          expires_at: string | null
          id: string
          last_seen_at: string
          novelty_method: string
          novelty_score: number
          opportunity_score: number
          status: string
          suggested_angle: string | null
          suggested_format: Database["public"]["Enums"]["content_type"] | null
          suggested_title: string | null
          updated_at: string
          used_content_id: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "radar_opportunities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      slugify_base: { Args: { p_text: string }; Returns: string }
      soft_delete_content: {
        Args: { p_content_id: string }
        Returns: {
          caption: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          deleted_at: string | null
          duplicated_from: string | null
          format: Database["public"]["Enums"]["content_format"]
          hashtags: string[]
          id: string
          origin: Database["public"]["Enums"]["content_origin"]
          published_at: string | null
          radar_opportunity_id: string | null
          rejection_reason: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "contents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      storage_path_workspace_id: {
        Args: { object_name: string }
        Returns: string
      }
      upsert_radar_opportunity: {
        Args: {
          p_ai_generation_id: string
          p_brand_fit_breakdown: Json
          p_brand_fit_score: number
          p_cluster_id: string
          p_confidence: string
          p_expires_at: string
          p_novelty_method: string
          p_novelty_score: number
          p_opportunity_score: number
          p_suggested_angle: string
          p_suggested_format: Database["public"]["Enums"]["content_type"]
          p_suggested_title: string
          p_workspace_id: string
        }
        Returns: {
          ai_generation_id: string | null
          brand_fit_breakdown: Json
          brand_fit_score: number
          cluster_id: string
          confidence: string
          created_at: string
          detected_at: string
          dismissed_reason: string | null
          expires_at: string | null
          id: string
          last_seen_at: string
          novelty_method: string
          novelty_score: number
          opportunity_score: number
          status: string
          suggested_angle: string | null
          suggested_format: Database["public"]["Enums"]["content_type"] | null
          suggested_title: string | null
          updated_at: string
          used_content_id: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "radar_opportunities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      workspace_role: {
        Args: { p_workspace_id: string }
        Returns: Database["public"]["Enums"]["workspace_role"]
      }
    }
    Enums: {
      ai_generation_status: "pending" | "processing" | "success" | "failed"
      ai_generation_type:
        | "post_unico"
        | "carrossel"
        | "reels_roteiro"
        | "legenda"
        | "ideias_conteudo"
        | "imagem"
      content_element_type: "text" | "image" | "shape"
      content_format: "1:1" | "4:5" | "9:16"
      content_origin: "manual" | "ia" | "radar" | "autopilot"
      content_status:
        | "rascunho"
        | "em_revisao"
        | "rejeitado"
        | "aprovado"
        | "agendado"
        | "publicando"
        | "publicado"
        | "falhou"
      content_type: "post" | "carrossel" | "reel"
      instagram_account_status:
        | "conectado"
        | "token_expirado"
        | "desconectado"
        | "erro"
      instagram_publication_status:
        | "pending"
        | "processing"
        | "container_created"
        | "publishing"
        | "published"
        | "failed"
        | "cancelled"
      workspace_role: "owner" | "admin" | "editor" | "approver" | "viewer"
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
      ai_generation_status: ["pending", "processing", "success", "failed"],
      ai_generation_type: [
        "post_unico",
        "carrossel",
        "reels_roteiro",
        "legenda",
        "ideias_conteudo",
        "imagem",
      ],
      content_element_type: ["text", "image", "shape"],
      content_format: ["1:1", "4:5", "9:16"],
      content_origin: ["manual", "ia", "radar", "autopilot"],
      content_status: [
        "rascunho",
        "em_revisao",
        "rejeitado",
        "aprovado",
        "agendado",
        "publicando",
        "publicado",
        "falhou",
      ],
      content_type: ["post", "carrossel", "reel"],
      instagram_account_status: [
        "conectado",
        "token_expirado",
        "desconectado",
        "erro",
      ],
      instagram_publication_status: [
        "pending",
        "processing",
        "container_created",
        "publishing",
        "published",
        "failed",
        "cancelled",
      ],
      workspace_role: ["owner", "admin", "editor", "approver", "viewer"],
    },
  },
} as const
