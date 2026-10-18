// Package demo siembra datos de muestra (sedes, habitaciones, tipos de cliente y
// ofertas) para poder recorrer el portal sin cargar nada a mano.
//
// Solo corre si la config lo pide (Demo.Datos) y solo cuando todavía no hay
// ninguna sede: nunca pisa ni duplica datos reales.
package demo

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"hotelerias/backend/internal/platform/fecha"
)

type sede struct {
	nombre, ciudad, direccion, descripcion, imagen string
	estrellas                                      int
	servicios                                      []string
	// factor sobre la tarifa base, en %: Cusco y Paracas cuestan más que Arequipa.
	factor int
}

type habitacion struct {
	nombre, descripcion, camas, imagen string
	capacidad, area, base, cantidad    int
	amenidades                         []string
}

var sedes = []sede{
	{
		nombre: "Velothr Miraflores", ciudad: "Lima", imagen: "ciudad", estrellas: 5, factor: 100,
		direccion:   "Malecón de la Reserva 1200, Miraflores",
		descripcion: "Frente al Pacífico, con piscina infinita en la azotea y cocina de autor abierta las 24 horas.",
		servicios:   []string{"Mayordomo", "Conserje de llaves", "Gastronomía 24/7 en la habitación", "Spa y bienestar", "Piscina infinita", "Check-in privado", "Traslado de lujo"},
	},
	{
		nombre: "Velothr Cusco Casona Imperial", ciudad: "Cusco", imagen: "andino", estrellas: 5, factor: 115,
		direccion:   "Calle Plateros 340, Centro Histórico",
		descripcion: "Una casona virreinal restaurada a pasos de la Plaza de Armas, con oxígeno suplementario en cada suite.",
		servicios:   []string{"Mayordomo", "Conserje de llaves", "Spa y bienestar", "Bodega de vinos", "Check-in privado", "Experiencias a medida", "Concierge de mascotas"},
	},
	{
		nombre: "Velothr Arequipa Plaza", ciudad: "Arequipa", imagen: "colonial", estrellas: 5, factor: 90,
		direccion:   "Portal de San Agustín 105, Plaza de Armas",
		descripcion: "Sillar y patios con vista al Misti, con terraza-mirador y salón de cigarros.",
		servicios:   []string{"Conserje de llaves", "Terraza y salón de cigarros", "Bodega de vinos", "Spa y bienestar", "Gastronomía 24/7 en la habitación", "Check-in privado"},
	},
	{
		nombre: "Velothr Paracas Resort", ciudad: "Paracas", imagen: "costa", estrellas: 5, factor: 120,
		direccion:   "Av. Paracas Km 14, Bahía de Paracas",
		descripcion: "Cabañas frente a la bahía, piscinas infinitas y helipuerto para llegar desde Lima en veinte minutos.",
		servicios:   []string{"Mayordomo", "Helipuerto y traslado de lujo", "Piscinas infinitas y cabañas", "Spa y bienestar", "Gastronomía 24/7 en la habitación", "Experiencias a medida"},
	},
}

var habitaciones = []habitacion{
	{
		nombre: "Habitación Deluxe", imagen: "deluxe", capacidad: 2, area: 32, base: 38000, cantidad: 12, camas: "1 cama King",
		descripcion: "Luminosa y silenciosa, con escritorio y baño de mármol.",
		amenidades:  []string{"Amenities de baño de diseñador", "Menú de almohadas", "Tecnología de habitación", "Regalo de bienvenida"},
	},
	{
		nombre: "Suite Ejecutiva", imagen: "ejecutiva", capacidad: 3, area: 52, base: 62000, cantidad: 6, camas: "1 cama King + sofá cama",
		descripcion: "Sala separada, acceso al lounge ejecutivo y desayuno a la carta.",
		amenidades:  []string{"Amenities de baño de diseñador", "Menú de almohadas", "Lounge ejecutivo", "Tecnología de habitación", "Regalo de bienvenida"},
	},
	{
		nombre: "Suite Presidencial", imagen: "presidencial", capacidad: 4, area: 110, base: 145000, cantidad: 2, camas: "2 camas King",
		descripcion: "Dos dormitorios, comedor privado y mayordomo dedicado.",
		amenidades:  []string{"Mayordomo dedicado", "Check-in privado", "Amenities de baño de diseñador", "Menú de almohadas", "Cocina de autor en la suite", "Regalo de bienvenida"},
	},
}

// Sembrar crea los datos de muestra. Devuelve false (sin error) si no hizo nada
// porque ya había sedes.
func Sembrar(ctx context.Context, pool *pgxpool.Pool, hoy fecha.Fecha) (bool, error) {
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM sede`).Scan(&n); err != nil {
		return false, err
	}
	if n > 0 {
		return false, nil
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	sedeIDs := map[string]int64{}
	for _, s := range sedes {
		var id int64
		err := tx.QueryRow(ctx, `
			INSERT INTO sede (nombre, ciudad, direccion, descripcion, estrellas, imagen, servicios)
			VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
			s.nombre, s.ciudad, s.direccion, s.descripcion, s.estrellas, s.imagen, s.servicios).Scan(&id)
		if err != nil {
			return false, fmt.Errorf("demo: sede %s: %w", s.nombre, err)
		}
		sedeIDs[s.ciudad] = id

		for piso, h := range habitaciones {
			// Redondeado a S/ 10 para que los precios se vean como de hotel.
			precio := int64(h.base) * int64(s.factor) / 100
			precio = (precio + 500) / 1000 * 1000
			var tipoID int64
			err := tx.QueryRow(ctx, `
				INSERT INTO tipo_habitacion (sede_id, nombre, descripcion, capacidad, camas, area_m2,
				                             precio_noche_cent, cantidad, amenidades, imagen)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
				id, h.nombre, h.descripcion, h.capacidad, h.camas, h.area, precio, h.cantidad, h.amenidades, h.imagen).Scan(&tipoID)
			if err != nil {
				return false, fmt.Errorf("demo: habitación %s: %w", h.nombre, err)
			}
			// Las habitaciones físicas: un piso por tipo (101, 102… / 201, 202…). La
			// cantidad del tipo la recalcula la base al insertarlas.
			for n := 1; n <= h.cantidad; n++ {
				_, err := tx.Exec(ctx, `
					INSERT INTO habitacion (sede_id, tipo_habitacion_id, numero, piso)
					VALUES ($1,$2,$3,$4)`, id, tipoID, fmt.Sprintf("%d%02d", piso+1, n), piso+1)
				if err != nil {
					return false, fmt.Errorf("demo: habitación %s n.º %d: %w", h.nombre, n, err)
				}
			}
		}
	}

	tipoIDs := map[string]int64{}
	tipos := []struct {
		nombre, descripcion string
		pct                 int
		minimas             *int
		orden               int
	}{
		{"Regular", "Huésped nuevo o con pocas estadías.", 0, nil, 0},
		{"Frecuente", "Ya nos eligió varias veces.", 5, ptr(3), 1},
		{"VIP", "Nuestros huéspedes más fieles.", 10, ptr(6), 2},
		{"Corporativo", "Cuenta de empresa con convenio. Se asigna a mano.", 8, nil, 3},
	}
	for _, t := range tipos {
		var id int64
		err := tx.QueryRow(ctx, `
			INSERT INTO tipo_cliente (nombre, descripcion, descuento_pct, reservas_minimas, orden)
			VALUES ($1,$2,$3,$4,$5) RETURNING id`,
			t.nombre, t.descripcion, t.pct, t.minimas, t.orden).Scan(&id)
		if err != nil {
			return false, fmt.Errorf("demo: tipo de cliente %s: %w", t.nombre, err)
		}
		tipoIDs[t.nombre] = id
	}

	// Ofertas vigentes un año desde hoy, para que la demo no "caduque" al día siguiente.
	desde, hasta := hoy.Time(), hoy.Mas(365).Time()
	cusco, paracas, vip := sedeIDs["Cusco"], sedeIDs["Paracas"], tipoIDs["VIP"]
	ofertas := []struct {
		nombre, descripcion, tipo string
		pct                       *int
		montoNoche                *int64
		codigo                    *string
		sede, tipoCliente         *int64
		minNoches                 int
	}{
		{"Bienvenida 10%", "10% menos en tu primera reserva con el código.", "porcentaje", ptr(10), nil, ptr("BIENVENIDO10"), nil, nil, 1},
		{"Escapada de 3 noches", "15% menos al quedarte tres noches o más.", "porcentaje", ptr(15), nil, nil, nil, nil, 3},
		{"Larga estadía", "20% menos desde siete noches.", "porcentaje", ptr(20), nil, nil, nil, nil, 7},
		{"Cusco: S/ 80 menos por noche", "Descuento fijo por noche en la Casona Imperial desde dos noches.", "monto_noche", nil, ptr(int64(8000)), nil, &cusco, nil, 2},
		{"Verano en Paracas", "12% menos frente a la bahía.", "porcentaje", ptr(12), nil, nil, &paracas, nil, 2},
		{"Solo VIP: 18% menos", "Tarifa exclusiva para huéspedes VIP.", "porcentaje", ptr(18), nil, nil, nil, &vip, 1},
	}
	for _, o := range ofertas {
		_, err := tx.Exec(ctx, `
			INSERT INTO promocion (nombre, descripcion, tipo, porcentaje, monto_noche_cent, codigo,
			                       sede_id, tipo_cliente_id, desde, hasta, min_noches)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			o.nombre, o.descripcion, o.tipo, o.pct, o.montoNoche, o.codigo, o.sede, o.tipoCliente, desde, hasta, o.minNoches)
		if err != nil {
			return false, fmt.Errorf("demo: oferta %s: %w", o.nombre, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	return true, nil
}

func ptr[T any](v T) *T { return &v }
