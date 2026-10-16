package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"hotelerias/backend/internal/usuario"
)

// Los tres fallos que el login distingue. El mensaje de ErrCredenciales es el
// MISMO para "no existe ese correo" y "la clave está mal": decir cuál de las dos
// le regala a quien ataca la lista de correos que sí existen.
var (
	ErrCredenciales       = errors.New("Email o contraseña incorrectos")
	ErrCuentaInactiva     = errors.New("Tu cuenta está desactivada. Habla con un administrador.")
	ErrDemasiadosIntentos = errors.New("Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.")
	ErrSesionInvalida     = errors.New("Tu sesión no es válida.")
)

// Cuentas es lo que el login necesita de la base.
type Cuentas interface {
	PorEmail(ctx context.Context, email string) (usuario.Cuenta, error)
	PorID(ctx context.Context, id int64) (usuario.Cuenta, error)
}

// Hasher hashea y compara claves.
type Hasher interface {
	Hash(plain string) (string, error)
	Comparar(hash, plain string) error
}

// Emisor firma los tokens. Lo implementa *Tokens.
type Emisor interface {
	Emitir(usuarioID int64) (string, error)
}

// Sesion es el resultado de un login correcto.
type Sesion struct {
	Token   string         `json:"token"`
	Usuario usuario.Perfil `json:"usuario"`
}

// Servicio autentica personas. No sabe de HTTP ni de SQL.
type Servicio struct {
	cuentas   Cuentas
	hasher    Hasher
	emisor    Emisor
	limitador *Limitador

	// hashFalso se compara cuando el correo NO existe, para que responder
	// "no existe" tarde lo mismo que responder "clave incorrecta". Sin esto el
	// tiempo de respuesta delata qué correos están registrados.
	hashFalso string
}

func NewServicio(cuentas Cuentas, hasher Hasher, emisor Emisor, limitador *Limitador) (*Servicio, error) {
	falso, err := hasher.Hash("hotelerias-clave-que-no-pertenece-a-nadie")
	if err != nil {
		return nil, fmt.Errorf("auth: preparando el hash de relleno: %w", err)
	}
	return &Servicio{cuentas: cuentas, hasher: hasher, emisor: emisor, limitador: limitador, hashFalso: falso}, nil
}

// Login valida las credenciales y emite el token. `origen` (la IP) entra en la
// clave del limitador junto con el correo.
func (s *Servicio) Login(ctx context.Context, origen, email, password string) (Sesion, error) {
	email = strings.TrimSpace(email)

	// Vacío o más largo de lo que bcrypt procesa: no puede ser una clave válida.
	// Mismo error que cualquier otra credencial mala.
	if email == "" || password == "" || len(password) > MaxPasswordBytes {
		return Sesion{}, ErrCredenciales
	}

	clave := origen + "|" + strings.ToLower(email)
	if !s.limitador.Permitir(clave) {
		return Sesion{}, ErrDemasiadosIntentos
	}

	cuenta, err := s.cuentas.PorEmail(ctx, email)
	switch {
	case errors.Is(err, usuario.ErrNoEncontrada):
		_ = s.hasher.Comparar(s.hashFalso, password) // gastar el mismo tiempo
		s.limitador.Fallo(clave)
		return Sesion{}, ErrCredenciales
	case err != nil:
		return Sesion{}, fmt.Errorf("auth: buscando la cuenta: %w", err)
	}

	if err := s.hasher.Comparar(cuenta.PasswordHash, password); err != nil {
		s.limitador.Fallo(clave)
		return Sesion{}, ErrCredenciales
	}

	// Recién con la clave correcta se dice que la cuenta está desactivada: así
	// quien ataca no puede usar este mensaje para saber qué cuentas existen.
	if !cuenta.Activo {
		return Sesion{}, ErrCuentaInactiva
	}

	token, err := s.emisor.Emitir(cuenta.ID)
	if err != nil {
		return Sesion{}, fmt.Errorf("auth: emitiendo el token: %w", err)
	}

	s.limitador.Exito(clave)
	return Sesion{Token: token, Usuario: cuenta.Perfil()}, nil
}

// Me devuelve la cuenta del token. Una cuenta que ya no existe o fue
// desactivada deja de servir aunque su token no haya vencido.
func (s *Servicio) Me(ctx context.Context, usuarioID int64) (usuario.Perfil, error) {
	cuenta, err := s.cuentas.PorID(ctx, usuarioID)
	if errors.Is(err, usuario.ErrNoEncontrada) {
		return usuario.Perfil{}, ErrSesionInvalida
	}
	if err != nil {
		return usuario.Perfil{}, fmt.Errorf("auth: buscando la cuenta: %w", err)
	}
	if !cuenta.Activo {
		return usuario.Perfil{}, ErrSesionInvalida
	}
	return cuenta.Perfil(), nil
}
