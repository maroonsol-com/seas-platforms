CREATE TABLE "invoice_sequences" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_sequences_last_number_nonnegative" CHECK ("invoice_sequences"."last_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_sequences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "item_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "item_code" text;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "unit" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "tax_classification" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "unit" text DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "tax_classification" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "unit" text DEFAULT 'unit' NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "tax_classification" text;--> statement-breakpoint
ALTER TABLE "invoice_sequences" ADD CONSTRAINT "invoice_sequences_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "services_business_code_unique" ON "services" USING btree ("business_id","code") WHERE "services"."code" is not null;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_catalogue_reference" CHECK (
    (
      "invoice_items"."kind" = 'product'
      AND "invoice_items"."product_id" IS NOT NULL
      AND "invoice_items"."service_id" IS NULL
    ) OR (
      "invoice_items"."kind" IN ('service', 'consultation', 'procedure')
      AND "invoice_items"."service_id" IS NOT NULL
      AND "invoice_items"."product_id" IS NULL
    )
  );--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_snapshot_present" CHECK (
    char_length("invoice_items"."item_name") > 0 AND char_length("invoice_items"."unit") > 0
    AND ("invoice_items"."item_code" IS NULL OR char_length("invoice_items"."item_code") > 0)
  );--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_balance_equation" CHECK ("invoices"."balance" = "invoices"."total" - "invoices"."amount_paid");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_present" CHECK (char_length("products"."unit") > 0);--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_unit_present" CHECK (char_length("services"."unit") > 0);--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_code_present" CHECK ("services"."code" IS NULL OR char_length("services"."code") > 0);--> statement-breakpoint
CREATE POLICY "invoice_sequences_business_isolation" ON "invoice_sequences" AS PERMISSIVE FOR ALL TO public USING ("invoice_sequences"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid) WITH CHECK ("invoice_sequences"."business_id" = nullif(current_setting('app.current_business_id', true), '')::uuid);