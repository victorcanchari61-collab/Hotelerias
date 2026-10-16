// Package moneda son las monedas con que opera la cadena (soles y dólares) y el
// tipo de cambio de cada día.
//
// Todo el dinero del sistema son enteros en la unidad menor de su moneda. La
// lista de precios y la contabilidad van en soles (la base); el huésped puede
// ver y pagar en dólares, convertido con el tipo de cambio del día, que la
// reserva COPIA para que lo ya reservado no cambie si el cambio cambia.
package moneda

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
)

// Base es la moneda de la lista de precios y de la contabilidad.
const Base = "PEN"

// Micro es la escala del tipo de cambio: 3.752 se guarda como 3_752_000.
const Micro int64 = 1_000_000

// DiasAtras es cuánto se retrocede para encontrar un tipo de cambio cuando hoy
// no hay uno (fines de semana y feriados no se publica): pasada una semana sin
// ninguno es mejor negarse a cotizar en dólares que usar un dato viejo.
const DiasAtras = 7

var (
	ErrSinTipoCambio = errors.New("moneda: no hay un tipo de cambio vigente")
	ErrNoSoportada   = errors.New("moneda: moneda no disponible")
)

type Moneda struct {
	Codigo    string `json:"codigo"`
	Nombre    string `json:"nombre"`
	Simbolo   string `json:"simbolo"`
	Decimales int    `json:"decimales"`
	Base      bool   `json:"base"`
	Activa    bool   `json:"activa"`
}

// TipoCambio es el cambio de un día. Compra y venta van ×1.000.000.
type TipoCambio struct {
	ID            int64       `json:"id"`
	Fecha         fecha.Fecha `json:"fecha"`
	Moneda        string      `json:"moneda"`
	CompraMicro   int64       `json:"compraMicro"`
	VentaMicro    int64       `json:"ventaMicro"`
	Fuente        string      `json:"fuente"`
	RegistradoPor string      `json:"registradoPor"`
	ActualizadoEn time.Time   `json:"actualizadoEn"`
}

// DePenA convierte soles (céntimos) a otra moneda con la VENTA, redondeando al
// centavo más cercano (mitad hacia arriba) y sin pasar por float.
func DePenA(penCent, ventaMicro int64) int64 {
	if ventaMicro <= 0 {
		return 0
	}
	return (penCent*Micro + ventaMicro/2) / ventaMicro
}

// APen convierte un importe de otra moneda a soles con la misma venta.
func APen(cent, ventaMicro int64) int64 {
	return (cent*ventaMicro + Micro/2) / Micro
}

// ParseTasa lee "3.752" (o "3,752") como micro. Acepta hasta 6 decimales y
// rechaza lo que no sea un número positivo plano: nada de notación científica,
// signos ni separadores de miles.
func ParseTasa(texto string) (int64, error) {
	t := strings.ReplaceAll(strings.TrimSpace(texto), ",", ".")
	ent, dec, _ := strings.Cut(t, ".")
	if ent == "" || len(dec) > 6 || len(ent) > 6 {
		return 0, fmt.Errorf("tasa %q no válida", texto)
	}
	for _, r := range ent + dec {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("tasa %q no válida", texto)
		}
	}
	e, _ := strconv.ParseInt(ent, 10, 64)
	d, _ := strconv.ParseInt((dec + "000000")[:6], 10, 64)
	micro := e*Micro + d
	if micro <= 0 {
		return 0, fmt.Errorf("la tasa debe ser mayor que cero")
	}
	return micro, nil
}

// FormatoTasa deja 3_752_000 como "3.752" (mínimo 3 decimales, sin ceros de más).
func FormatoTasa(micro int64) string {
	s := fmt.Sprintf("%d.%06d", micro/Micro, micro%Micro)
	s = strings.TrimRight(s, "0")
	if i := strings.IndexByte(s, '.'); len(s)-i-1 < 3 {
		s += strings.Repeat("0", 3-(len(s)-i-1))
	}
	return s
}

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	Monedas(ctx context.Context) ([]Moneda, error)
	// UltimoHasta es el tipo de cambio más reciente de `moneda` con fecha <= hasta y >= desde.
	UltimoHasta(ctx context.Context, moneda string, desde, hasta fecha.Fecha) (TipoCambio, error)
	Historial(ctx context.Context, moneda string, limite int) ([]TipoCambio, error)
	// Guardar inserta o corrige el de ese día y moneda.
	Guardar(ctx context.Context, t TipoCambio, actor int64) (TipoCambio, error)
}

// Servicio son las reglas de las monedas y del tipo de cambio.
type Servicio struct {
	repo      Repositorio
	hoy       func() fecha.Fecha
	auditoria auditoria.Registrador
}

func NewServicio(repo Repositorio, hoy func() fecha.Fecha, aud auditoria.Registrador) *Servicio {
	return &Servicio{repo: repo, hoy: hoy, auditoria: aud}
}

func (s *Servicio) Monedas(ctx context.Context) ([]Moneda, error) { return s.repo.Monedas(ctx) }

// Vigente devuelve el tipo de cambio para operar HOY en esa moneda. Para la
// base no hay conversión y no se pide.
func (s *Servicio) Vigente(ctx context.Context, moneda string) (TipoCambio, error) {
	moneda = strings.ToUpper(strings.TrimSpace(moneda))
	if moneda == Base {
		return TipoCambio{}, errors.New("moneda: la moneda base no tiene tipo de cambio")
	}
	monedas, err := s.repo.Monedas(ctx)
	if err != nil {
		return TipoCambio{}, err
	}
	ok := false
	for _, m := range monedas {
		ok = ok || (m.Codigo == moneda && m.Activa && !m.Base)
	}
	if !ok {
		return TipoCambio{}, ErrNoSoportada
	}

	hoy := s.hoy()
	return s.repo.UltimoHasta(ctx, moneda, hoy.Mas(-DiasAtras), hoy)
}

// Publico es lo que ve la web: las monedas activas y, de las que no son base,
// el tipo de cambio de hoy (si no hay, esa moneda no se ofrece para cotizar).
type Publico struct {
	Monedas    []Moneda              `json:"monedas"`
	TipoCambio map[string]TipoPublic `json:"tipoCambio"`
}

type TipoPublic struct {
	Fecha      fecha.Fecha `json:"fecha"`
	VentaMicro int64       `json:"ventaMicro"`
}

func (s *Servicio) Publico(ctx context.Context) (Publico, error) {
	todas, err := s.repo.Monedas(ctx)
	if err != nil {
		return Publico{}, err
	}
	out := Publico{Monedas: []Moneda{}, TipoCambio: map[string]TipoPublic{}}
	for _, m := range todas {
		if !m.Activa {
			continue
		}
		out.Monedas = append(out.Monedas, m)
		if m.Base {
			continue
		}
		t, err := s.Vigente(ctx, m.Codigo)
		if errors.Is(err, ErrSinTipoCambio) {
			continue
		}
		if err != nil {
			return Publico{}, err
		}
		out.TipoCambio[m.Codigo] = TipoPublic{Fecha: t.Fecha, VentaMicro: t.VentaMicro}
	}
	return out, nil
}

func (s *Servicio) Historial(ctx context.Context, moneda string, limite int) ([]TipoCambio, error) {
	if limite < 1 || limite > 365 {
		limite = 60
	}
	return s.repo.Historial(ctx, strings.ToUpper(strings.TrimSpace(moneda)), limite)
}

// Entrada es lo que registra el personal. Las tasas llegan como TEXTO ("3.752"):
// un número JSON pasaría por float y 3.752 no es exacto en binario.
type Entrada struct {
	Fecha  fecha.Fecha `json:"fecha"`
	Moneda string      `json:"moneda"`
	Compra string      `json:"compra"`
	Venta  string      `json:"venta"`
}

// Guardar registra (o corrige) el tipo de cambio de un día.
func (s *Servicio) Guardar(ctx context.Context, e Entrada, actor int64) (TipoCambio, error) {
	moneda := strings.ToUpper(strings.TrimSpace(e.Moneda))
	if moneda == "" || moneda == Base {
		return TipoCambio{}, httpx.Validacion("Elige la moneda extranjera (la base no lleva tipo de cambio)")
	}
	monedas, err := s.repo.Monedas(ctx)
	if err != nil {
		return TipoCambio{}, err
	}
	conocida := false
	for _, m := range monedas {
		conocida = conocida || (m.Codigo == moneda && !m.Base)
	}
	if !conocida {
		return TipoCambio{}, httpx.Validacion("Esa moneda no existe")
	}

	hoy := s.hoy()
	switch {
	case e.Fecha.IsZero():
		return TipoCambio{}, httpx.Validacion("Indica la fecha del tipo de cambio")
	case e.Fecha.Despues(hoy):
		return TipoCambio{}, httpx.Validacion("El tipo de cambio no puede ser de una fecha futura")
	case e.Fecha.Antes(hoy.Mas(-365)):
		return TipoCambio{}, httpx.Validacion("Esa fecha es demasiado antigua para registrarla aquí")
	}

	compra, err := ParseTasa(e.Compra)
	if err != nil {
		return TipoCambio{}, httpx.Validacion("La compra no es una tasa válida (por ejemplo 3.745)")
	}
	venta, err := ParseTasa(e.Venta)
	if err != nil {
		return TipoCambio{}, httpx.Validacion("La venta no es una tasa válida (por ejemplo 3.752)")
	}
	if venta < compra {
		return TipoCambio{}, httpx.Validacion("La venta no puede ser menor que la compra")
	}
	// Una tasa absurda (un cero de más) descuadraría toda la facturación del día.
	if venta > 20*Micro || compra < Micro/20 {
		return TipoCambio{}, httpx.Validacion("Esa tasa está fuera de lo razonable: revísala")
	}

	guardado, err := s.repo.Guardar(ctx, TipoCambio{Fecha: e.Fecha, Moneda: moneda, CompraMicro: compra, VentaMicro: venta, Fuente: "manual"}, actor)
	if err != nil {
		return TipoCambio{}, err
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "TipoCambio", EntidadID: fmt.Sprintf("%s %s", moneda, e.Fecha),
		Accion:  auditoria.Creado,
		Despues: map[string]any{"compra": FormatoTasa(compra), "venta": FormatoTasa(venta)},
	})
	return guardado, nil
}
