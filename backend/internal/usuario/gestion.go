package usuario

import (
	"context"
	"fmt"
	"net/mail"
	"slices"
	"strings"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/httpx"
)

// MinPassword es el largo mínimo de la clave de una cuenta del personal.
const MinPassword = 8

// maxPassword es lo que bcrypt procesa: más allá ignora el resto en silencio.
const maxPassword = 72

// RolRef es un rol tal como lo necesita validar el alta de una persona.
type RolRef struct {
	ID          int64
	Activo      bool
	AccesoTotal bool
}

// Nueva es lo que se envía al crear o editar una persona.
type Nueva struct {
	Nombre   string  `json:"nombre"`
	Apellido string  `json:"apellido"`
	Email    string  `json:"email"`
	Telefono string  `json:"telefono"`
	RolIDs   []int64 `json:"rolIds"`
	SedeIDs  []int64 `json:"sedeIds"`
	Activo   bool    `json:"activo"`
	// Password es obligatoria al crear; al editar, vacía significa "no la cambies".
	Password string `json:"password"`
}

// Escritura es lo que el almacén guarda: ya validado y con la clave hasheada.
type Escritura struct {
	Nombre, Apellido, Email, Telefono string
	RolIDs, SedeIDs                   []int64
	Activo                            bool
	// PasswordHash vacío = no tocar la clave (al editar).
	PasswordHash string
}

// GestionStore es lo que la gestión de cuentas necesita de la base.
type GestionStore interface {
	PorID(ctx context.Context, id int64) (Cuenta, error)
	Listar(ctx context.Context) ([]Cuenta, error)
	EmailEnUso(ctx context.Context, email string, exceptoID int64) (bool, error)
	// Roles devuelve los que existen entre los ids pedidos.
	Roles(ctx context.Context, ids []int64) ([]RolRef, error)
	// SedesExistentes devuelve cuáles de esos ids son sedes.
	SedesExistentes(ctx context.Context, ids []int64) ([]int64, error)
	// ConAccesoTotal dice si la persona tiene hoy un rol de acceso total.
	ConAccesoTotal(ctx context.Context, usuarioID int64) (bool, error)
	// OtrosAdministradoresActivos cuenta las personas ACTIVAS con acceso total,
	// sin contar a `exceptoID`.
	OtrosAdministradoresActivos(ctx context.Context, exceptoID int64) (int, error)
	Crear(ctx context.Context, e Escritura) (int64, error)
	Actualizar(ctx context.Context, id int64, e Escritura) error
	CambiarEstado(ctx context.Context, id int64, activo bool) error
	Eliminar(ctx context.Context, id int64) error
}

// Gestion son las reglas del alta, edición y baja de cuentas del personal.
type Gestion struct {
	store     GestionStore
	hasher    Hasher
	auditoria auditoria.Registrador
}

func NewGestion(store GestionStore, hasher Hasher, aud auditoria.Registrador) *Gestion {
	return &Gestion{store: store, hasher: hasher, auditoria: aud}
}

func (g *Gestion) Listar(ctx context.Context) ([]Cuenta, error) { return g.store.Listar(ctx) }

func (g *Gestion) PorID(ctx context.Context, id int64) (Cuenta, error) { return g.store.PorID(ctx, id) }

// preparar normaliza y valida lo común al alta y a la edición.
func (g *Gestion) preparar(ctx context.Context, n *Nueva, id int64, esAlta bool) error {
	n.Nombre = strings.TrimSpace(n.Nombre)
	n.Apellido = strings.TrimSpace(n.Apellido)
	n.Telefono = strings.TrimSpace(n.Telefono)
	n.Email = strings.TrimSpace(n.Email)

	if n.Nombre == "" {
		return httpx.Validacion("El nombre es obligatorio")
	}
	addr, err := mail.ParseAddress(n.Email)
	if err != nil || addr.Name != "" {
		return httpx.Validacion("Escribe un correo válido")
	}
	n.Email = addr.Address

	switch {
	case esAlta && n.Password == "":
		return httpx.Validacion("La contraseña es obligatoria")
	case n.Password != "" && len(n.Password) < MinPassword:
		return httpx.Validacion(fmt.Sprintf("La contraseña debe tener al menos %d caracteres", MinPassword))
	case len(n.Password) > maxPassword:
		return httpx.Validacion(fmt.Sprintf("La contraseña no puede pasar de %d caracteres", maxPassword))
	}

	n.RolIDs = unicos(n.RolIDs)
	n.SedeIDs = unicos(n.SedeIDs)
	if len(n.RolIDs) == 0 {
		return httpx.Validacion("Elige al menos un rol")
	}

	if usado, err := g.store.EmailEnUso(ctx, n.Email, id); err != nil {
		return err
	} else if usado {
		return httpx.Conflicto("Ya existe una cuenta con ese correo")
	}

	existentes, err := g.store.SedesExistentes(ctx, n.SedeIDs)
	if err != nil {
		return err
	}
	if len(existentes) != len(n.SedeIDs) {
		return httpx.Validacion("Alguna de las sedes elegidas no existe")
	}
	return nil
}

func unicos(ids []int64) []int64 {
	out := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id > 0 && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	slices.Sort(out)
	return out
}

// validarRoles comprueba que existan y, de los que se AGREGAN, que estén
// activos: si un rol se desactivó después, editar el teléfono de quien ya lo
// tenía no debería fallar.
func (g *Gestion) validarRoles(ctx context.Context, pedidos, actuales []int64) ([]RolRef, error) {
	roles, err := g.store.Roles(ctx, pedidos)
	if err != nil {
		return nil, err
	}
	if len(roles) != len(pedidos) {
		return nil, httpx.Validacion("Alguno de los roles elegidos no existe")
	}
	for _, r := range roles {
		if !r.Activo && !slices.Contains(actuales, r.ID) {
			return nil, httpx.Validacion("No se puede asignar un rol desactivado")
		}
	}
	return roles, nil
}

func tieneTotal(roles []RolRef) bool {
	for _, r := range roles {
		if r.AccesoTotal && r.Activo {
			return true
		}
	}
	return false
}

func (g *Gestion) Crear(ctx context.Context, n Nueva, actor int64) (Cuenta, error) {
	if err := g.preparar(ctx, &n, 0, true); err != nil {
		return Cuenta{}, err
	}
	if _, err := g.validarRoles(ctx, n.RolIDs, nil); err != nil {
		return Cuenta{}, err
	}

	hash, err := g.hasher.Hash(n.Password)
	if err != nil {
		return Cuenta{}, fmt.Errorf("usuario: hasheando la clave: %w", err)
	}

	id, err := g.store.Crear(ctx, Escritura{
		Nombre: n.Nombre, Apellido: n.Apellido, Email: n.Email, Telefono: n.Telefono,
		RolIDs: n.RolIDs, SedeIDs: n.SedeIDs, Activo: n.Activo, PasswordHash: hash,
	})
	if err != nil {
		return Cuenta{}, err
	}

	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Usuario", EntidadID: fmt.Sprint(id), Accion: auditoria.Creado,
		Despues: map[string]any{
			"nombre": n.Nombre, "apellido": n.Apellido, "email": n.Email,
			"roles": n.RolIDs, "sedes": n.SedeIDs, "activo": n.Activo,
		},
	})
	return g.store.PorID(ctx, id)
}

// protegerUltimoAdministrador impide dejar el sistema sin nadie que pueda
// configurarlo: es el mismo motivo por el que el rol de acceso total no se
// desactiva.
func (g *Gestion) protegerUltimoAdministrador(ctx context.Context, id int64) error {
	otros, err := g.store.OtrosAdministradoresActivos(ctx, id)
	if err != nil {
		return err
	}
	if otros == 0 {
		return httpx.Conflicto("Es el último administrador activo: sin él nadie podría configurar el sistema")
	}
	return nil
}

func (g *Gestion) Actualizar(ctx context.Context, id int64, n Nueva, actor int64) (Cuenta, error) {
	actual, err := g.store.PorID(ctx, id)
	if err != nil {
		return Cuenta{}, err
	}
	if err := g.preparar(ctx, &n, id, false); err != nil {
		return Cuenta{}, err
	}
	roles, err := g.validarRoles(ctx, n.RolIDs, actual.RolIDs)
	if err != nil {
		return Cuenta{}, err
	}

	if id == actor && !n.Activo {
		return Cuenta{}, httpx.Conflicto("No puedes desactivar tu propia cuenta")
	}
	eraTotal, err := g.store.ConAccesoTotal(ctx, id)
	if err != nil {
		return Cuenta{}, err
	}
	// Deja de ser administrador si se desactiva o se le quitan los roles de acceso total.
	if eraTotal && (!n.Activo || !tieneTotal(roles)) {
		if err := g.protegerUltimoAdministrador(ctx, id); err != nil {
			return Cuenta{}, err
		}
	}

	hash := ""
	if n.Password != "" {
		if hash, err = g.hasher.Hash(n.Password); err != nil {
			return Cuenta{}, fmt.Errorf("usuario: hasheando la clave: %w", err)
		}
	}

	err = g.store.Actualizar(ctx, id, Escritura{
		Nombre: n.Nombre, Apellido: n.Apellido, Email: n.Email, Telefono: n.Telefono,
		RolIDs: n.RolIDs, SedeIDs: n.SedeIDs, Activo: n.Activo, PasswordHash: hash,
	})
	if err != nil {
		return Cuenta{}, err
	}

	antes, despues := auditoria.Diferencia(
		map[string]any{
			"nombre": actual.Nombre, "apellido": actual.Apellido, "email": actual.Email,
			"telefono": actual.Telefono, "roles": nuncaNil(actual.RolIDs), "sedes": nuncaNil(actual.SedeIDs),
			"activo": actual.Activo,
		},
		map[string]any{
			"nombre": n.Nombre, "apellido": n.Apellido, "email": n.Email,
			"telefono": n.Telefono, "roles": nuncaNil(n.RolIDs), "sedes": nuncaNil(n.SedeIDs),
			"activo": n.Activo,
		})
	if n.Password != "" {
		// Solo se deja constancia de que se cambió; jamás la clave ni su hash.
		despues["contraseña"] = "cambiada"
	}
	if len(despues) > 0 {
		g.auditoria.Registrar(ctx, auditoria.Evento{
			UsuarioID: actor, Entidad: "Usuario", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
			Antes: antes, Despues: despues,
		})
	}
	return g.store.PorID(ctx, id)
}

func nuncaNil(ids []int64) []int64 {
	if ids == nil {
		return []int64{}
	}
	return ids
}

func (g *Gestion) CambiarEstado(ctx context.Context, id int64, activo bool, actor int64) (bool, error) {
	actual, err := g.store.PorID(ctx, id)
	if err != nil {
		return false, err
	}
	if actual.Activo == activo {
		return activo, nil
	}
	if !activo {
		if id == actor {
			return false, httpx.Conflicto("No puedes desactivar tu propia cuenta")
		}
		total, err := g.store.ConAccesoTotal(ctx, id)
		if err != nil {
			return false, err
		}
		if total {
			if err := g.protegerUltimoAdministrador(ctx, id); err != nil {
				return false, err
			}
		}
	}
	if err := g.store.CambiarEstado(ctx, id, activo); err != nil {
		return false, err
	}
	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Usuario", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
		Antes: map[string]any{"activo": actual.Activo}, Despues: map[string]any{"activo": activo},
	})
	return activo, nil
}

func (g *Gestion) Eliminar(ctx context.Context, id, actor int64) error {
	actual, err := g.store.PorID(ctx, id)
	if err != nil {
		return err
	}
	if id == actor {
		return httpx.Conflicto("No puedes eliminar tu propia cuenta")
	}
	total, err := g.store.ConAccesoTotal(ctx, id)
	if err != nil {
		return err
	}
	if total {
		if err := g.protegerUltimoAdministrador(ctx, id); err != nil {
			return err
		}
	}
	if err := g.store.Eliminar(ctx, id); err != nil {
		return err
	}
	g.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Usuario", EntidadID: fmt.Sprint(id), Accion: auditoria.Eliminado,
		Antes: map[string]any{"nombre": actual.Nombre, "apellido": actual.Apellido, "email": actual.Email},
	})
	return nil
}
