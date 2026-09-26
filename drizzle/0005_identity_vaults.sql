CREATE TABLE "identity_vaults" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"public_key" "bytea" NOT NULL,
	"vault" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_vaults" ADD CONSTRAINT "identity_vaults_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;