package permiso

import (
	"context"
	"fmt"
	"time"
)

// Los puertos son chicos y los define quien los consume. Postgres los
// implementa en permiso/postgres; en las pruebas son fakes de tres líneas.

// RolesDeUsuario es lo que se sabe de los roles de una persona.
// El valor cero significa "sin acceso": usuario inexistente o inactivo.
type RolesDeUsuario struct {
	RolIDs      []int64
	AccesoTotal bool
}

// UsuarioRoles dice qué roles tiene un usuario activo.
type UsuarioRoles interface {
	RolesDe(ctx context.Context, usuarioID int64) (RolesDeUsuario, error)
}

// PermisosDeRol dice qué puede hacer un rol.
type PermisosDeRol interface {
	PermisosDeRol(ctx context.Context, rolID int64) ([]Clave, error)
}

// ExcepcionStore son las excepciones por persona y su gasto atómico.
type ExcepcionStore interface {
	// VigentesDe trae lo que aún puede servir (sin revocar, sin vencer, sin
	// gastar). El filtro fino lo repite Excepcion.Vigente, en un solo sitio.
	VigentesDe(ctx context.Context, usuarioID int64, ahora time.Time) ([]Excepcion, error)

	// Reservar marca como gastada una excepción de un solo uso, y dice si lo
	// consiguió. Es atómico: de dos peticiones en paralelo gana una.
	Reservar(ctx context.Context, id int64) (bool, error)

	// Liberar devuelve una reservada, cuando la operación no llegó a hacerse.
	Liberar(ctx context.Context, id int64) error
}

// Service resuelve qué puede hacer una persona: sus roles más sus excepciones,
// contra la base y no contra el token, para que conceder o quitar un permiso
// surta efecto sin que nadie vuelva a entrar.
//
// Se cachea lo del ROL (ver CachedRoles), que es lo que de verdad se repite:
// cincuenta vendedores comparten una sola fila de permisos. Las excepciones NO
// se cachean — son pocas por persona, y una de un solo uso cacheada seguiría
// pareciendo válida después de gastarse.
type Service struct {
	usuarios    UsuarioRoles
	roles       PermisosDeRol
	excepciones ExcepcionStore
	catalogo    *Catalogo
	now         func() time.Time
}

func NewService(cat *Catalogo, usuarios UsuarioRoles, roles PermisosDeRol, excepciones ExcepcionStore) *Service {
	return &Service{usuarios: usuarios, roles: roles, excepciones: excepciones, catalogo: cat, now: time.Now}
}

// AccesoDe arma el Acceso de una persona. Para el rol sin restricción no
// consulta nada más: ya puede todo.
func (s *Service) AccesoDe(ctx context.Context, usuarioID int64) (Acceso, error) {
	r, err := s.usuarios.RolesDe(ctx, usuarioID)
	if err != nil {
		return Acceso{}, fmt.Errorf("permiso: roles de %d: %w", usuarioID, err)
	}
	if r.AccesoTotal {
		return Acceso{Total: true}, nil
	}
	if len(r.RolIDs) == 0 {
		return Acceso{}, nil // sin roles no hay nada que sumar; tampoco excepciones
	}

	deRoles := make(map[Clave]struct{})
	for _, rolID := range r.RolIDs {
		claves, err := s.roles.PermisosDeRol(ctx, rolID)
		if err != nil {
			return Acceso{}, fmt.Errorf("permiso: permisos del rol %d: %w", rolID, err)
		}
		for _, c := range claves {
			deRoles[c] = struct{}{}
		}
	}

	exc, err := s.excepciones.VigentesDe(ctx, usuarioID, s.now())
	if err != nil {
		return Acceso{}, fmt.Errorf("permiso: excepciones de %d: %w", usuarioID, err)
	}
	return Acceso{DeRoles: deRoles, Excepciones: exc}, nil
}

// Mios devuelve los permisos de la persona como "submodulo:accion".
func (s *Service) Mios(ctx context.Context, usuarioID int64) ([]string, error) {
	acceso, err := s.AccesoDe(ctx, usuarioID)
	if err != nil {
		return nil, err
	}
	claves := acceso.Claves(s.catalogo, s.now())
	out := make([]string, len(claves))
	for i, c := range claves {
		out[i] = c.String()
	}
	return out, nil
}

// Reservar y Liberar satisfacen UsoUnico, lo que necesita el Guard.
func (s *Service) Reservar(ctx context.Context, id int64) (bool, error) {
	return s.excepciones.Reservar(ctx, id)
}

func (s *Service) Liberar(ctx context.Context, id int64) error {
	return s.excepciones.Liberar(ctx, id)
}
