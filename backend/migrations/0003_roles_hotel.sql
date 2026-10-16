-- Roles base de una cadena hotelera.
--
-- 0001 sembró "Vendedor" y "Almacenero", que venían del proyecto de distribución
-- del que se tomó la lógica de permisos y no describen a este negocio. Los roles
-- son DATOS (el administrador crea los suyos sin tocar código); esto solo
-- cambia los de arranque. Sus permisos no se tocan: una matriz vacía sigue vacía.

-- "Vendedor" → "Recepcionista". Se conserva el id: las personas ya asignadas y
-- su matriz siguen donde estaban.
UPDATE rol
   SET nombre = 'Recepcionista',
       descripcion = 'Check-in, check-out, reservas y cargos a la habitación.'
 WHERE nombre = 'Vendedor' AND del_sistema;

UPDATE rol
   SET descripcion = 'Inventario, compras e insumos: amenidades, lencería y alimentos.'
 WHERE nombre = 'Almacenero' AND del_sistema;

-- Los demás no son "del sistema": el administrador puede renombrarlos o borrarlos.
INSERT INTO rol (nombre, descripcion) VALUES
    ('Gerente de sede', 'Opera una sede: ocupación, equipo, caja y reportes.'),
    ('Housekeeping',    'Limpieza y estado de las habitaciones.'),
    ('Restaurante',     'Salón, cocina y servicio a la habitación.')
ON CONFLICT (nombre) DO NOTHING;
