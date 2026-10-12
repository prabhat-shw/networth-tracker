DROP INDEX "records_household_version_idx";--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "record_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "records" ADD COLUMN "seq" bigint;--> statement-breakpoint
-- Existing rows (ADR-0045): number them per household in their old pull order.
UPDATE "records" r SET "seq" = n.seq FROM (
	SELECT "id", row_number() OVER (PARTITION BY "household_id" ORDER BY "version", "updated_at", "id") AS seq
	FROM "records"
) n WHERE r."id" = n."id";--> statement-breakpoint
UPDATE "households" h SET "record_seq" = m.top FROM (
	SELECT "household_id", max("seq") AS top FROM "records" GROUP BY "household_id"
) m WHERE h."id" = m."household_id";--> statement-breakpoint
ALTER TABLE "records" ALTER COLUMN "seq" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "records_household_seq_idx" ON "records" USING btree ("household_id","seq");
