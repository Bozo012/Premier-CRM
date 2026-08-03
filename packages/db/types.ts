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
      activity_log: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          message: string | null
          org_id: string
          related_ids: Json | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          message?: string | null
          org_id: string
          related_ids?: Json | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          message?: string | null
          org_id?: string
          related_ids?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          audio_seconds: number | null
          conversation_id: string | null
          cost_usd: number | null
          feature: string
          id: string
          model: string
          occurred_at: string
          org_id: string
          provider: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string | null
          vault_item_id: string | null
        }
        Insert: {
          audio_seconds?: number | null
          conversation_id?: string | null
          cost_usd?: number | null
          feature: string
          id?: string
          model: string
          occurred_at?: string
          org_id: string
          provider: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
          vault_item_id?: string | null
        }
        Update: {
          audio_seconds?: number | null
          conversation_id?: string | null
          cost_usd?: number | null
          feature?: string
          id?: string
          model?: string
          occurred_at?: string
          org_id?: string
          provider?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string | null
          vault_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_vault_item_id_fkey"
            columns: ["vault_item_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_actions: {
        Row: {
          affected_entity_id: string | null
          affected_entity_type: string | null
          approved_at: string | null
          approved_by: string | null
          conversation_id: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          message_id: string | null
          org_id: string
          rejected_reason: string | null
          status: Database["public"]["Enums"]["action_status"]
          tool_args: Json
          tool_name: string
          tool_result: Json | null
        }
        Insert: {
          affected_entity_id?: string | null
          affected_entity_type?: string | null
          approved_at?: string | null
          approved_by?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          message_id?: string | null
          org_id: string
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          tool_args: Json
          tool_name: string
          tool_result?: Json | null
        }
        Update: {
          affected_entity_id?: string | null
          affected_entity_type?: string | null
          approved_at?: string | null
          approved_by?: string | null
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          message_id?: string | null
          org_id?: string
          rejected_reason?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          tool_args?: Json
          tool_name?: string
          tool_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "assistant_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_conversations: {
        Row: {
          archived: boolean | null
          context_id: string | null
          context_type: string | null
          created_at: string
          id: string
          message_count: number | null
          org_id: string
          title: string | null
          total_tokens_in: number | null
          total_tokens_out: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          message_count?: number | null
          org_id: string
          title?: string | null
          total_tokens_in?: number | null
          total_tokens_out?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          id?: string
          message_count?: number | null
          org_id?: string
          title?: string | null
          total_tokens_in?: number | null
          total_tokens_out?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: string | null
          conversation_id: string
          cost_usd: number | null
          created_at: string
          id: string
          ip_address: unknown
          model: string | null
          role: Database["public"]["Enums"]["message_role"]
          tokens_in: number | null
          tokens_out: number | null
          tool_calls: Json | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          ip_address?: unknown
          model?: string | null
          role: Database["public"]["Enums"]["message_role"]
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          ip_address?: unknown
          model?: string | null
          role?: Database["public"]["Enums"]["message_role"]
          tokens_in?: number | null
          tokens_out?: number | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "assistant_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_events: {
        Row: {
          actions_executed: Json | null
          actions_planned: Json | null
          conditions_failed_at: number | null
          conditions_passed: boolean | null
          error_message: string | null
          id: string
          occurred_at: string
          org_id: string
          outcome: string
          rule_id: string
          trigger_event_type: string
          trigger_payload: Json | null
          user_id: string | null
          user_responded_at: string | null
          user_response: Json | null
        }
        Insert: {
          actions_executed?: Json | null
          actions_planned?: Json | null
          conditions_failed_at?: number | null
          conditions_passed?: boolean | null
          error_message?: string | null
          id?: string
          occurred_at?: string
          org_id: string
          outcome: string
          rule_id: string
          trigger_event_type: string
          trigger_payload?: Json | null
          user_id?: string | null
          user_responded_at?: string | null
          user_response?: Json | null
        }
        Update: {
          actions_executed?: Json | null
          actions_planned?: Json | null
          conditions_failed_at?: number | null
          conditions_passed?: boolean | null
          error_message?: string | null
          id?: string
          occurred_at?: string
          org_id?: string
          outcome?: string
          rule_id?: string
          trigger_event_type?: string
          trigger_payload?: Json | null
          user_id?: string | null
          user_responded_at?: string | null
          user_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json | null
          applies_to_customer_ids: string[] | null
          applies_to_geofence_types:
            | Database["public"]["Enums"]["geofence_type"][]
            | null
          applies_to_job_ids: string[] | null
          conditions: Json | null
          cooldown_seconds: number | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_enabled: boolean | null
          is_system_default: boolean | null
          last_triggered_at: string | null
          max_fires_per_day: number | null
          name: string
          org_id: string
          times_triggered: number | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actions?: Json | null
          applies_to_customer_ids?: string[] | null
          applies_to_geofence_types?:
            | Database["public"]["Enums"]["geofence_type"][]
            | null
          applies_to_job_ids?: string[] | null
          conditions?: Json | null
          cooldown_seconds?: number | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean | null
          is_system_default?: boolean | null
          last_triggered_at?: string | null
          max_fires_per_day?: number | null
          name: string
          org_id: string
          times_triggered?: number | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actions?: Json | null
          applies_to_customer_ids?: string[] | null
          applies_to_geofence_types?:
            | Database["public"]["Enums"]["geofence_type"][]
            | null
          applies_to_job_ids?: string[] | null
          conditions?: Json | null
          cooldown_seconds?: number | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_enabled?: boolean | null
          is_system_default?: boolean | null
          last_triggered_at?: string | null
          max_fires_per_day?: number | null
          name?: string
          org_id?: string
          times_triggered?: number | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      change_order_comments: {
        Row: {
          author_customer_id: string | null
          author_user_id: string | null
          body: string
          change_order_id: string
          created_at: string
          id: string
          org_id: string
          revision_id: string | null
        }
        Insert: {
          author_customer_id?: string | null
          author_user_id?: string | null
          body: string
          change_order_id: string
          created_at?: string
          id?: string
          org_id: string
          revision_id?: string | null
        }
        Update: {
          author_customer_id?: string | null
          author_user_id?: string | null
          body?: string
          change_order_id?: string
          created_at?: string
          id?: string
          org_id?: string
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_order_comments_author_customer_id_fkey"
            columns: ["author_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_comments_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_comments_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "change_order_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      change_order_line_items: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          quantity: number
          revision_id: string
          sort_order: number
          source_reference: string | null
          taxable: boolean
          total: number | null
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind: string
          quantity?: number
          revision_id: string
          sort_order?: number
          source_reference?: string | null
          taxable?: boolean
          total?: number | null
          unit?: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          quantity?: number
          revision_id?: string
          sort_order?: number
          source_reference?: string | null
          taxable?: boolean
          total?: number | null
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "change_order_line_items_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "change_order_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      change_order_revisions: {
        Row: {
          acknowledgment_text: string | null
          acknowledgment_version: string | null
          change_order_id: string
          created_at: string
          created_by_user_id: string | null
          decided_at: string | null
          decided_by_customer_id: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          deposit_impact: number
          id: string
          incorporated_at: string | null
          price_adjustment: number
          proposed_at: string | null
          proposed_by_user_id: string | null
          reason: string | null
          schedule_delta_minutes: number | null
          schedule_impact_notes: string | null
          schedule_only: boolean
          scope_change_summary: string | null
          status: Database["public"]["Enums"]["change_order_status"]
          supersedes_revision_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          acknowledgment_text?: string | null
          acknowledgment_version?: string | null
          change_order_id: string
          created_at?: string
          created_by_user_id?: string | null
          decided_at?: string | null
          decided_by_customer_id?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          deposit_impact?: number
          id?: string
          incorporated_at?: string | null
          price_adjustment?: number
          proposed_at?: string | null
          proposed_by_user_id?: string | null
          reason?: string | null
          schedule_delta_minutes?: number | null
          schedule_impact_notes?: string | null
          schedule_only?: boolean
          scope_change_summary?: string | null
          status?: Database["public"]["Enums"]["change_order_status"]
          supersedes_revision_id?: string | null
          updated_at?: string
          version: number
        }
        Update: {
          acknowledgment_text?: string | null
          acknowledgment_version?: string | null
          change_order_id?: string
          created_at?: string
          created_by_user_id?: string | null
          decided_at?: string | null
          decided_by_customer_id?: string | null
          decided_by_user_id?: string | null
          decision_note?: string | null
          deposit_impact?: number
          id?: string
          incorporated_at?: string | null
          price_adjustment?: number
          proposed_at?: string | null
          proposed_by_user_id?: string | null
          reason?: string | null
          schedule_delta_minutes?: number | null
          schedule_impact_notes?: string | null
          schedule_only?: boolean
          scope_change_summary?: string | null
          status?: Database["public"]["Enums"]["change_order_status"]
          supersedes_revision_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "change_order_revisions_change_order_id_fkey"
            columns: ["change_order_id"]
            isOneToOne: false
            referencedRelation: "change_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_revisions_decided_by_customer_id_fkey"
            columns: ["decided_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_order_revisions_supersedes_revision_id_fkey"
            columns: ["supersedes_revision_id"]
            isOneToOne: true
            referencedRelation: "change_order_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      change_orders: {
        Row: {
          created_at: string
          current_revision_id: string | null
          id: string
          initiator: Database["public"]["Enums"]["change_order_initiator"]
          job_id: string
          org_id: string
          requested_by_customer_id: string | null
          requested_by_user_id: string | null
          status: Database["public"]["Enums"]["change_order_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_revision_id?: string | null
          id?: string
          initiator: Database["public"]["Enums"]["change_order_initiator"]
          job_id: string
          org_id: string
          requested_by_customer_id?: string | null
          requested_by_user_id?: string | null
          status?: Database["public"]["Enums"]["change_order_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_revision_id?: string | null
          id?: string
          initiator?: Database["public"]["Enums"]["change_order_initiator"]
          job_id?: string
          org_id?: string
          requested_by_customer_id?: string | null
          requested_by_user_id?: string | null
          status?: Database["public"]["Enums"]["change_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_orders_current_revision_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "change_order_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_orders_requested_by_customer_id_fkey"
            columns: ["requested_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          action_items: Json | null
          attachment_ids: string[] | null
          body: string | null
          body_html: string | null
          cc_addresses: string[] | null
          channel: Database["public"]["Enums"]["comm_channel"]
          created_at: string
          customer_id: string | null
          direction: Database["public"]["Enums"]["comm_direction"]
          from_address: string | null
          id: string
          is_read: boolean | null
          job_id: string | null
          occurred_at: string
          org_id: string
          property_id: string | null
          provider: string | null
          provider_message_id: string | null
          provider_metadata: Json | null
          read_at: string | null
          sentiment: string | null
          subject: string | null
          summary: string | null
          to_address: string | null
          updated_at: string
        }
        Insert: {
          action_items?: Json | null
          attachment_ids?: string[] | null
          body?: string | null
          body_html?: string | null
          cc_addresses?: string[] | null
          channel: Database["public"]["Enums"]["comm_channel"]
          created_at?: string
          customer_id?: string | null
          direction: Database["public"]["Enums"]["comm_direction"]
          from_address?: string | null
          id?: string
          is_read?: boolean | null
          job_id?: string | null
          occurred_at?: string
          org_id: string
          property_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_metadata?: Json | null
          read_at?: string | null
          sentiment?: string | null
          subject?: string | null
          summary?: string | null
          to_address?: string | null
          updated_at?: string
        }
        Update: {
          action_items?: Json | null
          attachment_ids?: string[] | null
          body?: string | null
          body_html?: string | null
          cc_addresses?: string[] | null
          channel?: Database["public"]["Enums"]["comm_channel"]
          created_at?: string
          customer_id?: string | null
          direction?: Database["public"]["Enums"]["comm_direction"]
          from_address?: string | null
          id?: string
          is_read?: boolean | null
          job_id?: string | null
          occurred_at?: string
          org_id?: string
          property_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_metadata?: Json | null
          read_at?: string | null
          sentiment?: string | null
          subject?: string | null
          summary?: string | null
          to_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_accounts: {
        Row: {
          accepted_at: string | null
          auth_user_id: string
          created_at: string
          customer_id: string
          email: string
          id: string
          invited_at: string | null
          org_id: string
          status: Database["public"]["Enums"]["customer_account_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          auth_user_id: string
          created_at?: string
          customer_id: string
          email: string
          id?: string
          invited_at?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["customer_account_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          auth_user_id?: string
          created_at?: string
          customer_id?: string
          email?: string
          id?: string
          invited_at?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["customer_account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_archetype_defaults: {
        Row: {
          archetype: Database["public"]["Enums"]["customer_archetype"]
          consolidate_invoices_monthly: boolean | null
          default_arrival_lead_minutes: number | null
          default_bill_drive_time: boolean | null
          default_materials_markup_pct: number | null
          default_payment_terms_days: number | null
          default_send_arrival_text: boolean | null
          default_send_on_the_way: boolean | null
          default_standing_approval: number | null
          notes: string | null
          recurring_templates_available: boolean | null
        }
        Insert: {
          archetype: Database["public"]["Enums"]["customer_archetype"]
          consolidate_invoices_monthly?: boolean | null
          default_arrival_lead_minutes?: number | null
          default_bill_drive_time?: boolean | null
          default_materials_markup_pct?: number | null
          default_payment_terms_days?: number | null
          default_send_arrival_text?: boolean | null
          default_send_on_the_way?: boolean | null
          default_standing_approval?: number | null
          notes?: string | null
          recurring_templates_available?: boolean | null
        }
        Update: {
          archetype?: Database["public"]["Enums"]["customer_archetype"]
          consolidate_invoices_monthly?: boolean | null
          default_arrival_lead_minutes?: number | null
          default_bill_drive_time?: boolean | null
          default_materials_markup_pct?: number | null
          default_payment_terms_days?: number | null
          default_send_arrival_text?: boolean | null
          default_send_on_the_way?: boolean | null
          default_standing_approval?: number | null
          notes?: string | null
          recurring_templates_available?: boolean | null
        }
        Relationships: []
      }
      customer_location_prefs: {
        Row: {
          arrival_notification_lead_minutes: number | null
          bill_drive_time: boolean | null
          customer_id: string
          geofence_radius_m: number | null
          is_commercial_recurring: boolean | null
          is_home_sensitive: boolean | null
          notes: string | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          send_arrival_notification: boolean | null
          send_departure_summary: boolean | null
          send_on_the_way_texts: boolean | null
          updated_at: string
        }
        Insert: {
          arrival_notification_lead_minutes?: number | null
          bill_drive_time?: boolean | null
          customer_id: string
          geofence_radius_m?: number | null
          is_commercial_recurring?: boolean | null
          is_home_sensitive?: boolean | null
          notes?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          send_arrival_notification?: boolean | null
          send_departure_summary?: boolean | null
          send_on_the_way_texts?: boolean | null
          updated_at?: string
        }
        Update: {
          arrival_notification_lead_minutes?: number | null
          bill_drive_time?: boolean | null
          customer_id?: string
          geofence_radius_m?: number | null
          is_commercial_recurring?: boolean | null
          is_home_sensitive?: boolean | null
          notes?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          send_arrival_notification?: boolean | null
          send_departure_summary?: boolean | null
          send_on_the_way_texts?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_location_prefs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_properties: {
        Row: {
          customer_id: string
          end_date: string | null
          is_primary: boolean | null
          property_id: string
          relationship: string | null
          start_date: string | null
        }
        Insert: {
          customer_id: string
          end_date?: string | null
          is_primary?: boolean | null
          property_id: string
          relationship?: string | null
          start_date?: string | null
        }
        Update: {
          customer_id?: string
          end_date?: string | null
          is_primary?: boolean | null
          property_id?: string
          relationship?: string | null
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_properties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          archetype: Database["public"]["Enums"]["customer_archetype"] | null
          company_name: string | null
          consolidate_invoices_monthly: boolean | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          is_archived: boolean | null
          jobber_id: string | null
          last_contact_at: string | null
          last_job_completed_at: string | null
          last_name: string | null
          notes: string | null
          org_id: string
          payment_terms_days: number | null
          phone_primary: string | null
          phone_secondary: string | null
          preferred_channel:
            | Database["public"]["Enums"]["preferred_channel"]
            | null
          referred_by_id: string | null
          source: string | null
          standing_approval_threshold: number | null
          tags: string[] | null
          total_jobs: number | null
          total_revenue: number | null
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
        }
        Insert: {
          archetype?: Database["public"]["Enums"]["customer_archetype"] | null
          company_name?: string | null
          consolidate_invoices_monthly?: boolean | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_archived?: boolean | null
          jobber_id?: string | null
          last_contact_at?: string | null
          last_job_completed_at?: string | null
          last_name?: string | null
          notes?: string | null
          org_id: string
          payment_terms_days?: number | null
          phone_primary?: string | null
          phone_secondary?: string | null
          preferred_channel?:
            | Database["public"]["Enums"]["preferred_channel"]
            | null
          referred_by_id?: string | null
          source?: string | null
          standing_approval_threshold?: number | null
          tags?: string[] | null
          total_jobs?: number | null
          total_revenue?: number | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Update: {
          archetype?: Database["public"]["Enums"]["customer_archetype"] | null
          company_name?: string | null
          consolidate_invoices_monthly?: boolean | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_archived?: boolean | null
          jobber_id?: string | null
          last_contact_at?: string | null
          last_job_completed_at?: string | null
          last_name?: string | null
          notes?: string | null
          org_id?: string
          payment_terms_days?: number | null
          phone_primary?: string | null
          phone_secondary?: string | null
          preferred_channel?:
            | Database["public"]["Enums"]["preferred_channel"]
            | null
          referred_by_id?: string | null
          source?: string | null
          standing_approval_threshold?: number | null
          tags?: string[] | null
          total_jobs?: number | null
          total_revenue?: number | null
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_referred_by_id_fkey"
            columns: ["referred_by_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefings: {
        Row: {
          anomalies: Json | null
          briefing_date: string
          created_at: string
          delivered_at: string | null
          delivery_method: string[] | null
          id: string
          open_action_items: Json | null
          opportunities: Json | null
          org_id: string
          pending_followups: Json | null
          read_at: string | null
          rendered_html: string | null
          rendered_text: string | null
          todays_jobs: Json | null
          user_id: string
        }
        Insert: {
          anomalies?: Json | null
          briefing_date: string
          created_at?: string
          delivered_at?: string | null
          delivery_method?: string[] | null
          id?: string
          open_action_items?: Json | null
          opportunities?: Json | null
          org_id: string
          pending_followups?: Json | null
          read_at?: string | null
          rendered_html?: string | null
          rendered_text?: string | null
          todays_jobs?: Json | null
          user_id: string
        }
        Update: {
          anomalies?: Json | null
          briefing_date?: string
          created_at?: string
          delivered_at?: string | null
          delivery_method?: string[] | null
          id?: string
          open_action_items?: Json | null
          opportunities?: Json | null
          org_id?: string
          pending_followups?: Json | null
          read_at?: string | null
          rendered_html?: string | null
          rendered_text?: string | null
          todays_jobs?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_briefings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_line_items: {
        Row: {
          created_at: string
          description: string
          estimate_id: string
          id: string
          is_system_suggested: boolean
          org_id: string
          quantity: number
          reviewed_at: string | null
          reviewed_by: string | null
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          estimate_id: string
          id?: string
          is_system_suggested?: boolean
          org_id: string
          quantity?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          estimate_id?: string
          id?: string
          is_system_suggested?: boolean
          org_id?: string
          quantity?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_visit_state"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "estimate_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          converted_at: string | null
          converted_job_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          estimate_number: string
          expires_at: string | null
          id: string
          org_id: string
          pricing_reviewed_at: string | null
          pricing_reviewed_by: string | null
          property_id: string
          service_request_id: string | null
          site_visit_at: string | null
          site_visit_notes: string | null
          source_site_visit_id: string | null
          status: Database["public"]["Enums"]["estimate_status"]
          title: string
          updated_at: string
        }
        Insert: {
          converted_at?: string | null
          converted_job_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          estimate_number?: string
          expires_at?: string | null
          id?: string
          org_id: string
          pricing_reviewed_at?: string | null
          pricing_reviewed_by?: string | null
          property_id: string
          service_request_id?: string | null
          site_visit_at?: string | null
          site_visit_notes?: string | null
          source_site_visit_id?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          title: string
          updated_at?: string
        }
        Update: {
          converted_at?: string | null
          converted_job_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          estimate_number?: string
          expires_at?: string | null
          id?: string
          org_id?: string
          pricing_reviewed_at?: string | null
          pricing_reviewed_by?: string | null
          property_id?: string
          service_request_id?: string | null
          site_visit_at?: string | null
          site_visit_notes?: string | null
          source_site_visit_id?: string | null
          status?: Database["public"]["Enums"]["estimate_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimates_converted_job_id_fkey"
            columns: ["converted_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_source_site_visit_id_fkey"
            columns: ["source_site_visit_id"]
            isOneToOne: true
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_events: {
        Row: {
          accuracy_meters: number | null
          automation_fired: boolean | null
          confidence: number | null
          created_at: string
          dwell_seconds: number | null
          event_type: Database["public"]["Enums"]["geofence_event_type"]
          geofence_id: string
          id: string
          location: unknown
          occurred_at: string
          org_id: string
          time_entry_id: string | null
          trip_id: string | null
          user_id: string
          vault_item_id: string | null
        }
        Insert: {
          accuracy_meters?: number | null
          automation_fired?: boolean | null
          confidence?: number | null
          created_at?: string
          dwell_seconds?: number | null
          event_type: Database["public"]["Enums"]["geofence_event_type"]
          geofence_id: string
          id?: string
          location?: unknown
          occurred_at: string
          org_id: string
          time_entry_id?: string | null
          trip_id?: string | null
          user_id: string
          vault_item_id?: string | null
        }
        Update: {
          accuracy_meters?: number | null
          automation_fired?: boolean | null
          confidence?: number | null
          created_at?: string
          dwell_seconds?: number | null
          event_type?: Database["public"]["Enums"]["geofence_event_type"]
          geofence_id?: string
          id?: string
          location?: unknown
          occurred_at?: string
          org_id?: string
          time_entry_id?: string | null
          trip_id?: string | null
          user_id?: string
          vault_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geofence_events_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_vault_item_id_fkey"
            columns: ["vault_item_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          applies_to_users: string[] | null
          auto_generated: boolean | null
          center: unknown
          created_at: string
          id: string
          is_active: boolean | null
          job_id: string | null
          label: string
          min_absence_seconds: number | null
          min_dwell_seconds: number | null
          notes: string | null
          org_id: string
          property_id: string | null
          radius_meters: number
          type: Database["public"]["Enums"]["geofence_type"]
          updated_at: string
        }
        Insert: {
          applies_to_users?: string[] | null
          auto_generated?: boolean | null
          center: unknown
          created_at?: string
          id?: string
          is_active?: boolean | null
          job_id?: string | null
          label: string
          min_absence_seconds?: number | null
          min_dwell_seconds?: number | null
          notes?: string | null
          org_id: string
          property_id?: string | null
          radius_meters?: number
          type: Database["public"]["Enums"]["geofence_type"]
          updated_at?: string
        }
        Update: {
          applies_to_users?: string[] | null
          auto_generated?: boolean | null
          center?: unknown
          created_at?: string
          id?: string
          is_active?: boolean | null
          job_id?: string | null
          label?: string
          min_absence_seconds?: number | null
          min_dwell_seconds?: number | null
          notes?: string | null
          org_id?: string
          property_id?: string | null
          radius_meters?: number
          type?: Database["public"]["Enums"]["geofence_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofences_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofences_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_template_versions: {
        Row: {
          created_at: string
          created_by: string | null
          field_definitions: Json
          id: string
          inspection_template_id: string
          publication_status: string
          published_at: string | null
          response_schema_version: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          field_definitions: Json
          id?: string
          inspection_template_id: string
          publication_status?: string
          published_at?: string | null
          response_schema_version: number
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          field_definitions?: Json
          id?: string
          inspection_template_id?: string
          publication_status?: string
          published_at?: string | null
          response_schema_version?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inspection_template_versions_inspection_template_id_fkey"
            columns: ["inspection_template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_templates: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string | null
          trade: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id?: string | null
          trade?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string | null
          trade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspection_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          name: string
          quantity: number
          quote_line_id: string | null
          sort_order: number | null
          source_change_order_revision_id: string | null
          source_note: string | null
          source_quote_line_id: string | null
          source_type: string | null
          total: number | null
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          name: string
          quantity?: number
          quote_line_id?: string | null
          sort_order?: number | null
          source_change_order_revision_id?: string | null
          source_note?: string | null
          source_quote_line_id?: string | null
          source_type?: string | null
          total?: number | null
          unit: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          name?: string
          quantity?: number
          quote_line_id?: string | null
          sort_order?: number | null
          source_change_order_revision_id?: string | null
          source_note?: string | null
          source_quote_line_id?: string | null
          source_type?: string | null
          total?: number | null
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_quote_line_id_fkey"
            columns: ["quote_line_id"]
            isOneToOne: false
            referencedRelation: "quote_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_source_change_order_revision_id_fkey"
            columns: ["source_change_order_revision_id"]
            isOneToOne: false
            referencedRelation: "change_order_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_source_quote_line_id_fkey"
            columns: ["source_quote_line_id"]
            isOneToOne: false
            referencedRelation: "quote_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_due: number | null
          amount_paid: number | null
          created_at: string
          discount_amount: number | null
          due_date: string | null
          finalized_at: string | null
          finalized_into_invoice_id: string | null
          id: string
          invoice_number: string
          issued_date: string
          job_id: string
          jobber_id: string | null
          kind: Database["public"]["Enums"]["invoice_kind"]
          notes: string | null
          org_id: string
          paid_at: string | null
          pdf_url: string | null
          quote_id: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_intent_id: string | null
          stripe_payment_link_url: string | null
          subtotal: number | null
          tax_amount: number | null
          tax_pct: number | null
          terms: string | null
          title: string | null
          total: number | null
          updated_at: string
        }
        Insert: {
          amount_due?: number | null
          amount_paid?: number | null
          created_at?: string
          discount_amount?: number | null
          due_date?: string | null
          finalized_at?: string | null
          finalized_into_invoice_id?: string | null
          id?: string
          invoice_number?: string
          issued_date?: string
          job_id: string
          jobber_id?: string | null
          kind?: Database["public"]["Enums"]["invoice_kind"]
          notes?: string | null
          org_id: string
          paid_at?: string | null
          pdf_url?: string | null
          quote_id?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_intent_id?: string | null
          stripe_payment_link_url?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tax_pct?: number | null
          terms?: string | null
          title?: string | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          amount_due?: number | null
          amount_paid?: number | null
          created_at?: string
          discount_amount?: number | null
          due_date?: string | null
          finalized_at?: string | null
          finalized_into_invoice_id?: string | null
          id?: string
          invoice_number?: string
          issued_date?: string
          job_id?: string
          jobber_id?: string | null
          kind?: Database["public"]["Enums"]["invoice_kind"]
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          pdf_url?: string | null
          quote_id?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_payment_intent_id?: string | null
          stripe_payment_link_url?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          tax_pct?: number | null
          terms?: string | null
          title?: string | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_finalized_into_invoice_id_fkey"
            columns: ["finalized_into_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      job_deposits: {
        Row: {
          blocks_scheduling: boolean
          blocks_work_start: boolean
          created_at: string
          deposit_invoice_id: string | null
          due_date: string | null
          id: string
          job_id: string
          org_id: string
          required_amount: number | null
          required_percentage: number | null
          requirement_status: Database["public"]["Enums"]["deposit_requirement_status"]
          updated_at: string
          waived_at: string | null
          waived_by_user_id: string | null
          waived_reason: string | null
        }
        Insert: {
          blocks_scheduling?: boolean
          blocks_work_start?: boolean
          created_at?: string
          deposit_invoice_id?: string | null
          due_date?: string | null
          id?: string
          job_id: string
          org_id: string
          required_amount?: number | null
          required_percentage?: number | null
          requirement_status?: Database["public"]["Enums"]["deposit_requirement_status"]
          updated_at?: string
          waived_at?: string | null
          waived_by_user_id?: string | null
          waived_reason?: string | null
        }
        Update: {
          blocks_scheduling?: boolean
          blocks_work_start?: boolean
          created_at?: string
          deposit_invoice_id?: string | null
          due_date?: string | null
          id?: string
          job_id?: string
          org_id?: string
          required_amount?: number | null
          required_percentage?: number | null
          requirement_status?: Database["public"]["Enums"]["deposit_requirement_status"]
          updated_at?: string
          waived_at?: string | null
          waived_by_user_id?: string | null
          waived_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_deposits_deposit_invoice_id_fkey"
            columns: ["deposit_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_deposits_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_deposits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_location_prefs: {
        Row: {
          allow_after_hours: boolean | null
          arrival_notification_lead_minutes: number | null
          bill_drive_time: boolean | null
          geofence_radius_m: number | null
          job_id: string
          notes: string | null
          send_arrival_notification: boolean | null
          tracking_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          allow_after_hours?: boolean | null
          arrival_notification_lead_minutes?: number | null
          bill_drive_time?: boolean | null
          geofence_radius_m?: number | null
          job_id: string
          notes?: string | null
          send_arrival_notification?: boolean | null
          tracking_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          allow_after_hours?: boolean | null
          arrival_notification_lead_minutes?: number | null
          bill_drive_time?: boolean | null
          geofence_radius_m?: number | null
          job_id?: string
          notes?: string | null
          send_arrival_notification?: boolean | null
          tracking_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_location_prefs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_material_uses: {
        Row: {
          created_at: string
          custom_name: string | null
          id: string
          job_id: string
          material_id: string | null
          notes: string | null
          org_id: string
          phase_id: string | null
          quantity: number
          receipt_id: string | null
          recorded_by: string | null
          supplier: string | null
          total_cost: number | null
          unit: string
          unit_cost: number | null
          used_at: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          id?: string
          job_id: string
          material_id?: string | null
          notes?: string | null
          org_id: string
          phase_id?: string | null
          quantity: number
          receipt_id?: string | null
          recorded_by?: string | null
          supplier?: string | null
          total_cost?: number | null
          unit: string
          unit_cost?: number | null
          used_at?: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          id?: string
          job_id?: string
          material_id?: string | null
          notes?: string | null
          org_id?: string
          phase_id?: string | null
          quantity?: number
          receipt_id?: string | null
          recorded_by?: string | null
          supplier?: string | null
          total_cost?: number | null
          unit?: string
          unit_cost?: number | null
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_material_uses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_material_uses_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_material_uses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_material_uses_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "job_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      job_phases: {
        Row: {
          actual_cost: number | null
          actual_end: string | null
          actual_start: string | null
          created_at: string
          description: string | null
          estimated_total: number | null
          id: string
          job_id: string
          name: string
          scheduled_end: string | null
          scheduled_start: string | null
          sort_order: number | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_start?: string | null
          created_at?: string
          description?: string | null
          estimated_total?: number | null
          id?: string
          job_id: string
          name: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          actual_end?: string | null
          actual_start?: string | null
          created_at?: string
          description?: string | null
          estimated_total?: number | null
          id?: string
          job_id?: string
          name?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          sort_order?: number | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_phases_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          ai_summary: string | null
          authorization_note: string | null
          authorization_reference: string | null
          authorization_type: string | null
          authorized_at: string | null
          authorized_customer_contact: string | null
          category_id: string | null
          closed_at: string | null
          closed_reason: string | null
          cost_total: number | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          embedding: string | null
          estimated_duration_minutes: number | null
          id: string
          invoiced_total: number | null
          job_number: string | null
          jobber_id: string | null
          not_to_exceed_amount: number | null
          org_id: string
          origin_estimate_id: string | null
          origin_quote_id: string | null
          origin_request_id: string | null
          paid_total: number | null
          priority: Database["public"]["Enums"]["job_priority"]
          property_id: string
          quoted_total: number | null
          scheduled_end: string | null
          scheduled_start: string | null
          status: Database["public"]["Enums"]["job_status"]
          tags: string[] | null
          title: string
          total_drive_cost: number | null
          total_drive_miles: number | null
          total_drive_time_seconds: number | null
          total_on_site_minutes: number | null
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          ai_summary?: string | null
          authorization_note?: string | null
          authorization_reference?: string | null
          authorization_type?: string | null
          authorized_at?: string | null
          authorized_customer_contact?: string | null
          category_id?: string | null
          closed_at?: string | null
          closed_reason?: string | null
          cost_total?: number | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          embedding?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          invoiced_total?: number | null
          job_number?: string | null
          jobber_id?: string | null
          not_to_exceed_amount?: number | null
          org_id: string
          origin_estimate_id?: string | null
          origin_quote_id?: string | null
          origin_request_id?: string | null
          paid_total?: number | null
          priority?: Database["public"]["Enums"]["job_priority"]
          property_id: string
          quoted_total?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          tags?: string[] | null
          title: string
          total_drive_cost?: number | null
          total_drive_miles?: number | null
          total_drive_time_seconds?: number | null
          total_on_site_minutes?: number | null
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          ai_summary?: string | null
          authorization_note?: string | null
          authorization_reference?: string | null
          authorization_type?: string | null
          authorized_at?: string | null
          authorized_customer_contact?: string | null
          category_id?: string | null
          closed_at?: string | null
          closed_reason?: string | null
          cost_total?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          embedding?: string | null
          estimated_duration_minutes?: number | null
          id?: string
          invoiced_total?: number | null
          job_number?: string | null
          jobber_id?: string | null
          not_to_exceed_amount?: number | null
          org_id?: string
          origin_estimate_id?: string | null
          origin_quote_id?: string | null
          origin_request_id?: string | null
          paid_total?: number | null
          priority?: Database["public"]["Enums"]["job_priority"]
          property_id?: string
          quoted_total?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          tags?: string[] | null
          title?: string
          total_drive_cost?: number | null
          total_drive_miles?: number | null
          total_drive_time_seconds?: number | null
          total_on_site_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_origin_estimate_id_fkey"
            columns: ["origin_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_visit_state"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "jobs_origin_estimate_id_fkey"
            columns: ["origin_estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_origin_quote_id_fkey"
            columns: ["origin_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_origin_request_id_fkey"
            columns: ["origin_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      location_events: {
        Row: {
          accuracy_meters: number | null
          activity: string | null
          activity_confidence: number | null
          altitude_m: number | null
          battery_level: number | null
          heading_deg: number | null
          id: string
          is_background: boolean | null
          location: unknown
          org_id: string
          received_at: string
          recorded_at: string
          source: string | null
          speed_mps: number | null
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          activity?: string | null
          activity_confidence?: number | null
          altitude_m?: number | null
          battery_level?: number | null
          heading_deg?: number | null
          id?: string
          is_background?: boolean | null
          location: unknown
          org_id: string
          received_at?: string
          recorded_at: string
          source?: string | null
          speed_mps?: number | null
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          activity?: string | null
          activity_confidence?: number | null
          altitude_m?: number | null
          battery_level?: number | null
          heading_deg?: number | null
          id?: string
          is_background?: boolean | null
          location?: unknown
          org_id?: string
          received_at?: string
          recorded_at?: string
          source?: string | null
          speed_mps?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_events_2026_q2: {
        Row: {
          accuracy_meters: number | null
          activity: string | null
          activity_confidence: number | null
          altitude_m: number | null
          battery_level: number | null
          heading_deg: number | null
          id: string
          is_background: boolean | null
          location: unknown
          org_id: string
          received_at: string
          recorded_at: string
          source: string | null
          speed_mps: number | null
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          activity?: string | null
          activity_confidence?: number | null
          altitude_m?: number | null
          battery_level?: number | null
          heading_deg?: number | null
          id?: string
          is_background?: boolean | null
          location: unknown
          org_id: string
          received_at?: string
          recorded_at: string
          source?: string | null
          speed_mps?: number | null
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          activity?: string | null
          activity_confidence?: number | null
          altitude_m?: number | null
          battery_level?: number | null
          heading_deg?: number | null
          id?: string
          is_background?: boolean | null
          location?: unknown
          org_id?: string
          received_at?: string
          recorded_at?: string
          source?: string | null
          speed_mps?: number | null
          user_id?: string
        }
        Relationships: []
      }
      location_events_2026_q3: {
        Row: {
          accuracy_meters: number | null
          activity: string | null
          activity_confidence: number | null
          altitude_m: number | null
          battery_level: number | null
          heading_deg: number | null
          id: string
          is_background: boolean | null
          location: unknown
          org_id: string
          received_at: string
          recorded_at: string
          source: string | null
          speed_mps: number | null
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          activity?: string | null
          activity_confidence?: number | null
          altitude_m?: number | null
          battery_level?: number | null
          heading_deg?: number | null
          id?: string
          is_background?: boolean | null
          location: unknown
          org_id: string
          received_at?: string
          recorded_at: string
          source?: string | null
          speed_mps?: number | null
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          activity?: string | null
          activity_confidence?: number | null
          altitude_m?: number | null
          battery_level?: number | null
          heading_deg?: number | null
          id?: string
          is_background?: boolean | null
          location?: unknown
          org_id?: string
          received_at?: string
          recorded_at?: string
          source?: string | null
          speed_mps?: number | null
          user_id?: string
        }
        Relationships: []
      }
      location_events_2026_q4: {
        Row: {
          accuracy_meters: number | null
          activity: string | null
          activity_confidence: number | null
          altitude_m: number | null
          battery_level: number | null
          heading_deg: number | null
          id: string
          is_background: boolean | null
          location: unknown
          org_id: string
          received_at: string
          recorded_at: string
          source: string | null
          speed_mps: number | null
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          activity?: string | null
          activity_confidence?: number | null
          altitude_m?: number | null
          battery_level?: number | null
          heading_deg?: number | null
          id?: string
          is_background?: boolean | null
          location: unknown
          org_id: string
          received_at?: string
          recorded_at: string
          source?: string | null
          speed_mps?: number | null
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          activity?: string | null
          activity_confidence?: number | null
          altitude_m?: number | null
          battery_level?: number | null
          heading_deg?: number | null
          id?: string
          is_background?: boolean | null
          location?: unknown
          org_id?: string
          received_at?: string
          recorded_at?: string
          source?: string | null
          speed_mps?: number | null
          user_id?: string
        }
        Relationships: []
      }
      material_prices: {
        Row: {
          id: string
          material_id: string
          metadata: Json | null
          observed_at: string
          source: string
          store_id: string | null
          unit_price: number
          zip_code: string | null
        }
        Insert: {
          id?: string
          material_id: string
          metadata?: Json | null
          observed_at?: string
          source: string
          store_id?: string | null
          unit_price: number
          zip_code?: string | null
        }
        Update: {
          id?: string
          material_id?: string
          metadata?: Json | null
          observed_at?: string
          source?: string
          store_id?: string | null
          unit_price?: number
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_prices_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          last_known_at: string | null
          last_known_supplier: string | null
          last_known_unit_price: number | null
          last_known_zip: string | null
          name: string
          notes: string | null
          org_id: string
          preferred_supplier: string | null
          sku_ferguson: string | null
          sku_home_depot: string | null
          sku_lowes: string | null
          sku_other: Json | null
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_known_at?: string | null
          last_known_supplier?: string | null
          last_known_unit_price?: number | null
          last_known_zip?: string | null
          name: string
          notes?: string | null
          org_id: string
          preferred_supplier?: string | null
          sku_ferguson?: string | null
          sku_home_depot?: string | null
          sku_lowes?: string | null
          sku_other?: Json | null
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_known_at?: string | null
          last_known_supplier?: string | null
          last_known_unit_price?: number | null
          last_known_zip?: string | null
          name?: string
          notes?: string | null
          org_id?: string
          preferred_supplier?: string | null
          sku_ferguson?: string | null
          sku_home_depot?: string | null
          sku_lowes?: string | null
          sku_other?: Json | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string
          id: string
          invited_by: string | null
          last_resent_at: string | null
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["org_invite_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          full_name: string
          id?: string
          invited_by?: string | null
          last_resent_at?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["org_invite_status"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          invited_by?: string | null
          last_resent_at?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["org_invite_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          id: string
          joined_at: string
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_pricing_policy: {
        Row: {
          charge_tax_on_labor: boolean | null
          charge_tax_on_materials: boolean | null
          custom_job_uncertainty_buffer_pct: number | null
          default_sales_tax_pct: number | null
          fuel_price_per_gallon: number | null
          fuel_price_source: string | null
          fuel_price_updated_at: string | null
          materials_commercial_markup_pct: number | null
          materials_overage_threshold: number | null
          materials_residential_markup_pct: number | null
          org_id: string
          target_hourly_equivalent: number | null
          trip_fee_commercial: number
          trip_fee_residential: number
          trip_fee_waived_on_multi_day: boolean | null
          updated_at: string
          vehicle_mpg: number | null
        }
        Insert: {
          charge_tax_on_labor?: boolean | null
          charge_tax_on_materials?: boolean | null
          custom_job_uncertainty_buffer_pct?: number | null
          default_sales_tax_pct?: number | null
          fuel_price_per_gallon?: number | null
          fuel_price_source?: string | null
          fuel_price_updated_at?: string | null
          materials_commercial_markup_pct?: number | null
          materials_overage_threshold?: number | null
          materials_residential_markup_pct?: number | null
          org_id: string
          target_hourly_equivalent?: number | null
          trip_fee_commercial?: number
          trip_fee_residential?: number
          trip_fee_waived_on_multi_day?: boolean | null
          updated_at?: string
          vehicle_mpg?: number | null
        }
        Update: {
          charge_tax_on_labor?: boolean | null
          charge_tax_on_materials?: boolean | null
          custom_job_uncertainty_buffer_pct?: number | null
          default_sales_tax_pct?: number | null
          fuel_price_per_gallon?: number | null
          fuel_price_source?: string | null
          fuel_price_updated_at?: string | null
          materials_commercial_markup_pct?: number | null
          materials_overage_threshold?: number | null
          materials_residential_markup_pct?: number | null
          org_id?: string
          target_hourly_equivalent?: number | null
          trip_fee_commercial?: number
          trip_fee_residential?: number
          trip_fee_waived_on_multi_day?: boolean | null
          updated_at?: string
          vehicle_mpg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "org_pricing_policy_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          ai_credits_monthly: number | null
          ai_credits_reset_at: string | null
          ai_credits_used: number | null
          ai_enabled: boolean | null
          city: string | null
          created_at: string
          daily_briefing_enabled: boolean | null
          daily_briefing_time: string | null
          default_labor_rate: number | null
          default_markup_pct: number | null
          default_quote_validity_days: number | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          primary_color: string | null
          slug: string
          state: string | null
          timezone: string
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          ai_credits_monthly?: number | null
          ai_credits_reset_at?: string | null
          ai_credits_used?: number | null
          ai_enabled?: boolean | null
          city?: string | null
          created_at?: string
          daily_briefing_enabled?: boolean | null
          daily_briefing_time?: string | null
          default_labor_rate?: number | null
          default_markup_pct?: number | null
          default_quote_validity_days?: number | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          primary_color?: string | null
          slug: string
          state?: string | null
          timezone?: string
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          ai_credits_monthly?: number | null
          ai_credits_reset_at?: string | null
          ai_credits_used?: number | null
          ai_enabled?: boolean | null
          city?: string | null
          created_at?: string
          daily_briefing_enabled?: boolean | null
          daily_briefing_time?: string | null
          default_labor_rate?: number | null
          default_markup_pct?: number | null
          default_quote_validity_days?: number | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          slug?: string
          state?: string | null
          timezone?: string
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          org_id: string
          paid_at: string
          reference: string | null
          stripe_charge_id: string | null
          stripe_fee: number | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          org_id: string
          paid_at?: string
          reference?: string | null
          stripe_charge_id?: string | null
          stripe_fee?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          org_id?: string
          paid_at?: string
          reference?: string | null
          stripe_charge_id?: string | null
          stripe_fee?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_uploads: {
        Row: {
          created_at: string
          created_by: string | null
          declared_mime_type: string
          declared_size_bytes: number
          entity_id: string
          entity_type: string
          expires_at: string
          finalized_vault_item_id: string | null
          id: string
          org_id: string
          pending_path: string
          rejection_reason: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          declared_mime_type: string
          declared_size_bytes: number
          entity_id: string
          entity_type: string
          expires_at?: string
          finalized_vault_item_id?: string | null
          id?: string
          org_id: string
          pending_path: string
          rejection_reason?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          declared_mime_type?: string
          declared_size_bytes?: number
          entity_id?: string
          entity_type?: string
          expires_at?: string
          finalized_vault_item_id?: string | null
          id?: string
          org_id?: string
          pending_path?: string
          rejection_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_uploads_finalized_vault_item_id_fkey"
            columns: ["finalized_vault_item_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_guardrails: {
        Row: {
          created_at: string
          decision_logic: Json
          default_outcome: string | null
          description: string | null
          id: string
          is_active: boolean | null
          jurisdiction: string | null
          org_id: string
          rule_name: string
          service_category: string
          source_url: string | null
        }
        Insert: {
          created_at?: string
          decision_logic: Json
          default_outcome?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          jurisdiction?: string | null
          org_id: string
          rule_name: string
          service_category: string
          source_url?: string | null
        }
        Update: {
          created_at?: string
          decision_logic?: Json
          default_outcome?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          jurisdiction?: string | null
          org_id?: string
          rule_name?: string
          service_category?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_guardrails_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          access_notes: string | null
          address_line_1: string
          address_line_2: string | null
          city: string
          country: string | null
          created_at: string
          gate_code: string | null
          geocoded_at: string | null
          geofence_center: unknown
          geofence_radius_m: number | null
          hazards: string[] | null
          hide_from_auto_tracking: boolean | null
          id: string
          jobber_id: string | null
          location: unknown
          lot_size_sqft: number | null
          notes: string | null
          org_id: string
          parking_notes: string | null
          property_type: string | null
          satellite_image_url: string | null
          square_footage: number | null
          state: string
          stories: number | null
          street_view_url: string | null
          updated_at: string
          year_built: number | null
          zip: string
        }
        Insert: {
          access_notes?: string | null
          address_line_1: string
          address_line_2?: string | null
          city: string
          country?: string | null
          created_at?: string
          gate_code?: string | null
          geocoded_at?: string | null
          geofence_center?: unknown
          geofence_radius_m?: number | null
          hazards?: string[] | null
          hide_from_auto_tracking?: boolean | null
          id?: string
          jobber_id?: string | null
          location?: unknown
          lot_size_sqft?: number | null
          notes?: string | null
          org_id: string
          parking_notes?: string | null
          property_type?: string | null
          satellite_image_url?: string | null
          square_footage?: number | null
          state: string
          stories?: number | null
          street_view_url?: string | null
          updated_at?: string
          year_built?: number | null
          zip: string
        }
        Update: {
          access_notes?: string | null
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          country?: string | null
          created_at?: string
          gate_code?: string | null
          geocoded_at?: string | null
          geofence_center?: unknown
          geofence_radius_m?: number | null
          hazards?: string[] | null
          hide_from_auto_tracking?: boolean | null
          id?: string
          jobber_id?: string | null
          location?: unknown
          lot_size_sqft?: number | null
          notes?: string | null
          org_id?: string
          parking_notes?: string | null
          property_type?: string | null
          satellite_image_url?: string | null
          square_footage?: number | null
          state?: string
          stories?: number | null
          street_view_url?: string | null
          updated_at?: string
          year_built?: number | null
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          ai_basis: string | null
          ai_confidence: number | null
          ai_generated: boolean | null
          created_at: string
          description: string | null
          id: string
          job_id: string | null
          labor_cost_actual: number | null
          labor_cost_estimated: number | null
          labor_minutes_actual: number | null
          labor_minutes_estimated: number | null
          markup_pct: number | null
          material_cost_actual: number | null
          material_cost_estimated: number | null
          name: string
          option_group: string | null
          org_id: string
          outcome: string | null
          outcome_notes: string | null
          phase_id: string | null
          property_id: string | null
          quantity: number
          quote_id: string
          quoted_at: string
          service_id: string | null
          sort_order: number | null
          total_quoted: number | null
          unit: string
          unit_price: number
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          ai_basis?: string | null
          ai_confidence?: number | null
          ai_generated?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          labor_cost_actual?: number | null
          labor_cost_estimated?: number | null
          labor_minutes_actual?: number | null
          labor_minutes_estimated?: number | null
          markup_pct?: number | null
          material_cost_actual?: number | null
          material_cost_estimated?: number | null
          name: string
          option_group?: string | null
          org_id: string
          outcome?: string | null
          outcome_notes?: string | null
          phase_id?: string | null
          property_id?: string | null
          quantity?: number
          quote_id: string
          quoted_at?: string
          service_id?: string | null
          sort_order?: number | null
          total_quoted?: number | null
          unit: string
          unit_price?: number
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          ai_basis?: string | null
          ai_confidence?: number | null
          ai_generated?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string | null
          labor_cost_actual?: number | null
          labor_cost_estimated?: number | null
          labor_minutes_actual?: number | null
          labor_minutes_estimated?: number | null
          markup_pct?: number | null
          material_cost_actual?: number | null
          material_cost_estimated?: number | null
          name?: string
          option_group?: string | null
          org_id?: string
          outcome?: string | null
          outcome_notes?: string | null
          phase_id?: string | null
          property_id?: string | null
          quantity?: number
          quote_id?: string
          quoted_at?: string
          service_id?: string | null
          sort_order?: number | null
          total_quoted?: number | null
          unit?: string
          unit_price?: number
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "job_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_items"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          ai_confidence: number | null
          ai_generated: boolean | null
          created_at: string
          created_by: string | null
          decline_reason: string | null
          declined_at: string | null
          discount_amount: number | null
          estimate_id: string | null
          id: string
          intro_text: string | null
          job_id: string | null
          jobber_id: string | null
          org_id: string
          outro_text: string | null
          parent_quote_id: string | null
          pdf_url: string | null
          quote_number: string | null
          sent_at: string | null
          share_token: string | null
          signature_data: Json | null
          signed_pdf_url: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number | null
          tax_amount: number | null
          tax_pct: number | null
          terms: string | null
          title: string | null
          total: number | null
          type: Database["public"]["Enums"]["quote_type"]
          updated_at: string
          valid_until: string | null
          version: number | null
          viewed_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          ai_confidence?: number | null
          ai_generated?: boolean | null
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          discount_amount?: number | null
          estimate_id?: string | null
          id?: string
          intro_text?: string | null
          job_id?: string | null
          jobber_id?: string | null
          org_id: string
          outro_text?: string | null
          parent_quote_id?: string | null
          pdf_url?: string | null
          quote_number?: string | null
          sent_at?: string | null
          share_token?: string | null
          signature_data?: Json | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number | null
          tax_amount?: number | null
          tax_pct?: number | null
          terms?: string | null
          title?: string | null
          total?: number | null
          type?: Database["public"]["Enums"]["quote_type"]
          updated_at?: string
          valid_until?: string | null
          version?: number | null
          viewed_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          ai_confidence?: number | null
          ai_generated?: boolean | null
          created_at?: string
          created_by?: string | null
          decline_reason?: string | null
          declined_at?: string | null
          discount_amount?: number | null
          estimate_id?: string | null
          id?: string
          intro_text?: string | null
          job_id?: string | null
          jobber_id?: string | null
          org_id?: string
          outro_text?: string | null
          parent_quote_id?: string | null
          pdf_url?: string | null
          quote_number?: string | null
          sent_at?: string | null
          share_token?: string | null
          signature_data?: Json | null
          signed_pdf_url?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number | null
          tax_amount?: number | null
          tax_pct?: number | null
          terms?: string | null
          title?: string | null
          total?: number | null
          type?: Database["public"]["Enums"]["quote_type"]
          updated_at?: string
          valid_until?: string | null
          version?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_visit_state"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "quotes_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_parent_quote_id_fkey"
            columns: ["parent_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_slot_bookings: {
        Row: {
          booked_by_customer_id: string | null
          booked_by_user_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_customer_id: string | null
          cancelled_by_user_id: string | null
          created_at: string
          id: string
          job_id: string
          org_id: string
          slot_id: string
        }
        Insert: {
          booked_by_customer_id?: string | null
          booked_by_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_customer_id?: string | null
          cancelled_by_user_id?: string | null
          created_at?: string
          id?: string
          job_id: string
          org_id: string
          slot_id: string
        }
        Update: {
          booked_by_customer_id?: string | null
          booked_by_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_customer_id?: string | null
          cancelled_by_user_id?: string | null
          created_at?: string
          id?: string
          job_id?: string
          org_id?: string
          slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_slot_bookings_booked_by_customer_id_fkey"
            columns: ["booked_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_slot_bookings_cancelled_by_customer_id_fkey"
            columns: ["cancelled_by_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_slot_bookings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_slot_bookings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduling_slot_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "scheduling_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_slots: {
        Row: {
          capacity: number
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          org_id: string
          starts_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          org_id: string
          starts_at: string
        }
        Update: {
          capacity?: number
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          org_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_slots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          id: string
          name: string
          org_id: string
          parent_id: string | null
          sort_order: number | null
        }
        Insert: {
          id?: string
          name: string
          org_id: string
          parent_id?: string | null
          sort_order?: number | null
        }
        Update: {
          id?: string
          name?: string
          org_id?: string
          parent_id?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      service_items: {
        Row: {
          ai_description: string | null
          category_id: string | null
          common_addons: string | null
          confidence: string | null
          created_at: string
          default_labor_minutes: number | null
          default_markup_pct: number | null
          default_unit_price: number | null
          description: string | null
          embedding: string | null
          exclusion_note: string | null
          id: string
          is_active: boolean | null
          is_custom_only: boolean | null
          name: string
          org_id: string
          permit_check: Json | null
          pricing_metric: string | null
          rate_confirmed: number | null
          rate_high: number | null
          rate_low: number | null
          scope_excludes: string | null
          scope_includes: string | null
          times_quoted: number | null
          times_won: number | null
          unit: string
          unit_label: string | null
          updated_at: string
        }
        Insert: {
          ai_description?: string | null
          category_id?: string | null
          common_addons?: string | null
          confidence?: string | null
          created_at?: string
          default_labor_minutes?: number | null
          default_markup_pct?: number | null
          default_unit_price?: number | null
          description?: string | null
          embedding?: string | null
          exclusion_note?: string | null
          id?: string
          is_active?: boolean | null
          is_custom_only?: boolean | null
          name: string
          org_id: string
          permit_check?: Json | null
          pricing_metric?: string | null
          rate_confirmed?: number | null
          rate_high?: number | null
          rate_low?: number | null
          scope_excludes?: string | null
          scope_includes?: string | null
          times_quoted?: number | null
          times_won?: number | null
          unit: string
          unit_label?: string | null
          updated_at?: string
        }
        Update: {
          ai_description?: string | null
          category_id?: string | null
          common_addons?: string | null
          confidence?: string | null
          created_at?: string
          default_labor_minutes?: number | null
          default_markup_pct?: number | null
          default_unit_price?: number | null
          description?: string | null
          embedding?: string | null
          exclusion_note?: string | null
          id?: string
          is_active?: boolean | null
          is_custom_only?: boolean | null
          name?: string
          org_id?: string
          permit_check?: Json | null
          pricing_metric?: string | null
          rate_confirmed?: number | null
          rate_high?: number | null
          rate_low?: number | null
          scope_excludes?: string | null
          scope_includes?: string | null
          times_quoted?: number | null
          times_won?: number | null
          unit?: string
          unit_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_materials: {
        Row: {
          is_optional: boolean | null
          material_id: string
          quantity: number
          service_id: string
        }
        Insert: {
          is_optional?: boolean | null
          material_id: string
          quantity: number
          service_id: string
        }
        Update: {
          is_optional?: boolean | null
          material_id?: string
          quantity?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_materials_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_items"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          access_notes: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          contact_preferred_channel:
            | Database["public"]["Enums"]["preferred_channel"]
            | null
          converted_at: string | null
          created_at: string
          customer_id: string
          estimate_id: string | null
          id: string
          internal_notes: string | null
          job_id: string | null
          org_id: string
          preferred_date: string | null
          preferred_time: string | null
          priority: Database["public"]["Enums"]["service_request_priority"]
          property_address_line_1: string | null
          property_address_line_2: string | null
          property_city: string | null
          property_country: string | null
          property_id: string | null
          property_state: string | null
          property_type: string | null
          property_zip: string | null
          request_number: string
          reviewed_at: string | null
          service_category: string | null
          service_description: string
          service_title: string
          source: Database["public"]["Enums"]["service_request_source"]
          status: Database["public"]["Enums"]["service_request_status"]
          submitted_at: string
          triage_corrected_at: string | null
          triage_corrected_by: string | null
          triage_corrected_from: string | null
          triage_correction_reason: string | null
          triage_decision: string | null
          triage_reason: string | null
          triaged_at: string | null
          triaged_by: string | null
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          contact_preferred_channel?:
            | Database["public"]["Enums"]["preferred_channel"]
            | null
          converted_at?: string | null
          created_at?: string
          customer_id: string
          estimate_id?: string | null
          id?: string
          internal_notes?: string | null
          job_id?: string | null
          org_id: string
          preferred_date?: string | null
          preferred_time?: string | null
          priority?: Database["public"]["Enums"]["service_request_priority"]
          property_address_line_1?: string | null
          property_address_line_2?: string | null
          property_city?: string | null
          property_country?: string | null
          property_id?: string | null
          property_state?: string | null
          property_type?: string | null
          property_zip?: string | null
          request_number?: string
          reviewed_at?: string | null
          service_category?: string | null
          service_description: string
          service_title: string
          source?: Database["public"]["Enums"]["service_request_source"]
          status?: Database["public"]["Enums"]["service_request_status"]
          submitted_at?: string
          triage_corrected_at?: string | null
          triage_corrected_by?: string | null
          triage_corrected_from?: string | null
          triage_correction_reason?: string | null
          triage_decision?: string | null
          triage_reason?: string | null
          triaged_at?: string | null
          triaged_by?: string | null
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          contact_preferred_channel?:
            | Database["public"]["Enums"]["preferred_channel"]
            | null
          converted_at?: string | null
          created_at?: string
          customer_id?: string
          estimate_id?: string | null
          id?: string
          internal_notes?: string | null
          job_id?: string | null
          org_id?: string
          preferred_date?: string | null
          preferred_time?: string | null
          priority?: Database["public"]["Enums"]["service_request_priority"]
          property_address_line_1?: string | null
          property_address_line_2?: string | null
          property_city?: string | null
          property_country?: string | null
          property_id?: string | null
          property_state?: string | null
          property_type?: string | null
          property_zip?: string | null
          request_number?: string
          reviewed_at?: string | null
          service_category?: string | null
          service_description?: string
          service_title?: string
          source?: Database["public"]["Enums"]["service_request_source"]
          status?: Database["public"]["Enums"]["service_request_status"]
          submitted_at?: string
          triage_corrected_at?: string | null
          triage_corrected_by?: string | null
          triage_corrected_from?: string | null
          triage_correction_reason?: string | null
          triage_decision?: string | null
          triage_reason?: string | null
          triaged_at?: string | null
          triaged_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_visit_state"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "service_requests_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visit_appointments: {
        Row: {
          assigned_user_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          scheduled_end: string
          scheduled_start: string
          site_visit_id: string
          status: string
          supersedes_appointment_id: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          scheduled_end: string
          scheduled_start: string
          site_visit_id: string
          status: string
          supersedes_appointment_id?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          scheduled_end?: string
          scheduled_start?: string
          site_visit_id?: string
          status?: string
          supersedes_appointment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visit_appointments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visit_appointments_site_visit_id_fkey"
            columns: ["site_visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visit_appointments_supersedes_appointment_id_fkey"
            columns: ["supersedes_appointment_id"]
            isOneToOne: false
            referencedRelation: "site_visit_appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          assigned_user_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          inspection_responses: Json | null
          inspection_template_version_id: string | null
          org_id: string
          response_schema_version: number | null
          service_request_id: string
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["site_visit_status"]
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_responses?: Json | null
          inspection_template_version_id?: string | null
          org_id: string
          response_schema_version?: number | null
          service_request_id: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["site_visit_status"]
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_responses?: Json | null
          inspection_template_version_id?: string | null
          org_id?: string
          response_schema_version?: number | null
          service_request_id?: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["site_visit_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_inspection_template_version_fkey"
            columns: ["inspection_template_version_id"]
            isOneToOne: false
            referencedRelation: "inspection_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          ai_generated: boolean | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          due_at: string | null
          id: string
          job_id: string | null
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          property_id: string | null
          snoozed_until: string | null
          source_comm_id: string | null
          source_vault_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated?: boolean | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          job_id?: string | null
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          property_id?: string | null
          snoozed_until?: string | null
          source_comm_id?: string | null
          source_vault_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated?: boolean | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          job_id?: string | null
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          property_id?: string | null
          snoozed_until?: string | null
          source_comm_id?: string | null
          source_vault_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_comm_id_fkey"
            columns: ["source_comm_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_vault_id_fkey"
            columns: ["source_vault_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          auto_generated: boolean | null
          created_at: string
          duration_minutes: number | null
          end_location: unknown
          ended_at: string | null
          entry_geofence_event_id: string | null
          entry_kind: string | null
          exit_geofence_event_id: string | null
          hourly_rate: number | null
          id: string
          is_billable: boolean | null
          job_id: string
          jobber_id: string | null
          notes: string | null
          org_id: string
          phase_id: string | null
          start_location: unknown
          started_at: string
          user_confirmed: boolean | null
          user_id: string
        }
        Insert: {
          auto_generated?: boolean | null
          created_at?: string
          duration_minutes?: number | null
          end_location?: unknown
          ended_at?: string | null
          entry_geofence_event_id?: string | null
          entry_kind?: string | null
          exit_geofence_event_id?: string | null
          hourly_rate?: number | null
          id?: string
          is_billable?: boolean | null
          job_id: string
          jobber_id?: string | null
          notes?: string | null
          org_id: string
          phase_id?: string | null
          start_location?: unknown
          started_at: string
          user_confirmed?: boolean | null
          user_id: string
        }
        Update: {
          auto_generated?: boolean | null
          created_at?: string
          duration_minutes?: number | null
          end_location?: unknown
          ended_at?: string | null
          entry_geofence_event_id?: string | null
          entry_kind?: string | null
          exit_geofence_event_id?: string | null
          hourly_rate?: number | null
          id?: string
          is_billable?: boolean | null
          job_id?: string
          jobber_id?: string | null
          notes?: string | null
          org_id?: string
          phase_id?: string | null
          start_location?: unknown
          started_at?: string
          user_confirmed?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_entry_event_fk"
            columns: ["entry_geofence_event_id"]
            isOneToOne: false
            referencedRelation: "geofence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_exit_event_fk"
            columns: ["exit_geofence_event_id"]
            isOneToOne: false
            referencedRelation: "geofence_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "job_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          distance_meters: number
          duration_seconds: number | null
          end_address: string | null
          end_geofence_id: string | null
          end_location: unknown
          ended_at: string
          has_gap: boolean | null
          id: string
          implausible_speed: boolean | null
          is_billable: boolean | null
          job_id: string | null
          mileage_cost: number | null
          mileage_rate: number | null
          miles: number | null
          org_id: string
          purpose: Database["public"]["Enums"]["trip_purpose"] | null
          route_polyline: string | null
          start_address: string | null
          start_geofence_id: string | null
          start_location: unknown
          started_at: string
          updated_at: string
          user_id: string
          user_override_purpose:
            | Database["public"]["Enums"]["trip_purpose"]
            | null
          user_reviewed: boolean | null
        }
        Insert: {
          created_at?: string
          distance_meters?: number
          duration_seconds?: number | null
          end_address?: string | null
          end_geofence_id?: string | null
          end_location: unknown
          ended_at: string
          has_gap?: boolean | null
          id?: string
          implausible_speed?: boolean | null
          is_billable?: boolean | null
          job_id?: string | null
          mileage_cost?: number | null
          mileage_rate?: number | null
          miles?: number | null
          org_id: string
          purpose?: Database["public"]["Enums"]["trip_purpose"] | null
          route_polyline?: string | null
          start_address?: string | null
          start_geofence_id?: string | null
          start_location: unknown
          started_at: string
          updated_at?: string
          user_id: string
          user_override_purpose?:
            | Database["public"]["Enums"]["trip_purpose"]
            | null
          user_reviewed?: boolean | null
        }
        Update: {
          created_at?: string
          distance_meters?: number
          duration_seconds?: number | null
          end_address?: string | null
          end_geofence_id?: string | null
          end_location?: unknown
          ended_at?: string
          has_gap?: boolean | null
          id?: string
          implausible_speed?: boolean | null
          is_billable?: boolean | null
          job_id?: string | null
          mileage_cost?: number | null
          mileage_rate?: number | null
          miles?: number | null
          org_id?: string
          purpose?: Database["public"]["Enums"]["trip_purpose"] | null
          route_polyline?: string | null
          start_address?: string | null
          start_geofence_id?: string | null
          start_location?: unknown
          started_at?: string
          updated_at?: string
          user_id?: string
          user_override_purpose?:
            | Database["public"]["Enums"]["trip_purpose"]
            | null
          user_reviewed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_end_geofence_id_fkey"
            columns: ["end_geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_start_geofence_id_fkey"
            columns: ["start_geofence_id"]
            isOneToOne: false
            referencedRelation: "geofences"
            referencedColumns: ["id"]
          },
        ]
      }
      user_location_prefs: {
        Row: {
          auto_classify_trips: boolean | null
          auto_create_time_entries: boolean | null
          business_hours: Json | null
          default_dwell_seconds: number | null
          default_geofence_radius_m: number | null
          default_trip_billable: boolean | null
          gps_mode: string | null
          mileage_rate_override: number | null
          notification_prefs: Json | null
          org_id: string
          raw_location_retention_days: number | null
          require_confirmation: boolean | null
          track_outside_business_hours: boolean | null
          tracking_enabled: boolean | null
          updated_at: string
          user_id: string
          vacation_mode: boolean | null
          vacation_until: string | null
        }
        Insert: {
          auto_classify_trips?: boolean | null
          auto_create_time_entries?: boolean | null
          business_hours?: Json | null
          default_dwell_seconds?: number | null
          default_geofence_radius_m?: number | null
          default_trip_billable?: boolean | null
          gps_mode?: string | null
          mileage_rate_override?: number | null
          notification_prefs?: Json | null
          org_id: string
          raw_location_retention_days?: number | null
          require_confirmation?: boolean | null
          track_outside_business_hours?: boolean | null
          tracking_enabled?: boolean | null
          updated_at?: string
          user_id: string
          vacation_mode?: boolean | null
          vacation_until?: string | null
        }
        Update: {
          auto_classify_trips?: boolean | null
          auto_create_time_entries?: boolean | null
          business_hours?: Json | null
          default_dwell_seconds?: number | null
          default_geofence_radius_m?: number | null
          default_trip_billable?: boolean | null
          gps_mode?: string | null
          mileage_rate_override?: number | null
          notification_prefs?: Json | null
          org_id?: string
          raw_location_retention_days?: number | null
          require_confirmation?: boolean | null
          track_outside_business_hours?: boolean | null
          tracking_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          vacation_mode?: boolean | null
          vacation_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_location_prefs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          active_org_id: string | null
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active_org_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active_org_id?: string | null
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_active_org_id_fkey"
            columns: ["active_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prompts: {
        Row: {
          automation_event_id: string | null
          body: string | null
          created_at: string
          customer_id: string | null
          default_option_id: string | null
          expires_at: string | null
          id: string
          job_id: string | null
          options: Json | null
          org_id: string
          payload: Json | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          prompt_type: string
          responded_at: string | null
          response: Json | null
          snoozed_until: string | null
          status: Database["public"]["Enums"]["prompt_status"] | null
          title: string
          user_id: string
        }
        Insert: {
          automation_event_id?: string | null
          body?: string | null
          created_at?: string
          customer_id?: string | null
          default_option_id?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string | null
          options?: Json | null
          org_id: string
          payload?: Json | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          prompt_type: string
          responded_at?: string | null
          response?: Json | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["prompt_status"] | null
          title: string
          user_id: string
        }
        Update: {
          automation_event_id?: string | null
          body?: string | null
          created_at?: string
          customer_id?: string | null
          default_option_id?: string | null
          expires_at?: string | null
          id?: string
          job_id?: string | null
          options?: Json | null
          org_id?: string
          payload?: Json | null
          priority?: Database["public"]["Enums"]["task_priority"] | null
          prompt_type?: string
          responded_at?: string | null
          response?: Json | null
          snoozed_until?: string | null
          status?: Database["public"]["Enums"]["prompt_status"] | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_prompts_automation_event_id_fkey"
            columns: ["automation_event_id"]
            isOneToOne: false
            referencedRelation: "automation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_prompts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_prompts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_prompts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_items: {
        Row: {
          ai_action_items: Json | null
          ai_caption: string | null
          ai_extracted_entities: Json | null
          ai_sentiment: string | null
          ai_summary: string | null
          audio_url: string | null
          captured_at: string
          change_order_revision_id: string | null
          classified_type: string | null
          communication_id: string | null
          content: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          document_url: string | null
          duration_seconds: number | null
          embedding: string | null
          estimate_id: string | null
          exif_data: Json | null
          geo_address: string | null
          id: string
          image_url: string | null
          job_id: string | null
          location: unknown
          metadata: Json | null
          occurred_at: string
          org_id: string
          phase_id: string | null
          processed_at: string | null
          processing_error: string | null
          processing_status: string | null
          property_id: string | null
          raw_content: string | null
          site_visit_id: string | null
          source: Database["public"]["Enums"]["vault_source"]
          speakers: Json | null
          storage_object_key: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string | null
          type: Database["public"]["Enums"]["vault_item_type"]
          updated_at: string
        }
        Insert: {
          ai_action_items?: Json | null
          ai_caption?: string | null
          ai_extracted_entities?: Json | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          audio_url?: string | null
          captured_at?: string
          change_order_revision_id?: string | null
          classified_type?: string | null
          communication_id?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_url?: string | null
          duration_seconds?: number | null
          embedding?: string | null
          estimate_id?: string | null
          exif_data?: Json | null
          geo_address?: string | null
          id?: string
          image_url?: string | null
          job_id?: string | null
          location?: unknown
          metadata?: Json | null
          occurred_at?: string
          org_id: string
          phase_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string | null
          property_id?: string | null
          raw_content?: string | null
          site_visit_id?: string | null
          source: Database["public"]["Enums"]["vault_source"]
          speakers?: Json | null
          storage_object_key?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string | null
          type: Database["public"]["Enums"]["vault_item_type"]
          updated_at?: string
        }
        Update: {
          ai_action_items?: Json | null
          ai_caption?: string | null
          ai_extracted_entities?: Json | null
          ai_sentiment?: string | null
          ai_summary?: string | null
          audio_url?: string | null
          captured_at?: string
          change_order_revision_id?: string | null
          classified_type?: string | null
          communication_id?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          document_url?: string | null
          duration_seconds?: number | null
          embedding?: string | null
          estimate_id?: string | null
          exif_data?: Json | null
          geo_address?: string | null
          id?: string
          image_url?: string | null
          job_id?: string | null
          location?: unknown
          metadata?: Json | null
          occurred_at?: string
          org_id?: string
          phase_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string | null
          property_id?: string | null
          raw_content?: string | null
          site_visit_id?: string | null
          source?: Database["public"]["Enums"]["vault_source"]
          speakers?: Json | null
          storage_object_key?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["vault_item_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_items_change_order_revision_id_fkey"
            columns: ["change_order_revision_id"]
            isOneToOne: false
            referencedRelation: "change_order_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimate_visit_state"
            referencedColumns: ["estimate_id"]
          },
          {
            foreignKeyName: "vault_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "job_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_site_visit_id_fkey"
            columns: ["site_visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      website_promotions: {
        Row: {
          active: boolean
          button_link: string | null
          button_text: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          description: string | null
          display_order: number
          end_date: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          message: string | null
          org_id: string
          placement: string | null
          priority: number
          start_date: string | null
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          description?: string | null
          display_order?: number
          end_date?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          message?: string | null
          org_id: string
          placement?: string | null
          priority?: number
          start_date?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          description?: string | null
          display_order?: number
          end_date?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          message?: string | null
          org_id?: string
          placement?: string | null
          priority?: number
          start_date?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_promotions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      website_service_highlights: {
        Row: {
          active: boolean
          created_at: string
          cta_label: string | null
          cta_path: string | null
          description: string | null
          display_order: number
          featured: boolean
          icon_key: string | null
          id: string
          is_active: boolean
          org_id: string
          slug: string | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cta_label?: string | null
          cta_path?: string | null
          description?: string | null
          display_order?: number
          featured?: boolean
          icon_key?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          slug?: string | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cta_label?: string | null
          cta_path?: string | null
          description?: string | null
          display_order?: number
          featured?: boolean
          icon_key?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          slug?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_service_highlights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      website_settings: {
        Row: {
          active: boolean
          availability_text: string | null
          call_cta_label: string | null
          created_at: string
          emergency_message: string | null
          hero_headline: string | null
          hero_subheadline: string | null
          homepage_seo_description: string | null
          homepage_seo_title: string | null
          id: string
          is_published: boolean
          org_id: string
          phone_display: string | null
          phone_e164: string | null
          portal_cta_label: string | null
          portal_status_message: string | null
          primary_cta_label: string | null
          primary_cta_path: string | null
          published: boolean
          request_service_cta_label: string | null
          seo_description: string | null
          seo_title: string | null
          service_area_summary: string | null
          singleton_key: string
          social_image_url: string | null
          text_cta_label: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          availability_text?: string | null
          call_cta_label?: string | null
          created_at?: string
          emergency_message?: string | null
          hero_headline?: string | null
          hero_subheadline?: string | null
          homepage_seo_description?: string | null
          homepage_seo_title?: string | null
          id?: string
          is_published?: boolean
          org_id: string
          phone_display?: string | null
          phone_e164?: string | null
          portal_cta_label?: string | null
          portal_status_message?: string | null
          primary_cta_label?: string | null
          primary_cta_path?: string | null
          published?: boolean
          request_service_cta_label?: string | null
          seo_description?: string | null
          seo_title?: string | null
          service_area_summary?: string | null
          singleton_key?: string
          social_image_url?: string | null
          text_cta_label?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          availability_text?: string | null
          call_cta_label?: string | null
          created_at?: string
          emergency_message?: string | null
          hero_headline?: string | null
          hero_subheadline?: string | null
          homepage_seo_description?: string | null
          homepage_seo_title?: string | null
          id?: string
          is_published?: boolean
          org_id?: string
          phone_display?: string | null
          phone_e164?: string | null
          portal_cta_label?: string | null
          portal_status_message?: string | null
          primary_cta_label?: string | null
          primary_cta_path?: string | null
          published?: boolean
          request_service_cta_label?: string | null
          seo_description?: string | null
          seo_title?: string | null
          service_area_summary?: string | null
          singleton_key?: string
          social_image_url?: string | null
          text_cta_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      estimate_visit_state: {
        Row: {
          estimate_id: string | null
          site_visit_completed_at: string | null
          site_visit_status:
            | Database["public"]["Enums"]["site_visit_status"]
            | null
          source_site_visit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_source_site_visit_id_fkey"
            columns: ["source_site_visit_id"]
            isOneToOne: true
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _apply_triage_decision: {
        Args: {
          p_actor_id: string
          p_authorization_note: string
          p_authorization_reference: string
          p_authorization_type: string
          p_authorized_at: string
          p_authorized_customer_contact: string
          p_decision: string
          p_not_to_exceed_amount: number
          p_org_id: string
          p_request_id: string
        }
        Returns: Json
      }
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_org_invite: {
        Args: { p_full_name: string; p_token: string; p_user_id: string }
        Returns: string
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      apply_job_scheduling: {
        Args: {
          p_actor_customer_id: string
          p_actor_user_id: string
          p_job_id: string
          p_org_id: string
          p_scheduled_end: string
          p_scheduled_start: string
        }
        Returns: {
          actual_end: string | null
          actual_start: string | null
          ai_summary: string | null
          authorization_note: string | null
          authorization_reference: string | null
          authorization_type: string | null
          authorized_at: string | null
          authorized_customer_contact: string | null
          category_id: string | null
          closed_at: string | null
          closed_reason: string | null
          cost_total: number | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          embedding: string | null
          estimated_duration_minutes: number | null
          id: string
          invoiced_total: number | null
          job_number: string | null
          jobber_id: string | null
          not_to_exceed_amount: number | null
          org_id: string
          origin_estimate_id: string | null
          origin_quote_id: string | null
          origin_request_id: string | null
          paid_total: number | null
          priority: Database["public"]["Enums"]["job_priority"]
          property_id: string
          quoted_total: number | null
          scheduled_end: string | null
          scheduled_start: string | null
          status: Database["public"]["Enums"]["job_status"]
          tags: string[] | null
          title: string
          total_drive_cost: number | null
          total_drive_miles: number | null
          total_drive_time_seconds: number | null
          total_on_site_minutes: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_estimate_pricing: {
        Args: { p_estimate_id: string }
        Returns: undefined
      }
      book_scheduling_slot: {
        Args: {
          p_actor_customer_id: string
          p_job_id: string
          p_slot_id: string
        }
        Returns: {
          booked_by_customer_id: string | null
          booked_by_user_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_customer_id: string | null
          cancelled_by_user_id: string | null
          created_at: string
          id: string
          job_id: string
          org_id: string
          slot_id: string
        }
        SetofOptions: {
          from: "*"
          to: "scheduling_slot_bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bootstrap_demonstration_organization: {
        Args: { p_initiator_user_id: string }
        Returns: string
      }
      cancel_scheduling_slot_booking: {
        Args: {
          p_actor_customer_id: string
          p_actor_user_id: string
          p_booking_id: string
          p_reason: string
        }
        Returns: {
          booked_by_customer_id: string | null
          booked_by_user_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_customer_id: string | null
          cancelled_by_user_id: string | null
          created_at: string
          id: string
          job_id: string
          org_id: string
          slot_id: string
        }
        SetofOptions: {
          from: "*"
          to: "scheduling_slot_bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_site_visit: {
        Args: { p_reason: string; p_site_visit_id: string }
        Returns: undefined
      }
      cancel_site_visit_appointment: {
        Args: { p_appointment_id: string; p_reason: string }
        Returns: undefined
      }
      complete_site_visit: {
        Args: { p_site_visit_id: string }
        Returns: undefined
      }
      correct_request_triage: {
        Args: {
          p_authorization_note?: string
          p_authorization_reference?: string
          p_authorization_type?: string
          p_authorized_at?: string
          p_authorized_customer_contact?: string
          p_new_decision: string
          p_not_to_exceed_amount?: number
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      create_change_order_draft: {
        Args: {
          p_acknowledgment_text: string
          p_acknowledgment_version: string
          p_change_order_id: string
          p_created_by_user_id: string
          p_initiator: Database["public"]["Enums"]["change_order_initiator"]
          p_job_id: string
          p_line_items: Json
          p_org_id: string
          p_reason: string
          p_requested_by_customer_id: string
          p_requested_by_user_id: string
          p_schedule_delta_minutes: number
          p_schedule_impact_notes: string
          p_schedule_only: boolean
          p_scope_change_summary: string
        }
        Returns: {
          acknowledgment_text: string | null
          acknowledgment_version: string | null
          change_order_id: string
          created_at: string
          created_by_user_id: string | null
          decided_at: string | null
          decided_by_customer_id: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          deposit_impact: number
          id: string
          incorporated_at: string | null
          price_adjustment: number
          proposed_at: string | null
          proposed_by_user_id: string | null
          reason: string | null
          schedule_delta_minutes: number | null
          schedule_impact_notes: string | null
          schedule_only: boolean
          scope_change_summary: string | null
          status: Database["public"]["Enums"]["change_order_status"]
          supersedes_revision_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "change_order_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_quote_from_estimate: {
        Args: { p_estimate_id: string }
        Returns: string
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      find_job_anomalies: {
        Args: { search_org_id: string }
        Returns: {
          anomaly_type: string
          details: Json
          job_id: string
          job_title: string
          severity: string
        }[]
      }
      find_similar_jobs: {
        Args: {
          exclude_job_id?: string
          query_embedding: string
          result_limit?: number
          search_org_id: string
        }
        Returns: {
          completed_at: string
          customer_name: string
          job_id: string
          property_address: string
          similarity: number
          title: string
          total_invoiced: number
          total_quoted: number
        }[]
      }
      generate_estimate_from_site_visit: {
        Args: { p_site_visit_id: string }
        Returns: string
      }
      geofences_containing_point: {
        Args: { p_org_id: string; p_point: unknown; p_user_id?: string }
        Returns: {
          distance_m: number
          geofence_id: string
          job_id: string
          label: string
          property_id: string
          type: Database["public"]["Enums"]["geofence_type"]
        }[]
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_actor_org_role: {
        Args: { p_org_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_customer_360: {
        Args: { search_customer_id: string; search_org_id: string }
        Returns: Json
      }
      get_effective_location_prefs: {
        Args: { p_customer_id?: string; p_job_id?: string; p_user_id: string }
        Returns: Json
      }
      get_my_site_visit_summary: {
        Args: { p_service_request_id: string }
        Returns: {
          is_cancelled: boolean
          is_rescheduled: boolean
          safe_status: string
          scheduled_end: string
          scheduled_start: string
          site_visit_id: string
        }[]
      }
      get_pricing_intelligence: {
        Args: {
          lookback_months?: number
          search_org_id: string
          search_service_id: string
          search_zip: string
        }
        Returns: {
          avg_lost_price: number
          avg_won_price: number
          last_quoted_at: string
          max_price: number
          median_price: number
          min_price: number
          p25_price: number
          p75_price: number
          sample_size: number
          win_rate: number
        }[]
      }
      get_property_memory: {
        Args: { search_org_id: string; search_property_id: string }
        Returns: Json
      }
      gettransactionid: { Args: never; Returns: unknown }
      incorporate_change_order_revision: {
        Args: { p_actor_user_id: string; p_revision_id: string }
        Returns: {
          acknowledgment_text: string | null
          acknowledgment_version: string | null
          change_order_id: string
          created_at: string
          created_by_user_id: string | null
          decided_at: string | null
          decided_by_customer_id: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          deposit_impact: number
          id: string
          incorporated_at: string | null
          price_adjustment: number
          proposed_at: string | null
          proposed_by_user_id: string | null
          reason: string | null
          schedule_delta_minutes: number | null
          schedule_impact_notes: string | null
          schedule_only: boolean
          scope_change_summary: string | null
          status: Database["public"]["Enums"]["change_order_status"]
          supersedes_revision_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "change_order_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      next_estimate_number: { Args: never; Returns: string }
      next_invoice_number: { Args: never; Returns: string }
      next_service_request_number: { Args: never; Returns: string }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      propose_change_order_revision: {
        Args: {
          p_actor_user_id: string
          p_expected_price_adjustment: number
          p_revision_id: string
        }
        Returns: {
          acknowledgment_text: string | null
          acknowledgment_version: string | null
          change_order_id: string
          created_at: string
          created_by_user_id: string | null
          decided_at: string | null
          decided_by_customer_id: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          deposit_impact: number
          id: string
          incorporated_at: string | null
          price_adjustment: number
          proposed_at: string | null
          proposed_by_user_id: string | null
          reason: string | null
          schedule_delta_minutes: number | null
          schedule_impact_notes: string | null
          schedule_only: boolean
          scope_change_summary: string | null
          status: Database["public"]["Enums"]["change_order_status"]
          supersedes_revision_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "change_order_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_old_location_events: { Args: never; Returns: number }
      recalc_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      recalc_quote_totals: { Args: { p_quote_id: string }; Returns: undefined }
      record_request_triage: {
        Args: {
          p_authorization_note?: string
          p_authorization_reference?: string
          p_authorization_type?: string
          p_authorized_at?: string
          p_authorized_customer_contact?: string
          p_decision: string
          p_not_to_exceed_amount?: number
          p_reason: string
          p_request_id: string
        }
        Returns: Json
      }
      refresh_job_time_rollup: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      reopen_estimate_for_edit: {
        Args: { p_estimate_id: string }
        Returns: undefined
      }
      reschedule_site_visit: {
        Args: {
          p_assigned_user_id?: string
          p_end: string
          p_reason?: string
          p_site_visit_id: string
          p_start: string
        }
        Returns: string
      }
      respond_to_change_order_revision: {
        Args: {
          p_acknowledgment_version: string
          p_actor_customer_id: string
          p_decision_note: string
          p_response: string
          p_revision_id: string
        }
        Returns: {
          acknowledgment_text: string | null
          acknowledgment_version: string | null
          change_order_id: string
          created_at: string
          created_by_user_id: string | null
          decided_at: string | null
          decided_by_customer_id: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          deposit_impact: number
          id: string
          incorporated_at: string | null
          price_adjustment: number
          proposed_at: string | null
          proposed_by_user_id: string | null
          reason: string | null
          schedule_delta_minutes: number | null
          schedule_impact_notes: string | null
          schedule_only: boolean
          scope_change_summary: string | null
          status: Database["public"]["Enums"]["change_order_status"]
          supersedes_revision_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "change_order_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      role_has_capability: {
        Args: {
          p_capability: string
          p_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: boolean
      }
      save_site_visit_inspection: {
        Args: { p_responses_patch: Json; p_site_visit_id: string }
        Returns: undefined
      }
      schedule_site_visit: {
        Args: {
          p_assigned_user_id?: string
          p_end: string
          p_site_visit_id: string
          p_start: string
        }
        Returns: string
      }
      search_vault: {
        Args: {
          filter_after?: string
          filter_before?: string
          filter_customer_id?: string
          filter_job_id?: string
          filter_property_id?: string
          filter_tags?: string[]
          filter_types?: Database["public"]["Enums"]["vault_item_type"][]
          query_embedding?: string
          query_text?: string
          result_limit?: number
          search_org_id: string
          semantic_weight?: number
          similarity_threshold?: number
          text_weight?: number
        }
        Returns: {
          ai_summary: string
          combined_score: number
          content: string
          customer_id: string
          id: string
          job_id: string
          occurred_at: string
          property_id: string
          semantic_score: number
          text_score: number
          title: string
          type: Database["public"]["Enums"]["vault_item_type"]
        }[]
      }
      seed_default_automations: {
        Args: { target_org_id: string }
        Returns: undefined
      }
      seed_premier_data: { Args: { target_org_id: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      start_site_visit: {
        Args: { p_site_visit_id: string }
        Returns: undefined
      }
      switch_active_org: { Args: { p_org_id: string }; Returns: undefined }
      undo_site_visit_start: {
        Args: { p_site_visit_id: string }
        Returns: undefined
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      user_is_in_org: { Args: { target_org_id: string }; Returns: boolean }
      user_org_ids: { Args: never; Returns: string[] }
      withdraw_change_order_revision: {
        Args: { p_actor_user_id: string; p_revision_id: string }
        Returns: {
          acknowledgment_text: string | null
          acknowledgment_version: string | null
          change_order_id: string
          created_at: string
          created_by_user_id: string | null
          decided_at: string | null
          decided_by_customer_id: string | null
          decided_by_user_id: string | null
          decision_note: string | null
          deposit_impact: number
          id: string
          incorporated_at: string | null
          price_adjustment: number
          proposed_at: string | null
          proposed_by_user_id: string | null
          reason: string | null
          schedule_delta_minutes: number | null
          schedule_impact_notes: string | null
          schedule_only: boolean
          scope_change_summary: string | null
          status: Database["public"]["Enums"]["change_order_status"]
          supersedes_revision_id: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "change_order_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      action_status:
        | "proposed"
        | "approved"
        | "executed"
        | "rejected"
        | "failed"
      change_order_initiator: "customer" | "contractor"
      change_order_status:
        | "draft"
        | "proposed"
        | "under_review"
        | "approved"
        | "declined"
        | "revision_requested"
        | "withdrawn"
        | "expired"
        | "incorporated"
        | "completed"
      comm_channel:
        | "sms"
        | "email"
        | "call"
        | "portal_message"
        | "in_person"
        | "other"
      comm_direction: "inbound" | "outbound"
      customer_account_status: "invited" | "active" | "disabled"
      customer_archetype:
        | "residential_one_off"
        | "residential_repeat"
        | "landlord_small"
        | "landlord_growing"
        | "property_manager"
        | "commercial"
        | "unknown"
      customer_type: "residential" | "commercial" | "property_manager"
      deposit_requirement_status: "none" | "required" | "waived"
      estimate_status:
        | "draft"
        | "site_visit_scheduled"
        | "site_visit_complete"
        | "quoted"
        | "accepted"
        | "declined"
        | "expired"
        | "converted"
      geofence_event_type: "entered" | "exited" | "dwelled"
      geofence_type: "property" | "home" | "shop" | "supplier" | "custom"
      invoice_kind: "deposit" | "progress" | "final" | "standalone" | "working"
      invoice_status:
        | "draft"
        | "sent"
        | "viewed"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
        | "refunded"
      job_priority: "low" | "normal" | "high" | "emergency"
      job_status:
        | "lead"
        | "site_visit_scheduled"
        | "quoted"
        | "approved"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "invoiced"
        | "paid"
        | "cancelled"
        | "on_hold"
      message_role: "user" | "assistant" | "tool" | "system"
      org_invite_status: "pending" | "accepted" | "revoked" | "expired"
      payment_method: "card" | "ach" | "check" | "cash" | "venmo" | "other"
      preferred_channel: "sms" | "email" | "call" | "portal"
      prompt_status:
        | "pending"
        | "approved"
        | "rejected"
        | "snoozed"
        | "expired"
        | "auto_resolved"
      quote_status:
        | "draft"
        | "sent"
        | "viewed"
        | "accepted"
        | "declined"
        | "expired"
        | "revised"
      quote_type: "standard" | "options" | "package" | "quick"
      service_request_priority: "low" | "normal" | "high" | "emergency"
      service_request_source:
        | "website"
        | "portal"
        | "phone"
        | "sms"
        | "email"
        | "manual"
        | "ai_capture"
        | "jobber_import"
      service_request_status:
        | "new"
        | "reviewing"
        | "approved"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "spam"
        | "estimate_created"
      site_visit_status:
        | "awaiting_scheduling"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status: "open" | "in_progress" | "done" | "cancelled" | "snoozed"
      trip_purpose:
        | "to_job"
        | "from_job"
        | "between_jobs"
        | "supply_run"
        | "commute"
        | "personal"
        | "unknown"
      user_role: "owner" | "admin" | "employee" | "subcontractor" | "viewer"
      vault_item_type:
        | "recording"
        | "transcript"
        | "photo"
        | "note"
        | "email_body"
        | "sms_body"
        | "call_summary"
        | "document"
        | "receipt"
        | "quote_text"
        | "invoice_text"
        | "job_summary"
        | "customer_summary"
        | "manual_entry"
        | "web_extract"
        | "site_arrival"
        | "site_departure"
        | "drive"
      vault_source:
        | "mobile_quick_capture"
        | "plaud"
        | "inbound_sms"
        | "inbound_email"
        | "inbound_call"
        | "manual_upload"
        | "manual_typed"
        | "system_generated"
        | "web_capture"
        | "geofence_event"
        | "automation"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
      action_status: ["proposed", "approved", "executed", "rejected", "failed"],
      change_order_initiator: ["customer", "contractor"],
      change_order_status: [
        "draft",
        "proposed",
        "under_review",
        "approved",
        "declined",
        "revision_requested",
        "withdrawn",
        "expired",
        "incorporated",
        "completed",
      ],
      comm_channel: [
        "sms",
        "email",
        "call",
        "portal_message",
        "in_person",
        "other",
      ],
      comm_direction: ["inbound", "outbound"],
      customer_account_status: ["invited", "active", "disabled"],
      customer_archetype: [
        "residential_one_off",
        "residential_repeat",
        "landlord_small",
        "landlord_growing",
        "property_manager",
        "commercial",
        "unknown",
      ],
      customer_type: ["residential", "commercial", "property_manager"],
      deposit_requirement_status: ["none", "required", "waived"],
      estimate_status: [
        "draft",
        "site_visit_scheduled",
        "site_visit_complete",
        "quoted",
        "accepted",
        "declined",
        "expired",
        "converted",
      ],
      geofence_event_type: ["entered", "exited", "dwelled"],
      geofence_type: ["property", "home", "shop", "supplier", "custom"],
      invoice_kind: ["deposit", "progress", "final", "standalone", "working"],
      invoice_status: [
        "draft",
        "sent",
        "viewed",
        "partially_paid",
        "paid",
        "overdue",
        "void",
        "refunded",
      ],
      job_priority: ["low", "normal", "high", "emergency"],
      job_status: [
        "lead",
        "site_visit_scheduled",
        "quoted",
        "approved",
        "scheduled",
        "in_progress",
        "completed",
        "invoiced",
        "paid",
        "cancelled",
        "on_hold",
      ],
      message_role: ["user", "assistant", "tool", "system"],
      org_invite_status: ["pending", "accepted", "revoked", "expired"],
      payment_method: ["card", "ach", "check", "cash", "venmo", "other"],
      preferred_channel: ["sms", "email", "call", "portal"],
      prompt_status: [
        "pending",
        "approved",
        "rejected",
        "snoozed",
        "expired",
        "auto_resolved",
      ],
      quote_status: [
        "draft",
        "sent",
        "viewed",
        "accepted",
        "declined",
        "expired",
        "revised",
      ],
      quote_type: ["standard", "options", "package", "quick"],
      service_request_priority: ["low", "normal", "high", "emergency"],
      service_request_source: [
        "website",
        "portal",
        "phone",
        "sms",
        "email",
        "manual",
        "ai_capture",
        "jobber_import",
      ],
      service_request_status: [
        "new",
        "reviewing",
        "approved",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "spam",
        "estimate_created",
      ],
      site_visit_status: [
        "awaiting_scheduling",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: ["open", "in_progress", "done", "cancelled", "snoozed"],
      trip_purpose: [
        "to_job",
        "from_job",
        "between_jobs",
        "supply_run",
        "commute",
        "personal",
        "unknown",
      ],
      user_role: ["owner", "admin", "employee", "subcontractor", "viewer"],
      vault_item_type: [
        "recording",
        "transcript",
        "photo",
        "note",
        "email_body",
        "sms_body",
        "call_summary",
        "document",
        "receipt",
        "quote_text",
        "invoice_text",
        "job_summary",
        "customer_summary",
        "manual_entry",
        "web_extract",
        "site_arrival",
        "site_departure",
        "drive",
      ],
      vault_source: [
        "mobile_quick_capture",
        "plaud",
        "inbound_sms",
        "inbound_email",
        "inbound_call",
        "manual_upload",
        "manual_typed",
        "system_generated",
        "web_capture",
        "geofence_event",
        "automation",
      ],
    },
  },
} as const
