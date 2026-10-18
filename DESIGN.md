---
name: Hotel Velothr (web pública)
description: Etiquetas de hotel litografiadas pegadas en un baúl de cuero oscuro; un solo violeta de sello de aduana para lo activo.
colors:
  cuero: "#1a110d"
  cuero-2: "#241812"
  cuero-3: "#33231a"
  hilo: "#c79a62"
  hilo-suave: "#7d5f3d"
  hilo-claro: "#dcb47c"
  papel: "#efe8d8"
  papel-2: "#fbf7ec"
  tinta: "#1d1612"
  tinta-suave: "#5f5043"
  texto-sobre-cuero: "#f2eadb"
  texto-suave-sobre-cuero: "#cdbfa8"
  linea-cuero: "#3d2c21"
  lima: "#0f6e73"
  lima-on: "#e6f3f1"
  lima-trazo: "#9ad0cb"
  cusco: "#b23f25"
  cusco-on: "#fbeee6"
  cusco-trazo: "#f0b49e"
  arequipa: "#ecebe3"
  arequipa-on: "#23282c"
  arequipa-trazo: "#2c5d8a"
  paracas: "#243b86"
  paracas-on: "#f6e7b8"
  paracas-trazo: "#e9b73a"
  sello: "#6d3fd0"
  sello-claro: "#b79cff"
  peligro-sobre-papel: "#a8321f"
  peligro-sobre-cuero: "#ff9b88"
typography:
  etiqueta:
    fontFamily: "Bahnschrift, 'DIN Condensed', 'Avenir Next Condensed', 'Roboto Condensed', 'Arial Narrow', 'Liberation Sans Narrow', 'Noto Sans Condensed', system-ui, sans-serif"
    fontSize: "2.1rem"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.04em"
  nota:
    fontFamily: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.375
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.375
rounded:
  etiqueta: "3px"
  papel: "4px"
  sello: "6px"
spacing:
  etiqueta-interior: "24px"
  contenedor-max: "72rem"
components:
  papel:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.papel}"
  etiqueta-hotel:
    backgroundColor: "{colors.lima}"
    textColor: "{colors.lima-on}"
    rounded: "{rounded.etiqueta}"
    padding: "24px"
  boton-hilo-lleno:
    backgroundColor: "{colors.hilo}"
    textColor: "{colors.cuero}"
    rounded: "{rounded.etiqueta}"
    height: "36px"
    padding: "0 14px"
  boton-hilo-lleno-hover:
    backgroundColor: "{colors.hilo-claro}"
  boton-hilo-contorno:
    textColor: "{colors.hilo}"
    rounded: "{rounded.etiqueta}"
    height: "36px"
  sello:
    textColor: "{colors.sello}"
    rounded: "{rounded.sello}"
    padding: "0.55rem 0.9rem"
---

# Design System: Hotel Velothr (web pública)

## Overview

**Creative North Star: "El baúl del viajero"**

Cuatro hoteles son cuatro etiquetas litografiadas pegadas en un mismo baúl: una casa, cuatro destinos. El suelo es cuero curtido casi negro con grano fino y viñeta; lo que se lee y se rellena vive en papel de etiqueta; lo que ordena la página es un pespunte de hilo color camello. La web se sitúa en la cadena de hoteles del Perú (Lima, Cusco, Arequipa, Paracas) y rehúsa la web de hotel de lujo de siempre: foto a sangre, buscador flotante, tarjetas iguales.

La densidad es media y calmada. El color es escaso a propósito: cuero y papel dominan, cada hotel trae su tinta solo dentro de su etiqueta, y el violeta del sello de aduana aparece únicamente donde algo está activo o confirmado. Las fotos las pone el personal desde el panel; el sistema nunca fabrica una imagen.

El alcance es solo la web pública (`/`). El panel `/admin` usa otro kit y queda fuera de este sistema.

**Key Characteristics:**
- Dos superficies: cuero oscuro (suelo) y papel claro (formularios y texto largo).
- Una tinta por hotel, una tinta violeta para lo activo.
- Capitales condensadas para etiquetas; serif itálica para notas; sistema para texto corrido.
- Separadores punteados (pespunte) en vez de líneas sólidas.
- Movimiento propio: la etiqueta se pega, el sello cae.

## Colors

Paleta de cuero, papel e hilo, con cuatro tintas de hotel y una sola tinta de sello.

### Primary
- **Violeta de sello de aduana** (`sello` #6d3fd0; `sello-claro` #b79cff sobre cuero): la ÚNICA tinta de lo activo o confirmado. Sello de «Reservado» y «Recibido», categoría actual de huésped en el pasaporte, anillo de la reserva recién hecha, miniatura activa de la galería, cursor de texto y foco dentro de un papel. `sello` sobre papel, `sello-claro` sobre cuero.

### Secondary (tintas de hotel; fondo / texto / trazo)
- **Teal del Pacífico, Lima** (#0f6e73 / #e6f3f1 / #9ad0cb).
- **Terracota de achiote, Cusco** (#b23f25 / #fbeee6 / #f0b49e).
- **Blanco sillar con carbón, Arequipa** (#ecebe3 / #23282c / #2c5d8a).
- **Índigo con mostaza, Paracas** (#243b86 / #f6e7b8 / #e9b73a).
Una tinta vive solo dentro de la etiqueta de su hotel; la clave `imagen` del servidor (ciudad, andino, colonial, costa) elige la tinta, y las desconocidas caen en Lima.

### Tertiary
- **Hilo de camello** (`hilo` #c79a62; `hilo-suave` #7d5f3d; `hilo-claro` #dcb47c hover): acento de interfaz sobre cuero: enlace de navegación activo, botones, foco, selección, pespunte, bordes punteados.

### Neutral
- **Cuero** (#1a110d), **Cuero 2** (#241812), **Cuero 3** (#33231a): suelo y superficies sobre el cuero.
- **Papel** (#efe8d8) y **Papel 2** (#fbf7ec): etiqueta de papel y sus superficies internas.
- **Tinta** (#1d1612) y **Tinta suave** (#5f5043): texto sobre papel.
- **Texto sobre cuero** (#f2eadb) y **suave** (#cdbfa8); línea sobre cuero (#3d2c21).
- **Peligro**: #a8321f sobre papel, #ff9b88 sobre cuero.

### Named Rules
**The One Seal Rule.** El violeta no decora jamás. Solo señala lo activo, lo actual o lo confirmado; si algo no está en ese estado, no lleva violeta.
**The One Ink Per Hotel Rule.** La tinta de un hotel no sale de su etiqueta ni se usa para otra cosa.

## Typography

**Display / Label Font:** Bahnschrift con pila condensada de sistema (`'DIN Condensed'`, `'Roboto Condensed'`, `'Arial Narrow'`… hasta `system-ui`)
**Note Font:** Iowan Old Style / Palatino / Georgia (serif del sistema), siempre en cursiva
**Body Font:** `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

**Character:** Solo fuentes del sistema, por decisión del usuario. Capitales condensadas de etiqueta contra una nota manuscrita-serif; el texto corrido es neutro y de ancho normal.

### Hierarchy
- **Etiqueta grande** (700, 2.1rem, 0.95): nombre del hotel en su etiqueta; titulares de banner usan `clamp(1.6rem, 4vw, 2.4rem)` con 0.92.
- **Etiqueta** (700, 0.95rem a 1.125rem, 0.04em, mayúsculas, `font-stretch: 75%`): navegación, botones, ciudad, categorías.
- **Sello** (800, 1.45rem el título, 0.72rem el detalle; 0.06em y 0.14em; mayúsculas): texto del sello de aduana.
- **Nota** (cursiva, ~1.125rem, leading snug): subtítulos y frases cortas de voz cálida.
- **Body** (400, 0.875rem a 1rem, leading snug): texto corrido y descripciones.

### Named Rules
**The Condensed Caps Rule.** Las capitales condensadas son para etiquetas, nombres y botones; el texto de lectura nunca va en mayúsculas condensadas.
**The Tabular Price Rule.** Cifras de precio y contadores usan `font-variant-numeric: tabular-nums` (clase `v-num`).

## Layout

Contenedor centrado de máximo 72rem (`max-w-6xl`) con 16px de margen lateral. Cabecera de cuero fija solo desde `sm`, separada por un pespunte punteado de 2px; pie con el mismo pespunte arriba. El ritmo vertical se marca con filas separadas por pespuntes (`border-y-2 border-dashed`). La navegación se desplaza en horizontal en móvil. En pantallas de hasta 640px los giros de las etiquetas pasan a 0deg para que el texto no se corte. Las etiquetas de hotel miden al menos 21rem de alto con 24px de relleno.

## Elevation & Depth

Híbrido: el volumen viene de grano, viñeta y sombras suaves y difusas, nunca de bordes duros. El papel proyecta `0 14px 28px -12px rgb(0 0 0 / 0.65), 0 2px 4px rgb(0 0 0 / 0.35)`. La etiqueta de hotel usa `drop-shadow(0 12px 14px rgb(0 0 0 / 0.55)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.4))` en una caja exterior (la máscara de esquinas recortaría la sombra si fuera del mismo elemento) y la profundiza al apuntar o enfocar.

### Named Rules
**The Shadow On The Box Rule.** La sombra de una etiqueta troquelada va en `.v-etiqueta-caja`, nunca en el elemento enmascarado.

## Shapes

Esquinas casi rectas: 3px en etiquetas y botones, 4px en papeles y marcos, 6px en el sello. Las etiquetas de hotel tienen cuatro muescas redondas troqueladas (círculo de 11px en cada esquina) y un marco impreso de 1.5px a 10px del borde. Lo vacío o agotado se dibuja con borde punteado (2px dashed). El sello lleva borde doble de 3px y una máscara moteada de tinta. Giros de etiqueta: -3deg, 2.2deg, -1.4deg y 3deg.

## Components

### Papel
Superficie clara donde viven formularios y texto largo. Redefine `--color-*` y `--accent*` para que los componentes del kit se lean claros dentro de él (acento tinta #2b1b14, anillo de foco en violeta al 40%). Esquina de 4px, fibra de papel en ruido, sombra de papel.

### Etiqueta de hotel
Enlace a un hotel: fondo en la tinta del hotel, ruido de litografía, emblema centrado (6rem), ciudad y estrellas arriba, nombre en capitales, descripción a tres líneas máximo y «Ver el hotel». Entra con `v-pegar` (760ms, escalonado 140ms por índice), al apuntar o enfocar sube 8px y gira un 40% de su giro (transición 420ms). El foco va por dentro (contorno de 2px con offset -6px) por la máscara.

### Etiqueta fantasma
Lo agotado o sin datos se dibuja, no se apaga: borde 2px punteado al 55% del color de texto, fondo transparente, esquina de 3px. Se usa en habitaciones agotadas (con «Agotada» en etiqueta punteada), «Sin confirmar» y listas vacías.

### Sello de aduana
`Sello titulo detalle`: texto «Velothr» pequeño, título grande, detalle opcional; girado -7deg. `cae` activa `v-sellar` (520ms, retraso 380ms) una sola vez; `sobreCuero` usa el violeta claro. Con «reducir movimiento» conserva una aparición de 200ms sin golpe.

### Botones
Altura 36px, esquina de 3px, texto de etiqueta de 0.95rem. Lleno: fondo hilo, texto cuero, hover #dcb47c. Contorno: borde y texto hilo, hover se rellena. Selector de moneda: botones con `aria-pressed`, el activo relleno de hilo (no de violeta). Dentro de un papel el kit usa el acento tinta.

### Navegación y placa
Enlaces en capitales condensadas; el activo va en hilo con subrayado punteado. La «placa» de latón (degradado #e3c08a a #b98f57, dos remaches) es el logotipo provisional; no hay logo definitivo.

### Pasaporte de categorías
Círculos de 7rem con borde de 3px: categoría actual con borde doble en violeta claro; alcanzadas con borde sólido de hilo; pendientes con borde punteado. Los separadores entre ellas son pespuntes.

### Fotos, galería y carrusel
Marco de 4px con borde punteado de hilo suave sobre cuero. Si no hay archivo, `FotoSitio` no dibuja nada y el llamador pone un recuadro punteado (en habitaciones, con el ícono de cama); nunca se inventa una imagen. El carrusel rota cada 7s, se detiene al apuntar, enfocar o pausar, y no rota con «reducir movimiento»; su texto va en un `Papel` sobre un degradado de cuero, de modo que nunca depende de la foto.

## Do's and Don'ts

### Do:
- **Do** poner las fotos solo desde el panel (Sitio web); el personal las sube con su descripción.
- **Do** mostrar un recuadro punteado de hilo suave (2px dashed #7d5f3d) cuando falta una foto, en vez de inventar o poner una de relleno.
- **Do** poner todo texto largo editable en un `Papel` y dibujarlo con `TextoRico`, nunca como HTML.
- **Do** reservar el violeta (#6d3fd0 sobre papel, #b79cff sobre cuero) para lo activo, actual o confirmado.
- **Do** dibujar lo agotado o inexistente como etiqueta fantasma punteada.
- **Do** dejar todo contenido visible sin animación y respetar `prefers-reduced-motion`.
- **Do** usar un nombre de hotel corto (`nombreCorto`) en la etiqueta y el nombre completo para lectores de pantalla.

### Don't:
- **Don't** usar el violeta como decoración, énfasis ni color de botón.
- **Don't** usar la tinta de un hotel fuera de su etiqueta.
- **Don't** inyectar HTML del panel con `dangerouslySetInnerHTML`.
- **Don't** apagar lo agotado bajándole la opacidad; se dibuja fantasma.
- **Don't** aplicar este sistema al panel `/admin`, que usa otro kit.
- **Don't** presentar como real lo que es de muestra; el pie lo declara.
- **Don't** poner una animación que oculte contenido en su estado inicial.
