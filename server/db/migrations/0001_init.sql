-- =============================================================================
-- 0001_init.sql  —  Sovereign Grid Phase 1 backend schema
-- -----------------------------------------------------------------------------
-- db/README.md  (this header is the canonical DB model doc)
-- =============================================================================
--
-- SCOPE
--   Initial relational foundation for Sovereign Grid Phase 1 (DELIVERY_PLAN.md):
--   multi-deal wiring (deals keyed by id from day one), buyer/seller/operator
--   roles, persistence for requests/listings/offers/deals/evidence/approvals/
--   messages, per-role data access via Postgres Row-Level Security, and an
--   immutable audit log capturing every human approval and deal status change.
--
-- OWNERSHIP / ROLES
--   sg_migrate  — owns every object in this schema (runs `node src/db/migrate.js`).
--   sg_app      — least-privilege runtime role. NO BYPASSRLS, NO superuser.
--                 Table-level DML grants only (no DDL, no schema CREATE).
--   Admin (postgres superuser, e.g. `ares`) — database owner; pre-creates the
--                 `citext` extension (trusted, but not creatable by sg_migrate:
--                 CREATE EXTENSION requires database CREATE privilege). To stand
--                 up a fresh DB:
--                     CREATE EXTENSION IF NOT EXISTS citext;
--                 before running the migration as sg_migrate.
--
-- SECURITY MODEL
--   * Row-Level Security is ENABLED on every table and is the PRIMARY security
--     boundary (SECURITY_BASELINE.md #6, #7). App-layer checks are defense-in-depth.
--   * The application sets, per transaction (see server/src/db/pool.js withUser):
--         SET app.user_id   = '<uuid>';
--         SET app.user_role = 'buyer' | 'seller' | 'operator';
--   * Policy summary (default-deny: no matching policy => row invisible/denied):
--       - operator    : sees and mutates everything.
--       - buyer       : own requests, offers on own requests, deals+parties+
--                       messages+approvals where a party, own user row.
--       - seller      : own listings + evidence + offers, deals/parties/messages
--                       /approvals where a party, own user row.
--       - everything else is denied.
--   * audit_log is operator-READABLE only; it is written exclusively by the
--     security-definer trigger `audit_triggered_row()` (runs as table owner
--     sg_migrate, which bypasses RLS but has no UPDATE/DELETE/TRUNCATE grant).
--
-- AUDIT LOG & IMMUTABILITY
--   The audit_log table is append-only. UPDATE, DELETE and TRUNCATE are revoked
--   from BOTH sg_app and sg_migrate (verified: revoking from a non-superuser
--   owner takes effect). Rotation / purging requires the table OWNER (or a
--   superuser) to intervene — e.g. re-grant TRUNCATE, snapshot, rotate, then
--   revoke again. No application code path can modify audit history.
--
-- IDEMPOTENCY
--   Safe to apply more than once by hand: tables are CREATE IF NOT EXISTS,
--   functions are CREATE OR REPLACE, triggers and policies are dropped-then-
--   created. The migrator additionally records each file in schema_migrations
--   so repeated `npm run migrate` runs are no-ops (a file applies once).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions (citext is pre-installed by admin — see header above)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role         text NOT NULL CHECK (role IN ('buyer','seller','operator')),
  email        citext NOT NULL UNIQUE,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  company                  text,
  accelerator_preferred    text,
  accelerator_alternatives text[],
  "count"                  integer NOT NULL DEFAULT 1 CHECK ("count" > 0),
  node                     text,
  workload_type            text,
  workload                 jsonb,
  location                 jsonb,
  start_date               date,
  term_months              integer CHECK (term_months > 0),
  firmness                 text,
  resilience               jsonb,
  compliance               jsonb,
  options                  jsonb,
  budget                   jsonb,
  privacy                  jsonb,
  region                   text,
  status                   text NOT NULL DEFAULT 'open',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  provider_type       text NOT NULL,          -- accelerator vendor family, e.g. NVIDIA
  gpu_model           text NOT NULL,          -- e.g. H200 SXM, MI300X, TPU v7
  region              text NOT NULL CHECK (region IN ('GCC','EU')),
  "count"             integer NOT NULL DEFAULT 1 CHECK ("count" > 0),
  node                text,
  interconnect        text,
  memory              text,
  software            jsonb,
  portability         jsonb,
  facility            jsonb,
  data_residency      text,
  firmness            text,
  start_date          date,
  min_term_months     integer,
  max_term_months     integer,
  committed_price     numeric,                 -- per billing unit
  on_demand_price     numeric,
  currency            text NOT NULL DEFAULT 'USD',
  billing_unit        text,
  commercial          jsonb,
  commitment          jsonb,
  resilience          jsonb,
  sovereign           jsonb,
  power               jsonb,
  verification_status text,
  evidence_confidence integer,
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_region_idx ON listings (region);

CREATE TABLE IF NOT EXISTS deals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  status                text NOT NULL DEFAULT 'negotiating'
                        CHECK (status IN ('negotiating','commercially_agreed',
                                          'conditionally_awarded','contracted',
                                          'delivered','cancelled','completed')),
  offer_id              uuid,                 -- originating offer (plain ref, no FK cycle)
  negotiation           jsonb,
  eligibility_conditions jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deal_parties (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id   uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL CHECK (role IN ('buyer','seller','operator')),
  identity  text,
  contact   text,
  UNIQUE (deal_id, user_id)
);
CREATE INDEX IF NOT EXISTS deal_parties_deal_idx ON deal_parties (deal_id);
CREATE INDEX IF NOT EXISTS deal_parties_user_idx ON deal_parties (user_id);

CREATE TABLE IF NOT EXISTS offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       uuid REFERENCES listings(id) ON DELETE SET NULL,
  request_id       uuid REFERENCES requests(id) ON DELETE SET NULL,
  seller_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id          uuid REFERENCES deals(id) ON DELETE SET NULL,
  quote_version    text,
  quote_date       date,
  committed_price  numeric,
  on_demand_price  numeric,
  term_months      integer,
  quantity         integer,
  status           text NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offers_request_idx ON offers (request_id);
CREATE INDEX IF NOT EXISTS offers_deal_idx ON offers (deal_id);

CREATE TABLE IF NOT EXISTS evidence_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  type        text NOT NULL,                 -- capacityControl, benchmark, power, identity, ...
  uri         text,
  issuer      text,
  scope       text,
  status      text NOT NULL DEFAULT 'reviewed',
  issued_at   date,
  expires_at  date,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_listing_idx ON evidence_items (listing_id);

CREATE TABLE IF NOT EXISTS approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id      uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  approver_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  scope        text NOT NULL,                 -- what is being approved (e.g. 'route_reviewer_decision')
  decision     text NOT NULL DEFAULT 'requested'
               CHECK (decision IN ('approved','rejected','requested')),
  detail       text,
  reviewed_at  timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_deal_idx ON approvals (deal_id);

CREATE TABLE IF NOT EXISTS messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id    uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  from_role  text,
  body       text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_deal_idx ON messages (deal_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor       uuid,
  action      text NOT NULL,                 -- insert | update | delete
  entity      text NOT NULL,                 -- table name
  entity_id   uuid,
  details     jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_occurred_idx ON audit_log (occurred_at);

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Maintain updated_at on row modification.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- Immutable-audit writer. SECURITY DEFINER owned by sg_migrate so it can insert
-- into audit_log regardless of the acting user's RLS (owner bypasses RLS unless
-- FORCE ROW LEVEL SECURITY). It only INSERTs; UPDATE/DELETE/TRUNCATE on
-- audit_log are revoked from sg_app and sg_migrate.
CREATE OR REPLACE FUNCTION audit_triggered_row() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec        record;
  v_actor    uuid;
  v_entity_id uuid;
BEGIN
  v_actor := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF TG_OP = 'DELETE' THEN
    rec := OLD;
  ELSE
    rec := NEW;
  END IF;
  v_entity_id := rec.id;
  INSERT INTO audit_log (actor, action, entity, entity_id, details)
  VALUES (v_actor, lower(TG_OP), TG_TABLE_NAME, v_entity_id, to_jsonb(rec));
  RETURN rec;
END $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_requests_updated_at ON requests;
CREATE TRIGGER trg_requests_updated_at BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_listings_updated_at ON listings;
CREATE TRIGGER trg_listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_offers_updated_at ON offers;
CREATE TRIGGER trg_offers_updated_at BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_deals_updated_at ON deals;
CREATE TRIGGER trg_deals_updated_at BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Audit: every approval mutation is logged.
DROP TRIGGER IF EXISTS trg_approvals_audit ON approvals;
CREATE TRIGGER trg_approvals_audit AFTER INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION audit_triggered_row();

-- Audit: deal status transitions are logged.
DROP TRIGGER IF EXISTS trg_deals_status_audit ON deals;
CREATE TRIGGER trg_deals_status_audit AFTER UPDATE OF status ON deals
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION audit_triggered_row();

-- ---------------------------------------------------------------------------
-- Row-Level Security — ENABLE on every table (default-deny)
-- ---------------------------------------------------------------------------

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_parties   ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;

-- -------- users -----------------------------------------------------------
DROP POLICY IF EXISTS users_operator_all ON users;
CREATE POLICY users_operator_all ON users FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS users_self_select ON users;
CREATE POLICY users_self_select ON users FOR SELECT
  USING (id::text = current_setting('app.user_id', true));
DROP POLICY IF EXISTS users_self_update ON users;
CREATE POLICY users_self_update ON users FOR UPDATE
  USING (id::text = current_setting('app.user_id', true))
  WITH CHECK (id::text = current_setting('app.user_id', true));

-- -------- requests (buyer owns) -------------------------------------------
DROP POLICY IF EXISTS requests_operator_all ON requests;
CREATE POLICY requests_operator_all ON requests FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS requests_owner_all ON requests;
CREATE POLICY requests_owner_all ON requests FOR ALL
  USING (buyer_id::text = current_setting('app.user_id', true))
  WITH CHECK (buyer_id::text = current_setting('app.user_id', true));

-- -------- listings (seller owns) ------------------------------------------
DROP POLICY IF EXISTS listings_operator_all ON listings;
CREATE POLICY listings_operator_all ON listings FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS listings_owner_all ON listings;
CREATE POLICY listings_owner_all ON listings FOR ALL
  USING (seller_id::text = current_setting('app.user_id', true))
  WITH CHECK (seller_id::text = current_setting('app.user_id', true));

-- -------- deals (parties: buyer/seller of any deal_party row) -------------
DROP POLICY IF EXISTS deals_operator_all ON deals;
CREATE POLICY deals_operator_all ON deals FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS deals_party_select ON deals;
CREATE POLICY deals_party_select ON deals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM deal_parties dp
    WHERE dp.deal_id = deals.id
      AND dp.user_id::text = current_setting('app.user_id', true)));
DROP POLICY IF EXISTS deals_party_update ON deals;
CREATE POLICY deals_party_update ON deals FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM deal_parties dp
    WHERE dp.deal_id = deals.id
      AND dp.user_id::text = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM deal_parties dp
    WHERE dp.deal_id = deals.id
      AND dp.user_id::text = current_setting('app.user_id', true)));

-- -------- deal_parties -----------------------------------------------------
DROP POLICY IF EXISTS deal_parties_operator_all ON deal_parties;
CREATE POLICY deal_parties_operator_all ON deal_parties FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS deal_parties_self_select ON deal_parties;
CREATE POLICY deal_parties_self_select ON deal_parties FOR SELECT
  USING (user_id::text = current_setting('app.user_id', true));
-- NOTE: no "party can see the whole party list" policy here. Such a policy
-- would need a self-join on deal_parties, which PostgreSQL rejects as RLS
-- infinite recursion (a policy subquery on the same table re-triggers the
-- policy). Parties access shared deal data through deals / messages / approvals
-- policies, not through a party-list read.

-- -------- offers -----------------------------------------------------------
DROP POLICY IF EXISTS offers_operator_all ON offers;
CREATE POLICY offers_operator_all ON offers FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS offers_seller_all ON offers;
CREATE POLICY offers_seller_all ON offers FOR ALL
  USING (seller_id::text = current_setting('app.user_id', true))
  WITH CHECK (seller_id::text = current_setting('app.user_id', true));
DROP POLICY IF EXISTS offers_buyer_select ON offers;
CREATE POLICY offers_buyer_select ON offers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM requests rq
    WHERE rq.id = offers.request_id
      AND rq.buyer_id::text = current_setting('app.user_id', true)));

-- -------- evidence_items (seller of the listing) ---------------------------
DROP POLICY IF EXISTS evidence_operator_all ON evidence_items;
CREATE POLICY evidence_operator_all ON evidence_items FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS evidence_seller_all ON evidence_items;
CREATE POLICY evidence_seller_all ON evidence_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM listings l
    WHERE l.id = evidence_items.listing_id
      AND l.seller_id::text = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM listings l
    WHERE l.id = evidence_items.listing_id
      AND l.seller_id::text = current_setting('app.user_id', true)));

-- -------- approvals --------------------------------------------------------
DROP POLICY IF EXISTS approvals_operator_all ON approvals;
CREATE POLICY approvals_operator_all ON approvals FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS approvals_party_select ON approvals;
CREATE POLICY approvals_party_select ON approvals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM deal_parties dp
    WHERE dp.deal_id = approvals.deal_id
      AND dp.user_id::text = current_setting('app.user_id', true)));
DROP POLICY IF EXISTS approvals_self_update ON approvals;
CREATE POLICY approvals_self_update ON approvals FOR UPDATE
  USING (approver_id::text = current_setting('app.user_id', true))
  WITH CHECK (approver_id::text = current_setting('app.user_id', true));

-- -------- messages ---------------------------------------------------------
DROP POLICY IF EXISTS messages_operator_all ON messages;
CREATE POLICY messages_operator_all ON messages FOR ALL
  USING (current_setting('app.user_role', true) = 'operator')
  WITH CHECK (current_setting('app.user_role', true) = 'operator');
DROP POLICY IF EXISTS messages_party_all ON messages;
CREATE POLICY messages_party_all ON messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM deal_parties dp
    WHERE dp.deal_id = messages.deal_id
      AND dp.user_id::text = current_setting('app.user_id', true)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM deal_parties dp
    WHERE dp.deal_id = messages.deal_id
      AND dp.user_id::text = current_setting('app.user_id', true)));

-- -------- audit_log (operator-readable only) -------------------------------
DROP POLICY IF EXISTS audit_log_operator_select ON audit_log;
CREATE POLICY audit_log_operator_select ON audit_log FOR SELECT
  USING (current_setting('app.user_role', true) = 'operator');
-- No INSERT/UPDATE/DELETE policies: audit_log is written only by the
-- security-definer trigger and is otherwise default-deny.

-- ---------------------------------------------------------------------------
-- Grants (least privilege)
-- ---------------------------------------------------------------------------
-- sg_app: table-level DML on all domain tables, NO DDL, NOT BYPASSRLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, requests, listings, deals,
  deal_parties, offers, evidence_items, approvals, messages TO sg_app;

-- Sequence usage for any serial columns/surrogate keys.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sg_app;

-- audit_log: sg_app gets SELECT only (scoped to operators by RLS) so the
-- operator console can query the trail. No INSERT/UPDATE/DELETE/TRUNCATE: rows
-- are written only by the security-definer trigger, and mutation is blocked by
-- the REVOKE below. Updating/deleting/truncating requires owner intervention.
GRANT SELECT ON audit_log TO sg_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM sg_app, sg_migrate;
-- The owner still holds implicit SELECT/INSERT (needed by the security-definer
-- trigger) but its UPDATE/DELETE/TRUNCATE are revoked for immutability.
