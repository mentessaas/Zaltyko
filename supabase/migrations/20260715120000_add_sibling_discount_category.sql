-- Cobros y cuotas (deuda): categoría de descuento por hermanos.
--
-- Añade 'sibling' a discount_category para poder modelar descuentos por varios
-- hijos de la misma familia como categoría propia. Idempotente (PG12+).

ALTER TYPE "discount_category" ADD VALUE IF NOT EXISTS 'sibling';
