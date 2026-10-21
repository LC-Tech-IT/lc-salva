-- =========================================================
-- Salva — Desarrollado y respaldado por LC Tech
-- 20261022: el dueño puede borrar el historial de escaneos de sus pulseras
-- (botón "Borrar Historial" del panel). Sin esta política, RLS bloquea el
-- DELETE en silencio y no se elimina ninguna fila.
-- =========================================================
drop policy if exists "dueño borra sus escaneos" on public.escaneos_ubicacion;
create policy "dueño borra sus escaneos" on public.escaneos_ubicacion
  for delete to authenticated
  using (exists (select 1 from public.portadores p where p.pulsera_id = escaneos_ubicacion.pulsera_id and p.usuario_id = auth.uid()));

grant delete on public.escaneos_ubicacion to authenticated;
