-- =============================================================================
-- 0002_auth.sql  —  Sovereign Grid Phase 1 · Auth + sessions
-- -----------------------------------------------------------------------------
-- Adds password-based authentication on top of 0001_init.sql.
--
--   * users.password_hash  — nullable text. NULL for legacy seed users (the
--     operator and any pre-auth rows); set only for self-registered
--     buyer/seller accounts. Passwords are hashed in application code
--     (server/src/auth/passwords.js, scrypt w/ per-password random salt);
--     plaintext never enters the database.
--   * sessions             — 32-byte random bearer tokens. The database stores
--     ONLY the SHA-256 hash of the token (token_hash); the raw token is handed
--     to the client once at issue and never persisted. Tokens expire.
--   * Security-definer helpers (owned by sg_migrate, like audit_triggered_row):
--       auth_create_user     — registers a buyer/seller. Hard-rejects operator
--                              self-registration (operator users are provisioned
--                              via SQL by an admin, never via /api/auth/register).
--       auth_user_by_email   — login lookup across all users (a non-operator
--                              cannot SELECT other users' rows under RLS, so this
--                              pre-auth lookup must run as the owner).
--       auth_session_by_hash — resolve a presented token hash -> owner + role.
--                              The hash is the credential; lookup must bypass
--                              per-user RLS (we don't know the owner yet).
--   * v_marketplace_listings — PUBLIC read model for /api/listings/marketplace.
--      Owned by sg_migrate and run with invoker permissions OFF (default), so it
--      reads listings as the owner and thus returns ALL active listings; it
--      exposes ONLY the anonymized/safe column whitelist (no seller_id, no
--      committed_price). Granting SELECT on the view to sg_app is what makes the
--      marketplace public — the base listings table remains RLS-protected.
--
-- SECURITY NOTE on auth functions: running as SECURITY DEFINER they bypass RLS,
-- which is why each does the minimum and leaks nothing extra.
--   * auth_create_user verifies the role is buyer|seller and returns only the
--     new user id.
--   * auth_user_by_email returns only that one row (id, role, email,
--     display_name, password_hash) — needed to verify a login, never exposed
--     to the client.
--   * auth_session_by_hash returns only {user_id, role, expires_at} for a
--     non-expired matching token.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- users: add nullable password_hash (NULL = legacy/operator seed users)
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- ---------------------------------------------------------------------------
-- Security-definer auth helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auth_create_user(
  p_email        citext,
  p_role         text,
  p_display_name text,
  p_password_hash text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Operator accounts are NEVER self-provisioned; they are created via SQL by
  -- an administrator. Block them here at the schema boundary, not just in the
  -- route (defense in depth).
  IF p_role NOT IN ('buyer', 'seller') THEN
    RAISE EXCEPTION 'operator self-registration is forbidden'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;
  INSERT INTO users (role, email, display_name, password_hash)
  VALUES (p_role, p_email, p_display_name, p_password_hash)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Pre-auth login lookup: fetch every auth-relevant column by unique email.
CREATE OR REPLACE FUNCTION auth_user_by_email(p_email citext)
RETURNS TABLE (id uuid, role text, email citext, display_name text, password_hash text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, role, email, display_name, password_hash
  FROM users
  WHERE email = p_email;
$$;

-- Resolve a presented token hash to its owner iff the session is still valid.
CREATE OR REPLACE FUNCTION auth_session_by_hash(p_token_hash text)
RETURNS TABLE (user_id uuid, role text, expires_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, u.role, s.expires_at
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = p_token_hash
    AND s.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- Public marketplace read model (anonymized / safe columns only)
-- ---------------------------------------------------------------------------
-- Safe columns: everything needed to render a marketplace card and evaluate
-- fit, WITHOUT revealing the seller identity or any negotiated price.
--   EXCLUDED deliberately: seller_id, committed_price, commercial (may carry
--   negotiated terms / contact), evidence issuer identity.
DROP VIEW IF EXISTS v_marketplace_listings;
CREATE VIEW v_marketplace_listings AS
SELECT
  l.id,
  l.name,
  l.provider_type,
  l.gpu_model,
  l.region,
  l."count",
  l.node,
  l.interconnect,
  l.memory,
  l.software,
  l.portability,
  l.facility,
  l.data_residency,
  l.firmness,
  l.start_date,
  l.min_term_months,
  l.max_term_months,
  l.on_demand_price,          -- public list price (not negotiated)
  l.currency,
  l.billing_unit,
  l.resilience,
  l.sovereign,
  l.power,
  l.verification_status,
  l.evidence_confidence,
  l.status,
  l.created_at
FROM listings l
WHERE l.status = 'active';

-- ---------------------------------------------------------------------------
-- Row-Level Security — enable on sessions (default-deny, consistent w/ 0001)
-- ---------------------------------------------------------------------------
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_operator_all ON sessions;
CREATE POLICY sessions_operator_all ON sessions FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');

DROP POLICY IF EXISTS sessions_self_all ON sessions;
CREATE POLICY sessions_self_all ON sessions FOR ALL
  USING (user_id::text = current_setting('app.user_id', true))
  WITH CHECK (user_id::text = current_setting('app.user_id', true));

-- ---------------------------------------------------------------------------
-- Grants (mirror 0001: least privilege, sg_app)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO sg_app;

-- Execute on the security-definer auth helpers.
GRANT EXECUTE ON FUNCTION auth_create_user(citext, text, text, text) TO sg_app;
GRANT EXECUTE ON FUNCTION auth_user_by_email(citext) TO sg_app;
GRANT EXECUTE ON FUNCTION auth_session_by_hash(text) TO sg_app;

-- Public marketplace read only.
GRANT SELECT ON v_marketplace_listings TO sg_app;
