# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Huésped que reserva (la web pública, en `/`):** turista o viajero del Perú y del extranjero que compara hoteles de la cadena, mira habitaciones y precios y reserva. Para reservar tiene que iniciar sesión (mirar y cotizar no lo exige). La web va **solo en español por ahora**; el inglés queda como mejora futura, no como requisito.
- **Personal del hotel (el panel, en `/admin`):** recepción, limpieza, administración. Es otra mitad del producto, con su propio inicio de sesión; esta ficha se ocupa de la web pública.

## Product Purpose

Hotel Velothr es una cadena de cuatro hoteles en el Perú (Lima, Cusco, Arequipa y Paracas). La web pública permite conocer cada hotel, ver habitaciones y precios en soles o dólares, aplicar ofertas y beneficios de su categoría de huésped y reservar con el precio ya calculado. Éxito: que un visitante entienda en segundos qué ofrece cada hotel, confíe en el precio que ve y termine la reserva.

## Positioning

Una cadena con cuatro destinos distintos bajo una sola cuenta de huésped: el precio y el descuento que se ven son los que se cobran (los calcula el servidor, no el navegador) y el huésped sube de categoría solo, según cuántas veces reserva.

## Operating Context

- Las tarifas están en soles; el huésped puede ver y reservar en dólares con el tipo de cambio del día, que se muestra. Sin tipo de cambio vigente no se ofrece dólares.
- Los hoteles son: Velothr Miraflores (Lima), Velothr Cusco Casona Imperial, Velothr Arequipa Plaza y Velothr Paracas Resort. Cada hotel tiene tipos de habitación (Deluxe, Suite Ejecutiva, Suite Presidencial) con capacidad, camas, área y amenidades.
- Categorías de huésped: Regular, Frecuente, VIP y Corporativo, con un porcentaje de descuento y una regla automática por número de reservas (Corporativo se asigna a mano). Descuento por oferta y por categoría no se acumulan: gana el mayor.
- Hay horarios de check-in y check-out configurables, que la web muestra.
- Al reservar no hay todavía cobro ni pasarela de pago.

## Capabilities and Constraints

- Ya existe: portada con buscador, página de cada hotel con disponibilidad y precio, ofertas, registro e ingreso de huésped, reservar, «mis reservas» y cancelar, selector de moneda.
- **Contenido que hoy no existe y se quiere crear**: experiencias y servicios (spa, restaurantes, eventos y salones), página de detalle de cada tipo de habitación, programa de fidelización y membresías, y páginas «Nosotros» y «Contacto».
- Los datos de hoteles, habitaciones, ofertas y categorías son **de muestra** (demostración). Nada de lo mostrado debe presentarse como real sin marcarlo.
- El servidor es la fuente del precio: la web no calcula importes que se cobran.
- Pendiente de decisión: textos reales de cada hotel, políticas de cancelación y condiciones de las membresías.

## Brand Commitments

- Nombre: **Hotel Velothr**. Voz en español, sencilla y cálida.
- No hay logo, fotos ni identidad gráfica definidos todavía; el logo actual es un ícono genérico.
- Se busca que se perciba como una cadena de hoteles de lujo.

## Evidence on Hand

- **No hay fotos reales ni logo.** El usuario pidió **buscar fotos libres de derechos** (uso comercial permitido, con su origen anotado); cada foto que se use debe tener su licencia y fuente registradas.
- Los textos y datos de hoteles y habitaciones salen de la demostración sembrada en la base (`backend/internal/demo`); son sintéticos.
- No hay testimonios, reseñas, premios ni cifras reales: **no se inventan**.

## Product Principles

1. **El precio que se ve es el que se cobra.** Nada de importes calculados en el navegador para cobrar; las conversiones a dólares muestran el tipo de cambio.
2. **Reservar es corto.** Del hotel a la reserva sin pasos de más; la cuenta se pide cuando hace falta, no antes.
3. **Honestidad con lo de muestra.** Lo que no es real se marca como de muestra y se puede reemplazar sin rehacer el diseño.
4. **Español primero, preparado para crecer.** Se escribe para español; la estructura no debe impedir sumar inglés después.
5. **Cuatro destinos, una sola casa.** Cada hotel tiene identidad propia, pero se reconoce una sola cadena y una sola cuenta.

## Accessibility & Inclusion

No se estableció un estándar propio; se espera un mínimo razonable (contraste, uso con teclado, texto legible, respeto de «reducir movimiento» en las animaciones).
