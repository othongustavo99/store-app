-- Fase 4.3: atendimento privado por loja e cliente, sem dependência do Firebase.
-- Não altera migrations anteriores nem cria fretes/transportadoras fictícios.
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id UUID,
  subject VARCHAR(160) NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, store_id),
  FOREIGN KEY (order_id,store_id) REFERENCES orders(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_support_tickets_customer ON support_tickets(store_id,customer_id,last_message_at DESC);
CREATE INDEX ix_support_tickets_admin ON support_tickets(store_id,status,last_message_at DESC);
CREATE TABLE support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  store_id UUID NOT NULL,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body VARCHAR(4000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (ticket_id,store_id) REFERENCES support_tickets(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX ix_support_messages_ticket ON support_messages(ticket_id,created_at,id);

-- Somente IDs de loja e cliente, nunca textos de mensagens, saem pelo NOTIFY.
CREATE OR REPLACE FUNCTION notify_support_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE ticket_store UUID; ticket_customer UUID;
BEGIN
  IF TG_TABLE_NAME = 'support_messages' THEN
    SELECT store_id,customer_id INTO ticket_store,ticket_customer
      FROM support_tickets WHERE id=NEW.ticket_id AND store_id=NEW.store_id;
  ELSE
    ticket_store := NEW.store_id;
    ticket_customer := NEW.customer_id;
  END IF;
  PERFORM pg_notify('loja_support_changed',
    json_build_object('storeId',ticket_store,'customerId',ticket_customer)::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER support_ticket_updated AFTER INSERT OR UPDATE OF status ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION notify_support_change();
CREATE TRIGGER support_message_created AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION notify_support_change();
