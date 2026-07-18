// Hand-authored to mirror supabase/migrations/0001_init.sql exactly.
// Once the project is linked to a real Supabase project, regenerate with:
//   supabase gen types typescript --linked > types/database.ts
// and reconcile any drift.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ApprovalStatus =
  | "profile_incomplete"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended"
  | "blacklisted";

export type EventRegistrationStatus = "draft" | "open" | "closed" | "archived";

export type BoothStatus =
  | "available"
  | "locked"
  | "reserved"
  | "awaiting_payment"
  | "confirmed"
  | "admin_held"
  | "blocked"
  | "unavailable";

export type ApplicationStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "booth_selection_available"
  | "booth_selected"
  | "awaiting_payment"
  | "payment_under_review"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "expired";

export type PaymentMethod = "adcb_pace_pay" | "bank_transfer" | "offline" | "other";

export type PaymentStatus =
  | "not_requested"
  | "payment_required"
  | "pending_payment"
  | "receipt_uploaded"
  | "pending_verification"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
  | "partially_refunded";

export type WaitingListStatus = "waiting" | "invited" | "accepted" | "declined" | "expired" | "removed";
export type NotificationChannel = "email" | "sms" | "whatsapp";
export type NotificationStatus = "queued" | "sent" | "delivered" | "failed";
export type MapFeatureType =
  | "entrance"
  | "exit"
  | "loading_bay"
  | "main_stage"
  | "food_section"
  | "clothing_section"
  | "coffee_area"
  | "electrical_point"
  | "restroom"
  | "other";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: "vendor" | "admin";
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Relationships: [];
      };
      businesses: {
        Row: {
          id: string;
          owner_id: string;
          business_name: string;
          owner_name: string;
          email: string;
          phone: string;
          instagram_username: string | null;
          category_id: string | null;
          description: string | null;
          logo_url: string | null;
          trade_license_url: string | null;
          product_photo_urls: string[];
          approval_status: ApprovalStatus;
          rejection_reason: string | null;
          requires_reapproval: boolean;
          submitted_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          last_profile_update: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["businesses"]["Row"]> & {
          owner_id: string;
          business_name: string;
          owner_name: string;
          email: string;
          phone: string;
        };
        Update: Partial<Database["public"]["Tables"]["businesses"]["Row"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          name: string;
          slug: string;
          location: string | null;
          description: string | null;
          vendor_rules: string | null;
          setup_instructions: string | null;
          banner_url: string | null;
          start_at: string | null;
          end_at: string | null;
          setup_start_at: string | null;
          setup_end_at: string | null;
          registration_opens_at: string | null;
          registration_closes_at: string | null;
          registration_status: EventRegistrationStatus;
          payment_deadline_minutes: number;
          booth_lock_minutes: number;
          recommendations_enabled: boolean;
          booth_changes_locked: boolean;
          is_archived: boolean;
          duplicated_from: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["events"]["Row"]> & { name: string; slug: string };
        Update: Partial<Database["public"]["Tables"]["events"]["Row"]>;
        Relationships: [];
      };
      zones: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          color: string;
          description: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["zones"]["Row"]> & { event_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["zones"]["Row"]>;
        Relationships: [];
      };
      map_features: {
        Row: {
          id: string;
          event_id: string;
          type: MapFeatureType;
          label: string | null;
          map_x: number;
          map_y: number;
          map_width: number;
          map_height: number;
          rotation: number;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["map_features"]["Row"]> & { event_id: string; type: MapFeatureType };
        Update: Partial<Database["public"]["Tables"]["map_features"]["Row"]>;
        Relationships: [];
      };
      booths: {
        Row: {
          id: string;
          event_id: string;
          zone_id: string | null;
          booth_number: string;
          size_label: string | null;
          map_x: number;
          map_y: number;
          map_width: number;
          map_height: number;
          rotation: number;
          price_before_vat: number;
          status: BoothStatus;
          feature_tags: string[];
          distance_from_entrance: number | null;
          suitable_category_ids: string[];
          admin_notes: string | null;
          held_for_business_id: string | null;
          locked_by_business_id: string | null;
          lock_expires_at: string | null;
          current_application_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["booths"]["Row"]> & { event_id: string; booth_number: string };
        Update: Partial<Database["public"]["Tables"]["booths"]["Row"]>;
        Relationships: [];
      };
      category_zone_rules: {
        Row: {
          id: string;
          event_id: string;
          category_id: string;
          preferred_zone_id: string | null;
          preferred_feature_tags: string[];
          avoid_adjacent_same_category: boolean;
          max_per_zone: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["category_zone_rules"]["Row"]> & {
          event_id: string;
          category_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["category_zone_rules"]["Row"]>;
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          event_id: string;
          business_id: string;
          status: ApplicationStatus;
          booth_id: string | null;
          booth_price_before_vat: number | null;
          vat_amount: number | null;
          total_amount: number | null;
          booth_access_granted_at: string | null;
          booth_access_reason: string | null;
          admin_notes: string | null;
          rejection_reason: string | null;
          submitted_at: string | null;
          reviewed_at: string | null;
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["applications"]["Row"]> & {
          event_id: string;
          business_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Row"]>;
        Relationships: [];
      };
      booth_change_log: {
        Row: {
          id: string;
          application_id: string;
          old_booth_id: string | null;
          new_booth_id: string | null;
          old_price: number | null;
          new_price: number | null;
          changed_by: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["booth_change_log"]["Row"]> & { application_id: string };
        Update: Partial<Database["public"]["Tables"]["booth_change_log"]["Row"]>;
        Relationships: [];
      };
      booth_events: {
        Row: {
          id: string;
          booth_id: string;
          event_type: string;
          business_id: string | null;
          actor_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["booth_events"]["Row"]> & { booth_id: string; event_type: string };
        Update: Partial<Database["public"]["Tables"]["booth_events"]["Row"]>;
        Relationships: [];
      };
      bank_details: {
        Row: {
          id: string;
          event_id: string | null;
          bank_name: string;
          account_name: string;
          iban: string;
          swift_code: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["bank_details"]["Row"]> & {
          bank_name: string;
          account_name: string;
          iban: string;
        };
        Update: Partial<Database["public"]["Tables"]["bank_details"]["Row"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          application_id: string;
          method: PaymentMethod | null;
          status: PaymentStatus;
          amount: number | null;
          payment_link: string | null;
          payment_reference: string | null;
          receipt_url: string | null;
          transfer_reference: string | null;
          transfer_date: string | null;
          deadline_at: string | null;
          verified_by: string | null;
          verified_at: string | null;
          rejection_reason: string | null;
          refund_amount: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["payments"]["Row"]> & { application_id: string };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [];
      };
      waiting_list: {
        Row: {
          id: string;
          event_id: string;
          business_id: string;
          preferred_booth_size: string | null;
          max_budget: number | null;
          preferred_zone_id: string | null;
          priority: number;
          admin_notes: string | null;
          status: WaitingListStatus;
          invited_booth_id: string | null;
          invitation_expires_at: string | null;
          joined_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["waiting_list"]["Row"]> & {
          event_id: string;
          business_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["waiting_list"]["Row"]>;
        Relationships: [];
      };
      notification_templates: {
        Row: {
          id: string;
          key: string;
          channel: NotificationChannel;
          subject: string | null;
          body: string;
          is_active: boolean;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notification_templates"]["Row"]> & {
          key: string;
          channel: NotificationChannel;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_templates"]["Row"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          business_id: string | null;
          channel: NotificationChannel;
          template_key: string | null;
          recipient: string | null;
          subject: string | null;
          body: string | null;
          status: NotificationStatus;
          provider_response: Json | null;
          sent_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> & { channel: NotificationChannel };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [];
      };
      setup_checklists: {
        Row: {
          id: string;
          application_id: string;
          vendor_arrived: boolean;
          identity_confirmed: boolean;
          booth_number_confirmed: boolean;
          products_match_category: boolean;
          setup_follows_dimensions: boolean;
          electrical_checked: boolean;
          no_blocked_aisles: boolean;
          safety_check_completed: boolean;
          booth_appearance_approved: boolean;
          final_approval: boolean;
          issue_found: string | null;
          issue_resolved: boolean;
          checkin_time: string | null;
          photo_url: string | null;
          notes: string | null;
          checked_by: string | null;
          qr_code: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["setup_checklists"]["Row"]> & { application_id: string };
        Update: Partial<Database["public"]["Tables"]["setup_checklists"]["Row"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          actor_role: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          previous_value: Json | null;
          new_value: Json | null;
          metadata: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]> & {
          action: string;
          entity_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      owned_business_id: { Args: Record<string, never>; Returns: string };
      check_email_available: { Args: { p_email: string }; Returns: boolean };
      check_phone_available: { Args: { p_phone: string }; Returns: boolean };
      vat_amount: { Args: { p_price: number }; Returns: number };
      lock_booth: { Args: { p_booth_id: string; p_lock_minutes?: number }; Returns: Database["public"]["Tables"]["booths"]["Row"] };
      release_booth_lock: {
        Args: { p_booth_id: string; p_reason?: string };
        Returns: Database["public"]["Tables"]["booths"]["Row"];
      };
      confirm_booth_selection: { Args: { p_booth_id: string }; Returns: Database["public"]["Tables"]["booths"]["Row"] };
      change_booth: {
        Args: { p_old_booth_id: string; p_new_booth_id: string; p_lock_minutes?: number };
        Returns: Database["public"]["Tables"]["booths"]["Row"];
      };
      release_expired_booth_locks: { Args: { p_event_id?: string | null }; Returns: number };
      expire_overdue_payments: { Args: { p_event_id?: string | null }; Returns: number };
    };
    Enums: Record<string, never>;
  };
}
