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
      account_deletion_requests: {
        Row: {
          id: string
          notes: string | null
          processed_at: string | null
          reason: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
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
          recovery_attempts: number
          recovery_claimed_at: string | null
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
          recovery_attempts?: number
          recovery_claimed_at?: string | null
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
          recovery_attempts?: number
          recovery_claimed_at?: string | null
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
      ai_webhook_rejections: {
        Row: {
          created_at: string
          has_hmac_secret: boolean
          has_signature_header: boolean
          has_timestamp_header: boolean
          id: string
          provider: string
          reason: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          has_hmac_secret?: boolean
          has_signature_header?: boolean
          has_timestamp_header?: boolean
          id?: string
          provider: string
          reason: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          has_hmac_secret?: boolean
          has_signature_header?: boolean
          has_timestamp_header?: boolean
          id?: string
          provider?: string
          reason?: string
          task_id?: string | null
        }
        Relationships: []
      }
      asaas_webhook_events: {
        Row: {
          asaas_event_id: string
          event_type: string
          id: string
          payload: Json
          processed_at: string
        }
        Insert: {
          asaas_event_id: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string
        }
        Update: {
          asaas_event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string
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
      brand_assets: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          storage_path: string
          title: string | null
          workspace_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          title?: string | null
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          title?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_workspace_id_fkey"
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
          first_content_completed_at: string | null
          first_content_started_at: string | null
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
          first_content_completed_at?: string | null
          first_content_started_at?: string | null
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
          first_content_completed_at?: string | null
          first_content_started_at?: string | null
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
      brand_reference_profiles: {
        Row: {
          analysis: Json | null
          analysis_error_code: string | null
          analyzed_at: string | null
          created_at: string
          created_by: string | null
          handle: string
          id: string
          ig_user_id: string | null
          liked_aspects: string[]
          notes: string | null
          reference_type: string | null
          removed_at: string | null
          status: Database["public"]["Enums"]["brand_reference_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis?: Json | null
          analysis_error_code?: string | null
          analyzed_at?: string | null
          created_at?: string
          created_by?: string | null
          handle: string
          id?: string
          ig_user_id?: string | null
          liked_aspects?: string[]
          notes?: string | null
          reference_type?: string | null
          removed_at?: string | null
          status?: Database["public"]["Enums"]["brand_reference_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis?: Json | null
          analysis_error_code?: string | null
          analyzed_at?: string | null
          created_at?: string
          created_by?: string | null
          handle?: string
          id?: string
          ig_user_id?: string | null
          liked_aspects?: string[]
          notes?: string | null
          reference_type?: string | null
          removed_at?: string | null
          status?: Database["public"]["Enums"]["brand_reference_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_reference_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_reference_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_visual_dna: {
        Row: {
          attributes: Json
          based_on_option_id: string | null
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          id: string
          reference_ids: string[]
          status: string
          version: number
          workspace_id: string
        }
        Insert: {
          attributes: Json
          based_on_option_id?: string | null
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          reference_ids?: string[]
          status?: string
          version: number
          workspace_id: string
        }
        Update: {
          attributes?: Json
          based_on_option_id?: string | null
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          reference_ids?: string[]
          status?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_visual_dna_based_on_option_id_fkey"
            columns: ["based_on_option_id"]
            isOneToOne: false
            referencedRelation: "visual_dna_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_visual_dna_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_visual_dna_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
      content_format_dimensions: {
        Row: {
          format: Database["public"]["Enums"]["content_format"]
          height: number
          width: number
        }
        Insert: {
          format: Database["public"]["Enums"]["content_format"]
          height: number
          width: number
        }
        Update: {
          format?: Database["public"]["Enums"]["content_format"]
          height?: number
          width?: number
        }
        Relationships: []
      }
      content_franchise_ledger: {
        Row: {
          content_id: string
          created_at: string
          id: string
          organization_id: string
          period_end: string
          period_start: string
          workspace_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          workspace_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_franchise_ledger_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: true
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_franchise_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_franchise_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          visual_ai_generation_id: string | null
          visual_asset_status: Database["public"]["Enums"]["content_visual_asset_status"]
          visual_generation_attempts: number
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
          visual_ai_generation_id?: string | null
          visual_asset_status?: Database["public"]["Enums"]["content_visual_asset_status"]
          visual_generation_attempts?: number
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
          visual_ai_generation_id?: string | null
          visual_asset_status?: Database["public"]["Enums"]["content_visual_asset_status"]
          visual_generation_attempts?: number
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
          {
            foreignKeyName: "content_pages_visual_ai_generation_id_fkey"
            columns: ["visual_ai_generation_id"]
            isOneToOne: false
            referencedRelation: "ai_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      content_performance_scores: {
        Row: {
          baseline_sample_size: number
          baseline_scope:
            | Database["public"]["Enums"]["performance_baseline_scope"]
            | null
          baseline_tier: Database["public"]["Enums"]["performance_baseline_tier"]
          computed_at: string
          content_id: string
          created_at: string
          format: Database["public"]["Enums"]["content_type"]
          id: string
          instagram_publication_id: string
          latest_age_bucket: string | null
          maturity_stage: Database["public"]["Enums"]["performance_maturity_stage"]
          relative_engagement: number | null
          relative_reach: number | null
          relative_saves: number | null
          relative_shares: number | null
          score: number | null
          scoring_config_snapshot: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          baseline_sample_size?: number
          baseline_scope?:
            | Database["public"]["Enums"]["performance_baseline_scope"]
            | null
          baseline_tier?: Database["public"]["Enums"]["performance_baseline_tier"]
          computed_at?: string
          content_id: string
          created_at?: string
          format: Database["public"]["Enums"]["content_type"]
          id?: string
          instagram_publication_id: string
          latest_age_bucket?: string | null
          maturity_stage?: Database["public"]["Enums"]["performance_maturity_stage"]
          relative_engagement?: number | null
          relative_reach?: number | null
          relative_saves?: number | null
          relative_shares?: number | null
          score?: number | null
          scoring_config_snapshot?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          baseline_sample_size?: number
          baseline_scope?:
            | Database["public"]["Enums"]["performance_baseline_scope"]
            | null
          baseline_tier?: Database["public"]["Enums"]["performance_baseline_tier"]
          computed_at?: string
          content_id?: string
          created_at?: string
          format?: Database["public"]["Enums"]["content_type"]
          id?: string
          instagram_publication_id?: string
          latest_age_bucket?: string | null
          maturity_stage?: Database["public"]["Enums"]["performance_maturity_stage"]
          relative_engagement?: number | null
          relative_reach?: number | null
          relative_saves?: number | null
          relative_shares?: number | null
          score?: number | null
          scoring_config_snapshot?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_performance_scores_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_performance_scores_instagram_publication_id_fkey"
            columns: ["instagram_publication_id"]
            isOneToOne: true
            referencedRelation: "instagram_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_performance_scores_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_performance_snapshots: {
        Row: {
          age_bucket: string
          api_version: string | null
          attempt_count: number
          captured_at: string | null
          claimed_at: string | null
          collector_status: Database["public"]["Enums"]["performance_snapshot_status"]
          comments: number | null
          content_id: string
          created_at: string
          id: string
          instagram_account_id: string
          instagram_publication_id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          likes: number | null
          next_retry_at: string | null
          raw_metrics: Json
          reach: number | null
          saved: number | null
          shares: number | null
          target_at: string
          total_interactions: number | null
          unsupported_metrics: string[]
          updated_at: string
          views: number | null
          workspace_id: string
        }
        Insert: {
          age_bucket: string
          api_version?: string | null
          attempt_count?: number
          captured_at?: string | null
          claimed_at?: string | null
          collector_status?: Database["public"]["Enums"]["performance_snapshot_status"]
          comments?: number | null
          content_id: string
          created_at?: string
          id?: string
          instagram_account_id: string
          instagram_publication_id: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          likes?: number | null
          next_retry_at?: string | null
          raw_metrics?: Json
          reach?: number | null
          saved?: number | null
          shares?: number | null
          target_at: string
          total_interactions?: number | null
          unsupported_metrics?: string[]
          updated_at?: string
          views?: number | null
          workspace_id: string
        }
        Update: {
          age_bucket?: string
          api_version?: string | null
          attempt_count?: number
          captured_at?: string | null
          claimed_at?: string | null
          collector_status?: Database["public"]["Enums"]["performance_snapshot_status"]
          comments?: number | null
          content_id?: string
          created_at?: string
          id?: string
          instagram_account_id?: string
          instagram_publication_id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          likes?: number | null
          next_retry_at?: string | null
          raw_metrics?: Json
          reach?: number | null
          saved?: number | null
          shares?: number | null
          target_at?: string
          total_interactions?: number | null
          unsupported_metrics?: string[]
          updated_at?: string
          views?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_performance_snapshots_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_performance_snapshots_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_performance_snapshots_instagram_publication_id_fkey"
            columns: ["instagram_publication_id"]
            isOneToOne: false
            referencedRelation: "instagram_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_performance_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          discovery_session_id: string | null
          duplicated_from: string | null
          format: Database["public"]["Enums"]["content_format"]
          hashtags: string[]
          id: string
          origin: Database["public"]["Enums"]["content_origin"]
          pilot_plan_item_id: string | null
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
          discovery_session_id?: string | null
          duplicated_from?: string | null
          format?: Database["public"]["Enums"]["content_format"]
          hashtags?: string[]
          id?: string
          origin?: Database["public"]["Enums"]["content_origin"]
          pilot_plan_item_id?: string | null
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
          discovery_session_id?: string | null
          duplicated_from?: string | null
          format?: Database["public"]["Enums"]["content_format"]
          hashtags?: string[]
          id?: string
          origin?: Database["public"]["Enums"]["content_origin"]
          pilot_plan_item_id?: string | null
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
            foreignKeyName: "contents_discovery_session_id_fkey"
            columns: ["discovery_session_id"]
            isOneToOne: false
            referencedRelation: "pre_onboarding_sessions"
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
            foreignKeyName: "contents_pilot_plan_item_id_fkey"
            columns: ["pilot_plan_item_id"]
            isOneToOne: false
            referencedRelation: "pilot_plan_items"
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
      coupon_redemptions: {
        Row: {
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          coupon_id: string
          created_at: string
          created_by: string | null
          discount_amount_cents: number
          failure_reason: string | null
          final_amount_cents: number
          id: string
          organization_id: string
          original_amount_cents: number
          plan_id: string
          status: Database["public"]["Enums"]["coupon_redemption_status"]
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          asaas_payment_id?: string | null
          asaas_subscription_id?: string | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          coupon_id: string
          created_at?: string
          created_by?: string | null
          discount_amount_cents: number
          failure_reason?: string | null
          final_amount_cents: number
          id?: string
          organization_id: string
          original_amount_cents: number
          plan_id: string
          status?: Database["public"]["Enums"]["coupon_redemption_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          asaas_payment_id?: string | null
          asaas_subscription_id?: string | null
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          coupon_id?: string
          created_at?: string
          created_by?: string | null
          discount_amount_cents?: number
          failure_reason?: string | null
          final_amount_cents?: number
          id?: string
          organization_id?: string
          original_amount_cents?: number
          plan_id?: string
          status?: Database["public"]["Enums"]["coupon_redemption_status"]
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          code_normalized: string | null
          created_at: string
          created_by: string | null
          discount_type: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value: number
          duration: Database["public"]["Enums"]["coupon_duration"]
          eligible_billing_intervals:
            | Database["public"]["Enums"]["billing_interval"][]
            | null
          eligible_plan_ids: string[] | null
          expires_at: string | null
          id: string
          max_redemptions: number | null
          max_redemptions_per_organization: number
          metadata: Json
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          code_normalized?: string | null
          created_at?: string
          created_by?: string | null
          discount_type: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value: number
          duration?: Database["public"]["Enums"]["coupon_duration"]
          eligible_billing_intervals?:
            | Database["public"]["Enums"]["billing_interval"][]
            | null
          eligible_plan_ids?: string[] | null
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          max_redemptions_per_organization?: number
          metadata?: Json
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          code_normalized?: string | null
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["coupon_discount_type"]
          discount_value?: number
          duration?: Database["public"]["Enums"]["coupon_duration"]
          eligible_billing_intervals?:
            | Database["public"]["Enums"]["billing_interval"][]
            | null
          eligible_plan_ids?: string[] | null
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          max_redemptions_per_organization?: number
          metadata?: Json
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          insights_status: Database["public"]["Enums"]["instagram_insights_status"]
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
          insights_status?: Database["public"]["Enums"]["instagram_insights_status"]
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
          insights_status?: Database["public"]["Enums"]["instagram_insights_status"]
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
          return_to: Database["public"]["Enums"]["instagram_oauth_return_to"]
          state: string
          used_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          return_to?: Database["public"]["Enums"]["instagram_oauth_return_to"]
          state: string
          used_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          return_to?: Database["public"]["Enums"]["instagram_oauth_return_to"]
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
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_type: string
          document_version: string
          id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          document_version: string
          id?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          document_version?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      legal_documents: {
        Row: {
          content_url: string | null
          created_at: string
          document_type: string
          id: string
          is_current: boolean
          version: string
        }
        Insert: {
          content_url?: string | null
          created_at?: string
          document_type: string
          id?: string
          is_current?: boolean
          version: string
        }
        Update: {
          content_url?: string | null
          created_at?: string
          document_type?: string
          id?: string
          is_current?: boolean
          version?: string
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          created_at: string
          dismissed_steps: string[]
          onboarding_dismissed: boolean
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          dismissed_steps?: string[]
          onboarding_dismissed?: boolean
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          dismissed_steps?: string[]
          onboarding_dismissed?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_collection_runs: {
        Row: {
          duration_ms: number | null
          errors: Json
          finished_at: string | null
          id: string
          permission_blocked_count: number
          publications_scheduled: number
          rate_limited_count: number
          retries: number
          snapshots_attempted: number
          snapshots_collected: number
          started_at: string
        }
        Insert: {
          duration_ms?: number | null
          errors?: Json
          finished_at?: string | null
          id?: string
          permission_blocked_count?: number
          publications_scheduled?: number
          rate_limited_count?: number
          retries?: number
          snapshots_attempted?: number
          snapshots_collected?: number
          started_at?: string
        }
        Update: {
          duration_ms?: number | null
          errors?: Json
          finished_at?: string | null
          id?: string
          permission_blocked_count?: number
          publications_scheduled?: number
          rate_limited_count?: number
          retries?: number
          snapshots_attempted?: number
          snapshots_collected?: number
          started_at?: string
        }
        Relationships: []
      }
      performance_insights: {
        Row: {
          ai_generation_id: string | null
          confidence: Database["public"]["Enums"]["performance_confidence"]
          created_at: string
          description: string
          dismissed_at: string | null
          evidence: Json
          fact_signature: string
          feedback:
            | Database["public"]["Enums"]["performance_insight_feedback"]
            | null
          generated_at: string
          id: string
          insight_type: string
          period_end: string
          period_start: string
          sample_size: number
          source: Database["public"]["Enums"]["performance_insight_source"]
          status: Database["public"]["Enums"]["performance_insight_status"]
          title: string
          workspace_id: string
        }
        Insert: {
          ai_generation_id?: string | null
          confidence: Database["public"]["Enums"]["performance_confidence"]
          created_at?: string
          description: string
          dismissed_at?: string | null
          evidence: Json
          fact_signature: string
          feedback?:
            | Database["public"]["Enums"]["performance_insight_feedback"]
            | null
          generated_at?: string
          id?: string
          insight_type: string
          period_end: string
          period_start: string
          sample_size: number
          source: Database["public"]["Enums"]["performance_insight_source"]
          status?: Database["public"]["Enums"]["performance_insight_status"]
          title: string
          workspace_id: string
        }
        Update: {
          ai_generation_id?: string | null
          confidence?: Database["public"]["Enums"]["performance_confidence"]
          created_at?: string
          description?: string
          dismissed_at?: string | null
          evidence?: Json
          fact_signature?: string
          feedback?:
            | Database["public"]["Enums"]["performance_insight_feedback"]
            | null
          generated_at?: string
          id?: string
          insight_type?: string
          period_end?: string
          period_start?: string
          sample_size?: number
          source?: Database["public"]["Enums"]["performance_insight_source"]
          status?: Database["public"]["Enums"]["performance_insight_status"]
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_insights_ai_generation_id_fkey"
            columns: ["ai_generation_id"]
            isOneToOne: false
            referencedRelation: "ai_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_insights_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_scoring_config: {
        Row: {
          id: string
          maturity_consolidated_days: number
          maturity_evolving_hours: number
          min_sample_provisional: number
          min_sample_ready: number
          updated_at: string
          weight_engagement: number
          weight_reach: number
          weight_saves: number
          weight_shares: number
          winsorize_high_pct: number
          winsorize_low_pct: number
          workspace_id: string | null
        }
        Insert: {
          id?: string
          maturity_consolidated_days?: number
          maturity_evolving_hours?: number
          min_sample_provisional?: number
          min_sample_ready?: number
          updated_at?: string
          weight_engagement?: number
          weight_reach?: number
          weight_saves?: number
          weight_shares?: number
          winsorize_high_pct?: number
          winsorize_low_pct?: number
          workspace_id?: string | null
        }
        Update: {
          id?: string
          maturity_consolidated_days?: number
          maturity_evolving_hours?: number
          min_sample_provisional?: number
          min_sample_ready?: number
          updated_at?: string
          weight_engagement?: number
          weight_reach?: number
          weight_saves?: number
          weight_shares?: number
          winsorize_high_pct?: number
          winsorize_low_pct?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_scoring_config_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_plan_items: {
        Row: {
          angle: string | null
          attempt_count: number
          brand_pillar: string | null
          claimed_at: string | null
          content_id: string | null
          created_at: string
          directive: string | null
          editorial_role: Database["public"]["Enums"]["pilot_editorial_role"]
          experiment_id: string | null
          format: Database["public"]["Enums"]["content_type"]
          id: string
          last_attempt_at: string | null
          last_error: string | null
          objective: string | null
          pilot_plan_id: string
          radar_opportunity_id: string | null
          reason: string | null
          rejection_feedback: Json | null
          scheduled_for: string
          source: string
          status: Database["public"]["Enums"]["pilot_plan_item_status"]
          status_reason: string | null
          topic: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          angle?: string | null
          attempt_count?: number
          brand_pillar?: string | null
          claimed_at?: string | null
          content_id?: string | null
          created_at?: string
          directive?: string | null
          editorial_role: Database["public"]["Enums"]["pilot_editorial_role"]
          experiment_id?: string | null
          format: Database["public"]["Enums"]["content_type"]
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          objective?: string | null
          pilot_plan_id: string
          radar_opportunity_id?: string | null
          reason?: string | null
          rejection_feedback?: Json | null
          scheduled_for: string
          source?: string
          status?: Database["public"]["Enums"]["pilot_plan_item_status"]
          status_reason?: string | null
          topic: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          angle?: string | null
          attempt_count?: number
          brand_pillar?: string | null
          claimed_at?: string | null
          content_id?: string | null
          created_at?: string
          directive?: string | null
          editorial_role?: Database["public"]["Enums"]["pilot_editorial_role"]
          experiment_id?: string | null
          format?: Database["public"]["Enums"]["content_type"]
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          objective?: string | null
          pilot_plan_id?: string
          radar_opportunity_id?: string | null
          reason?: string | null
          rejection_feedback?: Json | null
          scheduled_for?: string
          source?: string
          status?: Database["public"]["Enums"]["pilot_plan_item_status"]
          status_reason?: string | null
          topic?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_plan_items_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_plan_items_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "strategy_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_plan_items_pilot_plan_id_fkey"
            columns: ["pilot_plan_id"]
            isOneToOne: false
            referencedRelation: "pilot_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_plan_items_radar_opportunity_id_fkey"
            columns: ["radar_opportunity_id"]
            isOneToOne: false
            referencedRelation: "radar_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_plan_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          generated_at: string
          generation_key: string
          id: string
          mode: Database["public"]["Enums"]["pilot_mode"]
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["pilot_plan_status"]
          superseded_by: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          generated_at?: string
          generation_key: string
          id?: string
          mode: Database["public"]["Enums"]["pilot_mode"]
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["pilot_plan_status"]
          superseded_by?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          generated_at?: string
          generation_key?: string
          id?: string
          mode?: Database["public"]["Enums"]["pilot_mode"]
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["pilot_plan_status"]
          superseded_by?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_plans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_plans_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "pilot_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_plans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_runs: {
        Row: {
          ai_calls: number
          contents_generated: number
          created_at: string
          credits_consumed: number
          duration_ms: number | null
          error_summary: string | null
          estimated_ai_cost: Json
          finished_at: string | null
          id: string
          items_created: number
          plan_id: string | null
          radar_used: number
          run_type: string
          slots_evaluated: number
          started_at: string
          status: string
          workspace_id: string
        }
        Insert: {
          ai_calls?: number
          contents_generated?: number
          created_at?: string
          credits_consumed?: number
          duration_ms?: number | null
          error_summary?: string | null
          estimated_ai_cost?: Json
          finished_at?: string | null
          id?: string
          items_created?: number
          plan_id?: string | null
          radar_used?: number
          run_type: string
          slots_evaluated?: number
          started_at?: string
          status?: string
          workspace_id: string
        }
        Update: {
          ai_calls?: number
          contents_generated?: number
          created_at?: string
          credits_consumed?: number
          duration_ms?: number | null
          error_summary?: string | null
          estimated_ai_cost?: Json
          finished_at?: string | null
          id?: string
          items_created?: number
          plan_id?: string | null
          radar_used?: number
          run_type?: string
          slots_evaluated?: number
          started_at?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_runs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "pilot_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_schedule_slots: {
        Row: {
          created_at: string
          directive: string | null
          id: string
          time_of_day: string
          updated_at: string
          weekday: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          directive?: string | null
          id?: string
          time_of_day: string
          updated_at?: string
          weekday: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          directive?: string | null
          id?: string
          time_of_day?: string
          updated_at?: string
          weekday?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_schedule_slots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_settings: {
        Row: {
          allowed_formats: Database["public"]["Enums"]["content_type"][]
          allowed_weekdays: number[]
          always_require_approval: boolean
          auto_generate_art: boolean
          created_at: string
          default_instagram_account_id: string | null
          editorial_mix: Json
          format_mix: Json | null
          id: string
          max_credits_per_window: number | null
          max_posts_per_window: number
          max_radar_per_window: number
          mode: Database["public"]["Enums"]["pilot_mode"]
          planning_window_days: number
          preferred_times: Json
          radar_min_confidence: string
          radar_min_opportunity_score: number
          status: Database["public"]["Enums"]["pilot_status"]
          temporary_objective: string | null
          temporary_objective_expires_at: string | null
          updated_at: string
          use_radar: boolean
          workspace_id: string
        }
        Insert: {
          allowed_formats?: Database["public"]["Enums"]["content_type"][]
          allowed_weekdays?: number[]
          always_require_approval?: boolean
          auto_generate_art?: boolean
          created_at?: string
          default_instagram_account_id?: string | null
          editorial_mix?: Json
          format_mix?: Json | null
          id?: string
          max_credits_per_window?: number | null
          max_posts_per_window?: number
          max_radar_per_window?: number
          mode?: Database["public"]["Enums"]["pilot_mode"]
          planning_window_days?: number
          preferred_times?: Json
          radar_min_confidence?: string
          radar_min_opportunity_score?: number
          status?: Database["public"]["Enums"]["pilot_status"]
          temporary_objective?: string | null
          temporary_objective_expires_at?: string | null
          updated_at?: string
          use_radar?: boolean
          workspace_id: string
        }
        Update: {
          allowed_formats?: Database["public"]["Enums"]["content_type"][]
          allowed_weekdays?: number[]
          always_require_approval?: boolean
          auto_generate_art?: boolean
          created_at?: string
          default_instagram_account_id?: string | null
          editorial_mix?: Json
          format_mix?: Json | null
          id?: string
          max_credits_per_window?: number | null
          max_posts_per_window?: number
          max_radar_per_window?: number
          mode?: Database["public"]["Enums"]["pilot_mode"]
          planning_window_days?: number
          preferred_times?: Json
          radar_min_confidence?: string
          radar_min_opportunity_score?: number
          status?: Database["public"]["Enums"]["pilot_status"]
          temporary_objective?: string | null
          temporary_objective_expires_at?: string | null
          updated_at?: string
          use_radar?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_settings_default_instagram_account_id_fkey"
            columns: ["default_instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          capabilities: Json
          created_at: string
          id: string
          is_active: boolean
          max_members: number
          max_workspaces: number
          monthly_content_allowance: number
          name: string
          price_monthly_cents: number
          price_yearly_cents: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          id: string
          is_active?: boolean
          max_members: number
          max_workspaces: number
          monthly_content_allowance: number
          name: string
          price_monthly_cents: number
          price_yearly_cents: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          max_members?: number
          max_workspaces?: number
          monthly_content_allowance?: number
          name?: string
          price_monthly_cents?: number
          price_yearly_cents?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
          dna_revisado: Json | null
          error_code: string | null
          error_message: string | null
          expires_at: string
          flow_stage: string | null
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
          dna_revisado?: Json | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          flow_stage?: string | null
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
          dna_revisado?: Json | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          flow_stage?: string | null
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      radar_match_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          cluster_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          cluster_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          cluster_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "radar_match_jobs_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "radar_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radar_match_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      radar_targets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          source: string
          value: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          source?: string
          value: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          source?: string
          value?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "radar_targets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_experiments: {
        Row: {
          actual_sample_size: number
          baseline_definition: Json
          cancelled_at: string | null
          completed_at: string | null
          confidence:
            | Database["public"]["Enums"]["performance_confidence"]
            | null
          created_at: string
          created_by: string | null
          dimension: string
          hypothesis: string
          id: string
          period_end: string
          period_start: string
          recommendation_id: string | null
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["strategy_experiment_status"]
          success_criteria: Json
          target_sample_size: number
          updated_at: string
          variant: Json
          workspace_id: string
        }
        Insert: {
          actual_sample_size?: number
          baseline_definition: Json
          cancelled_at?: string | null
          completed_at?: string | null
          confidence?:
            | Database["public"]["Enums"]["performance_confidence"]
            | null
          created_at?: string
          created_by?: string | null
          dimension: string
          hypothesis: string
          id?: string
          period_end: string
          period_start: string
          recommendation_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["strategy_experiment_status"]
          success_criteria: Json
          target_sample_size: number
          updated_at?: string
          variant: Json
          workspace_id: string
        }
        Update: {
          actual_sample_size?: number
          baseline_definition?: Json
          cancelled_at?: string | null
          completed_at?: string | null
          confidence?:
            | Database["public"]["Enums"]["performance_confidence"]
            | null
          created_at?: string
          created_by?: string | null
          dimension?: string
          hypothesis?: string
          id?: string
          period_end?: string
          period_start?: string
          recommendation_id?: string | null
          result?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["strategy_experiment_status"]
          success_criteria?: Json
          target_sample_size?: number
          updated_at?: string
          variant?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_experiments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_experiments_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "strategy_recommendations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_experiments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_recommendation_runs: {
        Row: {
          candidates_evaluated: number
          deduplicated: number
          duration_ms: number | null
          errors: Json
          finished_at: string | null
          id: string
          recommendations_created: number
          skipped_low_sample: number
          stale_count: number
          started_at: string
          workspace_id: string
        }
        Insert: {
          candidates_evaluated?: number
          deduplicated?: number
          duration_ms?: number | null
          errors?: Json
          finished_at?: string | null
          id?: string
          recommendations_created?: number
          skipped_low_sample?: number
          stale_count?: number
          started_at?: string
          workspace_id: string
        }
        Update: {
          candidates_evaluated?: number
          deduplicated?: number
          duration_ms?: number | null
          errors?: Json
          finished_at?: string | null
          id?: string
          recommendations_created?: number
          skipped_low_sample?: number
          stale_count?: number
          started_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_recommendation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_recommendations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          after: Json | null
          applied_at: string | null
          applied_by: string | null
          before: Json | null
          confidence: Database["public"]["Enums"]["performance_confidence"]
          created_at: string
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          evidence: Json
          expires_at: string
          fact: Json
          fingerprint: string
          id: string
          insight_id: string | null
          interpretation: string
          operation: string | null
          period_end: string
          period_start: string
          priority_score: number
          recommendation_type: Database["public"]["Enums"]["strategy_recommendation_type"]
          reverted_at: string | null
          reverted_by: string | null
          sample_size: number
          status: Database["public"]["Enums"]["strategy_recommendation_status"]
          status_reason: string | null
          target: string | null
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          after?: Json | null
          applied_at?: string | null
          applied_by?: string | null
          before?: Json | null
          confidence: Database["public"]["Enums"]["performance_confidence"]
          created_at?: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence: Json
          expires_at: string
          fact: Json
          fingerprint: string
          id?: string
          insight_id?: string | null
          interpretation: string
          operation?: string | null
          period_end: string
          period_start: string
          priority_score?: number
          recommendation_type: Database["public"]["Enums"]["strategy_recommendation_type"]
          reverted_at?: string | null
          reverted_by?: string | null
          sample_size: number
          status?: Database["public"]["Enums"]["strategy_recommendation_status"]
          status_reason?: string | null
          target?: string | null
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          after?: Json | null
          applied_at?: string | null
          applied_by?: string | null
          before?: Json | null
          confidence?: Database["public"]["Enums"]["performance_confidence"]
          created_at?: string
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          evidence?: Json
          expires_at?: string
          fact?: Json
          fingerprint?: string
          id?: string
          insight_id?: string | null
          interpretation?: string
          operation?: string | null
          period_end?: string
          period_start?: string
          priority_score?: number
          recommendation_type?: Database["public"]["Enums"]["strategy_recommendation_type"]
          reverted_at?: string | null
          reverted_by?: string | null
          sample_size?: number
          status?: Database["public"]["Enums"]["strategy_recommendation_status"]
          status_reason?: string | null
          target?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_recommendations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_recommendations_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_recommendations_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_recommendations_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "performance_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_recommendations_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategy_recommendations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_status_history: {
        Row: {
          created_at: string
          from_status: Database["public"]["Enums"]["subscription_status"] | null
          id: string
          organization_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["subscription_status"]
        }
        Insert: {
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          id?: string
          organization_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["subscription_status"]
        }
        Update: {
          created_at?: string
          from_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          id?: string
          organization_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["subscription_status"]
        }
        Relationships: [
          {
            foreignKeyName: "subscription_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          activated_at: string | null
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          organization_id: string
          past_due_grace_days: number
          past_due_since: string | null
          pending_billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_change_kind: string | null
          pending_change_price_cents: number | null
          pending_plan_id: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          past_due_grace_days?: number
          past_due_since?: string | null
          pending_billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_change_kind?: string | null
          pending_change_price_cents?: number | null
          pending_plan_id?: string | null
          plan_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          past_due_grace_days?: number
          past_due_since?: string | null
          pending_billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_change_kind?: string | null
          pending_change_price_cents?: number | null
          pending_plan_id?: string | null
          plan_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_pending_plan_id_fkey"
            columns: ["pending_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      temp_backup_sub: {
        Row: {
          id: string | null
          organization_id: string | null
          status: Database["public"]["Enums"]["subscription_status"] | null
        }
        Insert: {
          id?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
        }
        Update: {
          id?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
        }
        Relationships: []
      }
      visual_dna_generation_runs: {
        Row: {
          credit_cost: number
          duration_ms: number | null
          errors: Json
          finished_at: string | null
          id: string
          images_attempted: number
          images_succeeded: number
          option_set_id: string | null
          started_at: string
          workspace_id: string
        }
        Insert: {
          credit_cost?: number
          duration_ms?: number | null
          errors?: Json
          finished_at?: string | null
          id?: string
          images_attempted?: number
          images_succeeded?: number
          option_set_id?: string | null
          started_at?: string
          workspace_id: string
        }
        Update: {
          credit_cost?: number
          duration_ms?: number | null
          errors?: Json
          finished_at?: string | null
          id?: string
          images_attempted?: number
          images_succeeded?: number
          option_set_id?: string | null
          started_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_dna_generation_runs_option_set_id_fkey"
            columns: ["option_set_id"]
            isOneToOne: false
            referencedRelation: "visual_dna_option_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_dna_generation_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_dna_option_sets: {
        Row: {
          created_at: string
          created_by: string | null
          credit_cost: number
          credit_ledger_id: string | null
          finished_at: string | null
          id: string
          prompt_version: string
          reference_snapshot: Json
          round_number: number
          shared_brief: Json | null
          status: Database["public"]["Enums"]["visual_dna_option_set_status"]
          status_reason: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_cost?: number
          credit_ledger_id?: string | null
          finished_at?: string | null
          id?: string
          prompt_version?: string
          reference_snapshot?: Json
          round_number: number
          shared_brief?: Json | null
          status?: Database["public"]["Enums"]["visual_dna_option_set_status"]
          status_reason?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_cost?: number
          credit_ledger_id?: string | null
          finished_at?: string | null
          id?: string
          prompt_version?: string
          reference_snapshot?: Json
          round_number?: number
          shared_brief?: Json | null
          status?: Database["public"]["Enums"]["visual_dna_option_set_status"]
          status_reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_dna_option_sets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_dna_option_sets_credit_ledger_id_fkey"
            columns: ["credit_ledger_id"]
            isOneToOne: false
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_dna_option_sets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_dna_options: {
        Row: {
          ai_generation_id: string | null
          attributes: Json | null
          attributes_summary: string | null
          created_at: string
          id: string
          label: string
          option_set_id: string
          preview_asset_path: string | null
          status: Database["public"]["Enums"]["visual_dna_option_status"]
          workspace_id: string
        }
        Insert: {
          ai_generation_id?: string | null
          attributes?: Json | null
          attributes_summary?: string | null
          created_at?: string
          id?: string
          label: string
          option_set_id: string
          preview_asset_path?: string | null
          status?: Database["public"]["Enums"]["visual_dna_option_status"]
          workspace_id: string
        }
        Update: {
          ai_generation_id?: string | null
          attributes?: Json | null
          attributes_summary?: string | null
          created_at?: string
          id?: string
          label?: string
          option_set_id?: string
          preview_asset_path?: string | null
          status?: Database["public"]["Enums"]["visual_dna_option_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_dna_options_ai_generation_id_fkey"
            columns: ["ai_generation_id"]
            isOneToOne: false
            referencedRelation: "ai_generations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_dna_options_option_set_id_fkey"
            columns: ["option_set_id"]
            isOneToOne: false
            referencedRelation: "visual_dna_option_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_dna_options_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
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
          organization_id: string
          owner_id: string
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          owner_id: string
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          owner_id?: string
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
      _compute_coupon_discount: {
        Args: {
          p_coupon: Database["public"]["Tables"]["coupons"]["Row"]
          p_original_amount_cents: number
        }
        Returns: number
      }
      _pilot_submit_content_if_visual_complete: {
        Args: { p_content_id: string }
        Returns: undefined
      }
      _validate_coupon_eligibility: {
        Args: {
          p_billing_interval: Database["public"]["Enums"]["billing_interval"]
          p_coupon: Database["public"]["Tables"]["coupons"]["Row"]
          p_organization_id: string
          p_plan_id: string
        }
        Returns: string
      }
      accept_organization_invite: { Args: { p_token: string }; Returns: Json }
      activate_pilot: {
        Args: { p_workspace_id: string }
        Returns: {
          allowed_formats: Database["public"]["Enums"]["content_type"][]
          allowed_weekdays: number[]
          always_require_approval: boolean
          auto_generate_art: boolean
          created_at: string
          default_instagram_account_id: string | null
          editorial_mix: Json
          format_mix: Json | null
          id: string
          max_credits_per_window: number | null
          max_posts_per_window: number
          max_radar_per_window: number
          mode: Database["public"]["Enums"]["pilot_mode"]
          planning_window_days: number
          preferred_times: Json
          radar_min_confidence: string
          radar_min_opportunity_score: number
          status: Database["public"]["Enums"]["pilot_status"]
          temporary_objective: string | null
          temporary_objective_expires_at: string | null
          updated_at: string
          use_radar: boolean
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_brand_reference: {
        Args: {
          p_handle: string
          p_liked_aspects?: string[]
          p_notes?: string
          p_reference_type?: string
          p_workspace_id: string
        }
        Returns: {
          analysis: Json | null
          analysis_error_code: string | null
          analyzed_at: string | null
          created_at: string
          created_by: string | null
          handle: string
          id: string
          ig_user_id: string | null
          liked_aspects: string[]
          notes: string | null
          reference_type: string | null
          removed_at: string | null
          status: Database["public"]["Enums"]["brand_reference_status"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "brand_reference_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_pilot_plan_item: {
        Args: {
          p_angle?: string
          p_brand_pillar?: string
          p_editorial_role: Database["public"]["Enums"]["pilot_editorial_role"]
          p_format: Database["public"]["Enums"]["content_type"]
          p_objective?: string
          p_plan_id: string
          p_scheduled_for: string
          p_topic: string
        }
        Returns: {
          angle: string | null
          attempt_count: number
          brand_pillar: string | null
          claimed_at: string | null
          content_id: string | null
          created_at: string
          directive: string | null
          editorial_role: Database["public"]["Enums"]["pilot_editorial_role"]
          experiment_id: string | null
          format: Database["public"]["Enums"]["content_type"]
          id: string
          last_attempt_at: string | null
          last_error: string | null
          objective: string | null
          pilot_plan_id: string
          radar_opportunity_id: string | null
          reason: string | null
          rejection_feedback: Json | null
          scheduled_for: string
          source: string
          status: Database["public"]["Enums"]["pilot_plan_item_status"]
          status_reason: string | null
          topic: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plan_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adjust_brand_visual_dna: {
        Args: { p_attributes: Json; p_workspace_id: string }
        Returns: {
          attributes: Json
          based_on_option_id: string | null
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          id: string
          reference_ids: string[]
          status: string
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "brand_visual_dna"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_confirmed_plan_change_system: {
        Args: { p_organization_id: string }
        Returns: {
          activated_at: string | null
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          organization_id: string
          past_due_grace_days: number
          past_due_since: string | null
          pending_billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_change_kind: string | null
          pending_change_price_cents: number | null
          pending_plan_id: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_scheduled_downgrades_system: { Args: never; Returns: number }
      apply_strategy_recommendation: {
        Args: { p_recommendation_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          after: Json | null
          applied_at: string | null
          applied_by: string | null
          before: Json | null
          confidence: Database["public"]["Enums"]["performance_confidence"]
          created_at: string
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          evidence: Json
          expires_at: string
          fact: Json
          fingerprint: string
          id: string
          insight_id: string | null
          interpretation: string
          operation: string | null
          period_end: string
          period_start: string
          priority_score: number
          recommendation_type: Database["public"]["Enums"]["strategy_recommendation_type"]
          reverted_at: string | null
          reverted_by: string | null
          sample_size: number
          status: Database["public"]["Enums"]["strategy_recommendation_status"]
          status_reason: string | null
          target: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "strategy_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_pilot_plan: {
        Args: { p_plan_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          generated_at: string
          generation_key: string
          id: string
          mode: Database["public"]["Enums"]["pilot_mode"]
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["pilot_plan_status"]
          superseded_by: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_organization_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      cancel_pilot_plan: {
        Args: { p_plan_id: string; p_reason?: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          generated_at: string
          generation_key: string
          id: string
          mode: Database["public"]["Enums"]["pilot_mode"]
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["pilot_plan_status"]
          superseded_by: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_strategy_experiment: {
        Args: { p_experiment_id: string; p_reason?: string }
        Returns: {
          actual_sample_size: number
          baseline_definition: Json
          cancelled_at: string | null
          completed_at: string | null
          confidence:
            | Database["public"]["Enums"]["performance_confidence"]
            | null
          created_at: string
          created_by: string | null
          dimension: string
          hypothesis: string
          id: string
          period_end: string
          period_start: string
          recommendation_id: string | null
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["strategy_experiment_status"]
          success_criteria: Json
          target_sample_size: number
          updated_at: string
          variant: Json
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "strategy_experiments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_member_role: {
        Args: {
          p_new_role: Database["public"]["Enums"]["workspace_role"]
          p_user_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      check_brand_dna_ready: { Args: { p_workspace_id: string }; Returns: Json }
      check_pilot_activation_readiness: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      check_subscription_entitlement: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
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
      claim_performance_snapshots: {
        Args: { p_limit?: number }
        Returns: {
          age_bucket: string
          api_version: string | null
          attempt_count: number
          captured_at: string | null
          claimed_at: string | null
          collector_status: Database["public"]["Enums"]["performance_snapshot_status"]
          comments: number | null
          content_id: string
          created_at: string
          id: string
          instagram_account_id: string
          instagram_publication_id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          likes: number | null
          next_retry_at: string | null
          raw_metrics: Json
          reach: number | null
          saved: number | null
          shares: number | null
          target_at: string
          total_interactions: number | null
          unsupported_metrics: string[]
          updated_at: string
          views: number | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "content_performance_snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pilot_plan_items_for_generation: {
        Args: { p_limit?: number; p_plan_id: string }
        Returns: {
          angle: string | null
          attempt_count: number
          brand_pillar: string | null
          claimed_at: string | null
          content_id: string | null
          created_at: string
          directive: string | null
          editorial_role: Database["public"]["Enums"]["pilot_editorial_role"]
          experiment_id: string | null
          format: Database["public"]["Enums"]["content_type"]
          id: string
          last_attempt_at: string | null
          last_error: string | null
          objective: string | null
          pilot_plan_id: string
          radar_opportunity_id: string | null
          reason: string | null
          rejection_feedback: Json | null
          scheduled_for: string
          source: string
          status: Database["public"]["Enums"]["pilot_plan_item_status"]
          status_reason: string | null
          topic: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pilot_plan_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pilot_workspace_for_planning: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_workspace_id: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          generated_at: string
          generation_key: string
          id: string
          mode: Database["public"]["Enums"]["pilot_mode"]
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["pilot_plan_status"]
          superseded_by: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_stuck_image_generations:
        | {
            Args: {
              p_limit?: number
              p_max_attempts?: number
              p_timeout_minutes?: number
            }
            Returns: {
              id: string
              task_id: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_max_attempts?: number
              p_retry_timeout_minutes?: number
              p_timeout_minutes?: number
            }
            Returns: {
              id: string
              task_id: string
            }[]
          }
      claim_visual_dna_generation: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          credit_cost: number
          credit_ledger_id: string | null
          finished_at: string | null
          id: string
          prompt_version: string
          reference_snapshot: Json
          round_number: number
          shared_brief: Json | null
          status: Database["public"]["Enums"]["visual_dna_option_set_status"]
          status_reason: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "visual_dna_option_sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cleanup_ai_webhook_rejections: { Args: never; Returns: undefined }
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
      compute_experiment_result: {
        Args: { p_experiment_id: string }
        Returns: {
          actual_sample_size: number
          baseline_definition: Json
          cancelled_at: string | null
          completed_at: string | null
          confidence:
            | Database["public"]["Enums"]["performance_confidence"]
            | null
          created_at: string
          created_by: string | null
          dimension: string
          hypothesis: string
          id: string
          period_end: string
          period_start: string
          recommendation_id: string | null
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["strategy_experiment_status"]
          success_criteria: Json
          target_sample_size: number
          updated_at: string
          variant: Json
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "strategy_experiments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_performance_facts: {
        Args: { p_period_days?: number; p_workspace_id: string }
        Returns: Json
      }
      confirm_visual_dna_from_content: {
        Args: {
          p_attributes: Json
          p_based_on_content_id?: string
          p_workspace_id: string
        }
        Returns: {
          attributes: Json
          based_on_option_id: string | null
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          id: string
          reference_ids: string[]
          status: string
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "brand_visual_dna"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_visual_dna_option: {
        Args: { p_option_id: string }
        Returns: {
          attributes: Json
          based_on_option_id: string | null
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          id: string
          reference_ids: string[]
          status: string
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "brand_visual_dna"
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
      consume_credits_system: {
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
      count_organization_seats_used: {
        Args: { p_organization_id: string }
        Returns: number
      }
      create_organization_invite: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["workspace_role"]
          p_workspace_id: string
        }
        Returns: {
          invite_id: string
          token: string
        }[]
      }
      create_workspace_in_organization: {
        Args: { p_name: string; p_organization_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          organization_id: string
          owner_id: string
          slug: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_pilot_schedule_slot: {
        Args: { p_slot_id: string }
        Returns: undefined
      }
      disable_pilot: {
        Args: { p_workspace_id: string }
        Returns: {
          allowed_formats: Database["public"]["Enums"]["content_type"][]
          allowed_weekdays: number[]
          always_require_approval: boolean
          auto_generate_art: boolean
          created_at: string
          default_instagram_account_id: string | null
          editorial_mix: Json
          format_mix: Json | null
          id: string
          max_credits_per_window: number | null
          max_posts_per_window: number
          max_radar_per_window: number
          mode: Database["public"]["Enums"]["pilot_mode"]
          planning_window_days: number
          preferred_times: Json
          radar_min_confidence: string
          radar_min_opportunity_score: number
          status: Database["public"]["Enums"]["pilot_status"]
          temporary_objective: string | null
          temporary_objective_expires_at: string | null
          updated_at: string
          use_radar: boolean
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      discovery_claim_create_content: {
        Args: {
          p_caption: string
          p_created_by: string
          p_discovery_session_id: string
          p_format: Database["public"]["Enums"]["content_format"]
          p_page_height: number
          p_page_width: number
          p_title: string
          p_type: Database["public"]["Enums"]["content_type"]
          p_workspace_id: string
        }
        Returns: {
          caption: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          deleted_at: string | null
          discovery_session_id: string | null
          duplicated_from: string | null
          format: Database["public"]["Enums"]["content_format"]
          hashtags: string[]
          id: string
          origin: Database["public"]["Enums"]["content_origin"]
          pilot_plan_item_id: string | null
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
      discovery_claim_promote_contents: {
        Args: {
          p_created_by: string
          p_previews: Json
          p_session_id: string
          p_workspace_id: string
        }
        Returns: {
          caption: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          deleted_at: string | null
          discovery_session_id: string | null
          duplicated_from: string | null
          format: Database["public"]["Enums"]["content_format"]
          hashtags: string[]
          id: string
          origin: Database["public"]["Enums"]["content_origin"]
          pilot_plan_item_id: string | null
          published_at: string | null
          radar_opportunity_id: string | null
          rejection_reason: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "contents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dismiss_onboarding: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      dismiss_onboarding_step: {
        Args: { p_step: string; p_workspace_id: string }
        Returns: undefined
      }
      dismiss_strategy_recommendation: {
        Args: { p_reason?: string; p_recommendation_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          after: Json | null
          applied_at: string | null
          applied_by: string | null
          before: Json | null
          confidence: Database["public"]["Enums"]["performance_confidence"]
          created_at: string
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          evidence: Json
          expires_at: string
          fact: Json
          fingerprint: string
          id: string
          insight_id: string | null
          interpretation: string
          operation: string | null
          period_end: string
          period_start: string
          priority_score: number
          recommendation_type: Database["public"]["Enums"]["strategy_recommendation_type"]
          reverted_at: string | null
          reverted_by: string | null
          sample_size: number
          status: Database["public"]["Enums"]["strategy_recommendation_status"]
          status_reason: string | null
          target: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "strategy_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dismiss_visual_dna_option_set: {
        Args: { p_feedback?: string; p_option_set_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          credit_cost: number
          credit_ledger_id: string | null
          finished_at: string | null
          id: string
          prompt_version: string
          reference_snapshot: Json
          round_number: number
          shared_brief: Json | null
          status: Database["public"]["Enums"]["visual_dna_option_set_status"]
          status_reason: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "visual_dna_option_sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_pilot_plan_item: {
        Args: {
          p_angle?: string
          p_brand_pillar?: string
          p_editorial_role?: Database["public"]["Enums"]["pilot_editorial_role"]
          p_format?: Database["public"]["Enums"]["content_type"]
          p_item_id: string
          p_objective?: string
          p_scheduled_for?: string
          p_topic?: string
        }
        Returns: {
          angle: string | null
          attempt_count: number
          brand_pillar: string | null
          claimed_at: string | null
          content_id: string | null
          created_at: string
          directive: string | null
          editorial_role: Database["public"]["Enums"]["pilot_editorial_role"]
          experiment_id: string | null
          format: Database["public"]["Enums"]["content_type"]
          id: string
          last_attempt_at: string | null
          last_error: string | null
          objective: string | null
          pilot_plan_id: string
          radar_opportunity_id: string | null
          reason: string | null
          rejection_feedback: Json | null
          scheduled_for: string
          source: string
          status: Database["public"]["Enums"]["pilot_plan_item_status"]
          status_reason: string | null
          topic: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plan_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_performance_snapshots_scheduled: {
        Args: { p_limit?: number; p_lookback_days?: number }
        Returns: number
      }
      export_my_data: { Args: never; Returns: Json }
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
      fail_visual_dna_generation: {
        Args: { p_option_set_id: string; p_reason?: string }
        Returns: {
          created_at: string
          created_by: string | null
          credit_cost: number
          credit_ledger_id: string | null
          finished_at: string | null
          id: string
          prompt_version: string
          reference_snapshot: Json
          round_number: number
          shared_brief: Json | null
          status: Database["public"]["Enums"]["visual_dna_option_set_status"]
          status_reason: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "visual_dna_option_sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_coupon_redemption_system: {
        Args: {
          p_asaas_payment_id?: string
          p_asaas_subscription_id?: string
          p_failure_reason?: string
          p_redemption_id: string
          p_status: Database["public"]["Enums"]["coupon_redemption_status"]
          p_subscription_id?: string
        }
        Returns: {
          asaas_payment_id: string | null
          asaas_subscription_id: string | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          coupon_id: string
          created_at: string
          created_by: string | null
          discount_amount_cents: number
          failure_reason: string | null
          final_amount_cents: number
          id: string
          organization_id: string
          original_amount_cents: number
          plan_id: string
          status: Database["public"]["Enums"]["coupon_redemption_status"]
          subscription_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "coupon_redemptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_pilot_plan: {
        Args: { p_plan_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          generated_at: string
          generation_key: string
          id: string
          mode: Database["public"]["Enums"]["pilot_mode"]
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["pilot_plan_status"]
          superseded_by: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_effective_subscription_status: {
        Args: { p_sub: Database["public"]["Tables"]["subscriptions"]["Row"] }
        Returns: Database["public"]["Enums"]["subscription_status"]
      }
      get_franchise_period: {
        Args: {
          p_now?: string
          p_sub: Database["public"]["Tables"]["subscriptions"]["Row"]
        }
        Returns: {
          period_end: string
          period_start: string
        }[]
      }
      get_invite_preview: { Args: { p_token: string }; Returns: Json }
      get_onboarding_state: { Args: { p_workspace_id: string }; Returns: Json }
      get_workspace_entitlements: {
        Args: { p_workspace_id: string }
        Returns: Json
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
      is_current_account_active: { Args: never; Returns: boolean }
      is_organization_member: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      is_organization_owner: {
        Args: { p_organization_id: string }
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
          recovery_attempts: number
          recovery_claimed_at: string | null
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
      list_organization_invites: {
        Args: { p_organization_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_name: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          workspace_id: string
          workspace_name: string
        }[]
      }
      list_organization_members: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          full_name: string
          member_since: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
          workspace_name: string
        }[]
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
      log_instagram_worker_audit_event: {
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
      pause_pilot: {
        Args: { p_workspace_id: string }
        Returns: {
          allowed_formats: Database["public"]["Enums"]["content_type"][]
          allowed_weekdays: number[]
          always_require_approval: boolean
          auto_generate_art: boolean
          created_at: string
          default_instagram_account_id: string | null
          editorial_mix: Json
          format_mix: Json | null
          id: string
          max_credits_per_window: number | null
          max_posts_per_window: number
          max_radar_per_window: number
          mode: Database["public"]["Enums"]["pilot_mode"]
          planning_window_days: number
          preferred_times: Json
          radar_min_confidence: string
          radar_min_opportunity_score: number
          status: Database["public"]["Enums"]["pilot_status"]
          temporary_objective: string | null
          temporary_objective_expires_at: string | null
          updated_at: string
          use_radar: boolean
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pilot_check_budget: {
        Args: { p_needed: number; p_plan_id: string; p_workspace_id: string }
        Returns: Json
      }
      pilot_check_slot_conflict: {
        Args: {
          p_exclude_plan_item_id?: string
          p_scheduled_for: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      pilot_claim_visual_asset_manual_retry: {
        Args: { p_page_id: string }
        Returns: {
          background_color: string
          content_id: string
          created_at: string
          height: number
          id: string
          position: number
          updated_at: string
          visual_ai_generation_id: string | null
          visual_asset_status: Database["public"]["Enums"]["content_visual_asset_status"]
          visual_generation_attempts: number
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "content_pages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pilot_claim_visual_assets_for_auto_retry: {
        Args: { p_limit?: number }
        Returns: {
          background_color: string
          content_id: string
          created_at: string
          height: number
          id: string
          position: number
          updated_at: string
          visual_ai_generation_id: string | null
          visual_asset_status: Database["public"]["Enums"]["content_visual_asset_status"]
          visual_generation_attempts: number
          width: number
        }[]
        SetofOptions: {
          from: "*"
          to: "content_pages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      pilot_create_content: {
        Args: {
          p_caption: string
          p_cta: string
          p_format: Database["public"]["Enums"]["content_format"]
          p_hashtags: string[]
          p_pilot_plan_item_id: string
          p_title: string
          p_type: Database["public"]["Enums"]["content_type"]
          p_workspace_id: string
        }
        Returns: {
          caption: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          deleted_at: string | null
          discovery_session_id: string | null
          duplicated_from: string | null
          format: Database["public"]["Enums"]["content_format"]
          hashtags: string[]
          id: string
          origin: Database["public"]["Enums"]["content_origin"]
          pilot_plan_item_id: string | null
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
      pilot_estimate_batch_cost: {
        Args: { p_plan_id: string }
        Returns: number
      }
      pilot_mark_visual_asset_failed: {
        Args: { p_page_id: string; p_reason: string }
        Returns: {
          background_color: string
          content_id: string
          created_at: string
          height: number
          id: string
          position: number
          updated_at: string
          visual_ai_generation_id: string | null
          visual_asset_status: Database["public"]["Enums"]["content_visual_asset_status"]
          visual_generation_attempts: number
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "content_pages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pilot_mark_visual_asset_generating: {
        Args: { p_ai_generation_id: string; p_page_id: string }
        Returns: {
          background_color: string
          content_id: string
          created_at: string
          height: number
          id: string
          position: number
          updated_at: string
          visual_ai_generation_id: string | null
          visual_asset_status: Database["public"]["Enums"]["content_visual_asset_status"]
          visual_generation_attempts: number
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "content_pages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pilot_reclaim_stuck_plan_items: {
        Args: {
          p_limit?: number
          p_max_attempts?: number
          p_timeout_minutes?: number
        }
        Returns: {
          item_id: string
          outcome: string
          plan_id: string
        }[]
      }
      pilot_submit_content_for_review: {
        Args: { p_content_id: string }
        Returns: {
          caption: string | null
          created_at: string
          created_by: string | null
          cta: string | null
          deleted_at: string | null
          discovery_session_id: string | null
          duplicated_from: string | null
          format: Database["public"]["Enums"]["content_format"]
          hashtags: string[]
          id: string
          origin: Database["public"]["Enums"]["content_origin"]
          pilot_plan_item_id: string | null
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
      preview_coupon: {
        Args: {
          p_billing_interval: Database["public"]["Enums"]["billing_interval"]
          p_code: string
          p_organization_id: string
          p_plan_id: string
        }
        Returns: Json
      }
      process_asaas_payment_confirmed_system: {
        Args: {
          p_asaas_event_id: string
          p_asaas_subscription_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      process_asaas_payment_overdue_system: {
        Args: { p_asaas_event_id: string; p_asaas_subscription_id: string }
        Returns: Json
      }
      radar_claim_match_jobs: {
        Args: { p_batch_size: number; p_lease_minutes?: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          cluster_id: string
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "radar_match_jobs"
          isOneToOne: false
          isSetofReturn: true
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
      recompute_content_performance_score: {
        Args: { p_instagram_publication_id: string }
        Returns: {
          baseline_sample_size: number
          baseline_scope:
            | Database["public"]["Enums"]["performance_baseline_scope"]
            | null
          baseline_tier: Database["public"]["Enums"]["performance_baseline_tier"]
          computed_at: string
          content_id: string
          created_at: string
          format: Database["public"]["Enums"]["content_type"]
          id: string
          instagram_publication_id: string
          latest_age_bucket: string | null
          maturity_stage: Database["public"]["Enums"]["performance_maturity_stage"]
          relative_engagement: number | null
          relative_reach: number | null
          relative_saves: number | null
          relative_shares: number | null
          score: number | null
          scoring_config_snapshot: Json
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "content_performance_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_legal_acceptance: {
        Args: { p_document_type: string; p_document_version: string }
        Returns: undefined
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
      remove_brand_reference: {
        Args: { p_reference_id: string }
        Returns: {
          analysis: Json | null
          analysis_error_code: string | null
          analyzed_at: string | null
          created_at: string
          created_by: string | null
          handle: string
          id: string
          ig_user_id: string | null
          liked_aspects: string[]
          notes: string | null
          reference_type: string | null
          removed_at: string | null
          status: Database["public"]["Enums"]["brand_reference_status"]
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "brand_reference_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_organization_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      request_account_deletion: {
        Args: { p_email_confirmation: string }
        Returns: Json
      }
      request_plan_change: {
        Args: {
          p_new_billing_interval: Database["public"]["Enums"]["billing_interval"]
          p_new_plan_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      resend_organization_invite: {
        Args: { p_invite_id: string }
        Returns: {
          invite_id: string
          token: string
        }[]
      }
      reserve_coupon_redemption_system: {
        Args: {
          p_billing_interval: Database["public"]["Enums"]["billing_interval"]
          p_code: string
          p_organization_id: string
          p_plan_id: string
        }
        Returns: Json
      }
      resolve_pilot_plan_item: {
        Args: {
          p_content_id?: string
          p_item_id: string
          p_outcome: string
          p_reason?: string
        }
        Returns: {
          angle: string | null
          attempt_count: number
          brand_pillar: string | null
          claimed_at: string | null
          content_id: string | null
          created_at: string
          directive: string | null
          editorial_role: Database["public"]["Enums"]["pilot_editorial_role"]
          experiment_id: string | null
          format: Database["public"]["Enums"]["content_type"]
          id: string
          last_attempt_at: string | null
          last_error: string | null
          objective: string | null
          pilot_plan_id: string
          radar_opportunity_id: string | null
          reason: string | null
          rejection_feedback: Json | null
          scheduled_for: string
          source: string
          status: Database["public"]["Enums"]["pilot_plan_item_status"]
          status_reason: string | null
          topic: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plan_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resume_pilot: {
        Args: { p_workspace_id: string }
        Returns: {
          allowed_formats: Database["public"]["Enums"]["content_type"][]
          allowed_weekdays: number[]
          always_require_approval: boolean
          auto_generate_art: boolean
          created_at: string
          default_instagram_account_id: string | null
          editorial_mix: Json
          format_mix: Json | null
          id: string
          max_credits_per_window: number | null
          max_posts_per_window: number
          max_radar_per_window: number
          mode: Database["public"]["Enums"]["pilot_mode"]
          planning_window_days: number
          preferred_times: Json
          radar_min_confidence: string
          radar_min_opportunity_score: number
          status: Database["public"]["Enums"]["pilot_status"]
          temporary_objective: string | null
          temporary_objective_expires_at: string | null
          updated_at: string
          use_radar: boolean
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revert_strategy_recommendation: {
        Args: { p_recommendation_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          after: Json | null
          applied_at: string | null
          applied_by: string | null
          before: Json | null
          confidence: Database["public"]["Enums"]["performance_confidence"]
          created_at: string
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          evidence: Json
          expires_at: string
          fact: Json
          fingerprint: string
          id: string
          insight_id: string | null
          interpretation: string
          operation: string | null
          period_end: string
          period_start: string
          priority_score: number
          recommendation_type: Database["public"]["Enums"]["strategy_recommendation_type"]
          reverted_at: string | null
          reverted_by: string | null
          sample_size: number
          status: Database["public"]["Enums"]["strategy_recommendation_status"]
          status_reason: string | null
          target: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "strategy_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_subscription_status_transitions_system: { Args: never; Returns: Json }
      schedule_subscription_cancellation: {
        Args: { p_organization_id: string }
        Returns: {
          activated_at: string | null
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          organization_id: string
          past_due_grace_days: number
          past_due_since: string | null
          pending_billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_change_kind: string | null
          pending_change_price_cents: number | null
          pending_plan_id: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_performance_insight_feedback: {
        Args: {
          p_dismiss?: boolean
          p_feedback?: Database["public"]["Enums"]["performance_insight_feedback"]
          p_insight_id: string
        }
        Returns: {
          ai_generation_id: string | null
          confidence: Database["public"]["Enums"]["performance_confidence"]
          created_at: string
          description: string
          dismissed_at: string | null
          evidence: Json
          fact_signature: string
          feedback:
            | Database["public"]["Enums"]["performance_insight_feedback"]
            | null
          generated_at: string
          id: string
          insight_type: string
          period_end: string
          period_start: string
          sample_size: number
          source: Database["public"]["Enums"]["performance_insight_source"]
          status: Database["public"]["Enums"]["performance_insight_status"]
          title: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "performance_insights"
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
      skip_pilot_plan_item: {
        Args: { p_item_id: string; p_reason?: string }
        Returns: {
          angle: string | null
          attempt_count: number
          brand_pillar: string | null
          claimed_at: string | null
          content_id: string | null
          created_at: string
          directive: string | null
          editorial_role: Database["public"]["Enums"]["pilot_editorial_role"]
          experiment_id: string | null
          format: Database["public"]["Enums"]["content_type"]
          id: string
          last_attempt_at: string | null
          last_error: string | null
          objective: string | null
          pilot_plan_id: string
          radar_opportunity_id: string | null
          reason: string | null
          rejection_feedback: Json | null
          scheduled_for: string
          source: string
          status: Database["public"]["Enums"]["pilot_plan_item_status"]
          status_reason: string | null
          topic: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plan_items"
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
          discovery_session_id: string | null
          duplicated_from: string | null
          format: Database["public"]["Enums"]["content_format"]
          hashtags: string[]
          id: string
          origin: Database["public"]["Enums"]["content_origin"]
          pilot_plan_item_id: string | null
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
      start_pilot_generation: {
        Args: { p_plan_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          generated_at: string
          generation_key: string
          id: string
          mode: Database["public"]["Enums"]["pilot_mode"]
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["pilot_plan_status"]
          superseded_by: string | null
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      start_strategy_experiment: {
        Args: {
          p_dimension: string
          p_hypothesis: string
          p_period_days?: number
          p_recommendation_id?: string
          p_success_threshold_pct?: number
          p_target_sample_size?: number
          p_variant: Json
          p_workspace_id: string
        }
        Returns: {
          actual_sample_size: number
          baseline_definition: Json
          cancelled_at: string | null
          completed_at: string | null
          confidence:
            | Database["public"]["Enums"]["performance_confidence"]
            | null
          created_at: string
          created_by: string | null
          dimension: string
          hypothesis: string
          id: string
          period_end: string
          period_start: string
          recommendation_id: string | null
          result: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["strategy_experiment_status"]
          success_criteria: Json
          target_sample_size: number
          updated_at: string
          variant: Json
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "strategy_experiments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      storage_path_workspace_id: {
        Args: { object_name: string }
        Returns: string
      }
      sync_visual_dna_option_set: {
        Args: { p_option_set_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          credit_cost: number
          credit_ledger_id: string | null
          finished_at: string | null
          id: string
          prompt_version: string
          reference_snapshot: Json
          round_number: number
          shared_brief: Json | null
          status: Database["public"]["Enums"]["visual_dna_option_set_status"]
          status_reason: string | null
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "visual_dna_option_sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      undo_subscription_cancellation: {
        Args: { p_organization_id: string }
        Returns: {
          activated_at: string | null
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          organization_id: string
          past_due_grace_days: number
          past_due_since: string | null
          pending_billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          pending_change_kind: string | null
          pending_change_price_cents: number | null
          pending_plan_id: string | null
          plan_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "subscriptions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_pilot_schedule_slot: {
        Args: {
          p_directive?: string
          p_slot_id?: string
          p_time_of_day: string
          p_weekday: number
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          directive: string | null
          id: string
          time_of_day: string
          updated_at: string
          weekday: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_schedule_slots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_pilot_settings: {
        Args: {
          p_allowed_formats: Database["public"]["Enums"]["content_type"][]
          p_allowed_weekdays: number[]
          p_always_require_approval?: boolean
          p_auto_generate_art?: boolean
          p_default_instagram_account_id: string
          p_editorial_mix: Json
          p_format_mix?: Json
          p_max_credits_per_window: number
          p_max_posts_per_window: number
          p_max_radar_per_window: number
          p_mode: Database["public"]["Enums"]["pilot_mode"]
          p_planning_window_days: number
          p_preferred_times: Json
          p_radar_min_confidence: string
          p_radar_min_opportunity_score: number
          p_temporary_objective: string
          p_temporary_objective_expires_at: string
          p_use_radar: boolean
          p_workspace_id: string
        }
        Returns: {
          allowed_formats: Database["public"]["Enums"]["content_type"][]
          allowed_weekdays: number[]
          always_require_approval: boolean
          auto_generate_art: boolean
          created_at: string
          default_instagram_account_id: string | null
          editorial_mix: Json
          format_mix: Json | null
          id: string
          max_credits_per_window: number | null
          max_posts_per_window: number
          max_radar_per_window: number
          mode: Database["public"]["Enums"]["pilot_mode"]
          planning_window_days: number
          preferred_times: Json
          radar_min_confidence: string
          radar_min_opportunity_score: number
          status: Database["public"]["Enums"]["pilot_status"]
          temporary_objective: string | null
          temporary_objective_expires_at: string | null
          updated_at: string
          use_radar: boolean
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pilot_settings"
          isOneToOne: true
          isSetofReturn: false
        }
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
        | "performance_insight"
        | "ideias_onboarding"
      billing_interval: "monthly" | "yearly"
      brand_reference_status:
        | "manual"
        | "analysis_pending"
        | "analyzed"
        | "permission_required"
        | "unavailable"
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
      content_visual_asset_status:
        | "not_requested"
        | "pending"
        | "generating"
        | "ready"
        | "failed"
      coupon_discount_type: "percentage" | "fixed"
      coupon_duration: "first_payment" | "recurring"
      coupon_redemption_status: "reserved" | "applied" | "failed" | "released"
      instagram_account_status:
        | "conectado"
        | "token_expirado"
        | "desconectado"
        | "erro"
      instagram_insights_status:
        | "not_connected"
        | "permission_required"
        | "available"
        | "not_supported"
      instagram_oauth_return_to: "onboarding" | "settings" | "dashboard"
      instagram_publication_status:
        | "pending"
        | "processing"
        | "container_created"
        | "publishing"
        | "published"
        | "failed"
        | "cancelled"
      performance_baseline_scope: "format" | "workspace"
      performance_baseline_tier:
        | "collecting_data"
        | "baseline_provisional"
        | "baseline_ready"
      performance_confidence: "low" | "medium" | "high"
      performance_insight_feedback: "useful" | "not_useful"
      performance_insight_source: "deterministic" | "ai"
      performance_insight_status: "active" | "dismissed" | "expired"
      performance_maturity_stage: "initial" | "evolving" | "consolidated"
      performance_snapshot_status:
        | "pending"
        | "collected"
        | "permission_required"
        | "media_unavailable"
        | "failed"
      pilot_editorial_role:
        | "educativo"
        | "autoridade"
        | "relacionamento"
        | "venda"
      pilot_mode: "assisted" | "semi_auto"
      pilot_plan_item_status:
        | "planned"
        | "approved"
        | "generating"
        | "generated"
        | "skipped"
        | "failed"
      pilot_plan_status:
        | "draft"
        | "awaiting_approval"
        | "approved"
        | "generating"
        | "completed"
        | "cancelled"
      pilot_status: "disabled" | "active" | "paused"
      strategy_experiment_status:
        | "draft"
        | "active"
        | "completed"
        | "cancelled"
        | "inconclusive"
      strategy_recommendation_status:
        | "proposed"
        | "accepted"
        | "dismissed"
        | "expired"
        | "reverted"
      strategy_recommendation_type:
        | "settings_change"
        | "experiment_suggestion"
        | "informational"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "cancel_at_period_end"
        | "cancelled"
        | "expired"
      visual_dna_option_set_status:
        | "generating"
        | "ready"
        | "failed"
        | "dismissed"
      visual_dna_option_status: "pending" | "generated" | "failed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "performance_insight",
        "ideias_onboarding",
      ],
      billing_interval: ["monthly", "yearly"],
      brand_reference_status: [
        "manual",
        "analysis_pending",
        "analyzed",
        "permission_required",
        "unavailable",
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
      content_visual_asset_status: [
        "not_requested",
        "pending",
        "generating",
        "ready",
        "failed",
      ],
      coupon_discount_type: ["percentage", "fixed"],
      coupon_duration: ["first_payment", "recurring"],
      coupon_redemption_status: ["reserved", "applied", "failed", "released"],
      instagram_account_status: [
        "conectado",
        "token_expirado",
        "desconectado",
        "erro",
      ],
      instagram_insights_status: [
        "not_connected",
        "permission_required",
        "available",
        "not_supported",
      ],
      instagram_oauth_return_to: ["onboarding", "settings", "dashboard"],
      instagram_publication_status: [
        "pending",
        "processing",
        "container_created",
        "publishing",
        "published",
        "failed",
        "cancelled",
      ],
      performance_baseline_scope: ["format", "workspace"],
      performance_baseline_tier: [
        "collecting_data",
        "baseline_provisional",
        "baseline_ready",
      ],
      performance_confidence: ["low", "medium", "high"],
      performance_insight_feedback: ["useful", "not_useful"],
      performance_insight_source: ["deterministic", "ai"],
      performance_insight_status: ["active", "dismissed", "expired"],
      performance_maturity_stage: ["initial", "evolving", "consolidated"],
      performance_snapshot_status: [
        "pending",
        "collected",
        "permission_required",
        "media_unavailable",
        "failed",
      ],
      pilot_editorial_role: [
        "educativo",
        "autoridade",
        "relacionamento",
        "venda",
      ],
      pilot_mode: ["assisted", "semi_auto"],
      pilot_plan_item_status: [
        "planned",
        "approved",
        "generating",
        "generated",
        "skipped",
        "failed",
      ],
      pilot_plan_status: [
        "draft",
        "awaiting_approval",
        "approved",
        "generating",
        "completed",
        "cancelled",
      ],
      pilot_status: ["disabled", "active", "paused"],
      strategy_experiment_status: [
        "draft",
        "active",
        "completed",
        "cancelled",
        "inconclusive",
      ],
      strategy_recommendation_status: [
        "proposed",
        "accepted",
        "dismissed",
        "expired",
        "reverted",
      ],
      strategy_recommendation_type: [
        "settings_change",
        "experiment_suggestion",
        "informational",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "cancel_at_period_end",
        "cancelled",
        "expired",
      ],
      visual_dna_option_set_status: [
        "generating",
        "ready",
        "failed",
        "dismissed",
      ],
      visual_dna_option_status: ["pending", "generated", "failed"],
      workspace_role: ["owner", "admin", "editor", "approver", "viewer"],
    },
  },
} as const
