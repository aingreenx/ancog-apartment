
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "app_settings": {
                  Row: {
                    "apartment_address": string | null,"gcash_name": string | null,"gcash_number": string | null,"gcash_qr_path": string | null,"id": boolean,"receipt_signature_path": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "apartment_address"?: string | null,"gcash_name"?: string | null,"gcash_number"?: string | null,"gcash_qr_path"?: string | null,"id"?: boolean,"receipt_signature_path"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "apartment_address"?: string | null,"gcash_name"?: string | null,"gcash_number"?: string | null,"gcash_qr_path"?: string | null,"id"?: boolean,"receipt_signature_path"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor": string | null,"after": Json | null,"at": string,"before": Json | null,"id": number,"row_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: never,"row_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: never,"row_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"charges": {
                  Row: {
                    "amount_centavos": number,"created_at": string,"created_by": string | null,"curr_kwh": number | null,"description": string,"due_date": string,"id": string,"kwh_used": number | null,"meter_reading_id": string | null,"period_end": string | null,"period_start": string | null,"prev_kwh": number | null,"rate_centavos_per_kwh": number | null,"tenancy_id": string,"type": Database["public"]['Enums']["charge_type"],"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_centavos": number,"created_at"?: string,"created_by"?: string | null,"curr_kwh"?: number | null,"description": string,"due_date": string,"id"?: string,"kwh_used"?: number | null,"meter_reading_id"?: string | null,"period_end"?: string | null,"period_start"?: string | null,"prev_kwh"?: number | null,"rate_centavos_per_kwh"?: number | null,"tenancy_id": string,"type": Database["public"]['Enums']["charge_type"],"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_centavos"?: number,"created_at"?: string,"created_by"?: string | null,"curr_kwh"?: number | null,"description"?: string,"due_date"?: string,"id"?: string,"kwh_used"?: number | null,"meter_reading_id"?: string | null,"period_end"?: string | null,"period_start"?: string | null,"prev_kwh"?: number | null,"rate_centavos_per_kwh"?: number | null,"tenancy_id"?: string,"type"?: Database["public"]['Enums']["charge_type"],"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_meter_reading_id_fkey"
      columns: ["meter_reading_id"]
isOneToOne: true
      referencedRelation: "meter_readings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancy_balances"
      referencedColumns: ["tenancy_id"]
    },{
      foreignKeyName: "charges_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"electricity_rates": {
                  Row: {
                    "created_at": string,"created_by": string | null,"effective_date": string,"id": string,"rate_centavos_per_kwh": number,"source_note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"effective_date": string,"id"?: string,"rate_centavos_per_kwh": number,"source_note"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"effective_date"?: string,"id"?: string,"rate_centavos_per_kwh"?: number,"source_note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "electricity_rates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"meter_readings": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"kind": Database["public"]['Enums']["reading_kind"],"photo_path": string | null,"reading_date": string,"reading_kwh": number,"tenancy_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["reading_kind"],"photo_path"?: string | null,"reading_date": string,"reading_kwh": number,"tenancy_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["reading_kind"],"photo_path"?: string | null,"reading_date"?: string,"reading_kwh"?: number,"tenancy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "meter_readings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meter_readings_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "meter_readings_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancy_balances"
      referencedColumns: ["tenancy_id"]
    }
                  ]
                },"move_out_settlements": {
                  Row: {
                    "applied_to_balance_centavos": number,"created_at": string,"created_by": string | null,"deductions_centavos": number,"deposit_held_centavos": number,"id": string,"notes": string | null,"refund_centavos": number,"remaining_owed_centavos": number,"settled_on": string,"tenancy_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_to_balance_centavos": number,"created_at"?: string,"created_by"?: string | null,"deductions_centavos": number,"deposit_held_centavos": number,"id"?: string,"notes"?: string | null,"refund_centavos": number,"remaining_owed_centavos": number,"settled_on": string,"tenancy_id": string
                  }
                  Update: {
                    "applied_to_balance_centavos"?: number,"created_at"?: string,"created_by"?: string | null,"deductions_centavos"?: number,"deposit_held_centavos"?: number,"id"?: string,"notes"?: string | null,"refund_centavos"?: number,"remaining_owed_centavos"?: number,"settled_on"?: string,"tenancy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "move_out_settlements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "move_out_settlements_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: true
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "move_out_settlements_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: true
      referencedRelation: "tenancy_balances"
      referencedColumns: ["tenancy_id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"link": string | null,"profile_id": string,"read_at": string | null,"title": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"link"?: string | null,"profile_id": string,"read_at"?: string | null,"title": string,"type": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"link"?: string | null,"profile_id"?: string,"read_at"?: string | null,"title"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_allocations": {
                  Row: {
                    "amount_centavos": number,"charge_id": string,"created_at": string,"created_by": string | null,"id": string,"payment_id": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_centavos": number,"charge_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"payment_id": string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_centavos"?: number,"charge_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"payment_id"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_allocations_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "charge_balances"
      referencedColumns: ["charge_id"]
    },{
      foreignKeyName: "payment_allocations_charge_id_fkey"
      columns: ["charge_id"]
isOneToOne: false
      referencedRelation: "charges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_allocations_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_centavos": number,"created_at": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"paid_on": string,"proof_path": string | null,"reference_no": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["payment_status"],"submitted_by": string | null,"tenancy_id": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_centavos": number,"created_at"?: string,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"paid_on": string,"proof_path"?: string | null,"reference_no"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"submitted_by"?: string | null,"tenancy_id": string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_centavos"?: number,"created_at"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"paid_on"?: string,"proof_path"?: string | null,"reference_no"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["payment_status"],"submitted_by"?: string | null,"tenancy_id"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancy_balances"
      referencedColumns: ["tenancy_id"]
    },{
      foreignKeyName: "payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"must_change_password": boolean,"role": Database["public"]['Enums']["user_role"],"username": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"must_change_password"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"username": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"must_change_password"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "created_at": string,"endpoint": string,"id": string,"keys": NonNullable<Json>,"profile_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"endpoint": string,"id"?: string,"keys": NonNullable<Json>,"profile_id": string
                  }
                  Update: {
                    "created_at"?: string,"endpoint"?: string,"id"?: string,"keys"?: NonNullable<Json>,"profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"receipts": {
                  Row: {
                    "id": string,"issued_at": string,"payment_id": string,"pdf_path": string | null,"receipt_no": number,"received_by": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"issued_at"?: string,"payment_id": string,"pdf_path"?: string | null,"receipt_no"?: never,"received_by": string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "id"?: string,"issued_at"?: string,"payment_id"?: string,"pdf_path"?: string | null,"receipt_no"?: never,"received_by"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "receipts_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipts_received_by_fkey"
      columns: ["received_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "receipts_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "base_rent_centavos": number,"created_at": string,"id": string,"meter_serial": string | null,"number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base_rent_centavos": number,"created_at"?: string,"id"?: string,"meter_serial"?: string | null,"number": number
                  }
                  Update: {
                    "base_rent_centavos"?: number,"created_at"?: string,"id"?: string,"meter_serial"?: string | null,"number"?: number
                  }
                  Relationships: [
                    
                  ]
                },"tenancies": {
                  Row: {
                    "advance_required_centavos": number,"created_at": string,"deposit_required_centavos": number,"due_day": number,"end_date": string | null,"id": string,"monthly_rent_centavos": number,"room_id": string,"start_date": string,"starting_kwh": number,"status": Database["public"]['Enums']["tenancy_status"],"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "advance_required_centavos"?: number,"created_at"?: string,"deposit_required_centavos"?: number,"due_day": number,"end_date"?: string | null,"id"?: string,"monthly_rent_centavos": number,"room_id": string,"start_date": string,"starting_kwh": number,"status"?: Database["public"]['Enums']["tenancy_status"],"tenant_id": string
                  }
                  Update: {
                    "advance_required_centavos"?: number,"created_at"?: string,"deposit_required_centavos"?: number,"due_day"?: number,"end_date"?: string | null,"id"?: string,"monthly_rent_centavos"?: number,"room_id"?: string,"start_date"?: string,"starting_kwh"?: number,"status"?: Database["public"]['Enums']["tenancy_status"],"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenancies_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                },"tenancy_occupants": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"phone": string | null,"tenancy_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"phone"?: string | null,"tenancy_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"phone"?: string | null,"tenancy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenancy_occupants_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancy_occupants_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancy_balances"
      referencedColumns: ["tenancy_id"]
    }
                  ]
                },"tenants": {
                  Row: {
                    "address": string | null,"created_at": string,"first_name": string,"id": string,"last_name": string,"phone_1": string,"phone_2": string | null,"profile_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"created_at"?: string,"first_name": string,"id"?: string,"last_name": string,"phone_1": string,"phone_2"?: string | null,"profile_id"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"created_at"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"phone_1"?: string,"phone_2"?: string | null,"profile_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenants_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "charge_balances": {
                  Row: {
                    "amount_centavos": number,"charge_id": string,"days_overdue": number | null,"description": string,"due_date": string,"owed_centavos": number | null,"paid_centavos": number | null,"period_end": string | null,"period_start": string | null,"status": string | null,"tenancy_id": string,"type": Database["public"]['Enums']["charge_type"],"voided_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "charges_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancy_balances"
      referencedColumns: ["tenancy_id"]
    }
                  ]
                },"monthly_summary": {
                  Row: {
                    "bank_collected_centavos": number | null,"cash_collected_centavos": number | null,"electricity_billed_centavos": number | null,"gcash_collected_centavos": number | null,"month": string | null,"other_billed_centavos": number | null,"rent_billed_centavos": number | null,"total_collected_centavos": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"tenancy_balances": {
                  Row: {
                    "balance_centavos": number | null,"charged_centavos": number | null,"credit_centavos": number | null,"max_days_overdue": number | null,"overdue_centavos": number | null,"owed_centavos": number | null,"paid_centavos": number | null,"room_id": string,"status": Database["public"]['Enums']["tenancy_status"],"tenancy_id": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "tenancies_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "tenants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "app_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"rate_for_date":
{ Args: { "p_date": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"effective_date": string,
"id": string,
"rate_centavos_per_kwh": number,
"source_note": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "electricity_rates"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "charge_type": "rent"|"electricity"|"deposit"|"custom"|"deduction","payment_method": "cash"|"gcash"|"bank"|"deposit","payment_status": "pending_review"|"confirmed"|"rejected","reading_kind": "regular"|"move_in"|"move_out"|"meter_change_old"|"meter_change_new","tenancy_status": "active"|"ended","user_role": "admin"|"tenant"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "charge_type": ["rent", "electricity", "deposit", "custom", "deduction"],"payment_method": ["cash", "gcash", "bank", "deposit"],"payment_status": ["pending_review", "confirmed", "rejected"],"reading_kind": ["regular", "move_in", "move_out", "meter_change_old", "meter_change_new"],"tenancy_status": ["active", "ended"],"user_role": ["admin", "tenant"]
          }
        }
} as const
