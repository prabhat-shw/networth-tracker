CREATE TABLE "price_universes" (
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"gzip" "bytea" NOT NULL,
	"etag" text NOT NULL,
	"count" integer NOT NULL,
	"flagged" integer DEFAULT 0 NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "price_universes_kind_date_pk" PRIMARY KEY("kind","date")
);
