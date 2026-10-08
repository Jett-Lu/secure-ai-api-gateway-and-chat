CREATE TABLE "ai_requests" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"model" varchar(128) NOT NULL,
	"duration_ms" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"outcome" varchar(7) NOT NULL,
	"status_code" integer NOT NULL,
	"error_category" varchar(32),
	CONSTRAINT "valid_duration" CHECK ("ai_requests"."duration_ms" >= 0),
	CONSTRAINT "valid_tokens" CHECK (("ai_requests"."prompt_tokens" IS NULL OR "ai_requests"."prompt_tokens" >= 0) AND ("ai_requests"."completion_tokens" IS NULL OR "ai_requests"."completion_tokens" >= 0) AND ("ai_requests"."total_tokens" IS NULL OR "ai_requests"."total_tokens" >= 0)),
	CONSTRAINT "valid_outcome" CHECK ("ai_requests"."outcome" IN ('success', 'failure')),
	CONSTRAINT "valid_status" CHECK ("ai_requests"."status_code" BETWEEN 100 AND 599),
	CONSTRAINT "valid_error" CHECK ("ai_requests"."error_category" IS NULL OR "ai_requests"."error_category" IN ('validation_error', 'rate_limit_error', 'timeout_error', 'upstream_error', 'internal_error', 'client_cancelled'))
);
--> statement-breakpoint
CREATE INDEX "ai_requests_timestamp_idx" ON "ai_requests" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "ai_requests_model_timestamp_idx" ON "ai_requests" USING btree ("model","timestamp");