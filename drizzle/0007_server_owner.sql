CREATE TABLE "server_owner" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"email_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_owner_single_row" CHECK ("server_owner"."id" = 1)
);
