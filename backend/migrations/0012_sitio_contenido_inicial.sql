-- Contenido inicial de muestra del sitio web, para que la web no salga vacía la primera vez.
-- Es texto general, sin precios, horarios, aforos ni premios inventados. El personal lo
-- edita o lo borra desde el panel (Sitio web); esta migración corre una sola vez.

INSERT INTO experiencia (slug, titulo, resumen, texto, ejemplos, orden) VALUES
    ('spa-y-bienestar', 'Spa y bienestar', 'Bajar el ritmo después del viaje.',
     'Tratamientos, circuitos de agua y espacios de silencio para descansar de la altura, del vuelo o de la ciudad. Cada hotel adapta la carta de tratamientos a su paisaje.',
     ARRAY['Masajes y rituales', 'Circuito de agua', 'Sala de descanso'], 1),
    ('mesa-y-bodega', 'Mesa y bodega', 'Cocina peruana, de tu mesa a tu habitación.',
     'Restaurantes con cocina de autor basada en producto de cada región, carta de vinos y pisco, y servicio a la habitación para cuando prefieras quedarte.',
     ARRAY['Restaurante del hotel', 'Carta de vinos y pisco', 'Servicio a la habitación'], 2),
    ('eventos-y-salones', 'Eventos y salones', 'Bodas, reuniones y banquetes.',
     'Salones que se arman a la medida del evento, con menú propuesto por la cocina y un coordinador que lo acompaña de principio a fin. Escríbenos con la fecha y el número de invitados.',
     ARRAY['Bodas y celebraciones', 'Reuniones de empresa', 'Banquetes'], 3),
    ('travesias', 'Travesías', 'Excursiones y traslados que armamos contigo.',
     'El conserje te propone recorridos según el destino —sitios arqueológicos, costa, campiña, pueblos— y coordina el traslado privado. Todo se confirma antes de tu llegada.',
     ARRAY['Excursiones guiadas', 'Traslados privados', 'Rutas entre los cuatro hoteles'], 4),
    ('mayordomia', 'Mayordomía', 'Alguien atento a lo que necesites.',
     'Un punto de contacto para resolver lo pequeño y lo urgente: una reserva en un restaurante, una entrada, una maleta que no llega, una mascota que viaja contigo.',
     ARRAY['Reservas y entradas', 'Atención de equipaje', 'Mascotas bienvenidas'], 5)
ON CONFLICT (slug) DO NOTHING;

UPDATE pagina SET
    titulo = 'Una sola casa',
    cuerpo = E'Hotel Velothr son cuatro hoteles en cuatro ciudades del Perú —Lima, Cusco, Arequipa y Paracas— que se atienden como una sola casa.\n\n## Una cuenta para los cuatro\n\nTu categoría de huésped te acompaña en todos los hoteles: mientras más nos eliges, mejor el precio.\n\n## Cada lugar a su manera\n\nCada hotel cuenta su ciudad a su manera; la casa es la misma.'
WHERE clave = 'nosotros' AND cuerpo = '';

UPDATE pagina SET
    titulo = 'Escríbenos',
    cuerpo = 'Una pregunta, un grupo, un evento: cuéntanos y te respondemos.'
WHERE clave = 'contacto' AND cuerpo = '';
