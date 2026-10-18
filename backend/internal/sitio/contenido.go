package sitio

import (
	"context"
	"errors"
	"net/mail"
	"strings"

	"hotelerias/backend/internal/auditoria"
	"hotelerias/backend/internal/platform/httpx"
)

// ---------------------------------------------------------------- portada (banners)

func normalizarBanner(in *BannerInput) error {
	var err error
	if in.Titulo, err = texto("Título", in.Titulo, 120, true); err != nil {
		return err
	}
	if in.Subtitulo, err = texto("Subtítulo", in.Subtitulo, 200, false); err != nil {
		return err
	}
	if in.EnlaceTexto, err = texto("Texto del botón", in.EnlaceTexto, 40, false); err != nil {
		return err
	}
	if in.EnlaceURL, err = enlace(in.EnlaceURL); err != nil {
		return err
	}
	switch {
	case in.EnlaceURL != "" && in.EnlaceTexto == "":
		return httpx.Validacion("Ponle un texto al botón, o quita el enlace")
	case in.EnlaceTexto != "" && in.EnlaceURL == "":
		return httpx.Validacion("El botón necesita un enlace, o quita su texto")
	case in.Orden < -1000 || in.Orden > 1000:
		return httpx.Validacion("El orden debe estar entre -1000 y 1000")
	case in.Desde != nil && in.Hasta != nil && in.Hasta.Antes(*in.Desde):
		return httpx.Validacion("«Hasta» no puede ser anterior a «Desde»")
	}
	return nil
}

func camposBanner(b Banner) map[string]any {
	return map[string]any{"título": b.Titulo, "orden": b.Orden, "activo": b.Activo, "enlace": b.EnlaceURL}
}

func (s *Servicio) Banners(ctx context.Context) ([]Banner, error) {
	return s.repo.ListarBanners(ctx, false, s.hoy())
}

// BannersVigentes son los que la web muestra hoy: activos y dentro de sus fechas.
func (s *Servicio) BannersVigentes(ctx context.Context) ([]Banner, error) {
	return s.repo.ListarBanners(ctx, true, s.hoy())
}

func (s *Servicio) CrearBanner(ctx context.Context, in BannerInput, actor int64) (Banner, error) {
	if err := normalizarBanner(&in); err != nil {
		return Banner{}, err
	}
	if err := s.medioValido(ctx, in.MedioID); err != nil {
		return Banner{}, err
	}
	id, err := s.repo.CrearBanner(ctx, in)
	if err != nil {
		return Banner{}, err
	}
	b, err := s.repo.ObtenerBanner(ctx, id)
	if err != nil {
		return Banner{}, err
	}
	s.registrar(ctx, actor, "Banner", id, auditoria.Creado, nil, camposBanner(b))
	return b, nil
}

func (s *Servicio) ActualizarBanner(ctx context.Context, id int64, in BannerInput, actor int64) (Banner, error) {
	if err := normalizarBanner(&in); err != nil {
		return Banner{}, err
	}
	antes, err := s.repo.ObtenerBanner(ctx, id)
	if err != nil {
		return Banner{}, err
	}
	if err := s.medioValido(ctx, in.MedioID); err != nil {
		return Banner{}, err
	}
	if err := s.repo.ActualizarBanner(ctx, id, in); err != nil {
		return Banner{}, err
	}
	b, err := s.repo.ObtenerBanner(ctx, id)
	if err != nil {
		return Banner{}, err
	}
	a, d := auditoria.Diferencia(camposBanner(antes), camposBanner(b))
	if len(d) > 0 {
		s.registrar(ctx, actor, "Banner", id, auditoria.Actualizado, a, d)
	}
	return b, nil
}

func (s *Servicio) EliminarBanner(ctx context.Context, id int64, actor int64) error {
	antes, err := s.repo.ObtenerBanner(ctx, id)
	if err != nil {
		return err
	}
	if err := s.repo.EliminarBanner(ctx, id); err != nil {
		return err
	}
	s.registrar(ctx, actor, "Banner", id, auditoria.Eliminado, camposBanner(antes), nil)
	return nil
}

// ---------------------------------------------------------------- experiencias

func normalizarExperiencia(in *ExperienciaInput) error {
	var err error
	if in.Titulo, err = texto("Título", in.Titulo, 80, true); err != nil {
		return err
	}
	if in.Resumen, err = texto("Resumen", in.Resumen, 160, false); err != nil {
		return err
	}
	if in.Texto, err = texto("Texto", in.Texto, 3000, false); err != nil {
		return err
	}
	limpios := make([]string, 0, len(in.Ejemplos))
	for _, e := range in.Ejemplos {
		v, err := texto("Ejemplo", e, 60, false)
		if err != nil {
			return err
		}
		if v != "" {
			limpios = append(limpios, v)
		}
	}
	if len(limpios) > 8 {
		return httpx.Validacion("Una experiencia admite hasta 8 ejemplos")
	}
	in.Ejemplos = limpios
	if in.Orden < -1000 || in.Orden > 1000 {
		return httpx.Validacion("El orden debe estar entre -1000 y 1000")
	}
	return nil
}

func (s *Servicio) Experiencias(ctx context.Context) ([]Experiencia, error) {
	return s.repo.ListarExperiencias(ctx, false)
}

func (s *Servicio) ExperienciasActivas(ctx context.Context) ([]Experiencia, error) {
	return s.repo.ListarExperiencias(ctx, true)
}

func (s *Servicio) CrearExperiencia(ctx context.Context, in ExperienciaInput, actor int64) (Experiencia, error) {
	if err := normalizarExperiencia(&in); err != nil {
		return Experiencia{}, err
	}
	if err := s.medioValido(ctx, in.MedioID); err != nil {
		return Experiencia{}, err
	}
	slug, err := s.slugLibre(ctx, "experiencia", in.Titulo, 0)
	if err != nil {
		return Experiencia{}, err
	}
	id, err := s.repo.CrearExperiencia(ctx, slug, in)
	if errors.Is(err, ErrSlugRepetido) {
		return Experiencia{}, httpx.Conflicto("Otra persona creó una experiencia con ese nombre al mismo tiempo. Inténtalo de nuevo")
	}
	if err != nil {
		return Experiencia{}, err
	}
	e, err := s.repo.ObtenerExperiencia(ctx, id)
	if err != nil {
		return Experiencia{}, err
	}
	s.registrar(ctx, actor, "Experiencia", id, auditoria.Creado, nil, map[string]any{"título": e.Titulo, "activo": e.Activo})
	return e, nil
}

func (s *Servicio) ActualizarExperiencia(ctx context.Context, id int64, in ExperienciaInput, actor int64) (Experiencia, error) {
	if err := normalizarExperiencia(&in); err != nil {
		return Experiencia{}, err
	}
	antes, err := s.repo.ObtenerExperiencia(ctx, id)
	if err != nil {
		return Experiencia{}, err
	}
	if err := s.medioValido(ctx, in.MedioID); err != nil {
		return Experiencia{}, err
	}
	// La dirección (slug) NO cambia al editar el título: los enlaces que ya circulan siguen sirviendo.
	if err := s.repo.ActualizarExperiencia(ctx, id, antes.Slug, in); err != nil {
		return Experiencia{}, err
	}
	e, err := s.repo.ObtenerExperiencia(ctx, id)
	if err != nil {
		return Experiencia{}, err
	}
	a, d := auditoria.Diferencia(
		map[string]any{"título": antes.Titulo, "activo": antes.Activo, "orden": antes.Orden},
		map[string]any{"título": e.Titulo, "activo": e.Activo, "orden": e.Orden})
	if len(d) > 0 {
		s.registrar(ctx, actor, "Experiencia", id, auditoria.Actualizado, a, d)
	}
	return e, nil
}

func (s *Servicio) EliminarExperiencia(ctx context.Context, id int64, actor int64) error {
	antes, err := s.repo.ObtenerExperiencia(ctx, id)
	if err != nil {
		return err
	}
	if err := s.repo.EliminarExperiencia(ctx, id); err != nil {
		return err
	}
	s.registrar(ctx, actor, "Experiencia", id, auditoria.Eliminado, map[string]any{"título": antes.Titulo}, nil)
	return nil
}

// ---------------------------------------------------------------- blog

func normalizarEntrada(in *EntradaInput) error {
	var err error
	if in.Titulo, err = texto("Título", in.Titulo, 120, true); err != nil {
		return err
	}
	if in.Resumen, err = texto("Resumen", in.Resumen, 240, false); err != nil {
		return err
	}
	in.Cuerpo = strings.TrimSpace(in.Cuerpo)
	if len([]rune(in.Cuerpo)) > 20000 {
		return httpx.Validacion("«Cuerpo» no puede pasar de 20000 caracteres")
	}
	return nil
}

func (s *Servicio) Entradas(ctx context.Context) ([]Entrada, error) {
	return s.repo.ListarEntradas(ctx, false, 500, 0)
}

func (s *Servicio) ObtenerEntrada(ctx context.Context, id int64) (Entrada, error) {
	return s.repo.ObtenerEntrada(ctx, id)
}

// EntradasPublicadas es la lista de la web: sin el cuerpo (eso se pide al abrir la historia).
func (s *Servicio) EntradasPublicadas(ctx context.Context, limite, desplazamiento int) ([]Entrada, error) {
	if limite < 1 || limite > 50 {
		limite = 12
	}
	if desplazamiento < 0 {
		desplazamiento = 0
	}
	es, err := s.repo.ListarEntradas(ctx, true, limite, desplazamiento)
	for i := range es {
		es[i].Cuerpo = ""
	}
	return es, err
}

func (s *Servicio) EntradaPublicada(ctx context.Context, slug string) (Entrada, error) {
	return s.repo.EntradaPorSlug(ctx, strings.ToLower(strings.TrimSpace(slug)), true)
}

func (s *Servicio) CrearEntrada(ctx context.Context, in EntradaInput, actor int64) (Entrada, error) {
	if err := normalizarEntrada(&in); err != nil {
		return Entrada{}, err
	}
	if err := s.medioValido(ctx, in.PortadaID); err != nil {
		return Entrada{}, err
	}
	slug, err := s.slugLibre(ctx, "entrada", in.Titulo, 0)
	if err != nil {
		return Entrada{}, err
	}
	id, err := s.repo.CrearEntrada(ctx, slug, in, actor)
	if errors.Is(err, ErrSlugRepetido) {
		return Entrada{}, httpx.Conflicto("Otra persona creó una historia con ese título al mismo tiempo. Inténtalo de nuevo")
	}
	if err != nil {
		return Entrada{}, err
	}
	e, err := s.repo.ObtenerEntrada(ctx, id)
	if err != nil {
		return Entrada{}, err
	}
	s.registrar(ctx, actor, "Entrada", id, auditoria.Creado, nil, map[string]any{"título": e.Titulo, "estado": string(e.Estado)})
	return e, nil
}

func (s *Servicio) ActualizarEntrada(ctx context.Context, id int64, in EntradaInput, actor int64) (Entrada, error) {
	if err := normalizarEntrada(&in); err != nil {
		return Entrada{}, err
	}
	antes, err := s.repo.ObtenerEntrada(ctx, id)
	if err != nil {
		return Entrada{}, err
	}
	if err := s.medioValido(ctx, in.PortadaID); err != nil {
		return Entrada{}, err
	}
	// Una historia ya publicada no puede quedar sin cuerpo.
	if antes.Estado == Publicada && strings.TrimSpace(in.Cuerpo) == "" {
		return Entrada{}, httpx.Validacion("Una historia publicada necesita texto. Despublícala primero si quieres vaciarla")
	}
	if err := s.repo.ActualizarEntrada(ctx, id, antes.Slug, in); err != nil {
		return Entrada{}, err
	}
	e, err := s.repo.ObtenerEntrada(ctx, id)
	if err != nil {
		return Entrada{}, err
	}
	a, d := auditoria.Diferencia(
		map[string]any{"título": antes.Titulo, "resumen": antes.Resumen},
		map[string]any{"título": e.Titulo, "resumen": e.Resumen})
	if len(d) > 0 || antes.Cuerpo != e.Cuerpo {
		if antes.Cuerpo != e.Cuerpo {
			d["cuerpo"] = "(editado)"
		}
		s.registrar(ctx, actor, "Entrada", id, auditoria.Actualizado, a, d)
	}
	return e, nil
}

// PublicarEntrada y DespublicarEntrada: escribir y publicar son permisos distintos.
func (s *Servicio) PublicarEntrada(ctx context.Context, id int64, publicar bool, actor int64) (Entrada, error) {
	e, err := s.repo.ObtenerEntrada(ctx, id)
	if err != nil {
		return Entrada{}, err
	}
	if publicar {
		if strings.TrimSpace(e.Cuerpo) == "" {
			return Entrada{}, httpx.Validacion("Escribe el texto de la historia antes de publicarla")
		}
		if e.Estado == Publicada {
			return e, nil
		}
	} else if e.Estado == Borrador {
		return e, nil
	}
	if err := s.repo.CambiarEstadoEntrada(ctx, id, publicar, s.ahora()); err != nil {
		return Entrada{}, err
	}
	nuevo := Borrador
	if publicar {
		nuevo = Publicada
	}
	s.registrar(ctx, actor, "Entrada", id, auditoria.Actualizado,
		map[string]any{"estado": string(e.Estado)}, map[string]any{"estado": string(nuevo), "título": e.Titulo})
	return s.repo.ObtenerEntrada(ctx, id)
}

func (s *Servicio) EliminarEntrada(ctx context.Context, id int64, actor int64) error {
	antes, err := s.repo.ObtenerEntrada(ctx, id)
	if err != nil {
		return err
	}
	if err := s.repo.EliminarEntrada(ctx, id); err != nil {
		return err
	}
	s.registrar(ctx, actor, "Entrada", id, auditoria.Eliminado, map[string]any{"título": antes.Titulo, "estado": string(antes.Estado)}, nil)
	return nil
}

// ---------------------------------------------------------------- páginas

func claveValida(clave string) error {
	if clave != "nosotros" && clave != "contacto" {
		return ErrNoEncontrado
	}
	return nil
}

func (s *Servicio) Pagina(ctx context.Context, clave string) (Pagina, error) {
	if err := claveValida(clave); err != nil {
		return Pagina{}, err
	}
	return s.repo.ObtenerPagina(ctx, clave)
}

func (s *Servicio) GuardarPagina(ctx context.Context, clave string, in PaginaInput, actor int64) (Pagina, error) {
	if err := claveValida(clave); err != nil {
		return Pagina{}, err
	}
	var err error
	if in.Titulo, err = texto("Título", in.Titulo, 80, true); err != nil {
		return Pagina{}, err
	}
	in.Cuerpo = strings.TrimSpace(in.Cuerpo)
	if len([]rune(in.Cuerpo)) > 10000 {
		return Pagina{}, httpx.Validacion("«Texto» no puede pasar de 10000 caracteres")
	}
	if err := s.medioValido(ctx, in.MedioID); err != nil {
		return Pagina{}, err
	}
	antes, err := s.repo.ObtenerPagina(ctx, clave)
	if err != nil {
		return Pagina{}, err
	}
	if err := s.repo.GuardarPagina(ctx, clave, in); err != nil {
		return Pagina{}, err
	}
	nueva, err := s.repo.ObtenerPagina(ctx, clave)
	if err != nil {
		return Pagina{}, err
	}
	cambios := map[string]any{}
	if antes.Titulo != nueva.Titulo {
		cambios["título"] = nueva.Titulo
	}
	if antes.Cuerpo != nueva.Cuerpo {
		cambios["texto"] = "(editado)"
	}
	if len(cambios) > 0 {
		s.auditoria.Registrar(ctx, auditoria.Evento{
			UsuarioID: actor, Entidad: "Pagina", EntidadID: clave, Accion: auditoria.Actualizado, Despues: cambios,
		})
	}
	return nueva, nil
}

// ---------------------------------------------------------------- galerías

const maxGaleria = 30

func entidadValida(entidad string) error {
	if entidad != EntidadSede && entidad != EntidadTipo {
		return ErrNoEncontrado
	}
	return nil
}

func (s *Servicio) Destinos(ctx context.Context) ([]Destino, error) { return s.repo.Destinos(ctx) }

func (s *Servicio) Galeria(ctx context.Context, entidad string, id int64) ([]MedioRef, error) {
	if err := entidadValida(entidad); err != nil {
		return nil, err
	}
	return s.repo.ObtenerGaleria(ctx, entidad, id)
}

// GuardarGaleria deja la galería con esos medios, en ese orden.
func (s *Servicio) GuardarGaleria(ctx context.Context, entidad string, id int64, medioIDs []int64, actor int64) ([]MedioRef, error) {
	if err := entidadValida(entidad); err != nil {
		return nil, err
	}
	ok, err := s.repo.ExisteEntidad(ctx, entidad, id)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNoEncontrado
	}
	if len(medioIDs) > maxGaleria {
		return nil, httpx.Validacion("Una galería admite hasta 30 archivos")
	}
	vistos := map[int64]bool{}
	for _, m := range medioIDs {
		if vistos[m] {
			return nil, httpx.Validacion("Un mismo archivo no puede estar dos veces en la galería")
		}
		vistos[m] = true
		if err := s.medioValido(ctx, &m); err != nil {
			return nil, err
		}
	}
	if err := s.repo.GuardarGaleria(ctx, entidad, id, medioIDs); err != nil {
		return nil, err
	}
	s.registrar(ctx, actor, "Galeria", id, auditoria.Actualizado, nil, map[string]any{"de": entidad, "archivos": len(medioIDs)})
	return s.repo.ObtenerGaleria(ctx, entidad, id)
}

// ---------------------------------------------------------------- mensajes de contacto

// RecibirMensaje guarda lo que escribió un visitante. Si llega con el cebo para robots lleno,
// responde como si hubiera funcionado (para no avisarle al robot) y no guarda nada.
func (s *Servicio) RecibirMensaje(ctx context.Context, in MensajeInput) error {
	if strings.TrimSpace(in.Sitio) != "" {
		return nil
	}
	var err error
	if in.Nombre, err = texto("Nombre", in.Nombre, 80, true); err != nil {
		return err
	}
	if in.Email, err = texto("Correo", in.Email, 120, true); err != nil {
		return err
	}
	if a, err := mail.ParseAddress(in.Email); err != nil || a.Name != "" || a.Address != in.Email {
		return httpx.Validacion("El correo no es válido")
	}
	if in.Telefono, err = texto("Teléfono", in.Telefono, 30, false); err != nil {
		return err
	}
	if in.Asunto, err = texto("Asunto", in.Asunto, 120, false); err != nil {
		return err
	}
	if in.Mensaje, err = texto("Mensaje", in.Mensaje, 2000, true); err != nil {
		return err
	}
	if len([]rune(in.Mensaje)) < 10 {
		return httpx.Validacion("Cuéntanos un poco más: el mensaje es muy corto")
	}
	_, err = s.repo.CrearMensaje(ctx, in)
	return err
}

func (s *Servicio) Mensajes(ctx context.Context, estado EstadoMensaje) ([]Mensaje, error) {
	switch estado {
	case "", Nuevo, Leido, Respondido:
		return s.repo.ListarMensajes(ctx, estado)
	}
	return nil, httpx.Validacion("Estado no válido")
}

func (s *Servicio) CambiarEstadoMensaje(ctx context.Context, id int64, estado EstadoMensaje, actor int64) error {
	if estado != Nuevo && estado != Leido && estado != Respondido {
		return httpx.Validacion("Estado no válido")
	}
	if err := s.repo.CambiarEstadoMensaje(ctx, id, estado); err != nil {
		return err
	}
	s.registrar(ctx, actor, "Mensaje", id, auditoria.Actualizado, nil, map[string]any{"estado": string(estado)})
	return nil
}

func (s *Servicio) EliminarMensaje(ctx context.Context, id int64, actor int64) error {
	if err := s.repo.EliminarMensaje(ctx, id); err != nil {
		return err
	}
	s.registrar(ctx, actor, "Mensaje", id, auditoria.Eliminado, nil, nil)
	return nil
}
