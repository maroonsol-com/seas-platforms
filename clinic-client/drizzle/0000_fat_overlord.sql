CREATE TYPE "public"."appointment_kind" AS ENUM('scheduled', 'walk_in', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'checked_in', 'waiting', 'in_consultation', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."blood_group" AS ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."branch_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."catalog_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."clinic_business_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."clinic_user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."clinical_record_kind" AS ENUM('allergy', 'history', 'note');--> statement-breakpoint
CREATE TYPE "public"."collection_method" AS ENUM('cash', 'upi', 'card', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."consultation_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."credit_note_status" AS ENUM('issued', 'voided');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('active', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('female', 'male', 'other', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_kind" AS ENUM('consultation', 'service', 'procedure', 'product');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'finalized', 'partially_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'removed');--> statement-breakpoint
CREATE TYPE "public"."payment_record_status" AS ENUM('recorded', 'voided');--> statement-breakpoint
CREATE TYPE "public"."prescription_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('draft', 'ordered', 'received', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_kind" AS ENUM('opening', 'purchase', 'sale', 'adjustment', 'return_in', 'return_out');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"follow_up_of_appointment_id" uuid,
	"kind" "appointment_kind" NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "appointments_time_order" CHECK ("appointments"."ends_at" > "appointments"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "branch_memberships" (
	"membership_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_memberships_membership_id_branch_id_pk" PRIMARY KEY("membership_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "branch_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"postal_code" text NOT NULL,
	"phone" text,
	"status" "branch_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "business_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_memberships_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "business_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "business_settings" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"legal_name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"email" text,
	"brand_color" text,
	"invoice_header" text,
	"invoice_footer" text,
	"prescription_header" text,
	"prescription_footer" text,
	"logo_file_id" uuid,
	"signature_file_id" uuid,
	"stamp_file_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_business_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"status" "clinic_business_status" DEFAULT 'active' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consultation_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"consultation_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"changes" text NOT NULL,
	"amended_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consultation_amendments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"appointment_id" uuid,
	"status" "consultation_status" DEFAULT 'draft' NOT NULL,
	"chief_complaint" text,
	"symptoms" text,
	"medical_history" text,
	"examination" text,
	"treatment" text,
	"notes" text,
	"follow_up_on" date,
	"finalized_at" timestamp with time zone,
	"finalized_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consultations_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "consultations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_note_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_note_items_amounts" CHECK (
    "credit_note_items"."quantity" > 0 AND "credit_note_items"."unit_price" >= 0 AND "credit_note_items"."tax_rate" >= 0
    AND "credit_note_items"."tax_amount" >= 0 AND "credit_note_items"."line_total" >= 0
  )
);
--> statement-breakpoint
ALTER TABLE "credit_note_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"credit_note_number" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"reason" text NOT NULL,
	"status" "credit_note_status" DEFAULT 'issued' NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "credit_notes_amounts_nonnegative" CHECK ("credit_notes"."amount" >= 0 AND "credit_notes"."tax_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"consultation_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"label" text NOT NULL,
	"code" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diagnoses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "doctor_leave" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_leave_dates" CHECK ("doctor_leave"."ends_on" >= "doctor_leave"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "doctor_leave" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "doctor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"branch_id" uuid,
	"qualification" text NOT NULL,
	"specialization" text NOT NULL,
	"registration_number" text NOT NULL,
	"consultation_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_profiles_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "doctor_profiles_fee_nonnegative" CHECK ("doctor_profiles"."consultation_fee" >= 0)
);
--> statement-breakpoint
ALTER TABLE "doctor_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "doctor_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"starts_time" time NOT NULL,
	"ends_time" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_schedules_weekday" CHECK ("doctor_schedules"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "doctor_schedules_time_order" CHECK ("doctor_schedules"."ends_time" > "doctor_schedules"."starts_time")
);
--> statement-breakpoint
ALTER TABLE "doctor_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"category_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"method" "collection_method" NOT NULL,
	"expense_date" date NOT NULL,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_nonnegative" CHECK ("expenses"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "file_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid,
	"product_key" text DEFAULT 'clinic' NOT NULL,
	"original_filename" text NOT NULL,
	"storage_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"related_type" text,
	"related_id" uuid,
	"uploaded_by" uuid,
	"status" "file_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_metadata_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "file_metadata_byte_size_nonnegative" CHECK ("file_metadata"."byte_size" >= 0),
	CONSTRAINT "file_metadata_product_key" CHECK ("file_metadata"."product_key" = 'clinic')
);
--> statement-breakpoint
ALTER TABLE "file_metadata" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inventory_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_categories_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"service_id" uuid,
	"product_id" uuid,
	"kind" "invoice_item_kind" NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_amounts" CHECK (
    "invoice_items"."quantity" > 0 AND "invoice_items"."unit_price" >= 0 AND "invoice_items"."discount" >= 0
    AND "invoice_items"."tax_rate" >= 0 AND "invoice_items"."tax_amount" >= 0 AND "invoice_items"."line_total" >= 0
  )
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid,
	"invoice_number" text NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(14, 2) DEFAULT '0' NOT NULL,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"notes" text,
	"finalized_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "invoices_amounts_nonnegative" CHECK (
    "invoices"."subtotal" >= 0 AND "invoices"."discount_total" >= 0 AND "invoices"."tax_total" >= 0
    AND "invoices"."total" >= 0 AND "invoices"."amount_paid" >= 0 AND "invoices"."balance" >= 0
  )
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_roles" (
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_roles_membership_id_role_id_pk" PRIMARY KEY("membership_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "membership_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patient_medical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"kind" "clinical_record_kind" NOT NULL,
	"title" text NOT NULL,
	"details" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_medical_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"patient_number" text NOT NULL,
	"full_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text,
	"date_of_birth" date,
	"gender" "gender" DEFAULT 'unknown' NOT NULL,
	"address" text,
	"blood_group" "blood_group" DEFAULT 'unknown' NOT NULL,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"receipt_number" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"method" "collection_method" NOT NULL,
	"reference" text,
	"status" "payment_record_status" DEFAULT 'recorded' NOT NULL,
	"idempotency_key" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"received_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescription_medicines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"prescription_id" uuid NOT NULL,
	"medicine_name" text NOT NULL,
	"strength" text,
	"dosage" text NOT NULL,
	"frequency" text NOT NULL,
	"duration" text NOT NULL,
	"route" text NOT NULL,
	"instructions" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prescription_medicines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"consultation_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"status" "prescription_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"doctor_name_snapshot" text NOT NULL,
	"qualification_snapshot" text NOT NULL,
	"registration_snapshot" text NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prescriptions_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "prescriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"purchase_price" numeric(14, 2) NOT NULL,
	"selling_price" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(5, 2),
	"reorder_level" numeric(14, 3) DEFAULT '0' NOT NULL,
	"status" "catalog_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "products_prices_nonnegative" CHECK (
    "products"."purchase_price" >= 0 AND "products"."selling_price" >= 0 AND "products"."reorder_level" >= 0
    AND ("products"."tax_rate" IS NULL OR "products"."tax_rate" >= 0)
  )
);
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"batch_number" text,
	"expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_items_amounts" CHECK (
    "purchase_items"."quantity" > 0 AND "purchase_items"."unit_cost" >= 0 AND "purchase_items"."tax_rate" >= 0
    AND "purchase_items"."tax_amount" >= 0 AND "purchase_items"."line_total" >= 0
  )
);
--> statement-breakpoint
ALTER TABLE "purchase_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"branch_id" uuid,
	"purchase_number" text NOT NULL,
	"status" "purchase_status" DEFAULT 'draft' NOT NULL,
	"ordered_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "purchases_amounts_nonnegative" CHECK ("purchases"."subtotal" >= 0 AND "purchases"."tax_total" >= 0 AND "purchases"."total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"reason" text NOT NULL,
	"refunded_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_amount_positive" CHECK ("refunds"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_id_business_unique" UNIQUE("id","business_id")
);
--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"default_price" numeric(14, 2) NOT NULL,
	"tax_rate" numeric(5, 2),
	"status" "catalog_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "services_price_nonnegative" CHECK ("services"."default_price" >= 0),
	CONSTRAINT "services_tax_rate" CHECK ("services"."tax_rate" IS NULL OR "services"."tax_rate" >= 0)
);
--> statement-breakpoint
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"branch_id" uuid,
	"job_title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"branch_id" uuid,
	"kind" "stock_movement_kind" NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"batch_number" text,
	"expires_on" date,
	"unit_cost" numeric(14, 2),
	"source_type" text,
	"source_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_quantity_nonzero" CHECK ("stock_movements"."quantity" <> 0),
	CONSTRAINT "stock_movements_unit_cost_nonnegative" CHECK ("stock_movements"."unit_cost" IS NULL OR "stock_movements"."unit_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"method" "collection_method" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"notes" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_amount_positive" CHECK ("supplier_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "supplier_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"gstin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_id_business_unique" UNIQUE("id","business_id"),
	CONSTRAINT "suppliers_gstin_length" CHECK ("suppliers"."gstin" IS NULL OR char_length("suppliers"."gstin") = 15)
);
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"mobile" text,
	"status" "clinic_user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"consultation_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"systolic_bp" integer,
	"diastolic_bp" integer,
	"pulse" integer,
	"temperature_c" numeric(4, 1),
	"height_cm" numeric(5, 1),
	"weight_kg" numeric(6, 2),
	"spo2" numeric(4, 1),
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vitals_ranges" CHECK (
    ("vitals"."systolic_bp" IS NULL OR "vitals"."systolic_bp" BETWEEN 0 AND 300)
    AND ("vitals"."diastolic_bp" IS NULL OR "vitals"."diastolic_bp" BETWEEN 0 AND 200)
    AND ("vitals"."pulse" IS NULL OR "vitals"."pulse" BETWEEN 0 AND 400)
    AND ("vitals"."temperature_c" IS NULL OR "vitals"."temperature_c" BETWEEN 25 AND 45)
    AND ("vitals"."height_cm" IS NULL OR "vitals"."height_cm" BETWEEN 20 AND 300)
    AND ("vitals"."weight_kg" IS NULL OR "vitals"."weight_kg" BETWEEN 0 AND 700)
    AND ("vitals"."spo2" IS NULL OR "vitals"."spo2" BETWEEN 0 AND 100)
  )
);
--> statement-breakpoint
ALTER TABLE "vitals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_business_fk" FOREIGN KEY ("patient_id","business_id") REFERENCES "public"."patients"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_business_fk" FOREIGN KEY ("doctor_id","business_id") REFERENCES "public"."doctor_profiles"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_memberships" ADD CONSTRAINT "branch_memberships_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_memberships" ADD CONSTRAINT "branch_memberships_membership_business_fk" FOREIGN KEY ("membership_id","business_id") REFERENCES "public"."business_memberships"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_memberships" ADD CONSTRAINT "branch_memberships_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_memberships" ADD CONSTRAINT "business_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_logo_business_fk" FOREIGN KEY ("logo_file_id","business_id") REFERENCES "public"."file_metadata"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_signature_business_fk" FOREIGN KEY ("signature_file_id","business_id") REFERENCES "public"."file_metadata"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_stamp_business_fk" FOREIGN KEY ("stamp_file_id","business_id") REFERENCES "public"."file_metadata"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_amendments" ADD CONSTRAINT "consultation_amendments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_amendments" ADD CONSTRAINT "consultation_amendments_amended_by_users_id_fk" FOREIGN KEY ("amended_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultation_amendments" ADD CONSTRAINT "consultation_amendments_consultation_business_fk" FOREIGN KEY ("consultation_id","business_id") REFERENCES "public"."consultations"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patient_business_fk" FOREIGN KEY ("patient_id","business_id") REFERENCES "public"."patients"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_doctor_business_fk" FOREIGN KEY ("doctor_id","business_id") REFERENCES "public"."doctor_profiles"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_appointment_business_fk" FOREIGN KEY ("appointment_id","business_id") REFERENCES "public"."appointments"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_items" ADD CONSTRAINT "credit_note_items_note_business_fk" FOREIGN KEY ("credit_note_id","business_id") REFERENCES "public"."credit_notes"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_business_fk" FOREIGN KEY ("invoice_id","business_id") REFERENCES "public"."invoices"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_consultation_business_fk" FOREIGN KEY ("consultation_id","business_id") REFERENCES "public"."consultations"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_patient_business_fk" FOREIGN KEY ("patient_id","business_id") REFERENCES "public"."patients"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_leave" ADD CONSTRAINT "doctor_leave_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_leave" ADD CONSTRAINT "doctor_leave_doctor_business_fk" FOREIGN KEY ("doctor_id","business_id") REFERENCES "public"."doctor_profiles"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_profiles" ADD CONSTRAINT "doctor_profiles_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_doctor_business_fk" FOREIGN KEY ("doctor_id","business_id") REFERENCES "public"."doctor_profiles"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_business_fk" FOREIGN KEY ("category_id","business_id") REFERENCES "public"."expense_categories"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_business_fk" FOREIGN KEY ("invoice_id","business_id") REFERENCES "public"."invoices"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_service_business_fk" FOREIGN KEY ("service_id","business_id") REFERENCES "public"."services"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_business_fk" FOREIGN KEY ("product_id","business_id") REFERENCES "public"."products"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patient_business_fk" FOREIGN KEY ("patient_id","business_id") REFERENCES "public"."patients"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_doctor_business_fk" FOREIGN KEY ("doctor_id","business_id") REFERENCES "public"."doctor_profiles"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_business_fk" FOREIGN KEY ("membership_id","business_id") REFERENCES "public"."business_memberships"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_business_fk" FOREIGN KEY ("role_id","business_id") REFERENCES "public"."roles"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_medical_records" ADD CONSTRAINT "patient_medical_records_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_medical_records" ADD CONSTRAINT "patient_medical_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_medical_records" ADD CONSTRAINT "patient_medical_records_patient_business_fk" FOREIGN KEY ("patient_id","business_id") REFERENCES "public"."patients"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_business_fk" FOREIGN KEY ("invoice_id","business_id") REFERENCES "public"."invoices"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_medicines" ADD CONSTRAINT "prescription_medicines_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_medicines" ADD CONSTRAINT "prescription_medicines_prescription_business_fk" FOREIGN KEY ("prescription_id","business_id") REFERENCES "public"."prescriptions"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_consultation_business_fk" FOREIGN KEY ("consultation_id","business_id") REFERENCES "public"."consultations"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_business_fk" FOREIGN KEY ("patient_id","business_id") REFERENCES "public"."patients"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctor_business_fk" FOREIGN KEY ("doctor_id","business_id") REFERENCES "public"."doctor_profiles"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_business_fk" FOREIGN KEY ("category_id","business_id") REFERENCES "public"."inventory_categories"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_business_fk" FOREIGN KEY ("purchase_id","business_id") REFERENCES "public"."purchases"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_business_fk" FOREIGN KEY ("product_id","business_id") REFERENCES "public"."products"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_business_fk" FOREIGN KEY ("supplier_id","business_id") REFERENCES "public"."suppliers"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_business_fk" FOREIGN KEY ("payment_id","business_id") REFERENCES "public"."payments"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoice_business_fk" FOREIGN KEY ("invoice_id","business_id") REFERENCES "public"."invoices"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_business_fk" FOREIGN KEY ("role_id","business_id") REFERENCES "public"."roles"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_business_fk" FOREIGN KEY ("product_id","business_id") REFERENCES "public"."products"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_business_fk" FOREIGN KEY ("branch_id","business_id") REFERENCES "public"."branches"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_business_fk" FOREIGN KEY ("supplier_id","business_id") REFERENCES "public"."suppliers"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_business_fk" FOREIGN KEY ("purchase_id","business_id") REFERENCES "public"."purchases"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_patient_business_fk" FOREIGN KEY ("patient_id","business_id") REFERENCES "public"."patients"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_consultation_business_fk" FOREIGN KEY ("consultation_id","business_id") REFERENCES "public"."consultations"("id","business_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_business_start_idx" ON "appointments" USING btree ("business_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_doctor_start_idx" ON "appointments" USING btree ("doctor_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_patient_idx" ON "appointments" USING btree ("business_id","patient_id");--> statement-breakpoint
CREATE INDEX "audit_logs_business_created_idx" ON "audit_logs" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("business_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "branch_memberships_business_idx" ON "branch_memberships" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_business_code_unique" ON "branches" USING btree ("business_id","code");--> statement-breakpoint
CREATE INDEX "branches_business_idx" ON "branches" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_memberships_business_user_unique" ON "business_memberships" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "business_memberships_user_idx" ON "business_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_platform_business_unique" ON "businesses" USING btree ("platform_business_id");--> statement-breakpoint
CREATE INDEX "businesses_status_idx" ON "businesses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "consultation_amendments_consultation_idx" ON "consultation_amendments" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "consultations_patient_idx" ON "consultations" USING btree ("business_id","patient_id");--> statement-breakpoint
CREATE INDEX "consultations_doctor_idx" ON "consultations" USING btree ("business_id","doctor_id");--> statement-breakpoint
CREATE INDEX "credit_note_items_note_idx" ON "credit_note_items" USING btree ("credit_note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_business_number_unique" ON "credit_notes" USING btree ("business_id","credit_note_number");--> statement-breakpoint
CREATE INDEX "credit_notes_invoice_idx" ON "credit_notes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "diagnoses_consultation_idx" ON "diagnoses" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "diagnoses_patient_idx" ON "diagnoses" USING btree ("business_id","patient_id");--> statement-breakpoint
CREATE INDEX "doctor_leave_doctor_idx" ON "doctor_leave" USING btree ("business_id","doctor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_profiles_business_user_unique" ON "doctor_profiles" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doctor_profiles_business_registration_unique" ON "doctor_profiles" USING btree ("business_id","registration_number");--> statement-breakpoint
CREATE INDEX "doctor_profiles_business_idx" ON "doctor_profiles" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "doctor_schedules_doctor_idx" ON "doctor_schedules" USING btree ("business_id","doctor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_business_name_unique" ON "expense_categories" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "expenses_business_date_idx" ON "expenses" USING btree ("business_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_metadata_storage_key_unique" ON "file_metadata" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "file_metadata_business_idx" ON "file_metadata" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "file_metadata_related_idx" ON "file_metadata" USING btree ("business_id","related_type","related_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_categories_business_name_unique" ON "inventory_categories" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_business_number_unique" ON "invoices" USING btree ("business_id","invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_patient_idx" ON "invoices" USING btree ("business_id","patient_id");--> statement-breakpoint
CREATE INDEX "invoices_business_date_idx" ON "invoices" USING btree ("business_id","invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "membership_roles_business_idx" ON "membership_roles" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "patient_medical_records_patient_idx" ON "patient_medical_records" USING btree ("business_id","patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_business_number_unique" ON "patients" USING btree ("business_id","patient_number");--> statement-breakpoint
CREATE INDEX "patients_business_name_idx" ON "patients" USING btree ("business_id","full_name");--> statement-breakpoint
CREATE INDEX "patients_business_mobile_idx" ON "patients" USING btree ("business_id","mobile");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_business_receipt_unique" ON "payments" USING btree ("business_id","receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_unique" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_unique" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "prescription_medicines_prescription_idx" ON "prescription_medicines" USING btree ("prescription_id","sort_order");--> statement-breakpoint
CREATE INDEX "prescriptions_patient_idx" ON "prescriptions" USING btree ("business_id","patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_business_sku_unique" ON "products" USING btree ("business_id","sku");--> statement-breakpoint
CREATE INDEX "products_business_name_idx" ON "products" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_business_number_unique" ON "purchases" USING btree ("business_id","purchase_number");--> statement-breakpoint
CREATE INDEX "purchases_supplier_idx" ON "purchases" USING btree ("business_id","supplier_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refunds_invoice_idx" ON "refunds" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "role_permissions_business_idx" ON "role_permissions" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_business_name_unique" ON "roles" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "roles_business_idx" ON "roles" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_business_name_unique" ON "services" USING btree ("business_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_business_user_unique" ON "staff_profiles" USING btree ("business_id","user_id");--> statement-breakpoint
CREATE INDEX "staff_profiles_business_idx" ON "staff_profiles" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("business_id","product_id");--> statement-breakpoint
CREATE INDEX "stock_movements_branch_idx" ON "stock_movements" USING btree ("business_id","branch_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_idx" ON "supplier_payments" USING btree ("business_id","supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_payments_purchase_idx" ON "supplier_payments" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "suppliers_business_name_idx" ON "suppliers" USING btree ("business_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vitals_patient_idx" ON "vitals" USING btree ("business_id","patient_id");--> statement-breakpoint
CREATE POLICY "appointments_business_isolation" ON "appointments" AS PERMISSIVE FOR ALL TO public USING ("appointments"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("appointments"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "audit_logs_business_isolation" ON "audit_logs" AS PERMISSIVE FOR ALL TO public USING ("audit_logs"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("audit_logs"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "branch_memberships_business_isolation" ON "branch_memberships" AS PERMISSIVE FOR ALL TO public USING ("branch_memberships"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("branch_memberships"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "branches_business_isolation" ON "branches" AS PERMISSIVE FOR ALL TO public USING ("branches"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("branches"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "business_memberships_tenant_isolation" ON "business_memberships" AS PERMISSIVE FOR ALL TO public USING ((
      "business_memberships"."user_id" = nullif(current_setting('app.current_user_id', true), '')::uuid
      OR "business_memberships"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid
    )) WITH CHECK ("business_memberships"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "business_settings_business_isolation" ON "business_settings" AS PERMISSIVE FOR ALL TO public USING ("business_settings"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("business_settings"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "businesses_tenant_isolation" ON "businesses" AS PERMISSIVE FOR ALL TO public USING ("businesses"."id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("businesses"."id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "consultation_amendments_business_isolation" ON "consultation_amendments" AS PERMISSIVE FOR ALL TO public USING ("consultation_amendments"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("consultation_amendments"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "consultations_business_isolation" ON "consultations" AS PERMISSIVE FOR ALL TO public USING ("consultations"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("consultations"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "credit_note_items_business_isolation" ON "credit_note_items" AS PERMISSIVE FOR ALL TO public USING ("credit_note_items"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("credit_note_items"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "credit_notes_business_isolation" ON "credit_notes" AS PERMISSIVE FOR ALL TO public USING ("credit_notes"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("credit_notes"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "diagnoses_business_isolation" ON "diagnoses" AS PERMISSIVE FOR ALL TO public USING ("diagnoses"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("diagnoses"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "doctor_leave_business_isolation" ON "doctor_leave" AS PERMISSIVE FOR ALL TO public USING ("doctor_leave"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("doctor_leave"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "doctor_profiles_business_isolation" ON "doctor_profiles" AS PERMISSIVE FOR ALL TO public USING ("doctor_profiles"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("doctor_profiles"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "doctor_schedules_business_isolation" ON "doctor_schedules" AS PERMISSIVE FOR ALL TO public USING ("doctor_schedules"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("doctor_schedules"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "expense_categories_business_isolation" ON "expense_categories" AS PERMISSIVE FOR ALL TO public USING ("expense_categories"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("expense_categories"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "expenses_business_isolation" ON "expenses" AS PERMISSIVE FOR ALL TO public USING ("expenses"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("expenses"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "file_metadata_business_isolation" ON "file_metadata" AS PERMISSIVE FOR ALL TO public USING ("file_metadata"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("file_metadata"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "inventory_categories_business_isolation" ON "inventory_categories" AS PERMISSIVE FOR ALL TO public USING ("inventory_categories"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("inventory_categories"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "invoice_items_business_isolation" ON "invoice_items" AS PERMISSIVE FOR ALL TO public USING ("invoice_items"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("invoice_items"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "invoices_business_isolation" ON "invoices" AS PERMISSIVE FOR ALL TO public USING ("invoices"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("invoices"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "membership_roles_business_isolation" ON "membership_roles" AS PERMISSIVE FOR ALL TO public USING ("membership_roles"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("membership_roles"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "patient_medical_records_business_isolation" ON "patient_medical_records" AS PERMISSIVE FOR ALL TO public USING ("patient_medical_records"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("patient_medical_records"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "patients_business_isolation" ON "patients" AS PERMISSIVE FOR ALL TO public USING ("patients"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("patients"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "payments_business_isolation" ON "payments" AS PERMISSIVE FOR ALL TO public USING ("payments"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("payments"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "prescription_medicines_business_isolation" ON "prescription_medicines" AS PERMISSIVE FOR ALL TO public USING ("prescription_medicines"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("prescription_medicines"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "prescriptions_business_isolation" ON "prescriptions" AS PERMISSIVE FOR ALL TO public USING ("prescriptions"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("prescriptions"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "products_business_isolation" ON "products" AS PERMISSIVE FOR ALL TO public USING ("products"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("products"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "purchase_items_business_isolation" ON "purchase_items" AS PERMISSIVE FOR ALL TO public USING ("purchase_items"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("purchase_items"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "purchases_business_isolation" ON "purchases" AS PERMISSIVE FOR ALL TO public USING ("purchases"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("purchases"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "refunds_business_isolation" ON "refunds" AS PERMISSIVE FOR ALL TO public USING ("refunds"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("refunds"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "role_permissions_business_isolation" ON "role_permissions" AS PERMISSIVE FOR ALL TO public USING ("role_permissions"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("role_permissions"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "roles_business_isolation" ON "roles" AS PERMISSIVE FOR ALL TO public USING ("roles"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("roles"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "services_business_isolation" ON "services" AS PERMISSIVE FOR ALL TO public USING ("services"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("services"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "staff_profiles_business_isolation" ON "staff_profiles" AS PERMISSIVE FOR ALL TO public USING ("staff_profiles"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("staff_profiles"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "stock_movements_business_isolation" ON "stock_movements" AS PERMISSIVE FOR ALL TO public USING ("stock_movements"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("stock_movements"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "supplier_payments_business_isolation" ON "supplier_payments" AS PERMISSIVE FOR ALL TO public USING ("supplier_payments"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("supplier_payments"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "suppliers_business_isolation" ON "suppliers" AS PERMISSIVE FOR ALL TO public USING ("suppliers"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("suppliers"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "vitals_business_isolation" ON "vitals" AS PERMISSIVE FOR ALL TO public USING ("vitals"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("vitals"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);