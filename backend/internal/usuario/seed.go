package usuario

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// NuevaCuenta es lo mínimo para crear una persona con rol.
type NuevaCuenta struct {
	Nombre       string
	Apellido     string
	Email        string
	PasswordHash string
}

// Sembrador es lo que la siembra necesita de la base.
type Sembrador interface {
	ExisteEmail(ctx context.Context, email string) (bool, error)

	// CrearAdministrador inserta la cuenta y le asigna el rol de acceso total,
	// todo en una transacción: no puede quedar un usuario sin rol.
	CrearAdministrador(ctx context.Context, c NuevaCuenta) error
}

// Hasher convierte una clave en su hash. Lo implementa auth.Bcrypt.
type Hasher interface {
	Hash(plain string) (string, error)
}

// Inicial son los datos de la cuenta que se garantiza al arrancar.
type Inicial struct {
	Email    string
	Nombre   string
	Password string
}

// AsegurarAdministrador crea el super administrador SI NO EXISTE.
//
//   - Sin correo o sin contraseña no hace nada (y lo dice): no hay ninguna
//     contraseña por defecto en el código, así que nadie puede entrar con una
//     que se haya publicado por error.
//   - Si la cuenta ya existe, no la toca: cambiar la contraseña en el entorno
//     no pisa la que alguien eligió después.
//   - Nunca devuelve ni registra la contraseña.
func AsegurarAdministrador(ctx context.Context, s Sembrador, h Hasher, ini Inicial) (creado bool, err error) {
	email := strings.TrimSpace(ini.Email)
	if email == "" || ini.Password == "" {
		return false, nil
	}

	existe, err := s.ExisteEmail(ctx, email)
	if err != nil {
		return false, fmt.Errorf("usuario: comprobando %s: %w", email, err)
	}
	if existe {
		return false, nil
	}

	hash, err := h.Hash(ini.Password)
	if err != nil {
		return false, fmt.Errorf("usuario: hash de la contraseña inicial: %w", err)
	}
	if hash == "" || hash == ini.Password {
		// Un Hasher roto no debe terminar guardando la clave en claro.
		return false, errors.New("usuario: el hasher no devolvió un hash válido")
	}

	nombre := strings.TrimSpace(ini.Nombre)
	if nombre == "" {
		nombre = "Super Admin"
	}

	if err := s.CrearAdministrador(ctx, NuevaCuenta{Nombre: nombre, Email: email, PasswordHash: hash}); err != nil {
		return false, fmt.Errorf("usuario: creando %s: %w", email, err)
	}
	return true, nil
}
