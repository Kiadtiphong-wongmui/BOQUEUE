-- Schema for the Front Row Upgrade Queue. Idempotent.
-- Dates and ticket_value are stored as text on purpose: the ranking domain
-- must survive dirty data (bad dates, "1,500", "abc") instead of the DB
-- rejecting it, and every excluded reason stays visible in the UI.
CREATE TABLE IF NOT EXISTS ticket_queue_entries (
  id                    VARCHAR(64)  NOT NULL,
  fan_id                VARCHAR(64)  NOT NULL,
  fan_name              VARCHAR(255) NOT NULL,
  ticket_value          VARCHAR(64)  NULL,
  joined_queue_at       VARCHAR(40)  NOT NULL,
  event_starts_at       VARCHAR(40)  NOT NULL,
  status                ENUM('waiting','upgraded','cancelled') NOT NULL DEFAULT 'waiting',
  loyalty_points        INT          NULL,
  upgrades_last_30_days INT          NULL,
  membership            ENUM('regular','vip','blocked') NOT NULL DEFAULT 'regular',
  phone_number          VARCHAR(64)  NULL,
  device_id             VARCHAR(128) NULL,
  payment_account       VARCHAR(128) NULL,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status (status),
  KEY idx_fan_id (fan_id),
  KEY idx_joined (joined_queue_at, id),
  KEY idx_phone (phone_number),
  KEY idx_device (device_id),
  KEY idx_payment (payment_account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
