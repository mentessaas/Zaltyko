CREATE TYPE "public"."academy_type" AS ENUM('artistica', 'ritmica', 'trampolin', 'general', 'parkour', 'danza');--> statement-breakpoint
CREATE TYPE "public"."ad_position" AS ENUM('marketplace_top', 'marketplace_sidebar', 'marketplace_between', 'empleo_top', 'empleo_sidebar', 'empleo_between', 'events_top', 'events_sidebar', 'events_between');--> statement-breakpoint
CREATE TYPE "public"."ad_type" AS ENUM('banner', 'featured');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('pending', 'reviewed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."billing_item_periodicity" AS ENUM('one_time', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."charge_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled', 'partial');--> statement-breakpoint
CREATE TYPE "public"."discount_category" AS ENUM('regular', 'early_payment', 'loyalty', 'promotional');--> statement-breakpoint
CREATE TYPE "public"."event_discipline" AS ENUM('artistic_female', 'artistic_male', 'rhythmic', 'trampoline', 'parkour');--> statement-breakpoint
CREATE TYPE "public"."event_level" AS ENUM('internal', 'local', 'national', 'international');--> statement-breakpoint
CREATE TYPE "public"."event_payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."event_registration_status" AS ENUM('pending', 'confirmed', 'cancelled', 'waitlisted');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('competitions', 'courses', 'camps', 'workshops', 'clinics', 'evaluations', 'other');--> statement-breakpoint
CREATE TYPE "public"."event_waitlist_status" AS ENUM('waiting', 'notified', 'converted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."job_category" AS ENUM('coach', 'assistant_coach', 'administrative', 'physiotherapist', 'psychologist', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_listing_status" AS ENUM('active', 'closed', 'draft');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('full_time', 'part_time', 'internship');--> statement-breakpoint
CREATE TYPE "public"."marketplace_category" AS ENUM('equipment', 'clothing', 'supplements', 'books', 'particular_training', 'personal_training', 'clinics', 'arbitration', 'physiotherapy', 'photography', 'other');--> statement-breakpoint
CREATE TYPE "public"."marketplace_listing_status" AS ENUM('active', 'sold', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."marketplace_listing_type" AS ENUM('product', 'service');--> statement-breakpoint
CREATE TYPE "public"."marketplace_price_type" AS ENUM('fixed', 'negotiable', 'contact');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'coach', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."onboarding_checklist_status" AS ENUM('pending', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer', 'bizum', 'card_manual', 'other');--> statement-breakpoint
CREATE TYPE "public"."profile_role" AS ENUM('super_admin', 'admin', 'owner', 'coach', 'athlete', 'parent');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'trialing', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('technical', 'billing', 'account', 'feature_request', 'other');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'waiting', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('technical', 'artistic', 'execution', 'coach_feedback', 'competition', 'practice');--> statement-breakpoint
CREATE TYPE "public"."license_status" AS ENUM('active', 'expired', 'suspended', 'pending');--> statement-breakpoint
CREATE TYPE "public"."person_type" AS ENUM('athlete', 'coach', 'judge');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('identity_document', 'medical_certificate', 'consent_form', 'birth_certificate', 'federative_license', 'insurance', 'photo', 'other');--> statement-breakpoint
CREATE TYPE "public"."permission" AS ENUM('athletes:read', 'athletes:create', 'athletes:update', 'athletes:delete', 'classes:read', 'classes:create', 'classes:update', 'classes:delete', 'classes:schedule', 'billing:read', 'billing:create', 'billing:update', 'billing:payments', 'billing:invoices', 'billing:reports', 'coaches:read', 'coaches:create', 'coaches:update', 'coaches:delete', 'reports:read', 'reports:create', 'reports:export', 'settings:read', 'settings:write', 'settings:branding', 'settings:users', 'events:read', 'events:create', 'events:update', 'events:delete', 'communications:read', 'communications:send', 'communications:templates');--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"athlete_limit" integer,
	"academy_limit" integer,
	"stripe_price_id" text,
	"stripe_product_id" text,
	"currency" text DEFAULT 'eur' NOT NULL,
	"billing_interval" text,
	"nickname" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"price_eur" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "academies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"region" text,
	"city" text,
	"academy_type" "academy_type" DEFAULT 'artistica' NOT NULL,
	"public_description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"logo_url" text,
	"website" text,
	"contact_email" text,
	"contact_phone" text,
	"address" text,
	"social_instagram" text,
	"social_facebook" text,
	"social_twitter" text,
	"social_youtube" text,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"is_suspended" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp with time zone,
	"trial_starts_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"is_trial_active" boolean DEFAULT false NOT NULL,
	"payments_configured_at" timestamp with time zone,
	"timezone" text,
	"branding_colors" text,
	"schedule_config" text,
	"stripe_public_key" text,
	"stripe_secret_key" text,
	"stripe_webhook_secret" text,
	"tax_id" text,
	"invoice_prefix" text DEFAULT 'INV'
);
--> statement-breakpoint
CREATE TABLE "academy_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_academy_id" uuid NOT NULL,
	"receiver_academy_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "announcement_read_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"action_url" text,
	"action_label" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"metadata" jsonb,
	"sent_count" text DEFAULT '0' NOT NULL,
	"read_count" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"attachment_url" text,
	"attachment_type" text,
	"attachment_name" text,
	"reply_to_id" uuid,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"last_read_at" timestamp with time zone,
	"notifications_enabled" text DEFAULT 'true' NOT NULL,
	"hidden_at" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid,
	"title" text,
	"last_message_preview" text,
	"last_message_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_read_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"profile_id" uuid,
	"phone" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text NOT NULL,
	"template_id" uuid,
	"meta" jsonb,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy_geo_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text,
	"region" text,
	"city" text,
	"academy_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text,
	"role" "profile_role" DEFAULT 'owner' NOT NULL,
	"active_academy_id" uuid,
	"can_login" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"is_suspended" boolean DEFAULT false NOT NULL,
	"photo_url" text,
	"phone" text,
	"bio" text,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"role" "membership_role" DEFAULT 'coach' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid,
	"status" text,
	"current_period_end" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"dob" date,
	"level" text,
	"status" text DEFAULT 'active' NOT NULL,
	"group_id" uuid,
	"template_id" uuid,
	"age_category" text,
	"competitive_level" text,
	"primary_apparatus" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"bio" text,
	"photo_url" text,
	"slug" text,
	"profile_id" uuid,
	"user_id" uuid,
	"is_public" boolean DEFAULT false NOT NULL,
	"specialties" text[],
	"public_bio" text,
	"years_experience" text,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"photo_gallery" text[],
	"achievements" jsonb DEFAULT '[]'::jsonb,
	"social_links" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "coaches_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "empleo_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid,
	"user_id" uuid,
	"status" "application_status" DEFAULT 'pending',
	"message" text,
	"resume_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "empleo_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid,
	"user_id" uuid,
	"title" text NOT NULL,
	"category" "job_category" NOT NULL,
	"description" text,
	"requirements" text,
	"location" jsonb,
	"job_type" "job_type" NOT NULL,
	"salary" jsonb,
	"how_to_apply" text DEFAULT 'internal',
	"external_url" text,
	"deadline" date,
	"status" "job_listing_status" DEFAULT 'active',
	"views" integer DEFAULT 0,
	"is_featured" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"weekday" integer,
	"start_time" time,
	"end_time" time,
	"capacity" integer DEFAULT 1,
	"is_extra" boolean DEFAULT false NOT NULL,
	"group_id" uuid,
	"auto_generate_sessions" boolean DEFAULT false NOT NULL,
	"auto_generate_frequency" text DEFAULT 'monthly',
	"last_auto_generated_at" timestamp with time zone,
	"auto_generate_days_ahead" integer DEFAULT 30,
	"allows_free_trial" boolean DEFAULT false NOT NULL,
	"waiting_list_enabled" boolean DEFAULT false NOT NULL,
	"cancellation_hours_before" integer DEFAULT 24,
	"cancellation_policy" text DEFAULT 'standard',
	"created_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "class_weekdays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"weekday" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text[],
	"is_public" boolean DEFAULT false NOT NULL,
	"level" "event_level" DEFAULT 'internal' NOT NULL,
	"discipline" "event_discipline",
	"event_type" "event_type",
	"start_date" date NOT NULL,
	"end_date" date,
	"registration_start_date" date,
	"registration_end_date" date,
	"country_code" text,
	"country_name" text,
	"province_name" text,
	"city_name" text,
	"country" text,
	"province" text,
	"city" text,
	"contact_email" text,
	"contact_phone" text,
	"contact_instagram" text,
	"contact_website" text,
	"images" text[],
	"attachments" jsonb,
	"notify_internal_staff" boolean DEFAULT false,
	"notify_city_academies" boolean DEFAULT false,
	"notify_province_academies" boolean DEFAULT false,
	"notify_country_academies" boolean DEFAULT false,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"max_capacity" integer,
	"registration_fee" integer,
	"allow_waitlist" boolean DEFAULT true NOT NULL,
	"waitlist_max_size" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"user_email" text,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"resource_name" text,
	"description" text,
	"ip_address" text,
	"user_agent" text,
	"meta" jsonb,
	"status" text DEFAULT 'success' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"coach_id" uuid,
	"session_date" date NOT NULL,
	"start_time" text,
	"end_time" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"status" text DEFAULT 'present' NOT NULL,
	"notes" text,
	"recorded_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "family_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text,
	"email" text,
	"phone" text,
	"notify_email" boolean DEFAULT true,
	"notify_sms" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "skill_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"apparatus" text NOT NULL,
	"skill_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"difficulty" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assessment_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(200) NOT NULL,
	"description" text,
	"type" varchar(100) NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assessment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" text DEFAULT 'true' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" varchar(200),
	"description" text,
	"thumbnail_url" text,
	"duration" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "athlete_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"assessed_by" uuid,
	"assessment_date" date NOT NULL,
	"assessment_type" "assessment_type" DEFAULT 'technical' NOT NULL,
	"rubric_id" uuid,
	"apparatus" text,
	"overall_comment" text,
	"total_score" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rubric_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"max_points" integer DEFAULT 0,
	"weight" integer DEFAULT 0,
	"order_index" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "assessment_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"comments" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "coach_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"note" text NOT NULL,
	"shared_with_parents" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guardian_athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"relationship" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"relationship" text,
	"notify_email" boolean DEFAULT true NOT NULL,
	"notify_sms" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "guardians_profile_id_unique" UNIQUE("profile_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "profile_role" NOT NULL,
	"role_id" uuid,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"academy_ids" uuid[],
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"supabase_user_id" uuid,
	"default_academy_id" uuid,
	"custom_message" text,
	"permissions" text[],
	"send_email" text DEFAULT 'true' NOT NULL,
	"resend_count" text DEFAULT '0' NOT NULL,
	"last_resent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone,
	"last_sign_in_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "class_coach_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "athlete_extra_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"academy_id" uuid NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"status" text NOT NULL,
	"amount_due" integer,
	"amount_paid" integer,
	"currency" text DEFAULT 'eur' NOT NULL,
	"billing_reason" text,
	"hosted_invoice_url" text,
	"invoice_pdf" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb,
	CONSTRAINT "billing_invoices_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error_message" text,
	"academy_id" uuid,
	"tenant_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone,
	CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "group_athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"custom_fee_cents" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"discipline" text NOT NULL,
	"level" text,
	"coach_id" uuid,
	"assistant_ids" uuid[],
	"color" text,
	"monthly_fee_cents" integer,
	"billing_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "onboarding_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_profile_id" uuid,
	"current_step" integer DEFAULT 1 NOT NULL,
	"completed_wizard" boolean DEFAULT false NOT NULL,
	"steps" jsonb,
	"last_completed_at" timestamp with time zone,
	"last_reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "onboarding_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"status" "onboarding_checklist_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"tooltip_flags" jsonb,
	"first_time_flags" jsonb,
	"timezone" text DEFAULT 'Europe/Madrid',
	"language" text DEFAULT 'es',
	"email_notifications" jsonb DEFAULT '{}'::jsonb,
	"in_app_notifications" jsonb DEFAULT '{"enabled":true,"types":{}}'::jsonb,
	"class_reminders" jsonb DEFAULT '{"enabled":true,"24h_before":true,"1h_before":false}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "billing_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"periodicity" "billing_item_periodicity" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"billing_item_id" uuid,
	"class_id" uuid,
	"label" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"period" text NOT NULL,
	"due_date" date,
	"status" charge_status DEFAULT 'pending' NOT NULL,
	"payment_method" "payment_method",
	"paid_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid,
	"event_type" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"data" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"academy_id" uuid,
	"user_id" uuid,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"template" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "scholarships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"required_documents" text[],
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"description" text,
	"discount_category" "discount_category" DEFAULT 'regular' NOT NULL,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"applicable_to" text DEFAULT 'all' NOT NULL,
	"min_amount" numeric(10, 2),
	"max_discount" numeric(10, 2),
	"start_date" date NOT NULL,
	"end_date" date,
	"max_uses" integer,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"payment_due_days" integer,
	"early_payment_discount" numeric(10, 2),
	"early_payment_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"max_uses" integer,
	"current_uses" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_usage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"discount_id" uuid NOT NULL,
	"athlete_id" uuid,
	"charge_id" uuid,
	"code" text,
	"discount_amount" numeric(10, 2) NOT NULL,
	"original_amount" numeric(10, 2) NOT NULL,
	"final_amount" numeric(10, 2) NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"charge_id" uuid,
	"athlete_id" uuid,
	"receipt_number" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"payment_method" text,
	"payment_date" date,
	"pdf_url" text,
	"template_id" text,
	"metadata" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"athlete_id" uuid,
	"guardian_id" uuid,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"contact_email" text NOT NULL,
	"contact_phone" text,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"responded" boolean DEFAULT false NOT NULL,
	"responded_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"exception_date" date NOT NULL,
	"exception_type" text DEFAULT 'holiday' NOT NULL,
	"reason" text,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text DEFAULT 'web' NOT NULL,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"response_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_url" varchar(500) NOT NULL,
	"file_type" varchar(100),
	"file_size" varchar(20),
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"category" "ticket_category" NOT NULL,
	"academy_id" uuid,
	"created_by" uuid NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"seller_type" text NOT NULL,
	"type" "marketplace_listing_type" NOT NULL,
	"category" "marketplace_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price_cents" integer,
	"currency" text DEFAULT 'eur',
	"price_type" "marketplace_price_type" DEFAULT 'contact',
	"contact" jsonb,
	"images" text[],
	"location" jsonb,
	"status" "marketplace_listing_status" DEFAULT 'active',
	"views" integer DEFAULT 0,
	"is_featured" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "marketplace_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid,
	"seller_id" uuid,
	"reviewer_id" uuid,
	"rating" integer NOT NULL,
	"comment" text,
	"verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "advertisements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "ad_type" NOT NULL,
	"position" "ad_position" NOT NULL,
	"title" text NOT NULL,
	"image_url" text,
	"link_url" text NOT NULL,
	"alt_text" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT true,
	"views" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "featured_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marketplace_listing_id" uuid,
	"empleo_listing_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "event_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'EUR' NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now(),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "event_waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "federative_licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"person_type" text NOT NULL,
	"license_number" text NOT NULL,
	"license_type" text NOT NULL,
	"federation" text NOT NULL,
	"country" text DEFAULT 'ES' NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"medical_certificate_expiry" date,
	"status" text DEFAULT 'active' NOT NULL,
	"annual_fee_cents" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "competition_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"event_id" uuid,
	"apparatus" text,
	"d_score" integer,
	"e_score" integer,
	"final_score" integer,
	"rank" integer,
	"qualification_points" integer,
	"judge_panel" text,
	"round" text,
	"subdivision" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "athlete_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" text,
	"mime_type" text,
	"issued_date" date,
	"expiry_date" date,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"alert_sent" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_waiting_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now(),
	"notes" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"report_type" varchar(100) NOT NULL,
	"schedule" varchar(100) NOT NULL,
	"params" jsonb,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"is_active" text DEFAULT 'true' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(200) NOT NULL,
	"description" text,
	"recipient_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(200) NOT NULL,
	"description" text,
	"channel" varchar(50) DEFAULT 'whatsapp' NOT NULL,
	"template_type" varchar(100) NOT NULL,
	"subject" varchar(200),
	"body" text NOT NULL,
	"variables" jsonb,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"channel" varchar(50) DEFAULT 'whatsapp' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scheduled_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"group_id" uuid,
	"template_id" uuid,
	"channel" varchar(50) DEFAULT 'whatsapp' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academy_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"inherits_from" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "role_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"academy_id" uuid NOT NULL,
	"member_role" text DEFAULT 'viewer' NOT NULL,
	"permissions" jsonb,
	"assigned_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone,
	"custom_permissions" jsonb,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" text NOT NULL,
	"country_code" text NOT NULL,
	"discipline" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_age_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"min_age" integer NOT NULL,
	"max_age" integer NOT NULL,
	"is_competitive" text DEFAULT 'false' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_apparatus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"has_rotation" boolean DEFAULT false NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_competition_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_competitive" boolean DEFAULT false NOT NULL,
	"min_age" integer,
	"max_age" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_scoring_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"scoring_type" text DEFAULT 'd_e' NOT NULL,
	"max_difficulties" integer DEFAULT 6 NOT NULL,
	"max_per_group" integer DEFAULT 1 NOT NULL,
	"deductions_small" integer DEFAULT 1 NOT NULL,
	"deductions_medium" integer DEFAULT 3 NOT NULL,
	"deductions_large" integer DEFAULT 5 NOT NULL,
	"deductions_fall" integer DEFAULT 10 NOT NULL,
	"combo_bonus_2_elements" integer DEFAULT 1 NOT NULL,
	"combo_bonus_3_plus_elements" integer DEFAULT 2 NOT NULL,
	"min_difficulty_value" integer DEFAULT 1 NOT NULL,
	"max_difficulty_value" integer DEFAULT 26 NOT NULL,
	"extra_config" jsonb,
	CONSTRAINT "template_scoring_config_template_id_unique" UNIQUE("template_id")
);
--> statement-breakpoint
CREATE TABLE "template_competition_flow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"level" text DEFAULT 'local' NOT NULL,
	"stage_order" integer DEFAULT 0 NOT NULL,
	"requirements" jsonb,
	"is_active" text DEFAULT 'true' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_license_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"required_for_competition" boolean DEFAULT true NOT NULL,
	"required_for_training" boolean DEFAULT false NOT NULL,
	"renewal_months" integer DEFAULT 12 NOT NULL,
	"documents_required" jsonb DEFAULT '[]'::jsonb,
	"annual_fee_cents" integer,
	"medical_certificate_required" boolean DEFAULT true NOT NULL,
	"medical_certificate_validity_months" integer DEFAULT 12 NOT NULL,
	CONSTRAINT "template_license_config_template_id_unique" UNIQUE("template_id")
);
--> statement-breakpoint
ALTER TABLE "academies" ADD CONSTRAINT "academies_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_messages" ADD CONSTRAINT "academy_messages_sender_academy_id_academies_id_fk" FOREIGN KEY ("sender_academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_messages" ADD CONSTRAINT "academy_messages_receiver_academy_id_academies_id_fk" FOREIGN KEY ("receiver_academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read_status" ADD CONSTRAINT "announcement_read_status_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read_status" ADD CONSTRAINT "announcement_read_status_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_read_receipts" ADD CONSTRAINT "message_read_receipts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_geo_groups" ADD CONSTRAINT "academy_geo_groups_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleo_applications" ADD CONSTRAINT "empleo_applications_listing_id_empleo_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."empleo_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleo_applications" ADD CONSTRAINT "empleo_applications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleo_listings" ADD CONSTRAINT "empleo_listings_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_weekdays" ADD CONSTRAINT "class_weekdays_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_contacts" ADD CONSTRAINT "family_contacts_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_videos" ADD CONSTRAINT "assessment_videos_assessment_id_athlete_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."athlete_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_assessments" ADD CONSTRAINT "athlete_assessments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_assessments" ADD CONSTRAINT "athlete_assessments_assessed_by_coaches_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubric_id_assessment_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."assessment_rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_assessment_id_athlete_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."athlete_assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_scores" ADD CONSTRAINT "assessment_scores_skill_id_skill_catalog_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_athletes" ADD CONSTRAINT "guardian_athletes_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_athletes" ADD CONSTRAINT "guardian_athletes_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_profiles_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_default_academy_id_academies_id_fk" FOREIGN KEY ("default_academy_id") REFERENCES "public"."academies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_coach_assignments" ADD CONSTRAINT "class_coach_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_coach_assignments" ADD CONSTRAINT "class_coach_assignments_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_extra_classes" ADD CONSTRAINT "athlete_extra_classes_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_extra_classes" ADD CONSTRAINT "athlete_extra_classes_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_extra_classes" ADD CONSTRAINT "athlete_extra_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_athletes" ADD CONSTRAINT "group_athletes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_athletes" ADD CONSTRAINT "group_athletes_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_coach_id_coaches_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_billing_item_id_billing_items_id_fk" FOREIGN KEY ("billing_item_id") REFERENCES "public"."billing_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_states" ADD CONSTRAINT "onboarding_states_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_states" ADD CONSTRAINT "onboarding_states_owner_profile_id_profiles_id_fk" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_items_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_items" ADD CONSTRAINT "billing_items_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_billing_item_id_billing_items_id_fk" FOREIGN KEY ("billing_item_id") REFERENCES "public"."billing_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_campaigns" ADD CONSTRAINT "discount_campaigns_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_campaigns" ADD CONSTRAINT "discount_campaigns_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_campaigns" ADD CONSTRAINT "discount_campaigns_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_usage_history" ADD CONSTRAINT "discount_usage_history_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_usage_history" ADD CONSTRAINT "discount_usage_history_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_usage_history" ADD CONSTRAINT "discount_usage_history_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_usage_history" ADD CONSTRAINT "discount_usage_history_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_invitations" ADD CONSTRAINT "event_invitations_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_exceptions" ADD CONSTRAINT "class_exceptions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_exceptions" ADD CONSTRAINT "class_exceptions_tenant_id_academies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_response_id_ticket_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."ticket_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_responses" ADD CONSTRAINT "ticket_responses_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_responses" ADD CONSTRAINT "ticket_responses_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_ratings" ADD CONSTRAINT "marketplace_ratings_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_ratings" ADD CONSTRAINT "marketplace_ratings_seller_id_profiles_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_ratings" ADD CONSTRAINT "marketplace_ratings_reviewer_id_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advertisements" ADD CONSTRAINT "advertisements_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_payments" ADD CONSTRAINT "event_payments_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_results" ADD CONSTRAINT "competition_results_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_results" ADD CONSTRAINT "competition_results_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_roles" ADD CONSTRAINT "academy_roles_academy_id_academies_id_fk" FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_age_categories" ADD CONSTRAINT "template_age_categories_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_apparatus" ADD CONSTRAINT "template_apparatus_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_competition_levels" ADD CONSTRAINT "template_competition_levels_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_scoring_config" ADD CONSTRAINT "template_scoring_config_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_competition_flow" ADD CONSTRAINT "template_competition_flow_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_license_config" ADD CONSTRAINT "template_license_config_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academies_tenant_id_idx" ON "academies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "academies_is_public_idx" ON "academies" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "academies_location_idx" ON "academies" USING btree ("country","region","city");--> statement-breakpoint
CREATE INDEX "academies_type_idx" ON "academies" USING btree ("academy_type");--> statement-breakpoint
CREATE INDEX "academies_contact_email_idx" ON "academies" USING btree ("contact_email");--> statement-breakpoint
CREATE INDEX "academies_contact_phone_idx" ON "academies" USING btree ("contact_phone");--> statement-breakpoint
CREATE INDEX "academy_messages_sender_idx" ON "academy_messages" USING btree ("sender_academy_id");--> statement-breakpoint
CREATE INDEX "academy_messages_receiver_idx" ON "academy_messages" USING btree ("receiver_academy_id");--> statement-breakpoint
CREATE INDEX "academy_messages_created_at_idx" ON "academy_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "announcement_read_status_unique" ON "announcement_read_status" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "announcement_read_status_user_idx" ON "announcement_read_status" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "announcement_read_status_announcement_idx" ON "announcement_read_status" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "announcements_academy_idx" ON "announcements" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "announcements_author_idx" ON "announcements" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "announcements_status_idx" ON "announcements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "announcements_priority_idx" ON "announcements" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "announcements_published_at_idx" ON "announcements" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "announcements_academy_status_published_idx" ON "announcements" USING btree ("academy_id","status","published_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_idx" ON "conversation_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_sender_idx" ON "conversation_messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_created_at_idx" ON "conversation_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversation_messages_conversation_created_idx" ON "conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_participants_conversation_user_unique" ON "conversation_participants" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_user_idx" ON "conversation_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_hidden_idx" ON "conversation_participants" USING btree ("hidden_at");--> statement-breakpoint
CREATE INDEX "conversations_tenant_idx" ON "conversations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "conversations_academy_idx" ON "conversations" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "conversations_last_message_at_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "message_read_receipts_message_user_unique" ON "message_read_receipts" USING btree ("message_id","user_id");--> statement-breakpoint
CREATE INDEX "message_read_receipts_user_idx" ON "message_read_receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_history_tenant_idx" ON "message_history" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "message_history_profile_idx" ON "message_history" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "message_history_status_idx" ON "message_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_history_created_at_idx" ON "message_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "academy_geo_groups_academy_id_idx" ON "academy_geo_groups" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "academy_geo_groups_location_idx" ON "academy_geo_groups" USING btree ("country","region","city");--> statement-breakpoint
CREATE INDEX "profiles_tenant_role_idx" ON "profiles" USING btree ("tenant_id","role");--> statement-breakpoint
CREATE INDEX "profiles_active_academy_idx" ON "profiles" USING btree ("active_academy_id");--> statement-breakpoint
CREATE INDEX "memberships_academy_id_idx" ON "memberships" USING btree ("academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_academy_uq" ON "memberships" USING btree ("user_id","academy_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_id_unique" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "athletes_tenant_academy_idx" ON "athletes" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "athletes_user_id_idx" ON "athletes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "athletes_deleted_at_idx" ON "athletes" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "athletes_status_idx" ON "athletes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "athletes_academy_status_idx" ON "athletes" USING btree ("academy_id","status");--> statement-breakpoint
CREATE INDEX "coaches_tenant_academy_idx" ON "coaches" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "coaches_public_idx" ON "coaches" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "coaches_slug_idx" ON "coaches" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "application_listing_idx" ON "empleo_applications" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "application_user_idx" ON "empleo_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "empleo_academy_idx" ON "empleo_listings" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "empleo_category_idx" ON "empleo_listings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "empleo_status_idx" ON "empleo_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "empleo_created_at_idx" ON "empleo_listings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "classes_tenant_academy_idx" ON "classes" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "classes_group_id_idx" ON "classes" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "classes_start_time_end_time_idx" ON "classes" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX "classes_deleted_at_idx" ON "classes" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "class_weekdays_class_weekday_idx" ON "class_weekdays" USING btree ("class_id","weekday");--> statement-breakpoint
CREATE INDEX "class_weekdays_tenant_idx" ON "class_weekdays" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "events_tenant_academy_idx" ON "events" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "events_country_idx" ON "events" USING btree ("country");--> statement-breakpoint
CREATE INDEX "events_province_idx" ON "events" USING btree ("province");--> statement-breakpoint
CREATE INDEX "events_city_idx" ON "events" USING btree ("city");--> statement-breakpoint
CREATE INDEX "events_discipline_idx" ON "events" USING btree ("discipline");--> statement-breakpoint
CREATE INDEX "events_level_idx" ON "events" USING btree ("level");--> statement-breakpoint
CREATE INDEX "events_event_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "events_start_date_idx" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "events_registration_start_date_idx" ON "events" USING btree ("registration_start_date");--> statement-breakpoint
CREATE INDEX "events_registration_end_date_idx" ON "events" USING btree ("registration_end_date");--> statement-breakpoint
CREATE INDEX "events_country_code_idx" ON "events" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "events_is_public_idx" ON "events" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_user_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_module_idx" ON "audit_logs" USING btree ("module");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_module_idx" ON "audit_logs" USING btree ("tenant_id","module","created_at");--> statement-breakpoint
CREATE INDEX "class_sessions_tenant_idx" ON "class_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "class_sessions_class_date_idx" ON "class_sessions" USING btree ("class_id","session_date");--> statement-breakpoint
CREATE INDEX "attendance_records_tenant_idx" ON "attendance_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "attendance_records_session_idx" ON "attendance_records" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_athlete_uq" ON "attendance_records" USING btree ("session_id","athlete_id");--> statement-breakpoint
CREATE INDEX "attendance_records_date_tenant_idx" ON "attendance_records" USING btree ("recorded_at","tenant_id");--> statement-breakpoint
CREATE INDEX "family_contacts_tenant_idx" ON "family_contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "family_contacts_athlete_idx" ON "family_contacts" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "skill_catalog_tenant_idx" ON "skill_catalog" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "skill_catalog_code_idx" ON "skill_catalog" USING btree ("skill_code");--> statement-breakpoint
CREATE INDEX "assessment_rubrics_tenant_idx" ON "assessment_rubrics" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "assessment_types_name_idx" ON "assessment_types" USING btree ("name");--> statement-breakpoint
CREATE INDEX "assessment_videos_assessment_idx" ON "assessment_videos" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "athlete_assessments_tenant_idx" ON "athlete_assessments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "athlete_assessments_athlete_idx" ON "athlete_assessments" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_assessments_type_idx" ON "athlete_assessments" USING btree ("assessment_type");--> statement-breakpoint
CREATE INDEX "rubric_criteria_rubric_idx" ON "rubric_criteria" USING btree ("rubric_id");--> statement-breakpoint
CREATE INDEX "assessment_scores_tenant_idx" ON "assessment_scores" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "assessment_scores_assessment_idx" ON "assessment_scores" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "coach_notes_tenant_idx" ON "coach_notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "coach_notes_athlete_idx" ON "coach_notes" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "coach_notes_tags_idx" ON "coach_notes" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "guardian_athletes_guardian_idx" ON "guardian_athletes" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "guardian_athletes_athlete_idx" ON "guardian_athletes" USING btree ("athlete_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_athletes_unique" ON "guardian_athletes" USING btree ("tenant_id","guardian_id","athlete_id");--> statement-breakpoint
CREATE INDEX "guardians_tenant_idx" ON "guardians" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "guardians_email_idx" ON "guardians" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitations_tenant_idx" ON "invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "invitations_status_idx" ON "invitations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_unique" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_email_tenant_unique" ON "invitations" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "invitations_role_idx" ON "invitations" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_coach_assignments_unique" ON "class_coach_assignments" USING btree ("tenant_id","class_id","coach_id");--> statement-breakpoint
CREATE INDEX "class_coach_assignments_class_idx" ON "class_coach_assignments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_coach_assignments_coach_idx" ON "class_coach_assignments" USING btree ("coach_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_groups_unique" ON "class_groups" USING btree ("tenant_id","class_id","group_id");--> statement-breakpoint
CREATE INDEX "class_groups_class_idx" ON "class_groups" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_groups_group_idx" ON "class_groups" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_enrollments_unique" ON "class_enrollments" USING btree ("tenant_id","class_id","athlete_id");--> statement-breakpoint
CREATE INDEX "class_enrollments_class_idx" ON "class_enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_enrollments_athlete_idx" ON "class_enrollments" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "class_enrollments_tenant_idx" ON "class_enrollments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "class_enrollments_academy_idx" ON "class_enrollments" USING btree ("academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_extra_classes_unique" ON "athlete_extra_classes" USING btree ("tenant_id","athlete_id","class_id");--> statement-breakpoint
CREATE INDEX "athlete_extra_classes_athlete_id_idx" ON "athlete_extra_classes" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_extra_classes_class_id_idx" ON "athlete_extra_classes" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "athlete_extra_classes_tenant_id_idx" ON "athlete_extra_classes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "athlete_extra_classes_academy_id_idx" ON "athlete_extra_classes" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "billing_invoices_academy_created_idx" ON "billing_invoices" USING btree ("academy_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_invoices_tenant_created_idx" ON "billing_invoices" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_events_type_created_idx" ON "billing_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "group_athletes_tenant_idx" ON "group_athletes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "group_athletes_group_idx" ON "group_athletes" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_athletes_athlete_idx" ON "group_athletes" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "groups_tenant_idx" ON "groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "groups_academy_idx" ON "groups" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "groups_coach_idx" ON "groups" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "groups_deleted_at_idx" ON "groups" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_states_academy_unique" ON "onboarding_states" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "onboarding_states_tenant_idx" ON "onboarding_states" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_checklist_academy_key_unique" ON "onboarding_checklist_items" USING btree ("academy_id","key");--> statement-breakpoint
CREATE INDEX "onboarding_checklist_tenant_idx" ON "onboarding_checklist_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "onboarding_checklist_status_idx" ON "onboarding_checklist_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "billing_items_tenant_idx" ON "billing_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_items_academy_id_idx" ON "billing_items" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "billing_items_academy_active_idx" ON "billing_items" USING btree ("academy_id","is_active");--> statement-breakpoint
CREATE INDEX "charges_tenant_idx" ON "charges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "charges_academy_period_idx" ON "charges" USING btree ("academy_id","period");--> statement-breakpoint
CREATE INDEX "charges_academy_athlete_period_idx" ON "charges" USING btree ("academy_id","athlete_id","period");--> statement-breakpoint
CREATE INDEX "charges_academy_status_idx" ON "charges" USING btree ("academy_id","status");--> statement-breakpoint
CREATE INDEX "charges_class_id_idx" ON "charges" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "event_logs_academy_idx" ON "event_logs" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "event_logs_event_type_idx" ON "event_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "event_logs_created_at_idx" ON "event_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_user_idx" ON "notifications" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "email_logs_tenant_idx" ON "email_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "email_logs_academy_idx" ON "email_logs" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "email_logs_user_idx" ON "email_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_logs_status_idx" ON "email_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_logs_created_at_idx" ON "email_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "email_logs_template_idx" ON "email_logs" USING btree ("template");--> statement-breakpoint
CREATE INDEX "scholarships_tenant_academy_idx" ON "scholarships" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "scholarships_athlete_idx" ON "scholarships" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "scholarships_active_idx" ON "scholarships" USING btree ("is_active","start_date","end_date");--> statement-breakpoint
CREATE INDEX "scholarships_dates_idx" ON "scholarships" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "discounts_tenant_academy_idx" ON "discounts" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "discounts_code_idx" ON "discounts" USING btree ("code");--> statement-breakpoint
CREATE INDEX "discounts_active_dates_idx" ON "discounts" USING btree ("is_active","start_date","end_date");--> statement-breakpoint
CREATE INDEX "discounts_code_unique" ON "discounts" USING btree ("academy_id","code");--> statement-breakpoint
CREATE INDEX "discount_campaigns_tenant_academy_idx" ON "discount_campaigns" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "discount_campaigns_discount_idx" ON "discount_campaigns" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX "discount_campaigns_active_dates_idx" ON "discount_campaigns" USING btree ("is_active","start_date","end_date");--> statement-breakpoint
CREATE INDEX "discount_usage_history_tenant_academy_idx" ON "discount_usage_history" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "discount_usage_history_discount_idx" ON "discount_usage_history" USING btree ("discount_id");--> statement-breakpoint
CREATE INDEX "discount_usage_history_athlete_idx" ON "discount_usage_history" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "discount_usage_history_charge_idx" ON "discount_usage_history" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "discount_usage_history_used_at_idx" ON "discount_usage_history" USING btree ("used_at");--> statement-breakpoint
CREATE INDEX "receipts_tenant_academy_idx" ON "receipts" USING btree ("tenant_id","academy_id");--> statement-breakpoint
CREATE INDEX "receipts_charge_idx" ON "receipts" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "receipts_athlete_idx" ON "receipts" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "receipts_receipt_number_idx" ON "receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "receipts_number_unique" ON "receipts" USING btree ("academy_id","receipt_number");--> statement-breakpoint
CREATE INDEX "event_invitations_tenant_event_idx" ON "event_invitations" USING btree ("tenant_id","event_id");--> statement-breakpoint
CREATE INDEX "event_invitations_athlete_idx" ON "event_invitations" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "event_invitations_guardian_idx" ON "event_invitations" USING btree ("guardian_id");--> statement-breakpoint
CREATE INDEX "event_invitations_status_idx" ON "event_invitations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_invitations_email_idx" ON "event_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "contact_messages_academy_idx" ON "contact_messages" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "contact_messages_read_idx" ON "contact_messages" USING btree ("read");--> statement-breakpoint
CREATE INDEX "contact_messages_created_at_idx" ON "contact_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_class_exception" ON "class_exceptions" USING btree ("class_id","exception_date");--> statement-breakpoint
CREATE INDEX "idx_class_exceptions_class_id" ON "class_exceptions" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "idx_class_exceptions_date" ON "class_exceptions" USING btree ("exception_date");--> statement-breakpoint
CREATE INDEX "idx_class_exceptions_tenant_id" ON "class_exceptions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_class_exceptions_type" ON "class_exceptions" USING btree ("exception_type");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ticket_attachments_ticket_id_idx" ON "ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_attachments_response_id_idx" ON "ticket_attachments" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "ticket_responses_ticket_id_idx" ON "ticket_responses" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_responses_user_id_idx" ON "ticket_responses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tickets_academy_id_idx" ON "tickets" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "tickets_created_by_idx" ON "tickets" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "tickets_assigned_to_idx" ON "tickets" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_user_idx" ON "marketplace_listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketplace_category_idx" ON "marketplace_listings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "marketplace_type_idx" ON "marketplace_listings" USING btree ("type");--> statement-breakpoint
CREATE INDEX "marketplace_status_idx" ON "marketplace_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_created_at_idx" ON "marketplace_listings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "rating_seller_idx" ON "marketplace_ratings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "rating_listing_idx" ON "marketplace_ratings" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "ad_position_idx" ON "advertisements" USING btree ("position");--> statement-breakpoint
CREATE INDEX "ad_active_idx" ON "advertisements" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ad_dates_idx" ON "advertisements" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "event_categories_event_idx" ON "event_categories" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_payments_registration_idx" ON "event_payments" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "event_registrations_event_idx" ON "event_registrations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_registrations_profile_idx" ON "event_registrations" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "event_waitlist_event_idx" ON "event_waitlist" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "federative_licenses_tenant_idx" ON "federative_licenses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "federative_licenses_person_idx" ON "federative_licenses" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "federative_licenses_status_idx" ON "federative_licenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "federative_licenses_valid_until_idx" ON "federative_licenses" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "federative_licenses_license_number_idx" ON "federative_licenses" USING btree ("license_number");--> statement-breakpoint
CREATE INDEX "competition_results_tenant_idx" ON "competition_results" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "competition_results_athlete_idx" ON "competition_results" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "competition_results_event_idx" ON "competition_results" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "competition_results_apparatus_idx" ON "competition_results" USING btree ("apparatus");--> statement-breakpoint
CREATE INDEX "competition_results_rank_idx" ON "competition_results" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "athlete_documents_tenant_idx" ON "athlete_documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "athlete_documents_athlete_idx" ON "athlete_documents" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_documents_type_idx" ON "athlete_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "athlete_documents_expiry_idx" ON "athlete_documents" USING btree ("expiry_date");--> statement-breakpoint
CREATE INDEX "class_waiting_list_class_idx" ON "class_waiting_list" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "class_waiting_list_athlete_idx" ON "class_waiting_list" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "scheduled_reports_academy_idx" ON "scheduled_reports" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "message_groups_tenant_idx" ON "message_groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "message_templates_tenant_idx" ON "message_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_profile_idx" ON "notification_preferences" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_tenant_idx" ON "scheduled_notifications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_status_idx" ON "scheduled_notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "academy_roles_academy_idx" ON "academy_roles" USING btree ("academy_id");--> statement-breakpoint
CREATE INDEX "role_members_role_idx" ON "role_members" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_members_user_idx" ON "role_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_members_academy_idx" ON "role_members" USING btree ("academy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_members_uq" ON "role_members" USING btree ("role_id","user_id");--> statement-breakpoint
CREATE INDEX "templates_country_idx" ON "templates" USING btree ("country");--> statement-breakpoint
CREATE INDEX "templates_discipline_idx" ON "templates" USING btree ("discipline");--> statement-breakpoint
CREATE INDEX "templates_active_idx" ON "templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "template_age_categories_template_idx" ON "template_age_categories" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_age_categories_sort_idx" ON "template_age_categories" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE INDEX "template_apparatus_template_idx" ON "template_apparatus" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_apparatus_sort_idx" ON "template_apparatus" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE INDEX "template_competition_levels_template_idx" ON "template_competition_levels" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_competition_levels_sort_idx" ON "template_competition_levels" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE INDEX "template_scoring_config_template_idx" ON "template_scoring_config" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_competition_flow_template_idx" ON "template_competition_flow" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "template_competition_flow_stage_idx" ON "template_competition_flow" USING btree ("template_id","stage_order");--> statement-breakpoint
CREATE INDEX "template_license_config_template_idx" ON "template_license_config" USING btree ("template_id");