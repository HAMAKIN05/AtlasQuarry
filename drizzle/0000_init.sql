CREATE TABLE "actor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"password_hash" text,
	"totp_secret" text,
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actor_email_unique" UNIQUE("email"),
	CONSTRAINT "actor_type_check" CHECK ("actor"."type" IN ('human', 'agent')),
	CONSTRAINT "actor_role_check" CHECK ("actor"."role" IN ('owner', 'manager', 'developer', 'requester', 'agent')),
	CONSTRAINT "human_needs_credentials" CHECK ("actor"."type" <> 'human' OR ("actor"."email" IS NOT NULL AND "actor"."password_hash" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "actor_external_id" (
	"actor_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actor_external_id_actor_id_provider_pk" PRIMARY KEY("actor_id","provider"),
	CONSTRAINT "actor_external_id_provider_external_id_key" UNIQUE("provider","external_id"),
	CONSTRAINT "actor_external_id_provider_check" CHECK ("actor_external_id"."provider" IN ('discord', 'github'))
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"scope" text NOT NULL,
	"product_ids" uuid[],
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "api_key_scope_check" CHECK ("api_key"."scope" IN ('read', 'read_write'))
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"role" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" smallint DEFAULT 1 NOT NULL,
	"used_count" smallint DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitation_role_check" CHECK ("invitation"."role" IN ('owner', 'manager', 'developer', 'requester'))
);
--> statement-breakpoint
CREATE TABLE "login_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" "inet",
	"succeeded" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "feature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"start_date" date,
	"due_date" date,
	"position" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_status_check" CHECK ("feature"."status" IN ('planning', 'active', 'done', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"owner_id" uuid NOT NULL,
	"task_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_key_unique" UNIQUE("key"),
	CONSTRAINT "product_key_format" CHECK ("product"."key" ~ '^[A-Z][A-Z0-9]{1,9}$'),
	CONSTRAINT "product_status_check" CHECK ("product"."status" IN ('planning', 'active', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "label" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"color" text DEFAULT '#888888' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"feature_id" uuid,
	"parent_task_id" uuid,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text,
	"status" text DEFAULT 'backlog' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assignee_id" uuid,
	"reporter_id" uuid NOT NULL,
	"estimate_minutes" integer,
	"start_date" date,
	"due_date" date,
	"position" double precision NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_key_unique" UNIQUE("key"),
	CONSTRAINT "task_status_check" CHECK ("task"."status" IN ('backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled')),
	CONSTRAINT "task_priority_check" CHECK ("task"."priority" IN ('urgent', 'high', 'normal', 'low')),
	CONSTRAINT "task_estimate_positive" CHECK ("task"."estimate_minutes" IS NULL OR "task"."estimate_minutes" > 0),
	CONSTRAINT "date_order" CHECK ("task"."start_date" IS NULL OR "task"."due_date" IS NULL OR "task"."start_date" <= "task"."due_date"),
	CONSTRAINT "done_has_timestamp" CHECK ("task"."status" <> 'done' OR "task"."completed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "task_dependency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"predecessor_id" uuid NOT NULL,
	"successor_id" uuid NOT NULL,
	"type" text DEFAULT 'FS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependency_pair_key" UNIQUE("predecessor_id","successor_id"),
	CONSTRAINT "task_dependency_type_check" CHECK ("task_dependency"."type" IN ('FS')),
	CONSTRAINT "no_self_dependency" CHECK ("task_dependency"."predecessor_id" <> "task_dependency"."successor_id")
);
--> statement-breakpoint
CREATE TABLE "task_label" (
	"task_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "task_label_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"title" text NOT NULL,
	"body_md" text,
	"reporter_id" uuid NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"source_ref" text,
	"status" text DEFAULT 'received' NOT NULL,
	"converted_task_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_source_check" CHECK ("request"."source" IN ('web', 'discord_command')),
	CONSTRAINT "request_status_check" CHECK ("request"."status" IN ('received', 'reviewing', 'accepted', 'rejected', 'done')),
	CONSTRAINT "rejected_needs_reason" CHECK ("request"."status" <> 'rejected' OR "request"."reject_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "decision_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"author_id" uuid NOT NULL,
	"is_merged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_note_source_check" CHECK ("decision_note"."source" IN ('discord', 'web'))
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"parent_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"position" double precision NOT NULL,
	"meeting_date" date,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"locked_by" uuid,
	"locked_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_type_check" CHECK ("document"."type" IN ('spec', 'knowledge', 'minutes')),
	CONSTRAINT "minutes_only_fields" CHECK ("document"."type" = 'minutes' OR ("document"."meeting_date" IS NULL AND "document"."is_confirmed" = false))
);
--> statement-breakpoint
CREATE TABLE "document_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"body_md" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"uploader_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachment_target_type_check" CHECK ("attachment"."target_type" IN ('task', 'request', 'document', 'comment')),
	CONSTRAINT "attachment_size_positive" CHECK ("attachment"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_target_type_check" CHECK ("comment"."target_type" IN ('task', 'request', 'document'))
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"diff_json" jsonb,
	"weight" smallint DEFAULT 1 NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_entity_type_check" CHECK ("activity"."entity_type" IN ('product', 'feature', 'task', 'request', 'document', 'comment')),
	CONSTRAINT "activity_action_check" CHECK ("activity"."action" IN ('create', 'update', 'delete', 'status_change', 'comment', 'complete', 'triage'))
);
--> statement-breakpoint
CREATE TABLE "agent_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"task_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"token_usage" integer
);
--> statement-breakpoint
CREATE TABLE "work_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_log_source_check" CHECK ("work_log"."source" IN ('manual', 'agent')),
	CONSTRAINT "work_log_minutes_range" CHECK ("work_log"."minutes" > 0 AND "work_log"."minutes" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"delivered_channels" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_pref" (
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "notification_pref_actor_id_event_type_channel_pk" PRIMARY KEY("actor_id","event_type","channel"),
	CONSTRAINT "notification_pref_channel_check" CHECK ("notification_pref"."channel" IN ('web', 'mail', 'discord'))
);
--> statement-breakpoint
CREATE TABLE "notification_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_queue_channel_check" CHECK ("notification_queue"."channel" IN ('mail', 'discord')),
	CONSTRAINT "notification_queue_status_check" CHECK ("notification_queue"."status" IN ('pending', 'processing', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"config_encrypted" "bytea" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"product_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_provider_check" CHECK ("integration"."provider" IN ('discord', 'github', 'smtp'))
);
--> statement-breakpoint
ALTER TABLE "actor_external_id" ADD CONSTRAINT "actor_external_id_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature" ADD CONSTRAINT "feature_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_owner_id_actor_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label" ADD CONSTRAINT "label_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_feature_id_feature_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."feature"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_parent_task_id_task_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_actor_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."actor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_reporter_id_actor_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_predecessor_id_task_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_successor_id_task_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label" ADD CONSTRAINT "task_label_label_id_label_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."label"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_reporter_id_actor_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_converted_task_id_task_id_fk" FOREIGN KEY ("converted_task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request" ADD CONSTRAINT "request_decided_by_actor_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_note" ADD CONSTRAINT "decision_note_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_note" ADD CONSTRAINT "decision_note_author_id_actor_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_parent_id_document_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_locked_by_actor_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."actor"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_created_by_actor_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revision" ADD CONSTRAINT "document_revision_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_revision" ADD CONSTRAINT "document_revision_author_id_actor_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploader_id_actor_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_actor_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."actor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_agent_id_actor_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_log" ADD CONSTRAINT "work_log_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_log" ADD CONSTRAINT "work_log_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_pref" ADD CONSTRAINT "notification_pref_actor_id_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_login_attempt_email" ON "login_attempt" USING btree ("email","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_login_attempt_ip" ON "login_attempt" USING btree ("ip","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_session_actor" ON "session" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_session_expires" ON "session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_feature_product" ON "feature" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_task_product" ON "task" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_task_feature" ON "task" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "idx_task_assignee" ON "task" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "idx_task_status" ON "task" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX "idx_task_due" ON "task" USING btree ("due_date") WHERE status NOT IN ('done','cancelled');--> statement-breakpoint
CREATE INDEX "idx_task_parent" ON "task" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "idx_request_status" ON "request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_request_product" ON "request" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_decision_unmerged" ON "decision_note" USING btree ("is_merged","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_document_parent" ON "document" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_document_product" ON "document" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_document_type" ON "document" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_revision_document" ON "document_revision" USING btree ("document_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_attachment_target" ON "attachment" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_comment_target" ON "comment" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_actor_date" ON "activity" USING btree ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_activity_entity" ON "activity" USING btree ("entity_type","entity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_activity_created" ON "activity" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_agent_session_task" ON "agent_session" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_agent_session_agent" ON "agent_session" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_worklog_actor_date" ON "work_log" USING btree ("actor_id","work_date");--> statement-breakpoint
CREATE INDEX "idx_worklog_task" ON "work_log" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_notification_unread" ON "notification" USING btree ("actor_id","is_read","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_queue_pending" ON "notification_queue" USING btree ("status","next_retry_at") WHERE status = 'pending';