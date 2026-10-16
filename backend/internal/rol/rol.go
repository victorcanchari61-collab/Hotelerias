// Package rol administra los roles y su matriz de permisos.
//
// Qué PUEDE hacer una persona se resuelve en permiso (rol + excepciones); aquí
// solo se mantienen los datos de los roles.
package rol

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/permiso"
	"hotelerias/backend/internal/platform/httpx"
)

var ErrNoEncontrado = errors.New("rol: no encontrado")

// Rol es un conjunto de permisos con nombre.
type Rol struct {
	ID          int64  `json:"id"`
	Nombre      string `json:"nombre"`
	Descripcion string `json:"descripcion"`
	Activo      bool   `json:"activo"`
	// DelSistema: los de arranque. No se eliminan: hay cosas que dependen de ellos.
	DelSistema bool `json:"delSistema"`
	// AccesoTotal: puede todo y su matriz no se configura. Es el rol protegido:
	// sin él activo nadie podría volver a configurar el sistema.
	AccesoTotal bool      `json:"accesoTotal"`
	Creado      time.Time `json:"creadoEn"`
	Usuarios    int       `json:"usuarios"`
	// Permisos como "submodulo:accion", ordenados. Nunca null.
	Permisos []string `json:"permisos"`
}

// Entrada es lo que se envía al crear o editar.
type Entrada struct {
	Nombre      string `json:"nombre"`
	Descripcion string `json:"descripcion"`
	Activo      bool   `json:"activo"`
}

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	Listar(ctx context.Context) ([]Rol, error)
	PorID(ctx context.Context, id int64) (Rol, error)
	Crear(ctx context.Context, r Rol) (Rol, error)
	Actualizar(ctx context.Context, r Rol) error
	Eliminar(ctx context.Context, id int64) error
	ReemplazarPermisos(ctx context.Context, id int64, claves []permiso.Clave) error
	NombreEnUso(ctx context.Context, nombre string, exceptoID int64) (bool, error)
}

// Olvidador descarta lo que la caché recuerda de un rol.
type Olvidador interface {
	Olvidar(ctx context.Context, rolID int64) error
}

// Servicio son las reglas de los roles:
//
//   - El nombre no se repite.
//   - Un rol del sistema no se elimina, pero (salvo el de acceso total) se puede desactivar.
//   - El de acceso total está protegido: no se desactiva, no se elimina y su matriz no se toca.
//   - Un rol con personas asignadas no se elimina: primero hay que moverlas.
//   - Guardar permisos REEMPLAZA la matriz completa.
type Servicio struct {
	repo      Repositorio
	catalogo  *permiso.Catalogo
	olvidar   Olvidador
	auditoria auditoria.Registrador
}

func NewServicio(repo Repositorio, cat *permiso.Catalogo, olvidar Olvidador, aud auditoria.Registrador) *Servicio {
	return &Servicio{repo: repo, catalogo: cat, olvidar: olvidar, auditoria: aud}
}

func (s *Servicio) Listar(ctx context.Context) ([]Rol, error) { return s.repo.Listar(ctx) }

func (s *Servicio) PorID(ctx context.Context, id int64) (Rol, error) { return s.repo.PorID(ctx, id) }

func normalizar(e *Entrada) error {
	e.Nombre = strings.TrimSpace(e.Nombre)
	e.Descripcion = strings.TrimSpace(e.Descripcion)
	if e.Nombre == "" {
		return httpx.Validacion("Ponle un nombre al rol")
	}
	if len([]rune(e.Nombre)) > 60 {
		return httpx.Validacion("El nombre no puede pasar de 60 caracteres")
	}
	return nil
}

func (s *Servicio) Crear(ctx context.Context, e Entrada, actor int64) (Rol, error) {
	if err := normalizar(&e); err != nil {
		return Rol{}, err
	}
	if usado, err := s.repo.NombreEnUso(ctx, e.Nombre, 0); err != nil {
		return Rol{}, err
	} else if usado {
		return Rol{}, httpx.Conflicto("Ya existe un rol con ese nombre")
	}

	creado, err := s.repo.Crear(ctx, Rol{Nombre: e.Nombre, Descripcion: e.Descripcion, Activo: true})
	if err != nil {
		return Rol{}, err
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Rol", EntidadID: fmt.Sprint(creado.ID), Accion: auditoria.Creado,
		Despues: map[string]any{"nombre": creado.Nombre, "descripcion": creado.Descripcion},
	})
	return creado, nil
}

func (s *Servicio) Actualizar(ctx context.Context, id int64, e Entrada, actor int64) (Rol, error) {
	if err := normalizar(&e); err != nil {
		return Rol{}, err
	}
	actual, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Rol{}, err
	}
	if usado, err := s.repo.NombreEnUso(ctx, e.Nombre, id); err != nil {
		return Rol{}, err
	} else if usado {
		return Rol{}, httpx.Conflicto("Ya existe un rol con ese nombre")
	}
	if actual.AccesoTotal && !e.Activo {
		return Rol{}, httpx.Conflicto("Este rol no se puede desactivar: sin él nadie podría configurar el sistema")
	}

	nuevo := actual
	nuevo.Nombre, nuevo.Descripcion, nuevo.Activo = e.Nombre, e.Descripcion, e.Activo
	if err := s.repo.Actualizar(ctx, nuevo); err != nil {
		return Rol{}, err
	}

	antes, despues := auditoria.Diferencia(
		map[string]any{"nombre": actual.Nombre, "descripcion": actual.Descripcion, "activo": actual.Activo},
		map[string]any{"nombre": nuevo.Nombre, "descripcion": nuevo.Descripcion, "activo": nuevo.Activo})
	if len(despues) > 0 {
		s.auditoria.Registrar(ctx, auditoria.Evento{
			UsuarioID: actor, Entidad: "Rol", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
			Antes: antes, Despues: despues,
		})
	}
	return s.repo.PorID(ctx, id)
}

// GuardarPermisos reemplaza la matriz del rol.
//
// Solo entra lo que el catálogo reconoce (un submódulo mal escrito o una acción
// que ese submódulo no admite no llegan a la base) y cualquier acción implica
// poder VER: sin Ver la pantalla no abre y el permiso quedaría concedido pero
// inalcanzable.
func (s *Servicio) GuardarPermisos(ctx context.Context, id int64, pedidos []string, actor int64) (Rol, error) {
	actual, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Rol{}, err
	}
	if actual.AccesoTotal {
		return Rol{}, httpx.Conflicto("Este rol tiene acceso total: su matriz no se configura")
	}

	set := map[permiso.Clave]struct{}{}
	for _, texto := range pedidos {
		cl, err := permiso.ParseClave(texto)
		if err != nil || !s.catalogo.EsValido(cl) {
			continue
		}
		set[cl] = struct{}{}
		set[permiso.Clave{Submodulo: cl.Submodulo, Accion: permiso.Ver}] = struct{}{}
	}
	// Ver también debe ser válido en ese submódulo (siempre lo es, pero no se asume).
	for cl := range set {
		if !s.catalogo.EsValido(cl) {
			delete(set, cl)
		}
	}

	claves := make([]permiso.Clave, 0, len(set))
	for cl := range set {
		claves = append(claves, cl)
	}
	slices.SortFunc(claves, func(a, b permiso.Clave) int { return strings.Compare(a.String(), b.String()) })

	if err := s.repo.ReemplazarPermisos(ctx, id, claves); err != nil {
		return Rol{}, err
	}
	// Sin esto el cambio no se notaría hasta que venciera la caché, y quien
	// acaba de configurar el rol creería que no se guardó.
	if s.olvidar != nil {
		if err := s.olvidar.Olvidar(ctx, id); err != nil {
			return Rol{}, fmt.Errorf("rol: no se pudo invalidar la caché del rol %d: %w", id, err)
		}
	}

	nuevos := make([]string, len(claves))
	for i, cl := range claves {
		nuevos[i] = cl.String()
	}
	agregados, quitados := diferenciaLista(actual.Permisos, nuevos)
	if len(agregados)+len(quitados) > 0 {
		s.auditoria.Registrar(ctx, auditoria.Evento{
			UsuarioID: actor, Entidad: "Rol", EntidadID: fmt.Sprint(id), Accion: auditoria.Actualizado,
			Antes:   map[string]any{"permisos quitados": quitados},
			Despues: map[string]any{"permisos agregados": agregados},
		})
	}
	return s.repo.PorID(ctx, id)
}

func (s *Servicio) Eliminar(ctx context.Context, id int64, actor int64) error {
	r, err := s.repo.PorID(ctx, id)
	if err != nil {
		return err
	}
	switch {
	case r.DelSistema:
		return httpx.Conflicto("Los roles del sistema no se pueden eliminar")
	case r.AccesoTotal:
		return httpx.Conflicto("El rol de acceso total no se puede eliminar")
	case r.Usuarios > 0:
		return httpx.Conflicto(fmt.Sprintf(
			"El rol tiene %d usuario(s) asignado(s). Cámbialos de rol antes de eliminarlo", r.Usuarios))
	}

	if err := s.repo.Eliminar(ctx, id); err != nil {
		return err
	}
	if s.olvidar != nil {
		_ = s.olvidar.Olvidar(ctx, id)
	}
	s.auditoria.Registrar(ctx, auditoria.Evento{
		UsuarioID: actor, Entidad: "Rol", EntidadID: fmt.Sprint(id), Accion: auditoria.Eliminado,
		Antes: map[string]any{"nombre": r.Nombre, "descripcion": r.Descripcion},
	})
	return nil
}

// diferenciaLista devuelve lo que está en nuevos y no en antes, y al revés.
func diferenciaLista(antes, nuevos []string) (agregados, quitados []string) {
	agregados, quitados = []string{}, []string{}
	enAntes := map[string]bool{}
	for _, a := range antes {
		enAntes[a] = true
	}
	enNuevos := map[string]bool{}
	for _, n := range nuevos {
		enNuevos[n] = true
		if !enAntes[n] {
			agregados = append(agregados, n)
		}
	}
	for _, a := range antes {
		if !enNuevos[a] {
			quitados = append(quitados, a)
		}
	}
	return agregados, quitados
}
