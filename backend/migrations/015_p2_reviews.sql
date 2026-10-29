-- Avaliações de compra verificadas, isoladas por loja. Não alterar migrations anteriores.
CREATE TABLE IF NOT EXISTS product_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL CHECK (char_length(comment) BETWEEN 5 AND 1200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id,product_id,user_id),
  FOREIGN KEY (product_id,store_id) REFERENCES products(id,store_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS ix_product_reviews_product ON product_reviews(store_id,product_id,created_at DESC);

ALTER TABLE products ADD COLUMN IF NOT EXISTS size_guide TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD CONSTRAINT products_size_guide_max CHECK (char_length(size_guide) <= 3000);
CREATE INDEX IF NOT EXISTS ix_products_public_p2 ON products(store_id,status,created_at DESC,id DESC);
