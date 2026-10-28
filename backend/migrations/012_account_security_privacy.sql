-- Fase 5.4: reset por email e exclusão de conta verificável.
-- Nunca alterar migrations anteriores já aplicadas.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED'));

CREATE TABLE account_action_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('PASSWORD_RESET','ACCOUNT_DELETE')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_account_action_tokens_user_purpose ON account_action_tokens(user_id,purpose,created_at DESC);
CREATE INDEX ix_account_action_tokens_expiration ON account_action_tokens(expires_at);

CREATE TABLE account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED')),
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX ix_account_deletion_requests_status ON account_deletion_requests(status,requested_at);
