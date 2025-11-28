-- Migration: Add class_exceptions table
-- Created: 2025-11-26
-- Purpose: Store exceptions for class sessions (holidays, cancellations, special events)

CREATE TABLE IF NOT EXISTS class_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type VARCHAR(50) NOT NULL DEFAULT 'holiday',
  reason TEXT,
  tenant_id UUID NOT NULL REFERENCES academies(tenant_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_class_exception UNIQUE (class_id, exception_date)
);

-- Indexes for performance
CREATE INDEX idx_class_exceptions_class_id ON class_exceptions(class_id);
CREATE INDEX idx_class_exceptions_date ON class_exceptions(exception_date);
CREATE INDEX idx_class_exceptions_tenant_id ON class_exceptions(tenant_id);
CREATE INDEX idx_class_exceptions_type ON class_exceptions(exception_type);

-- Comments
COMMENT ON TABLE class_exceptions IS 'Excepciones para generación de sesiones de clase (festivos, cancelaciones, etc.)';
COMMENT ON COLUMN class_exceptions.exception_type IS 'Tipo de excepción: holiday, cancellation, special_event, maintenance';
COMMENT ON COLUMN class_exceptions.reason IS 'Razón de la excepción (ej: "Día festivo nacional", "Mantenimiento de instalaciones")';

-- RLS Policies
ALTER TABLE class_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_exceptions_select" ON class_exceptions;
CREATE POLICY "class_exceptions_select" ON class_exceptions
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

DROP POLICY IF EXISTS "class_exceptions_modify" ON class_exceptions;
CREATE POLICY "class_exceptions_modify" ON class_exceptions
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

COMMENT ON POLICY "class_exceptions_select" ON class_exceptions IS 
  'Permite a admins y usuarios del mismo tenant ver excepciones';

COMMENT ON POLICY "class_exceptions_modify" ON class_exceptions IS 
  'Permite a admins y usuarios del mismo tenant gestionar excepciones';
