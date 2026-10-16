package cliente

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"

	"hotelerias/backend/internal/auth"
	"hotelerias/backend/internal/platform/httpx"
)

// MinPassword es el largo mínimo de la clave de un huésped. Es una cuenta
// pública: lo mínimo razonable, sin reglas de composición que solo estorban.
const MinPassword = 8

// Repositorio es lo que este paquete necesita de la base.
type Repositorio interface {
	PorEmail(ctx context.Context, email string) (Cliente, error)
	PorID(ctx context.Context, id int64) (Cliente, error)
	Crear(ctx context.Context, c Cliente) (Cliente, error)
	Listar(ctx context.Context) ([]Cliente, error)
	// FijarTipo asigna el tipo. manual=true lo protege de la regla automática.
	FijarTipo(ctx context.Context, id int64, tipoID *int64, manual bool) error
	// Reservas cuenta las reservas que valen para la clasificación.
	Reservas(ctx context.Context, id int64) (int, error)

	Tipos(ctx context.Context) ([]Tipo, error)
	CrearTipo(ctx context.Context, t Tipo) (Tipo, error)
	ActualizarTipo(ctx context.Context, t Tipo) (Tipo, error)
}

// Hasher es lo que se necesita para guardar claves.
type Hasher interface {
	Hash(plain string) (string, error)
}

// Emisor firma el token de huésped. Lo implementa *auth.Tokens.
type Emisor interface {
	EmitirCliente(clienteID int64) (string, error)
}

// Sesion es el resultado de entrar o registrarse.
type Sesion struct {
	Token   string  `json:"token"`
	Cliente Cliente `json:"cliente"`
}

// Registro son los datos con los que alguien abre su cuenta.
type Registro struct {
	Nombre   string `json:"nombre"`
	Apellido string `json:"apellido"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Telefono string `json:"telefono"`
	Pais     string `json:"pais"`
}

// Servicio es la cuenta del huésped y su clasificación. No sabe de HTTP.
type Servicio struct {
	repo   Repositorio
	hasher Hasher
	emisor Emisor
	verif  *auth.Verificador
}

func NewServicio(repo Repositorio, hasher auth.Hasher, emisor Emisor, limitador *auth.Limitador) (*Servicio, error) {
	// Ámbito propio: el contador de intentos de un huésped no se mezcla con el del
	// personal aunque compartan correo.
	v, err := auth.NewVerificador(hasher, limitador, "cliente")
	if err != nil {
		return nil, err
	}
	return &Servicio{repo: repo, hasher: hasher, emisor: emisor, verif: v}, nil
}

// Registrar abre una cuenta y deja al huésped con sesión iniciada.
func (s *Servicio) Registrar(ctx context.Context, r Registro) (Sesion, error) {
	r.Nombre = strings.TrimSpace(r.Nombre)
	r.Apellido = strings.TrimSpace(r.Apellido)
	r.Telefono = strings.TrimSpace(r.Telefono)
	r.Pais = strings.TrimSpace(r.Pais)

	addr, err := mail.ParseAddress(strings.TrimSpace(r.Email))
	switch {
	case r.Nombre == "":
		return Sesion{}, httpx.Validacion("Escribe tu nombre")
	case err != nil || addr.Name != "":
		return Sesion{}, httpx.Validacion("Escribe un correo válido")
	case len(r.Password) < MinPassword:
		return Sesion{}, httpx.Validacion(fmt.Sprintf("La contraseña necesita al menos %d caracteres", MinPassword))
	case len(r.Password) > auth.MaxPasswordBytes:
		return Sesion{}, httpx.Validacion(fmt.Sprintf("La contraseña no puede pasar de %d caracteres", auth.MaxPasswordBytes))
	}

	hash, err := s.hasher.Hash(r.Password)
	if err != nil {
		return Sesion{}, fmt.Errorf("cliente: hasheando la clave: %w", err)
	}

	c := Cliente{
		Nombre: r.Nombre, Apellido: r.Apellido, Email: addr.Address,
		Telefono: r.Telefono, Pais: r.Pais, PasswordHash: hash, Activo: true,
	}

	// Entra con el tipo de entrada (cero reservas).
	tipos, err := s.repo.Tipos(ctx)
	if err != nil {
		return Sesion{}, err
	}
	if t := Clasificar(tipos, 0); t != nil {
		c.TipoClienteID = &t.ID
	}

	creado, err := s.repo.Crear(ctx, c)
	if err != nil {
		return Sesion{}, err
	}
	token, err := s.emisor.EmitirCliente(creado.ID)
	if err != nil {
		return Sesion{}, fmt.Errorf("cliente: emitiendo el token: %w", err)
	}
	return Sesion{Token: token, Cliente: creado}, nil
}

// Login valida las credenciales con el mismo verificador del personal.
func (s *Servicio) Login(ctx context.Context, origen, email, password string) (Sesion, error) {
	id, err := s.verif.Verificar(ctx, origen, email, password,
		func(ctx context.Context, email string) (auth.Credencial, error) {
			c, err := s.repo.PorEmail(ctx, email)
			if errors.Is(err, ErrNoEncontrado) {
				return auth.Credencial{}, auth.ErrCuentaInexistente
			}
			if err != nil {
				return auth.Credencial{}, err
			}
			return auth.Credencial{ID: c.ID, PasswordHash: c.PasswordHash, Activo: c.Activo}, nil
		})
	if err != nil {
		return Sesion{}, err
	}

	c, err := s.repo.PorID(ctx, id)
	if err != nil {
		return Sesion{}, err
	}
	token, err := s.emisor.EmitirCliente(id)
	if err != nil {
		return Sesion{}, fmt.Errorf("cliente: emitiendo el token: %w", err)
	}
	return Sesion{Token: token, Cliente: c}, nil
}

// Perfil devuelve al huésped del token. Una cuenta que ya no existe o fue
// desactivada deja de servir aunque su token no haya vencido.
func (s *Servicio) Perfil(ctx context.Context, id int64) (Cliente, error) {
	c, err := s.repo.PorID(ctx, id)
	if errors.Is(err, ErrNoEncontrado) {
		return Cliente{}, auth.ErrSesionInvalida
	}
	if err != nil {
		return Cliente{}, err
	}
	if !c.Activo {
		return Cliente{}, auth.ErrSesionInvalida
	}
	return c, nil
}

// Reclasificar aplica la regla automática: sube (o baja) al huésped al tipo que
// le corresponde por su cantidad de reservas. No toca a quien tiene el tipo
// fijado a mano.
func (s *Servicio) Reclasificar(ctx context.Context, id int64) error {
	c, err := s.repo.PorID(ctx, id)
	if err != nil {
		return err
	}
	if c.TipoManual {
		return nil
	}
	n, err := s.repo.Reservas(ctx, id)
	if err != nil {
		return err
	}
	tipos, err := s.repo.Tipos(ctx)
	if err != nil {
		return err
	}
	t := Clasificar(tipos, n)
	if t == nil {
		return nil
	}
	if c.TipoClienteID != nil && *c.TipoClienteID == t.ID {
		return nil
	}
	return s.repo.FijarTipo(ctx, id, &t.ID, false)
}

// --- Lo que usa el personal ---

func (s *Servicio) Listar(ctx context.Context) ([]Cliente, error) { return s.repo.Listar(ctx) }

// AsignarTipo fija el tipo a mano. Con tipoID nil devuelve al huésped a la regla
// automática y lo reclasifica de inmediato.
func (s *Servicio) AsignarTipo(ctx context.Context, id int64, tipoID *int64) (Cliente, error) {
	if _, err := s.repo.PorID(ctx, id); err != nil {
		return Cliente{}, err
	}

	if tipoID == nil {
		if err := s.repo.FijarTipo(ctx, id, nil, false); err != nil {
			return Cliente{}, err
		}
		if err := s.Reclasificar(ctx, id); err != nil {
			return Cliente{}, err
		}
		return s.repo.PorID(ctx, id)
	}

	tipos, err := s.repo.Tipos(ctx)
	if err != nil {
		return Cliente{}, err
	}
	ok := false
	for _, t := range tipos {
		if t.ID == *tipoID && t.Activo {
			ok = true
		}
	}
	if !ok {
		return Cliente{}, ErrTipoInvalido
	}
	if err := s.repo.FijarTipo(ctx, id, tipoID, true); err != nil {
		return Cliente{}, err
	}
	return s.repo.PorID(ctx, id)
}

func (s *Servicio) Tipos(ctx context.Context) ([]Tipo, error) { return s.repo.Tipos(ctx) }

func validarTipo(t *Tipo) error {
	t.Nombre = strings.TrimSpace(t.Nombre)
	t.Descripcion = strings.TrimSpace(t.Descripcion)
	switch {
	case t.Nombre == "":
		return httpx.Validacion("Ponle un nombre al tipo de cliente")
	case t.DescuentoPct < 0 || t.DescuentoPct > 100:
		return httpx.Validacion("El descuento debe estar entre 0 y 100")
	case t.ReservasMinimas != nil && *t.ReservasMinimas < 1:
		return httpx.Validacion("Las reservas mínimas deben ser 1 o más (o déjalo vacío para asignarlo a mano)")
	}
	return nil
}

func (s *Servicio) CrearTipo(ctx context.Context, t Tipo) (Tipo, error) {
	if err := validarTipo(&t); err != nil {
		return Tipo{}, err
	}
	return s.repo.CrearTipo(ctx, t)
}

func (s *Servicio) ActualizarTipo(ctx context.Context, t Tipo) (Tipo, error) {
	if err := validarTipo(&t); err != nil {
		return Tipo{}, err
	}
	return s.repo.ActualizarTipo(ctx, t)
}
