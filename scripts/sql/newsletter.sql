-- Newsletter subscribers (homepage "Stay inspired" form).
-- Additive and idempotent: safe to run repeatedly against a live database.
-- Emails are stored trimmed + lowercased by the API; the unique index on lower(email)
-- also guards against mixed-case duplicates without needing the citext extension.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id               bigserial    PRIMARY KEY,
  email            text         NOT NULL,
  source           text,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  unsubscribed_at  timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_lower_uniq
  ON newsletter_subscribers (lower(email));

CREATE INDEX IF NOT EXISTS newsletter_subscribers_active_created_idx
  ON newsletter_subscribers (created_at DESC)
  WHERE unsubscribed_at IS NULL;
