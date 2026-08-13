-- Supabase RLS policies for Exaai
-- Run via: psql -f prisma/rls.sql
--
-- Strategy: App-level auth (bcrypt + custom sessions) passes userId to Postgres
-- via SET LOCAL app.current_user_id in Prisma middleware. RLS policies use
-- current_setting('app.current_user_id') to enforce per-user data isolation.
-- Note: Prisma IDs are TEXT (cuid/uuid strings), so we compare as text.

-- =============================================================================
-- 0. HELPER FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "User"
    WHERE "id" = public.current_user_id()
      AND "role" = 'admin'
  );
$$;

-- =============================================================================
-- 1. USER (self only)
-- =============================================================================

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_self_select ON "User"
  FOR SELECT USING ("id" = public.current_user_id());

CREATE POLICY user_self_update ON "User"
  FOR UPDATE USING ("id" = public.current_user_id());

CREATE POLICY user_admin_select ON "User"
  FOR SELECT USING (public.is_admin());

-- =============================================================================
-- 2. SESSION (self only)
-- =============================================================================

ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_self_select ON "Session"
  FOR SELECT USING ("userId" = public.current_user_id());

CREATE POLICY session_self_insert ON "Session"
  FOR INSERT WITH CHECK ("userId" = public.current_user_id());

CREATE POLICY session_self_delete ON "Session"
  FOR DELETE USING ("userId" = public.current_user_id());

-- =============================================================================
-- 3. EXAM (root entity)
-- =============================================================================

ALTER TABLE "Exam" ENABLE ROW LEVEL SECURITY;

CREATE POLICY exam_owner_select ON "Exam"
  FOR SELECT USING ("userId" = public.current_user_id());

CREATE POLICY exam_owner_insert ON "Exam"
  FOR INSERT WITH CHECK ("userId" = public.current_user_id());

CREATE POLICY exam_owner_update ON "Exam"
  FOR UPDATE USING ("userId" = public.current_user_id());

CREATE POLICY exam_owner_delete ON "Exam"
  FOR DELETE USING ("userId" = public.current_user_id());

CREATE POLICY exam_admin_select ON "Exam"
  FOR SELECT USING (public.is_admin());

-- =============================================================================
-- 4. EXAM_CONFIG (1:1 with Exam)
-- =============================================================================

ALTER TABLE "ExamConfig" ENABLE ROW LEVEL SECURITY;

CREATE POLICY exam_config_owner_select ON "ExamConfig"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamConfig"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY exam_config_owner_insert ON "ExamConfig"
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamConfig"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY exam_config_owner_update ON "ExamConfig"
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamConfig"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY exam_config_owner_delete ON "ExamConfig"
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamConfig"."examId" AND "Exam"."userId" = public.current_user_id())
  );

-- =============================================================================
-- 5. EXAM_SECTION (1:N with Exam)
-- =============================================================================

ALTER TABLE "ExamSection" ENABLE ROW LEVEL SECURITY;

CREATE POLICY exam_section_owner_select ON "ExamSection"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamSection"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY exam_section_owner_insert ON "ExamSection"
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamSection"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY exam_section_owner_update ON "ExamSection"
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamSection"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY exam_section_owner_delete ON "ExamSection"
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamSection"."examId" AND "Exam"."userId" = public.current_user_id())
  );

-- =============================================================================
-- 6. TASK (via ExamSection -> Exam)
-- =============================================================================

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_owner_select ON "Task"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "ExamSection" es
      JOIN "Exam" e ON e."id" = es."examId"
      WHERE es."id" = "Task"."sectionId" AND e."userId" = public.current_user_id()
    )
  );

CREATE POLICY task_owner_insert ON "Task"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExamSection" es
      JOIN "Exam" e ON e."id" = es."examId"
      WHERE es."id" = "Task"."sectionId" AND e."userId" = public.current_user_id()
    )
  );

CREATE POLICY task_owner_update ON "Task"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "ExamSection" es
      JOIN "Exam" e ON e."id" = es."examId"
      WHERE es."id" = "Task"."sectionId" AND e."userId" = public.current_user_id()
    )
  );

CREATE POLICY task_owner_delete ON "Task"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "ExamSection" es
      JOIN "Exam" e ON e."id" = es."examId"
      WHERE es."id" = "Task"."sectionId" AND e."userId" = public.current_user_id()
    )
  );

-- =============================================================================
-- 7. TOPIC (via ExamSection -> Exam)
-- =============================================================================

ALTER TABLE "Topic" ENABLE ROW LEVEL SECURITY;

CREATE POLICY topic_owner_select ON "Topic"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "ExamSection" es
      JOIN "Exam" e ON e."id" = es."examId"
      WHERE es."id" = "Topic"."sectionId" AND e."userId" = public.current_user_id()
    )
  );

CREATE POLICY topic_owner_insert ON "Topic"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "ExamSection" es
      JOIN "Exam" e ON e."id" = es."examId"
      WHERE es."id" = "Topic"."sectionId" AND e."userId" = public.current_user_id()
    )
  );

CREATE POLICY topic_owner_update ON "Topic"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "ExamSection" es
      JOIN "Exam" e ON e."id" = es."examId"
      WHERE es."id" = "Topic"."sectionId" AND e."userId" = public.current_user_id()
    )
  );

CREATE POLICY topic_owner_delete ON "Topic"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "ExamSection" es
      JOIN "Exam" e ON e."id" = es."examId"
      WHERE es."id" = "Topic"."sectionId" AND e."userId" = public.current_user_id()
    )
  );

-- =============================================================================
-- 8. SOURCE (via Exam)
-- =============================================================================

ALTER TABLE "Source" ENABLE ROW LEVEL SECURITY;

CREATE POLICY source_owner_select ON "Source"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "Source"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY source_owner_insert ON "Source"
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "Source"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY source_owner_update ON "Source"
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "Source"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY source_owner_delete ON "Source"
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "Source"."examId" AND "Exam"."userId" = public.current_user_id())
  );

-- =============================================================================
-- 9. GENERATION (audit log)
-- =============================================================================

ALTER TABLE "Generation" ENABLE ROW LEVEL SECURITY;

CREATE POLICY generation_owner_select ON "Generation"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "Generation"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY generation_owner_insert ON "Generation"
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "Generation"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY generation_admin_select ON "Generation"
  FOR SELECT USING (public.is_admin());

-- =============================================================================
-- 10. FAVOURITE_TASK (direct userId)
-- =============================================================================

ALTER TABLE "FavouriteTask" ENABLE ROW LEVEL SECURITY;

CREATE POLICY favourite_task_owner_select ON "FavouriteTask"
  FOR SELECT USING ("userId" = public.current_user_id());

CREATE POLICY favourite_task_owner_insert ON "FavouriteTask"
  FOR INSERT WITH CHECK ("userId" = public.current_user_id());

CREATE POLICY favourite_task_owner_delete ON "FavouriteTask"
  FOR DELETE USING ("userId" = public.current_user_id());

-- =============================================================================
-- 11. CUSTOM_TASK (direct userId)
-- =============================================================================

ALTER TABLE "CustomTask" ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_task_owner_select ON "CustomTask"
  FOR SELECT USING ("userId" = public.current_user_id());

CREATE POLICY custom_task_owner_insert ON "CustomTask"
  FOR INSERT WITH CHECK ("userId" = public.current_user_id());

CREATE POLICY custom_task_owner_delete ON "CustomTask"
  FOR DELETE USING ("userId" = public.current_user_id());

-- =============================================================================
-- 12. GUIDE_CONFIG (shared data)
-- =============================================================================

ALTER TABLE "GuideConfig" ENABLE ROW LEVEL SECURITY;

CREATE POLICY guide_config_auth_select ON "GuideConfig"
  FOR SELECT USING (public.current_user_id() IS NOT NULL);

CREATE POLICY guide_config_admin_all ON "GuideConfig"
  FOR ALL USING (public.is_admin());

-- =============================================================================
-- 13. PRODUCT_EVENT
-- =============================================================================

ALTER TABLE "ProductEvent" ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_event_owner_select ON "ProductEvent"
  FOR SELECT USING ("userId" = public.current_user_id());

CREATE POLICY product_event_auth_insert ON "ProductEvent"
  FOR INSERT WITH CHECK (public.current_user_id() IS NOT NULL);

CREATE POLICY product_event_admin_select ON "ProductEvent"
  FOR SELECT USING (public.is_admin());

-- =============================================================================
-- 14. PASSWORD_RESET_TOKEN
-- =============================================================================

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;

-- Token lookup by hash (system-level), allow all reads
CREATE POLICY password_reset_token_lookup ON "PasswordResetToken"
  FOR SELECT USING (true);

CREATE POLICY password_reset_token_insert ON "PasswordResetToken"
  FOR INSERT WITH CHECK ("userId" = public.current_user_id());

CREATE POLICY password_reset_token_delete ON "PasswordResetToken"
  FOR DELETE USING ("userId" = public.current_user_id());

-- =============================================================================
-- 15. EXAM_REVISION (via Exam)
-- =============================================================================

ALTER TABLE "ExamRevision" ENABLE ROW LEVEL SECURITY;

CREATE POLICY exam_revision_owner_select ON "ExamRevision"
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamRevision"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY exam_revision_owner_insert ON "ExamRevision"
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamRevision"."examId" AND "Exam"."userId" = public.current_user_id())
  );

CREATE POLICY exam_revision_owner_delete ON "ExamRevision"
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM "Exam" WHERE "Exam"."id" = "ExamRevision"."examId" AND "Exam"."userId" = public.current_user_id())
  );

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON "GuideConfig" TO authenticated;
GRANT INSERT ON "ProductEvent" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Session" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Exam" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ExamConfig" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ExamSection" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Task" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Topic" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Source" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Generation" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FavouriteTask" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CustomTask" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PasswordResetToken" TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ExamRevision" TO authenticated;
