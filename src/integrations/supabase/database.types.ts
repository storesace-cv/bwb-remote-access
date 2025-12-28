/* eslint-disable @typescript-eslint/no-empty-object-type */
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
      android_devices: {
        Row: {
          agent_id: string | null
          created_at: string | null
          deleted_at: string | null
          device_id: string
          friendly_name: string | null
          group_id: string | null
          group_name: string | null
          id: number
          last_seen_at: string | null
          mesh_username: string | null
          notes: string | null
          owner: string | null
          provisioning_status: string
          rustdesk_ip: string | null
          rustdesk_password: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          device_id: string
          friendly_name?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: number
          last_seen_at?: string | null
          mesh_username?: string | null
          notes?: string | null
          owner?: string | null
          provisioning_status?: string
          rustdesk_ip?: string | null
          rustdesk_password?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string
          friendly_name?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: number
          last_seen_at?: string | null
          mesh_username?: string | null
          notes?: string | null
          owner?: string | null
          provisioning_status?: string
          rustdesk_ip?: string | null
          rustdesk_password?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "android_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "android_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "android_devices_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "android_devices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "android_devices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "mesh_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
        ]
      }
      device_ambiguity_events: {
        Row: {
          admin_mesh_user_id: string
          candidate_sessions: Json
          created_at: string
          device_id: string
          id: string
          processed_at: string | null
          reason: string
          rustdesk_ip: string | null
          status: string
        }
        Insert: {
          admin_mesh_user_id: string
          candidate_sessions: Json
          created_at?: string
          device_id: string
          id?: string
          processed_at?: string | null
          reason: string
          rustdesk_ip?: string | null
          status?: string
        }
        Update: {
          admin_mesh_user_id?: string
          candidate_sessions?: Json
          created_at?: string
          device_id?: string
          id?: string
          processed_at?: string | null
          reason?: string
          rustdesk_ip?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_ambiguity_events_admin_mesh_user_id_fkey"
            columns: ["admin_mesh_user_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "device_ambiguity_events_admin_mesh_user_id_fkey"
            columns: ["admin_mesh_user_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "device_ambiguity_events_admin_mesh_user_id_fkey"
            columns: ["admin_mesh_user_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
        ]
      }
      device_provisioning_attempts: {
        Row: {
          attempted_at: string
          client_ip: string | null
          code: string
          id: number
          success: boolean
        }
        Insert: {
          attempted_at?: string
          client_ip?: string | null
          code: string
          id?: number
          success: boolean
        }
        Update: {
          attempted_at?: string
          client_ip?: string | null
          code?: string
          id?: number
          success?: boolean
        }
        Relationships: []
      }
      device_provisioning_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          failed_attempts: number
          id: string
          last_attempt_at: string | null
          last_client_ip: string | null
          locked_until: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          failed_attempts?: number
          id?: string
          last_attempt_at?: string | null
          last_client_ip?: string | null
          locked_until?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          failed_attempts?: number
          id?: string
          last_attempt_at?: string | null
          last_client_ip?: string | null
          locked_until?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      device_provisioning_tokens: {
        Row: {
          client_ip: string | null
          code_id: string
          created_at: string
          device_hint: string | null
          expires_at: string
          id: string
          last_seen_at: string | null
          nonce_hash: string | null
          status: string
          token_hash: string
          used_by_device_id: string | null
        }
        Insert: {
          client_ip?: string | null
          code_id: string
          created_at?: string
          device_hint?: string | null
          expires_at: string
          id?: string
          last_seen_at?: string | null
          nonce_hash?: string | null
          status?: string
          token_hash: string
          used_by_device_id?: string | null
        }
        Update: {
          client_ip?: string | null
          code_id?: string
          created_at?: string
          device_hint?: string | null
          expires_at?: string
          id?: string
          last_seen_at?: string | null
          nonce_hash?: string | null
          status?: string
          token_hash?: string
          used_by_device_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_provisioning_tokens_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "device_provisioning_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      device_registration_sessions: {
        Row: {
          clicked_at: string
          created_at: string
          expires_at: string
          geolocation: Json | null
          id: string
          ip_address: string | null
          matched_at: string | null
          matched_device_id: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          clicked_at?: string
          created_at?: string
          expires_at?: string
          geolocation?: Json | null
          id?: string
          ip_address?: string | null
          matched_at?: string | null
          matched_device_id?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          clicked_at?: string
          created_at?: string
          expires_at?: string
          geolocation?: Json | null
          id?: string
          ip_address?: string | null
          matched_at?: string | null
          matched_device_id?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      device_registration_tokens: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          token: string
          used_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          token?: string
          used_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          token?: string
          used_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      mesh_group_permissions: {
        Row: {
          agent_id: string
          collaborator_id: string
          created_at: string
          granted_at: string
          granted_by: string | null
          group_id: string
          id: string
          notes: string | null
          permission: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          agent_id: string
          collaborator_id: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          group_id: string
          id?: string
          notes?: string | null
          permission?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          agent_id?: string
          collaborator_id?: string
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          group_id?: string
          id?: string
          notes?: string | null
          permission?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mesh_group_permissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "mesh_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
        ]
      }
      mesh_groups: {
        Row: {
          agent_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          level: number
          name: string
          owner_user_id: string
          parent_group_id: string | null
          path: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          level?: number
          name: string
          owner_user_id: string
          parent_group_id?: string | null
          path: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          level?: number
          name?: string
          owner_user_id?: string
          parent_group_id?: string | null
          path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mesh_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_groups_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_groups_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_groups_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_groups_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "mesh_groups_parent_group_id_fkey"
            columns: ["parent_group_id"]
            isOneToOne: false
            referencedRelation: "mesh_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      mesh_permission_audit: {
        Row: {
          action: string
          agent_id: string
          collaborator_id: string
          group_id: string
          id: string
          metadata: Json | null
          performed_at: string
          performed_by: string | null
          permission: string
          reason: string | null
        }
        Insert: {
          action: string
          agent_id: string
          collaborator_id: string
          group_id: string
          id?: string
          metadata?: Json | null
          performed_at?: string
          performed_by?: string | null
          permission: string
          reason?: string | null
        }
        Update: {
          action?: string
          agent_id?: string
          collaborator_id?: string
          group_id?: string
          id?: string
          metadata?: Json | null
          performed_at?: string
          performed_by?: string | null
          permission?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mesh_permission_audit_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "mesh_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_permission_audit_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
        ]
      }
      mesh_users: {
        Row: {
          agent_id: string
          auth_user_id: string | null
          created_at: string | null
          deleted_at: string | null
          disabled: boolean
          display_name: string | null
          domain: string
          domain_dns: string | null
          domain_key: string
          domainadmin: number
          email: string | null
          external_user_id: string | null
          id: string
          mesh_username: string
          name: string | null
          parent_agent_id: string | null
          role: string
          siteadmin: number
          source: string
          user_type: string
        }
        Insert: {
          agent_id: string
          auth_user_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          disabled?: boolean
          display_name?: string | null
          domain?: string
          domain_dns?: string | null
          domain_key?: string
          domainadmin?: number
          email?: string | null
          external_user_id?: string | null
          id?: string
          mesh_username: string
          name?: string | null
          parent_agent_id?: string | null
          role?: string
          siteadmin?: number
          source?: string
          user_type?: string
        }
        Update: {
          agent_id?: string
          auth_user_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          disabled?: boolean
          display_name?: string | null
          domain?: string
          domain_dns?: string | null
          domain_key?: string
          domainadmin?: number
          email?: string | null
          external_user_id?: string | null
          id?: string
          mesh_username?: string
          name?: string | null
          parent_agent_id?: string | null
          role?: string
          siteadmin?: number
          source?: string
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "mesh_users_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_users_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_users_parent_agent_id_fkey"
            columns: ["parent_agent_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rustdesk_settings: {
        Row: {
          created_at: string | null
          host: string
          id: number
          key: string
          relay: string
        }
        Insert: {
          created_at?: string | null
          host: string
          id?: number
          key: string
          relay: string
        }
        Update: {
          created_at?: string | null
          host?: string
          id?: number
          key?: string
          relay?: string
        }
        Relationships: []
      }
    }
    Views: {
      agent_hierarchy_summary: {
        Row: {
          active_permission_count: number | null
          agent_email: string | null
          agent_id: string | null
          agent_username: string | null
          collaborator_count: number | null
          device_count: number | null
          group_count: number | null
        }
        Relationships: []
      }
      android_devices_expanded: {
        Row: {
          created_at: string | null
          device_id: string | null
          group_name: string | null
          id: number | null
          notes: string | null
          owner: string | null
          owner_auth_id: string | null
          owner_email: string | null
        }
        Insert: {
          created_at?: string | null
          device_id?: string | null
          group_name?: string | null
          id?: number | null
          notes?: string | null
          owner?: string | null
          owner_auth_id?: string | null
          owner_email?: never
        }
        Update: {
          created_at?: string | null
          device_id?: string | null
          group_name?: string | null
          id?: number | null
          notes?: string | null
          owner?: string | null
          owner_auth_id?: string | null
          owner_email?: never
        }
        Relationships: [
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner_auth_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner_auth_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner_auth_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
        ]
      }
      android_devices_grouping: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          device_id: string | null
          friendly_name: string | null
          group_name: string | null
          id: number | null
          is_unassigned: boolean | null
          last_seen_at: string | null
          mesh_username: string | null
          notes: string | null
          owner: string | null
          rustdesk_password: string | null
          subgroup_name: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          friendly_name?: string | null
          group_name?: never
          id?: number | null
          is_unassigned?: never
          last_seen_at?: string | null
          mesh_username?: string | null
          notes?: string | null
          owner?: string | null
          rustdesk_password?: string | null
          subgroup_name?: never
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          device_id?: string | null
          friendly_name?: string | null
          group_name?: never
          id?: number | null
          is_unassigned?: never
          last_seen_at?: string | null
          mesh_username?: string | null
          notes?: string | null
          owner?: string | null
          rustdesk_password?: string | null
          subgroup_name?: never
        }
        Relationships: [
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "android_devices_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_effective_permissions: {
        Row: {
          agent_id: string | null
          collaborator_id: string | null
          granted_at: string | null
          granted_by: string | null
          group_id: string | null
          group_name: string | null
          group_path: string | null
          mesh_username: string | null
          permission: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mesh_group_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_group_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mesh_users_parent_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_hierarchy_summary"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "mesh_users_parent_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "collaborator_effective_permissions"
            referencedColumns: ["collaborator_id"]
          },
          {
            foreignKeyName: "mesh_users_parent_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "mesh_users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_hierarchy_view: {
        Row: {
          agent_id: string | null
          display_name_with_indent: string | null
          display_path: string | null
          id: string | null
          level: number | null
          name: string | null
          owner_user_id: string | null
          parent_group_id: string | null
          path: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view_group: {
        Args: { target_group_id: string; user_id: string }
        Returns: boolean
      }
      check_permission_conflicts: {
        Args: { collaborator_uuid: string; new_group_uuid: string }
        Returns: {
          conflict_group_id: string
          conflict_group_name: string
          conflict_type: string
          message: string
        }[]
      }
      compute_group_path: { Args: { group_id: string }; Returns: string }
      expire_old_registration_sessions: { Args: never; Returns: undefined }
      get_accessible_devices_for_collaborator: {
        Args: { user_uuid: string }
        Returns: {
          device_id: string
        }[]
      }
      get_descendant_groups: {
        Args: { parent_group_uuid: string }
        Returns: {
          group_id: string
        }[]
      }
      get_visible_groups: {
        Args: { user_id: string }
        Returns: {
          group_id: string
        }[]
      }
      get_visible_groups_with_inheritance: {
        Args: { user_uuid: string }
        Returns: {
          group_id: string
        }[]
      }
      has_group_access: {
        Args: { target_group_uuid: string; user_uuid: string }
        Returns: boolean
      }
      migrate_notes_to_groups: {
        Args: never
        Returns: {
          devices_migrated: number
          groups_created: number
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
