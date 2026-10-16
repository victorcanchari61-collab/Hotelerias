package auth

import (
	"context"
	"errors"
	"fmt"

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

// Servicio autentica al PERSONAL del hotel. No sabe de HTTP ni de SQL.
//
// La parte delicada (tiempos, enumeración, fuerza bruta) la hace el Verificador,
// que comparte con el login de huéspedes.
type Servicio struct {
	cuentas Cuentas
	emisor  Emisor
	verif   *Verificador
}

func NewServicio(cuentas Cuentas, hasher Hasher, emisor Emisor, limitador *Limitador) (*Servicio, error) {
	v, err := NewVerificador(hasher, limitador, "staff")
	if err != nil {
		return nil, err
	}
	return &Servicio{cuentas: cuentas, emisor: emisor, verif: v}, nil
}

// Login valida las credenciales y emite el token. `origen` (la IP) entra en la
// clave del limitador junto con el correo.
func (s *Servicio) Login(ctx context.Context, origen, email, password string) (Sesion, error) {
	var cuenta usuario.Cuenta

	id, err := s.verif.Verificar(ctx, origen, email, password,
		func(ctx context.Context, email string) (Credencial, error) {
			c, err := s.cuentas.PorEmail(ctx, email)
			if errors.Is(err, usuario.ErrNoEncontrada) {
				return Credencial{}, ErrCuentaInexistente
			}
			if err != nil {
				return Credencial{}, err
			}
			cuenta = c
			return Credencial{ID: c.ID, PasswordHash: c.PasswordHash, Activo: c.Activo}, nil
		})
	if err != nil {
		return Sesion{}, err
	}

	token, err := s.emisor.Emitir(id)
	if err != nil {
		return Sesion{}, fmt.Errorf("auth: emitiendo el token: %w", err)
	}
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
