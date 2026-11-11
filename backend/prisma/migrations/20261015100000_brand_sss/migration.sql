-- Store renamed to SSS Furniture: new products default to the house brand.
ALTER TABLE "Product" ALTER COLUMN "brand" SET DEFAULT 'SSS Furniture';
UPDATE "Product" SET "brand" = 'SSS Furniture' WHERE "brand" = 'Aangan';
