package permiso

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/httpx"
)

// --- Alcance de datos -------------------------------------------------------

// Alcance no dice QUÉ puede hacer una persona sino sobre QUÉ FILAS: todas las
// sedes o solo las suyas. Responde a la misma pregunta que los permisos (quién
// ve qué), a nivel de datos en vez de a nivel de botón.
type Alcance string

const (
	// TodasLasSedes es la ausencia de restricción.
	TodasLasSedes Alcance = "todas"
	// MisSedes limita a las sedes asignadas a la persona.
	MisSedes Alcance = "mis_sedes"
)

// AlcanceValido dice si el texto es un nivel que existe.
func AlcanceValido(a Alcance) bool { return a == TodasLasSedes || a == MisSedes }

// SubmodulosConAlcance son las pantallas cuyos datos se pueden acotar por sede.
// Solo las que de verdad aplican el filtro: ofrecer en la configuración una
// restricción que el backend nunca aplica sería mentirle al administrador.
var SubmodulosConAlcance = []string{"reservas.reservas"}

// ResolverAlcance decide el alcance efectivo. Es pura:
//
//   - El rol de acceso total no se restringe nunca.
//   - Lo de la PERSONA manda sobre lo del rol (el supervisor que es del rol
//     Recepcionista pero sí tiene que ver todo).
//   - Con varios roles gana el MÁS AMPLIO, igual que con los permisos: quien es
//     de dos roles no debe quedar limitado por uno de ellos.
//   - Un rol sin fila para esa pantalla no restringe ("todas"): un alcance
//     restrictivo por defecto habría dejado a todo el mundo sin ver nada.
func ResolverAlcance(accesoTotal bool, propio *Alcance, delRol []Alcance) Alcance {
	if accesoTotal {
		return TodasLasSedes
	}
	if propio != nil {
		return *propio
	}
	if len(delRol) == 0 {
		return TodasLasSedes
	}
	for _, a := range delRol {
		if a == TodasLasSedes {
			return TodasLasSedes
		}
	}
	return MisSedes
}

// --- Excepciones ------------------------------------------------------------

// ExcepcionDetalle es una excepción tal como la ve la pantalla de Accesos:
// vigente o ya gastada, revocada o vencida.
type ExcepcionDetalle struct {
	ID          int64      `json:"id"`
	UsuarioID   int64      `json:"usuarioId"`
	Submodulo   string     `json:"submodulo"`
	Accion      string     `json:"accion"`
	Vigencia    Vigencia   `json:"vigencia"`
	ExpiraEn    *time.Time `json:"expiraEn"`
	Usos        int        `json:"usos"`
	Revocado    bool       `json:"revocado"`
	Motivo      string     `json:"motivo"`
	OtorgadoPor string     `json:"otorgadoPor"`
	Fecha       time.Time  `json:"fechaOtorgado"`
	Vigente     bool       `json:"vigente"`
}

// ExcepcionNueva es lo que se concede.
type ExcepcionNueva struct {
	UsuarioID   int64
	Clave       Clave
	Vigencia    Vigencia
	ExpiraEn    *time.Time
	Motivo      string
	OtorgadoPor int64
}

// --- Solicitudes ------------------------------------------------------------

type EstadoSolicitud string

const (
	Pendiente EstadoSolicitud = "pendiente"
	Aprobada  EstadoSolicitud = "aprobada"
	Rechazada EstadoSolicitud = "rechazada"
)

// Solicitud es un permiso que alguien pidió al toparse con una acción bloqueada.
type Solicitud struct {
	ID              int64           `json:"id"`
	UsuarioID       int64           `json:"usuarioId"`
	Usuario         string          `json:"usuario"`
	Submodulo       string          `json:"submodulo"`
	Accion          string          `json:"accion"`
	Motivo          string          `json:"motivo"`
	Referencia      string          `json:"referencia"`
	Estado          EstadoSolicitud `json:"estado"`
	FechaSolicitud  time.Time       `json:"fechaSolicitud"`
	FechaResolucion *time.Time      `json:"fechaResolucion"`
	Respuesta       string          `json:"respuesta"`
}

// SolicitudNueva es lo que pide la persona.
type SolicitudNueva struct {
	UsuarioID  int64
	Clave      Clave
	Motivo     string
	Referencia string
}

var (
	ErrSolicitudNoEncontrada = errors.New("permiso: solicitud no encontrada")
	ErrYaResuelta            = errors.New("permiso: la solicitud ya fue resuelta")
	ErrExcepcionNoEncontrada = errors.New("permiso: excepción no encontrada")
	ErrUsuarioNoEncontrado   = errors.New("permiso: usuario no encontrado")
)

// GestionStore es lo que la gestión necesita de la base.
type GestionStore interface {
	Excepciones(ctx context.Context, usuarioID int64) ([]ExcepcionDetalle, error)
	CrearExcepcion(ctx context.Context, n ExcepcionNueva) (ExcepcionDetalle, error)
	// Revocar devuelve false si no existe.
	Revocar(ctx context.Context, id int64) (bool, error)

	// CrearSolicitud devuelve la que ya estaba abierta si la persona repite el pedido.
	CrearSolicitud(ctx context.Context, n SolicitudNueva) (Solicitud, error)
	SolicitudesDe(ctx context.Context, usuarioID int64) ([]Solicitud, error)
	Bandeja(ctx context.Context, soloPendientes bool) ([]Solicitud, error)
	// Aprobar concede la excepción y cierra la solicitud EN UNA TRANSACCIÓN:
	// dos admins con la bandeja abierta no pueden conceder dos veces.
	Aprobar(ctx context.Context, id, adminID int64, vigencia Vigencia, expira *time.Time, respuesta string) (Solicitud, error)
	Rechazar(ctx context.Context, id, adminID int64, respuesta string) (Solicitud, error)

	AlcancesDeRol(ctx context.Context, rolID int64) (map[string]Alcance, error)
	GuardarAlcancesRol(ctx context.Context, rolID int64, a map[string]Alcance) error
	AlcancesDeUsuario(ctx context.Context, usuarioID int64) (map[string]Alcance, error)
	GuardarAlcancesUsuario(ctx context.Context, usuarioID int64, a map[string]Alcance, concedidoPor int64) error
	// AlcancesDeRoles trae, por rol, la fila de ese submódulo (si la hay).
	AlcancesDeRoles(ctx context.Context, rolIDs []int64, submodulo string) (map[int64]Alcance, error)
	SedesDe(ctx context.Context, usuarioID int64) ([]int64, error)
}

// Gestion son las operaciones que el administrador hace sobre los permisos:
// conceder excepciones, resolver solicitudes y acotar por sede.
type Gestion struct {
	store     GestionStore
	catalogo  *Catalogo
	usuarios  UsuarioRoles
	auditoria auditoria.Registrador
	now       func() time.Time
}

func NewGestion(store GestionStore, cat *Catalogo, usuarios UsuarioRoles, aud auditoria.Registrador) *Gestion {
	return &Gestion{store: store, catalogo: cat, usuarios: usuarios, auditoria: aud, now: time.Now}
}

func (g *Gestion) validarClave(cl Clave) error {
	if !g.catalogo.EsValido(cl) {
		return httpx.Validacion(fmt.Sprintf("'%s' no es una acción de %s", cl.Accion, cl.Submodulo))
	}
	return nil
}

// vigencia valida la combinación vigencia/vencimiento y normaliza: fuera de
// Temporal la fecha no significa nada y, guardada, confundiría a quien revise
// por qué caducó algo que no caduca.
func (g *Gestion) vigencia(v Vigencia, expira *time.Time) (*time.Time, error) {
	switch v {
	case UnaVez, Permanente:
		return nil, nil
	case Temporal:
		if expira == nil {
			return nil, httpx.Validacion("Un permiso temporal necesita fecha de vencimiento")
		}
		if !expira.After(g.now()) {
			return nil, httpx.Validacion("El vencimiento tiene que ser una fecha futura")
		}
		return expira, nil
	}
	return nil, httpx.Validacion(fmt.Sprintf("Vigencia %q no válida (una_vez, temporal o permanente)", v))
}

func (g *Gestion) Excepciones(ctx context.Context, usuarioID int64) ([]ExcepcionDetalle, error) {
	return g.store.Excepciones(ctx, usuarioID)
}

// Conceder da a una persona algo que su rol no le da. Solo suma: no existe la
// excepción que quita, porque restar por persona convertiría cada "¿por qué no
// puede?" en revisar dos sitios.
func (g *Gestion) Conceder(ctx context.Context, n ExcepcionNueva) (ExcepcionDetalle, error) {
	if err := g.validarClave(n.Clave); err != nil {
		return ExcepcionDetalle{}, err
	}
	exp, err := g.vigencia(n.Vigencia, n.ExpiraEn)
	if err != nil {
		return ExcepcionDetalle{}, err
	}
	n.ExpiraEn = exp
	n.Motivo = strings.TrimSpace(n.Motivo)

	creada, err := g.store.CrearExcepcion(ctx, n)
	if err != nil {
		return ExcepcionDetalle{}, err
	}
	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: n.OtorgadoPor, Entidad: "Permiso", EntidadID: fmt.Sprint(creada.ID), Accion: auditoria.Creado,
		Despues: map[string]any{
			"usuarioId": n.UsuarioID, "permiso": n.Clave.String(), "vigencia": string(n.Vigencia),
			"expiraEn": n.ExpiraEn, "motivo": n.Motivo,
		},
	})
	return creada, nil
}

// Revocar retira una excepción antes de que venza o se gaste. La fila no se
// borra: queda quién tuvo qué.
func (g *Gestion) Revocar(ctx context.Context, id, actor int64) error {
	ok, err := g.store.Revocar(ctx, id)
	if err != nil {
		return err
	}
	if !ok {
		return ErrExcepcionNoEncontrada
	}
	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Permiso", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
		Antes: map[string]any{"revocado": false}, Despues: map[string]any{"revocado": true},
	})
	return nil
}

// Solicitar pide una acción con la que alguien se topó bloqueado. No exige
// ningún permiso a propósito: exigir uno para pedir permisos dejaría fuera
// justo a quien lo necesita.
func (g *Gestion) Solicitar(ctx context.Context, n SolicitudNueva) (Solicitud, error) {
	if err := g.validarClave(n.Clave); err != nil {
		return Solicitud{}, err
	}
	n.Motivo = strings.TrimSpace(n.Motivo)
	n.Referencia = strings.TrimSpace(n.Referencia)
	if len([]rune(n.Motivo)) > 500 {
		return Solicitud{}, httpx.Validacion("El motivo no puede pasar de 500 caracteres")
	}
	return g.store.CrearSolicitud(ctx, n)
}

func (g *Gestion) MisSolicitudes(ctx context.Context, usuarioID int64) ([]Solicitud, error) {
	return g.store.SolicitudesDe(ctx, usuarioID)
}

// Bandeja es la lista del administrador: lo pendiente primero.
func (g *Gestion) Bandeja(ctx context.Context, soloPendientes bool) ([]Solicitud, error) {
	return g.store.Bandeja(ctx, soloPendientes)
}

func (g *Gestion) Aprobar(ctx context.Context, id, adminID int64, v Vigencia, expira *time.Time, respuesta string) (Solicitud, error) {
	exp, err := g.vigencia(v, expira)
	if err != nil {
		return Solicitud{}, err
	}
	s, err := g.store.Aprobar(ctx, id, adminID, v, exp, strings.TrimSpace(respuesta))
	if err != nil {
		return Solicitud{}, err
	}
	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: adminID, Entidad: "SolicitudPermiso", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
		Antes:   map[string]any{"estado": string(Pendiente)},
		Despues: map[string]any{"estado": string(Aprobada), "permiso": s.Submodulo + ":" + s.Accion, "usuarioId": s.UsuarioID, "vigencia": string(v)},
	})
	return s, nil
}

func (g *Gestion) Rechazar(ctx context.Context, id, adminID int64, respuesta string) (Solicitud, error) {
	s, err := g.store.Rechazar(ctx, id, adminID, strings.TrimSpace(respuesta))
	if err != nil {
		return Solicitud{}, err
	}
	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: adminID, Entidad: "SolicitudPermiso", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
		Antes:   map[string]any{"estado": string(Pendiente)},
		Despues: map[string]any{"estado": string(Rechazada), "permiso": s.Submodulo + ":" + s.Accion, "usuarioId": s.UsuarioID},
	})
	return s, nil
}

// --- Alcances ---------------------------------------------------------------

func (g *Gestion) validarAlcances(a map[string]Alcance) error {
	for sub, nivel := range a {
		if !contiene(SubmodulosConAlcance, sub) {
			return httpx.Validacion(fmt.Sprintf("El submódulo %s no admite alcance", sub))
		}
		if !AlcanceValido(nivel) {
			return httpx.Validacion(fmt.Sprintf("El alcance %q no existe", nivel))
		}
	}
	return nil
}

func contiene(lista []string, s string) bool {
	for _, x := range lista {
		if x == s {
			return true
		}
	}
	return false
}

func (g *Gestion) AlcancesDeRol(ctx context.Context, rolID int64) (map[string]Alcance, error) {
	return g.store.AlcancesDeRol(ctx, rolID)
}

func (g *Gestion) GuardarAlcancesRol(ctx context.Context, rolID int64, a map[string]Alcance, actor int64) error {
	if err := g.validarAlcances(a); err != nil {
		return err
	}
	// "todas" es la ausencia de restricción: no se guarda en el rol, así la
	// tabla contiene solo lo que de verdad limita algo.
	limitantes := map[string]Alcance{}
	for sub, nivel := range a {
		if nivel != TodasLasSedes {
			limitantes[sub] = nivel
		}
	}
	if err := g.store.GuardarAlcancesRol(ctx, rolID, limitantes); err != nil {
		return err
	}
	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "AlcanceRol", EntidadID: fmt.Sprint(rolID), Accion: auditoria.Actualizado,
		Despues: alcancesAMapa(a),
	})
	return nil
}

func (g *Gestion) AlcancesDeUsuario(ctx context.Context, usuarioID int64) (map[string]Alcance, error) {
	return g.store.AlcancesDeUsuario(ctx, usuarioID)
}

func (g *Gestion) GuardarAlcancesUsuario(ctx context.Context, usuarioID int64, a map[string]Alcance, actor int64) error {
	if err := g.validarAlcances(a); err != nil {
		return err
	}
	// En la persona SÍ se guarda "todas": ahí es una excepción que ensancha lo
	// que su rol limita.
	if err := g.store.GuardarAlcancesUsuario(ctx, usuarioID, a, actor); err != nil {
		return err
	}
	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "AlcanceUsuario", EntidadID: fmt.Sprint(usuarioID), Accion: auditoria.Actualizado,
		Despues: alcancesAMapa(a),
	})
	return nil
}

func alcancesAMapa(a map[string]Alcance) map[string]any {
	out := make(map[string]any, len(a))
	for k, v := range a {
		out[k] = string(v)
	}
	return out
}

// Alcance resuelve el nivel efectivo de una persona sobre un submódulo.
func (g *Gestion) Alcance(ctx context.Context, usuarioID int64, submodulo string) (Alcance, error) {
	roles, err := g.usuarios.RolesDe(ctx, usuarioID)
	if err != nil {
		return "", err
	}
	// Sin usuario activo no hay nada que acotar: quien no entra, no ve.
	if roles.AccesoTotal || len(roles.RolIDs) == 0 {
		return TodasLasSedes, nil
	}

	propios, err := g.store.AlcancesDeUsuario(ctx, usuarioID)
	if err != nil {
		return "", err
	}
	var propio *Alcance
	if a, ok := propios[submodulo]; ok {
		propio = &a
	}

	delRol, err := g.store.AlcancesDeRoles(ctx, roles.RolIDs, submodulo)
	if err != nil {
		return "", err
	}
	niveles := make([]Alcance, 0, len(roles.RolIDs))
	for _, id := range roles.RolIDs {
		if a, ok := delRol[id]; ok {
			niveles = append(niveles, a)
		} else {
			niveles = append(niveles, TodasLasSedes)
		}
	}
	return ResolverAlcance(false, propio, niveles), nil
}

// Mios devuelve el alcance de la persona sobre cada submódulo acotable, para
// que su pantalla se adapte.
func (g *Gestion) Mios(ctx context.Context, usuarioID int64) (map[string]Alcance, error) {
	out := map[string]Alcance{}
	for _, sub := range SubmodulosConAlcance {
		a, err := g.Alcance(ctx, usuarioID, sub)
		if err != nil {
			return nil, err
		}
		out[sub] = a
	}
	return out, nil
}

// FiltroSedes es lo que una consulta necesita para acotar por sede: si ve todas
// o solo estas.
type FiltroSedes struct {
	Todas   bool
	SedeIDs []int64
}

// Sedes resuelve el filtro de una persona para un submódulo. Con "mis sedes"
// y ninguna sede asignada devuelve una lista vacía: no ve nada, que es lo
// correcto (nunca "todas" por descuido).
func (g *Gestion) Sedes(ctx context.Context, usuarioID int64, submodulo string) (FiltroSedes, error) {
	a, err := g.Alcance(ctx, usuarioID, submodulo)
	if err != nil {
		return FiltroSedes{}, err
	}
	if a == TodasLasSedes {
		return FiltroSedes{Todas: true}, nil
	}
	ids, err := g.store.SedesDe(ctx, usuarioID)
	if err != nil {
		return FiltroSedes{}, err
	}
	return FiltroSedes{Todas: false, SedeIDs: ids}, nil
}
