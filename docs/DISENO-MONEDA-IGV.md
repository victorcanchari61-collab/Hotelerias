# Diseño: dos monedas e IGV a extranjeros

Estado: **la moneda está construida; el IGV a extranjeros NO**, a propósito. Este documento deja
por escrito qué hay, qué falta y qué debe responder el contador antes de escribir una sola línea
de lógica tributaria.

---

## 1. Lo que ya está (monedas PEN y USD)

Se agregó **ahora** porque cambiarlo después, con reservas y comprobantes guardados, cuesta mucho más.

| Pieza | Dónde |
|---|---|
| Tablas `moneda` (PEN base, USD) y `tipo_cambio` (uno por día y moneda) | `backend/migrations/0006_moneda.sql` |
| `reserva.moneda`, `reserva.tipo_cambio_micro`, `reserva.total_pen_cent` | misma migración (con `CHECK`: en soles no hay tipo de cambio; en otra moneda siempre) |
| Conversión, validación y servicio | `backend/internal/moneda/` |
| Pantalla *Finanzas → Tipo de cambio* (`finanzas.tipocambio`) | `frontend/src/presentation/features/finanzas/` |
| Selector S/ · US$ en la web, con la preferencia recordada | `frontend/src/presentation/providers/MonedaProvider.tsx` |

### Reglas (decididas y probadas)

1. **Lista de precios y contabilidad en soles.** El motor de promociones decide SIEMPRE en soles; lo ya
   decidido se convierte, no se vuelve a decidir en dólares.
2. **Se convierte con la VENTA** del día (lo que cuesta un dólar). Compra y venta se guardan; solo la venta cotiza.
3. **Enteros, nunca decimales.** Importes en la unidad menor de su moneda; la tasa en *micro*
   (×1.000.000: `3.752` → `3752000`). Las tasas viajan como **texto** (`"3.752"`): un número JSON pasaría
   por coma flotante.
4. **Redondeo: mitad hacia arriba**, igual en Go y en TypeScript (se prueban los mismos casos en ambos lados).
5. **Las líneas suman exacto:** `precio/noche = conv(precio en soles)`, `subtotal = precio/noche × noches`,
   `descuento = conv(descuento en soles)` (sin pasar del subtotal), `total = subtotal − descuento`.
   El equivalente en soles (`total_pen_cent`) es el total convertido de vuelta; puede diferir en ±1–2
   céntimos del total en soles original, y eso es esperado.
6. **La reserva COPIA el tipo de cambio** con que se hizo. Corregir un día no mueve lo ya reservado.
7. **Sin tipo de cambio reciente no se cotiza en dólares** (se busca hasta 7 días atrás por fines de
   semana y feriados; pasado eso, error claro y la web deja de ofrecer dólares). Nunca se inventa una tasa.
8. **Los totales del panel** (importe confirmado) suman `total_pen_cent`: no se suman monedas distintas.

### Pendiente de la parte de monedas

- El tipo de cambio es **manual**. Importarlo de SUNAT/SBS queda para después (`fuente` ya lo contempla).
- No hay cobro todavía (ni pasarela): la reserva solo registra en qué moneda se ofreció.
- Si el huésped tarda y el tipo de cambio cambia entre cotizar y reservar, se cobra con el nuevo
  (la reserva muestra el total real). Se puede exigir recotizar como ya se hace con el precio de lista.

---

## 2. Lo que NO está: exoneración del IGV a extranjeros (el beneficio que se cita como "DL 919")

**Por qué no se programó.** Afecta tres cosas a la vez —el precio, el comprobante y la validación del
pasaporte y la fecha de ingreso— y las condiciones exactas (quién califica, cuántos días, con qué
documento) las debe confirmar el contador con la normativa **vigente**. Codificar una regla tributaria
a partir de memoria es emitir comprobantes mal hechos con apariencia de correctos.

### Preguntas para el contador (necesitamos las respuestas por escrito)

1. **¿Las tarifas publicadas incluyen IGV (18 %)?** De esto depende todo el cálculo: si lo incluyen, la
   exoneración *baja* el precio; si no, solo cambia el comprobante.
2. **¿Quién califica exactamente?** No domiciliado en el Perú. ¿Qué documento lo acredita (pasaporte,
   carné, otro)? ¿Basta el documento o hace falta el registro migratorio de ingreso?
3. **El tope de días de estadía.** ¿Cuál es hoy? ¿Se cuenta por ingreso al país o por estadía en el hotel?
   (Se suele citar 60 días por ingreso; **no tomarlo como dato**.)
4. **¿Qué pasa pasado el tope?** ¿Desde el día N+1 la noche es gravada y se emiten dos comprobantes, o toda
   la estadía pierde el beneficio?
5. **¿Aplica a todo lo que se factura** o solo al hospedaje? (Alimentos, minibar, spa, lavandería, eventos…)
6. **¿Cómo se redacta el comprobante?** Tipo de afectación del IGV por línea, leyenda obligatoria,
   serie, y qué documentos de sustento se guardan.
7. **Tipo de cambio para facturar en dólares:** ¿el de venta o el de compra de SUNAT, de qué fecha
   (emisión, estadía, pago)? Hoy el sistema cotiza con la *venta* del día cargada a mano.
8. **Reservas por agencia u OTA**: ¿cambia algo si quien paga no es el huésped?
9. **Si el huésped paga en dólares**, ¿el comprobante se emite en dólares o en soles con la conversión?

---

## 3. Diseño propuesto (se implementa cuando 1–9 estén respondidas)

La regla se **decide en recepción, no en la web**: la web puede informar *«si eres no domiciliado, tu
estadía puede estar exonerada de IGV»*, pero quien califica se comprueba con el documento en mano.

```
Web (reserva)  →  muestra el precio normal y avisa que puede aplicar la exoneración
Recepción      →  ficha de registro: documento (pasaporte), nacionalidad, domicilio, fecha de ingreso al país
Facturación    →  decide la afectación por línea y emite el comprobante
```

### Datos nuevos (esquema orientativo, no es una migración)

| Dónde | Qué |
|---|---|
| `recepcion.fichas` (permiso ya creado) | tipo y número de documento, nacionalidad, **domiciliado sí/no**, **fecha de ingreso al país**, ruta/archivo del sustento |
| Tarifa | `igv_incluido` (sí/no) según la respuesta 1 |
| Comprobante (línea) | `afectacion_igv` (gravado / exonerado …), `base_cent`, `igv_cent` |
| Comprobante | `moneda`, `tipo_cambio_micro`, `total_pen_cent`, leyenda, referencia a la ficha que sustenta la exoneración |

### Reglas a implementar (todas como funciones puras sobre enteros, con pruebas por tabla)

- `calificaExoneracion(ficha, checkIn, checkOut, hoy)` → `{califica, nochesExoneradas, nochesGravadas, motivo}`.
- `desglosarIGV(precio, incluido)` → base e IGV con redondeo mitad hacia arriba, sin decimales.
- Validaciones de ficha: fecha de ingreso al país **no posterior** al check-in, ni futura; pasaporte con
  formato razonable; el tope de días de la respuesta 3.
- Cada caso que el contador dé como ejemplo se vuelve **una fila de prueba**: esa es la forma de que la
  regla quede escrita y no solo "creída".

### Facturación (XML, CDR, PDF)

Como se analizó antes: **PostgreSQL es la fuente de verdad**; el XML firmado, el CDR de SUNAT y el PDF se
guardan como **archivos** y la base guarda solo sus metadatos (ruta, hash, estado ante SUNAT). No hace
falta MongoDB.

---

## 4. Riesgos si se hace sin confirmar

- Comprobantes con afectación equivocada (multas y notas de crédito).
- Un tope de días mal puesto que exonere de más o de menos.
- Dólares facturados con un tipo de cambio que no es el aceptable para la contabilidad.
