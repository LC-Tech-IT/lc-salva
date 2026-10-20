-- =========================================================
-- LC SALVA — LIMPIEZA DE PRUEBAS Y ASIGNACIÓN VIP DEL CREADOR
-- Ejecutar en: Supabase Dashboard > SQL Editor > RUN
-- =========================================================

-- 1. Eliminar los dos registros de prueba antiguos (Ithan Andres y Lee Castro de prueba)
DELETE FROM public.portadores
WHERE pulsera_id IN (
  SELECT id FROM public.pulseras WHERE codigo_qr IN ('LCSB-1001', 'LCSB-2001')
);

-- 2. Restablecer el estado de esas pulseras a disponible
UPDATE public.pulseras
SET estado = 'disponible'
WHERE codigo_qr IN ('LCSB-1001', 'LCSB-2001');

-- 3. Crear las 2 Pulseras VIP Salva Pro GPS definitivas del Creador
INSERT INTO public.pulseras (codigo_qr, estado, tipo_plan)
VALUES
  ('SALVA-P-CREADOR1', 'disponible', 'pro'),
  ('SALVA-P-CREADOR2', 'disponible', 'pro')
ON CONFLICT (codigo_qr) DO UPDATE 
SET estado = 'disponible', tipo_plan = 'pro';

-- 4. Confirmación de consulta
SELECT codigo_qr, estado, tipo_plan 
FROM public.pulseras 
WHERE codigo_qr LIKE 'SALVA-P-CREADOR%';
