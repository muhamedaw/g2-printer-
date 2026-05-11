CREATE TABLE IF NOT EXISTS "sandbox_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token_mint" text NOT NULL,
	"token_symbol" text NOT NULL,
	"token_name" text NOT NULL,
	"entry_price" numeric(18, 10) NOT NULL,
	"fake_usd_spent" numeric(18, 6) NOT NULL,
	"fake_tokens_held" numeric(28, 10) NOT NULL,
	"score" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sandbox_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"starting_capital" numeric(18, 6) NOT NULL,
	"current_capital" numeric(18, 6) NOT NULL,
	"peak_capital" numeric(18, 6) NOT NULL,
	"total_pnl_usd" numeric(18, 6) DEFAULT '0',
	"total_trades" integer DEFAULT 0,
	"winning_trades" integer DEFAULT 0,
	"config" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sandbox_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"token_mint" text NOT NULL,
	"token_symbol" text NOT NULL,
	"token_name" text NOT NULL,
	"action" text NOT NULL,
	"fake_usd_amount" numeric(18, 6) NOT NULL,
	"price" numeric(18, 10) NOT NULL,
	"score" integer NOT NULL,
	"exit_reason" text,
	"pnl_usd" numeric(18, 6),
	"pnl_percent" numeric(10, 4),
	"hold_time_ms" integer,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sandbox_positions" ADD CONSTRAINT "sandbox_positions_session_id_sandbox_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sandbox_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sandbox_trades" ADD CONSTRAINT "sandbox_trades_session_id_sandbox_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sandbox_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandbox_positions_session_idx" ON "sandbox_positions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandbox_positions_open_idx" ON "sandbox_positions" USING btree ("session_id","is_closed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandbox_sessions_user_idx" ON "sandbox_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandbox_sessions_status_idx" ON "sandbox_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandbox_trades_session_idx" ON "sandbox_trades" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandbox_trades_user_idx" ON "sandbox_trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sandbox_trades_token_idx" ON "sandbox_trades" USING btree ("token_mint");