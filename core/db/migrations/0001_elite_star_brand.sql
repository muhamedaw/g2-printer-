DO $$ BEGIN
 CREATE TYPE "public"."plan_tier" AS ENUM('free', 'starter', 'pro', 'whale');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"name" text NOT NULL,
	"requests_today" integer DEFAULT 0 NOT NULL,
	"request_limit" integer DEFAULT 1000 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"plan_tier" "plan_tier" NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"capital_usd" integer DEFAULT 1000 NOT NULL,
	"max_position_pct" integer DEFAULT 5 NOT NULL,
	"min_score_to_buy" integer DEFAULT 80 NOT NULL,
	"stop_loss_pct" integer DEFAULT 30 NOT NULL,
	"paper_trading" boolean DEFAULT true NOT NULL,
	"telegram_chat_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"plan_tier" "plan_tier" DEFAULT 'free' NOT NULL,
	"public_slug" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_address" varchar(44) NOT NULL,
	"token_symbol" varchar(20),
	"sentiment_score" numeric(5, 2),
	"authenticity_score" numeric(4, 3),
	"trend_score" numeric(5, 2),
	"narrative_freshness" numeric(4, 3),
	"final_ai_score" numeric(5, 2),
	"platforms_detected" text[],
	"platform_count" integer DEFAULT 1,
	"influencer_count" integer DEFAULT 0,
	"reasoning" text,
	"passed_to_safety" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raw_signals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"platform" varchar(20) NOT NULL,
	"content" text,
	"contract_address" varchar(44),
	"author_username" varchar(100),
	"author_followers" integer DEFAULT 0,
	"engagement_score" numeric(8, 2) DEFAULT '0',
	"platform_weight" numeric(4, 2) DEFAULT '1.0',
	"influencer_weight" numeric(4, 2) DEFAULT '1.0',
	"raw_data" jsonb,
	"processed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "safety_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"contract_address" varchar(44) NOT NULL,
	"overall_score" numeric(5, 2),
	"mint_authority_revoked" boolean,
	"freeze_authority_revoked" boolean,
	"top_holder_pct" numeric(6, 4),
	"top10_holders_pct" numeric(6, 4),
	"holder_count" integer,
	"is_honeypot" boolean DEFAULT false,
	"liquidity_usd" numeric(18, 2),
	"token_age_minutes" integer,
	"buy_sell_ratio" numeric(4, 3),
	"rugcheck_score" integer,
	"dna_match_found" boolean DEFAULT false,
	"rejection_reason" text,
	"passed" boolean DEFAULT false,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "safety_checks_contract_address_unique" UNIQUE("contract_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_blacklist" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"address" varchar(44) NOT NULL,
	"reason" text,
	"added_by" varchar(50) DEFAULT 'system',
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_blacklist_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "token_dna" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"creator_wallet" varchar(44) NOT NULL,
	"rugged_token" varchar(44) NOT NULL,
	"patterns" text[],
	"confidence" numeric(4, 3) DEFAULT '1.0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"contract_address" varchar(44) NOT NULL,
	"token_symbol" varchar(20),
	"entry_price" numeric(20, 10) NOT NULL,
	"current_price" numeric(20, 10),
	"highest_price_seen" numeric(20, 10),
	"quantity_remaining" numeric(30, 10) NOT NULL,
	"usd_invested" numeric(18, 2) NOT NULL,
	"current_usd_value" numeric(18, 2),
	"unrealized_pnl_pct" numeric(10, 4),
	"tp1_executed" boolean DEFAULT false,
	"tp2_executed" boolean DEFAULT false,
	"tp3_executed" boolean DEFAULT false,
	"trailing_stop_active" boolean DEFAULT false,
	"final_score" numeric(5, 2),
	"is_paper_trade" boolean DEFAULT true NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"contract_address" varchar(44) NOT NULL,
	"token_symbol" varchar(20),
	"trade_type" varchar(30) NOT NULL,
	"is_paper_trade" boolean DEFAULT true NOT NULL,
	"entry_price" numeric(20, 10),
	"exit_price" numeric(20, 10),
	"quantity_tokens" numeric(30, 10),
	"sol_amount" numeric(18, 9),
	"usd_amount" numeric(18, 2),
	"pnl_usd" numeric(18, 2),
	"pnl_pct" numeric(10, 4),
	"final_score" numeric(5, 2),
	"tx_signature" varchar(100),
	"gas_fee_sol" numeric(18, 9),
	"jito_tip_sol" numeric(18, 9),
	"sell_reason" varchar(50),
	"copy_trade_wallet" varchar(44),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_wallets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"wallet_address" varchar(44) NOT NULL,
	"nickname" varchar(100),
	"pattern" varchar(30) DEFAULT 'unknown' NOT NULL,
	"win_rate" numeric(4, 3) DEFAULT '0.5',
	"avg_profit_x" numeric(6, 2) DEFAULT '1.0',
	"avg_loss_pct" numeric(4, 3) DEFAULT '0.3',
	"total_trades" integer DEFAULT 0,
	"winning_trades" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"last_trade_at" timestamp with time zone,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smart_wallets_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"total_trades" integer DEFAULT 0,
	"winning_trades" integer DEFAULT 0,
	"losing_trades" integer DEFAULT 0,
	"win_rate" numeric(4, 3) DEFAULT '0',
	"total_pnl_usd" numeric(18, 2) DEFAULT '0',
	"capital_eod" numeric(18, 2),
	"market_regime" text,
	"daily_limit_hit" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_stats_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"parameter" text NOT NULL,
	"old_value" text NOT NULL,
	"new_value" text NOT NULL,
	"reason" text NOT NULL,
	"performance_data" jsonb,
	"week_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sandbox_positions" DROP CONSTRAINT "sandbox_positions_session_id_sandbox_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "sandbox_trades" DROP CONSTRAINT "sandbox_trades_session_id_sandbox_sessions_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "sandbox_trades_token_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_signals_contract_idx" ON "ai_signals" USING btree ("contract_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_signals_score_idx" ON "ai_signals" USING btree ("final_ai_score");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_signals_contract_idx" ON "raw_signals" USING btree ("contract_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_signals_processed_idx" ON "raw_signals" USING btree ("processed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_signals_created_idx" ON "raw_signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "safety_checks_expires_idx" ON "safety_checks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "token_dna_creator_idx" ON "token_dna" USING btree ("creator_wallet");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_user_idx" ON "positions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_open_idx" ON "positions" USING btree ("user_id","is_paper_trade");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_user_idx" ON "trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_contract_idx" ON "trades" USING btree ("contract_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_created_idx" ON "trades" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_wallets_active_idx" ON "smart_wallets" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "smart_wallets_win_rate_idx" ON "smart_wallets" USING btree ("win_rate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_log_week_idx" ON "learning_log" USING btree ("week_date");