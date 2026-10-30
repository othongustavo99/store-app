-- Etapa 05: preparo operacional separado de recebimento financeiro.
ALTER TABLE orders ADD COLUMN pickup_preparation TEXT NOT NULL DEFAULT 'NONE'
  CHECK (pickup_preparation IN ('NONE','PREPARING','READY'));
CREATE TRIGGER order_pickup_preparation_change AFTER UPDATE OF pickup_preparation ON orders
  FOR EACH ROW WHEN (OLD.pickup_preparation IS DISTINCT FROM NEW.pickup_preparation)
  EXECUTE FUNCTION notify_order_change();
