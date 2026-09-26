-- =============================================================================
-- 0009_auth_trust.sql  —  Sovereign Grid · Account trust bundle (Wave M)
-- -----------------------------------------------------------------------------
-- Turns registration from "demo" into "running product" by adding the account-
-- trust primitives real counterparties need:
--
--   * users.email_verified  — default false. Gated actions (seller = create a
--     listing; buyer = create a deal / accept an offer) return 403
--     email_unverified until the account is verified. Operator accounts and
--     operator actions are NOT gated.
--   * users.token_version   — bumped on password reset so any future JWT
--     payload can include and validate it. Today auth uses DB-backed bearer
--     sessions (no JWT), so reset ALSO deletes every session row for the user,
--     which is what actually invalidates live tokens.
--   * email_verifications   — single-use, expiring one-time tokens for the
--     'verify' (register, 24h) and 'reset' (password, 30min) purposes. Both the
--     token HASH (sha256, how the verify/reset endpoints compare) and the RAW
--     token (needed ONLY for operator hand-off — see below) are stored.
--
-- NO SMTP IS CONFIGURED. We do not send real email. The trust bundle is wired
-- so a human operator can complete verification until SMTP lands:
--
--   * In dev (`NODE_ENV !== 'production'`) the raw token is logged with a
--     console.info prefix `VERIFY_TOKEN:` (verify) / `RESET_TOKEN:` (reset) so
--     a developer can paste it into the verify/reset endpoint.
--   * In production the pending tokens are surfaced to OPERATORS only:
--       GET  /api/operator/verifications            -> {id, email, purpose,
--                                                       createdAt} — NEVER the token
--       POST /api/operator/verifications/:id/reveal -> returns the raw token
--                                                       ONCE (410 on repeat) and
--                                                       writes an immutable
--                                                       audit_log row.
--     The human operator then hands the token to the caller out-of-band.
--   * When SMTP is added, replace the console/operator-hand-off path with real
--     delivery and DELETE the token_raw column (see TODO in the app routes).
--
-- RLS: email_verifications is operator-all (needed for the reveal flow) and
-- default-deny for everyone else. Consumers/creators go through SECURITY
-- DEFINER helpers owned by sg_migrate (auth_create_verification,
-- auth_consume_verify, auth_consume_reset, auth_log_reveal) — the same
-- owner-run pattern as the other auth_* helpers, so a leaked sg_app session
-- still cannot read a stranger's verification rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- users: account-trust columns
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- email_verifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_raw    text NOT NULL,            -- raw token for operator hand-off (interim, see header)
  token_hash   text NOT NULL UNIQUE,     -- sha256(raw); the self-serve verify/reset path compares this
  purpose      text NOT NULL CHECK (purpose IN ('verify','reset')),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  revealed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_verifications_user_idx ON email_verifications (user_id);
CREATE INDEX IF NOT EXISTS email_verifications_pending_idx ON email_verifications (purpose, used_at);

-- Row-Level Security — enable (default-deny)
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;

-- Operators see/mutate every verification row (needed for the reveal flow).
DROP POLICY IF EXISTS email_verifications_operator_all ON email_verifications;
CREATE POLICY email_verifications_operator_all ON email_verifications FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
-- Everyone else (buyer/seller): no policies => default-deny. Verification rows
-- are only touched through the security-definer helpers below.


-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers (owner = sg_migrate, bypasses RLS like auth_*)
-- ---------------------------------------------------------------------------

-- Insert a one-time token. Store BOTH the raw token (for operator hand-off)
-- and its sha256 (for the self-serve verify/reset comparison).
CREATE OR REPLACE FUNCTION auth_create_verification(
  p_user_id   uuid,
  p_purpose   text,
  p_token_raw text,
  p_token_hash text,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO email_verifications (user_id, purpose, token_raw, token_hash, expires_at)
  VALUES (p_user_id, p_purpose, p_token_raw, p_token_hash, p_expires_at)
  RETURNING id;
$$;

-- Consume a 'verify' token: mark it used, flip the account to verified, and bump
-- token_version. Returns the user id, or NULL when the token is unknown /
-- already used / expired. The consuming statement is one transaction, so the
-- FOR UPDATE guard prevents double-spend under concurrency.
CREATE OR REPLACE FUNCTION auth_consume_verify(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user
  FROM email_verifications
  WHERE token_hash = p_token_hash
    AND purpose = 'verify'
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE email_verifications SET used_at = now() WHERE token_hash = p_token_hash;
  UPDATE users SET email_verified = true, token_version = token_version + 1 WHERE id = v_user;
  RETURN v_user;
END $$;

-- Consume a 'reset' token: set the new password, bump token_version, and delete
-- EVERY session for the user (log out everywhere). Returns the user id or NULL.
CREATE OR REPLACE FUNCTION auth_consume_reset(p_token_hash text, p_password_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user
  FROM email_verifications
  WHERE token_hash = p_token_hash
    AND purpose = 'reset'
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE email_verifications SET used_at = now() WHERE token_hash = p_token_hash;
  UPDATE users SET password_hash = p_password_hash, token_version = token_version + 1 WHERE id = v_user;
  DELETE FROM sessions WHERE user_id = v_user;
  RETURN v_user;
END $$;

-- Audit an operator token reveal. SECURITY DEFINER so the operator (who cannot
-- INSERT audit_log under its RLS) can still write an immutable trail row.
CREATE OR REPLACE FUNCTION auth_log_reveal(p_verification_id uuid, p_operator_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purpose text;
BEGIN
  SELECT purpose INTO v_purpose FROM email_verifications WHERE id = p_verification_id;
  INSERT INTO audit_log (actor, action, entity, entity_id, details)
  VALUES (p_operator_id, 'reveal', 'email_verifications', p_verification_id,
          jsonb_build_object('purpose', v_purpose));
END $$;


-- ---------------------------------------------------------------------------
-- Extend the login / session lookups to carry the verification state so the
-- API can return emailVerified and the gate middleware needs no extra query.
-- ---------------------------------------------------------------------------
-- NOTE: these two already exist (0002) WITH a different return type, and
-- PostgreSQL refuses to change a function's return type via CREATE OR REPLACE.
-- Drop-and-recreate is required; the EXECUTE grants are re-issued below.
DROP FUNCTION IF EXISTS auth_user_by_email(citext);
CREATE FUNCTION auth_user_by_email(p_email citext)
RETURNS TABLE (id uuid, role text, email citext, display_name text, password_hash text, email_verified boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, role, email, display_name, password_hash, email_verified
  FROM users
  WHERE email = p_email;
$$;

-- Resolve a presented token hash -> owner + role + verification state.
DROP FUNCTION IF EXISTS auth_session_by_hash(text);
CREATE FUNCTION auth_session_by_hash(p_token_hash text)
RETURNS TABLE (user_id uuid, role text, expires_at timestamptz, email_verified boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, u.role, s.expires_at, u.email_verified
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash
    AND s.expires_at > now();
$$;


-- ---------------------------------------------------------------------------
-- Seed verification: the DEMO accounts (created by db/seed.js) are pre-verified
-- so the golden path / e2e demo accounts keep working unchanged. Only rows that
-- exist are touched — idempotent, safe to re-run, and never flips a real
-- user's flag.
-- ---------------------------------------------------------------------------
UPDATE users SET email_verified = true
WHERE email IN ('falcon@demo.local', 'seller1@demo.local', 'seller2@demo.local', 'operator@sg.local');


-- ---------------------------------------------------------------------------
-- Grants (least privilege, mirror 0001/0002)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON email_verifications TO sg_app;
GRANT EXECUTE ON FUNCTION auth_create_verification(uuid, text, text, text, timestamptz) TO sg_app;
GRANT EXECUTE ON FUNCTION auth_consume_verify(text) TO sg_app;
GRANT EXECUTE ON FUNCTION auth_consume_reset(text, text) TO sg_app;
GRANT EXECUTE ON FUNCTION auth_log_reveal(uuid, uuid) TO sg_app;
-- Re-issue the login / session grants (functions were dropped + recreated above).
GRANT EXECUTE ON FUNCTION auth_user_by_email(citext) TO sg_app;
GRANT EXECUTE ON FUNCTION auth_session_by_hash(text) TO sg_app;
