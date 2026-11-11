-- Typo-tolerant search: trigram similarity on product names
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING GIN ("name" gin_trgm_ops);

-- Full-text search over the fields customers search for
CREATE INDEX IF NOT EXISTS "Product_search_fts_idx"
  ON "Product" USING GIN (
    to_tsvector('english',
      coalesce("name", '') || ' ' || coalesce("tagline", '') || ' ' ||
      coalesce("materials", '') || ' ' || coalesce("description", ''))
  );

-- Human-friendly, gap-tolerant numbers for orders and returns
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS return_number_seq START 101;

-- Stock can never go negative, and reserved can never exceed what is on hand
ALTER TABLE "InventoryLevel"
  ADD CONSTRAINT "InventoryLevel_nonnegative" CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand");

-- Prices are positive and never above MRP
ALTER TABLE "Variant"
  ADD CONSTRAINT "Variant_price_check" CHECK ("price" > 0 AND ("mrp" IS NULL OR "price" <= "mrp"));

-- Ratings are 1 to 5
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

-- At most one captured online payment per order
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_one_captured_per_order"
  ON "Payment" ("orderId") WHERE "status" = 'CAPTURED';
