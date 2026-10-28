-- FASE 2: mídia, identificadores legados e eventos de catálogo multi-loja.
-- Não altera nem remove registros comerciais preexistentes.
ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT '🏷️';
ALTER TABLE categories ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN legacy_firebase_id TEXT;
CREATE UNIQUE INDEX ux_categories_legacy ON categories(store_id, legacy_firebase_id) WHERE legacy_firebase_id IS NOT NULL;

ALTER TABLE products ADD COLUMN images JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN videos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN old_price_cents BIGINT CHECK (old_price_cents IS NULL OR old_price_cents >= 0);
ALTER TABLE products ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN is_new BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN legacy_firebase_id TEXT;
CREATE UNIQUE INDEX ux_products_legacy ON products(store_id, legacy_firebase_id) WHERE legacy_firebase_id IS NOT NULL;

-- Notificar somente o identificador da loja (nenhuma informação privada é transmitida).
CREATE OR REPLACE FUNCTION notify_catalog_change() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pg_notify('loja_catalog_changed', OLD.store_id::text);
    RETURN OLD;
  END IF;
  PERFORM pg_notify('loja_catalog_changed', NEW.store_id::text);
  RETURN NEW;
END; $$;
CREATE TRIGGER categories_catalog_change AFTER INSERT OR UPDATE OR DELETE ON categories
 FOR EACH ROW EXECUTE FUNCTION notify_catalog_change();
CREATE TRIGGER products_catalog_change AFTER INSERT OR UPDATE OR DELETE ON products
 FOR EACH ROW EXECUTE FUNCTION notify_catalog_change();
CREATE TRIGGER variants_catalog_change AFTER INSERT OR UPDATE OR DELETE ON product_variants
 FOR EACH ROW EXECUTE FUNCTION notify_catalog_change();
