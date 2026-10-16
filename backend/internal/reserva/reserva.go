// Package reserva es la reserva que hace un huésped por la web: cotizarla con
// el mejor descuento que le corresponda, comprobar que haya habitación y
// guardarla sin que dos personas se lleven la última.
package reserva

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/cliente"
	"hotelerias/backend/internal/hotel"
	"hotelerias/backend/internal/platform/fecha"
	"hotelerias/backend/internal/platform/httpx"
	"hotelerias/backend/internal/promocion"
)

var (
	ErrNoEncontrada      = errors.New("reserva: no encontrada")
	ErrSinDisponibilidad = errors.New("reserva: ya no quedan habitaciones de ese tipo para esas fechas")
	// ErrPrecioCambio: el precio del tipo cambió entre que se cotizó y se reservó.
	// Se pide volver a cotizar en vez de cobrar algo que el huésped no vio.
	ErrPrecioCambio    = errors.New("reserva: el precio cambió, vuelve a cotizar")
	ErrCodigoDuplicado = errors.New("reserva: código de reserva repetido")
	ErrNoCancelable    = errors.New("reserva: ya no se puede cancelar")
)

type Estado string

const (
	Confirmada Estado = "confirmada"
	Cancelada  Estado = "cancelada"
	Completada Estado = "completada"
)

const maxNotas = 500

// Reserva es una estadía reservada. Los importes y el descuento están COPIADOS:
// si la oferta cambia o se apaga, la reserva conserva lo que se le ofreció.
type Reserva struct {
	ID     int64  `json:"id"`
	Codigo string `json:"codigo"`

	ClienteID     int64  `json:"clienteId"`
	ClienteNombre string `json:"clienteNombre"`
	ClienteEmail  string `json:"clienteEmail"`

	SedeID           int64  `json:"sedeId"`
	SedeNombre       string `json:"sedeNombre"`
	TipoHabitacionID int64  `json:"tipoHabitacionId"`
	Habitacion       string `json:"habitacion"`

	CheckIn   fecha.Fecha `json:"checkIn"`
	CheckOut  fecha.Fecha `json:"checkOut"`
	Huespedes int         `json:"huespedes"`
	Noches    int         `json:"noches"`

	PrecioNocheCent int64 `json:"precioNocheCent"`
	SubtotalCent    int64 `json:"subtotalCent"`
	DescuentoCent   int64 `json:"descuentoCent"`
	TotalCent       int64 `json:"totalCent"`

	DescuentoOrigen string `json:"descuentoOrigen"`
	DescuentoNombre string `json:"descuentoNombre"`
	PromocionID     *int64 `json:"promocionId"`

	Estado   Estado    `json:"estado"`
	Notas    string    `json:"notas"`
	CreadoEn time.Time `json:"creadoEn"`
}

// Solicitud es lo que pide el huésped. Nada de importes: los calcula el servidor.
type Solicitud struct {
	TipoHabitacionID int64       `json:"tipoHabitacionId"`
	CheckIn          fecha.Fecha `json:"checkIn"`
	CheckOut         fecha.Fecha `json:"checkOut"`
	Huespedes        int         `json:"huespedes"`
	Codigo           string      `json:"codigo"`
	Notas            string      `json:"notas"`
}

// Cotizacion es el precio que el huésped verá y pagará.
type Cotizacion struct {
	SedeID           int64  `json:"sedeId"`
	SedeNombre       string `json:"sedeNombre"`
	TipoHabitacionID int64  `json:"tipoHabitacionId"`
	Habitacion       string `json:"habitacion"`

	CheckIn   fecha.Fecha `json:"checkIn"`
	CheckOut  fecha.Fecha `json:"checkOut"`
	Noches    int         `json:"noches"`
	Huespedes int         `json:"huespedes"`

	PrecioNocheCent int64               `json:"precioNocheCent"`
	SubtotalCent    int64               `json:"subtotalCent"`
	Descuento       promocion.Descuento `json:"descuento"`
	TotalCent       int64               `json:"totalCent"`

	Disponibles int `json:"disponibles"`

	// Codigo es el que el huésped escribió; CodigoValido dice si esa oferta
	// existe y le corresponde a esta estadía (aunque otra le dé más descuento).
	Codigo       string `json:"codigo"`
	CodigoValido bool   `json:"codigoValido"`

	// TipoCliente es el tipo con el que se cotizó ("" si es un visitante).
	TipoCliente string `json:"tipoCliente"`
}

// Nueva es lo que el repositorio guarda. Ya viene calculada y validada.
type Nueva struct {
	Codigo           string
	ClienteID        int64
	SedeID           int64
	TipoHabitacionID int64
	CheckIn          fecha.Fecha
	CheckOut         fecha.Fecha
	Huespedes        int
	Noches           int
	PrecioNocheCent  int64
	SubtotalCent     int64
	DescuentoCent    int64
	TotalCent        int64
	DescuentoOrigen  string
	DescuentoNombre  string
	PromocionID      *int64
	Notas            string
}

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	// Crear guarda la reserva comprobando la disponibilidad DENTRO de la misma
	// transacción que la inserta, con el tipo de habitación bloqueado: dos
	// peticiones simultáneas por la última habitación no pueden pasar las dos.
	// Devuelve ErrSinDisponibilidad, ErrPrecioCambio o ErrCodigoDuplicado.
	Crear(ctx context.Context, n Nueva) (Reserva, error)
	PorCodigo(ctx context.Context, codigo string) (Reserva, error)
	PorID(ctx context.Context, id int64) (Reserva, error)
	DeCliente(ctx context.Context, clienteID int64) ([]Reserva, error)
	// Listar es para el personal. estado "" = todas. sedeIDs nil = de todas las
	// sedes; una lista (aunque vacía) limita a esas: la vacía no devuelve nada.
	Listar(ctx context.Context, estado Estado, sedeIDs []int64) ([]Reserva, error)
	// Cancelar pasa una reserva CONFIRMADA a cancelada. false si ya no lo estaba.
	Cancelar(ctx context.Context, id int64) (bool, error)
}

// Catalogo es lo que se necesita saber de los hoteles.
type Catalogo interface {
	Sede(ctx context.Context, id int64) (hotel.Sede, error)
	Tipo(ctx context.Context, id int64) (hotel.TipoHabitacion, error)
	Ocupadas(ctx context.Context, tipoID int64, desde, hasta fecha.Fecha) (int, error)
}

// Ofertas son las promociones vigentes.
type Ofertas interface {
	Vigentes(ctx context.Context) ([]promocion.Promocion, error)
}

// Huespedes es lo que se necesita del huésped.
type Huespedes interface {
	// Perfil devuelve al huésped; una cuenta inexistente o desactivada es
	// auth.ErrSesionInvalida.
	Perfil(ctx context.Context, id int64) (cliente.Cliente, error)
	Reclasificar(ctx context.Context, id int64) error
}

// Servicio cotiza y reserva. No sabe de HTTP.
type Servicio struct {
	repo      Repositorio
	catalogo  Catalogo
	ofertas   Ofertas
	huespedes Huespedes
	hoy       func() fecha.Fecha
	// codigo genera el código de reserva (reemplazable en pruebas).
	codigo func() string
}

func NewServicio(repo Repositorio, cat Catalogo, ofertas Ofertas, h Huespedes, hoy func() fecha.Fecha) *Servicio {
	return &Servicio{repo: repo, catalogo: cat, ofertas: ofertas, huespedes: h, hoy: hoy, codigo: NuevoCodigo}
}

// cargar valida la solicitud y trae lo que hace falta para cotizarla.
func (s *Servicio) cargar(ctx context.Context, sol Solicitud) (hotel.TipoHabitacion, hotel.Sede, error) {
	if err := hotel.ValidarFechas(s.hoy(), sol.CheckIn, sol.CheckOut); err != nil {
		return hotel.TipoHabitacion{}, hotel.Sede{}, err
	}
	if sol.Huespedes < 1 {
		return hotel.TipoHabitacion{}, hotel.Sede{}, httpx.Validacion("Indica cuántos huéspedes son")
	}

	tipo, err := s.catalogo.Tipo(ctx, sol.TipoHabitacionID)
	if err != nil {
		return hotel.TipoHabitacion{}, hotel.Sede{}, err
	}
	if sol.Huespedes > tipo.Capacidad {
		return hotel.TipoHabitacion{}, hotel.Sede{}, httpx.Validacion(
			fmt.Sprintf("Esa habitación admite hasta %d huéspedes", tipo.Capacidad))
	}
	sede, err := s.catalogo.Sede(ctx, tipo.SedeID)
	if err != nil {
		return hotel.TipoHabitacion{}, hotel.Sede{}, err
	}
	return tipo, sede, nil
}

// cotizar calcula el precio. `huesped` es nil para un visitante.
func (s *Servicio) cotizar(ctx context.Context, tipo hotel.TipoHabitacion, sede hotel.Sede, huesped *cliente.Cliente, sol Solicitud) (Cotizacion, promocion.Descuento, error) {
	est := promocion.Estadia{
		SedeID:          sede.ID,
		CheckIn:         sol.CheckIn,
		CheckOut:        sol.CheckOut,
		PrecioNocheCent: tipo.PrecioNocheCent,
		Codigo:          sol.Codigo,
	}
	var beneficio *promocion.Beneficio
	tipoCliente := ""
	if huesped != nil {
		est.TipoClienteID = huesped.TipoClienteID
		tipoCliente = huesped.TipoCliente
		if huesped.DescuentoPct > 0 {
			beneficio = &promocion.Beneficio{Nombre: huesped.TipoCliente, Pct: huesped.DescuentoPct}
		}
	}

	promos, err := s.ofertas.Vigentes(ctx)
	if err != nil {
		return Cotizacion{}, promocion.Descuento{}, err
	}
	d := promocion.Mejor(promos, est, beneficio)

	codigo := strings.TrimSpace(sol.Codigo)
	valido := false
	if codigo != "" {
		for _, p := range promos {
			if p.Codigo != nil && strings.EqualFold(*p.Codigo, codigo) && p.Aplica(est) {
				valido = true
			}
		}
	}

	ocupadas, err := s.catalogo.Ocupadas(ctx, tipo.ID, sol.CheckIn, sol.CheckOut)
	if err != nil {
		return Cotizacion{}, promocion.Descuento{}, err
	}
	libres := max(tipo.Cantidad-ocupadas, 0)

	sub := est.SubtotalCent()
	return Cotizacion{
		SedeID: sede.ID, SedeNombre: sede.Nombre,
		TipoHabitacionID: tipo.ID, Habitacion: tipo.Nombre,
		CheckIn: sol.CheckIn, CheckOut: sol.CheckOut, Noches: est.Noches(), Huespedes: sol.Huespedes,
		PrecioNocheCent: tipo.PrecioNocheCent, SubtotalCent: sub,
		Descuento: d, TotalCent: sub - d.TotalCent,
		Disponibles: libres,
		Codigo:      codigo, CodigoValido: valido,
		TipoCliente: tipoCliente,
	}, d, nil
}

// Cotizar es público: un visitante ve el precio de lista y, si ya entró, el que
// le corresponde por su tipo. clienteID 0 = visitante.
func (s *Servicio) Cotizar(ctx context.Context, clienteID int64, sol Solicitud) (Cotizacion, error) {
	tipo, sede, err := s.cargar(ctx, sol)
	if err != nil {
		return Cotizacion{}, err
	}
	var huesped *cliente.Cliente
	if clienteID != 0 {
		c, err := s.huespedes.Perfil(ctx, clienteID)
		if err != nil {
			return Cotizacion{}, err
		}
		huesped = &c
	}
	q, _, err := s.cotizar(ctx, tipo, sede, huesped, sol)
	return q, err
}

// Reservar guarda la reserva. El precio y el descuento los calcula AQUÍ: nada
// de lo que mande el navegador sobre importes se usa.
func (s *Servicio) Reservar(ctx context.Context, clienteID int64, sol Solicitud) (Reserva, error) {
	if clienteID == 0 {
		return Reserva{}, auth.ErrSesionInvalida
	}
	notas := strings.TrimSpace(sol.Notas)
	if len([]rune(notas)) > maxNotas {
		return Reserva{}, httpx.Validacion(fmt.Sprintf("Las notas no pueden pasar de %d caracteres", maxNotas))
	}

	tipo, sede, err := s.cargar(ctx, sol)
	if err != nil {
		return Reserva{}, err
	}
	huesped, err := s.huespedes.Perfil(ctx, clienteID)
	if err != nil {
		return Reserva{}, err
	}
	if !huesped.Activo {
		return Reserva{}, auth.ErrCuentaInactiva
	}

	q, d, err := s.cotizar(ctx, tipo, sede, &huesped, sol)
	if err != nil {
		return Reserva{}, err
	}
	if q.Disponibles < 1 {
		return Reserva{}, ErrSinDisponibilidad
	}

	n := Nueva{
		ClienteID: clienteID, SedeID: sede.ID, TipoHabitacionID: tipo.ID,
		CheckIn: sol.CheckIn, CheckOut: sol.CheckOut, Huespedes: sol.Huespedes, Noches: q.Noches,
		PrecioNocheCent: q.PrecioNocheCent, SubtotalCent: q.SubtotalCent,
		DescuentoCent: d.TotalCent, TotalCent: q.TotalCent,
		DescuentoOrigen: string(d.Origen), DescuentoNombre: d.Nombre, PromocionID: d.PromocionID,
		Notas: notas,
	}

	var creada Reserva
	for intento := 0; ; intento++ {
		n.Codigo = s.codigo()
		creada, err = s.repo.Crear(ctx, n)
		if !errors.Is(err, ErrCodigoDuplicado) || intento >= 4 {
			break
		}
	}
	if err != nil {
		return Reserva{}, err
	}

	// La reserva ya está hecha: que falle la reclasificación no la deshace. Se
	// corrige sola en la próxima.
	if err := s.huespedes.Reclasificar(ctx, clienteID); err != nil {
		log.Printf("reserva: no se pudo reclasificar al cliente %d: %v", clienteID, err)
	}
	return creada, nil
}

// DeCliente son las reservas del huésped.
func (s *Servicio) DeCliente(ctx context.Context, clienteID int64) ([]Reserva, error) {
	return s.repo.DeCliente(ctx, clienteID)
}

// Cancelar anula una reserva del huésped. Se puede hasta el día anterior a la
// entrada; después es una gestión con el hotel. Una reserva ajena responde igual
// que una inexistente: no se revela que el código existe.
func (s *Servicio) Cancelar(ctx context.Context, clienteID int64, codigo string) (Reserva, error) {
	r, err := s.repo.PorCodigo(ctx, strings.ToUpper(strings.TrimSpace(codigo)))
	if err != nil {
		return Reserva{}, err
	}
	if r.ClienteID != clienteID {
		return Reserva{}, ErrNoEncontrada
	}
	if r.Estado != Confirmada {
		return Reserva{}, ErrNoCancelable
	}
	if !r.CheckIn.Despues(s.hoy()) {
		return Reserva{}, ErrNoCancelable
	}
	return s.anular(ctx, r)
}

// CancelarPorPersonal anula sin la restricción de fechas: el personal puede
// cancelar una reserva aunque la estadía ya haya empezado. sedeIDs es lo que la
// persona alcanza a ver (nil = todas): una reserva de otra sede responde como
// si no existiera.
func (s *Servicio) CancelarPorPersonal(ctx context.Context, id int64, sedeIDs []int64) (Reserva, error) {
	r, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Reserva{}, err
	}
	if !enAlcance(sedeIDs, r.SedeID) {
		return Reserva{}, ErrNoEncontrada
	}
	if r.Estado != Confirmada {
		return Reserva{}, ErrNoCancelable
	}
	return s.anular(ctx, r)
}

func (s *Servicio) anular(ctx context.Context, r Reserva) (Reserva, error) {
	ok, err := s.repo.Cancelar(ctx, r.ID)
	if err != nil {
		return Reserva{}, err
	}
	if !ok {
		return Reserva{}, ErrNoCancelable // alguien la canceló entre medio
	}
	if err := s.huespedes.Reclasificar(ctx, r.ClienteID); err != nil {
		log.Printf("reserva: no se pudo reclasificar al cliente %d: %v", r.ClienteID, err)
	}
	r.Estado = Cancelada
	return r, nil
}

// Listar es para el personal. sedeIDs es lo que la persona alcanza a ver (nil = todas).
func (s *Servicio) Listar(ctx context.Context, estado Estado, sedeIDs []int64) ([]Reserva, error) {
	switch estado {
	case "", Confirmada, Cancelada, Completada:
		return s.repo.Listar(ctx, estado, sedeIDs)
	}
	return nil, httpx.Validacion("Estado no válido")
}

// enAlcance dice si una sede está dentro de lo que la persona alcanza a ver.
func enAlcance(sedeIDs []int64, sedeID int64) bool {
	if sedeIDs == nil {
		return true
	}
	for _, id := range sedeIDs {
		if id == sedeID {
			return true
		}
	}
	return false
}

// alfabeto sin 0/O, 1/I/L: el código se lee por teléfono.
const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// NuevoCodigo genera "HV-XXXX-XXXX". 31^8 combinaciones: adivinar uno ajeno no es práctico
// y, además, cancelar exige ser el dueño de la reserva.
func NuevoCodigo() string {
	b := make([]byte, 8)
	max := big.NewInt(int64(len(alfabeto)))
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic(fmt.Sprintf("reserva: sin aleatoriedad del sistema: %v", err))
		}
		b[i] = alfabeto[n.Int64()]
	}
	return "HV-" + string(b[:4]) + "-" + string(b[4:])
}
