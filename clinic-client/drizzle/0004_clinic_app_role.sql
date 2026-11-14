-- The Neon owner role has BYPASSRLS, which ignores FORCE ROW LEVEL SECURITY.
-- clinic_app has no bypass and is not the table owner. Tenant transactions
-- switch to it for the duration of the transaction only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic_app') THEN
    CREATE ROLE clinic_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT clinic_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO clinic_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO clinic_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO clinic_app;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO clinic_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO clinic_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO clinic_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT EXECUTE ON FUNCTIONS TO clinic_app;
