# Hotel Portal Norte 170 — sitio de reservas

Sitio público para huéspedes y panel de administración del Hotel Portal Norte 170 (Calle 174A # 47-24, Suba, Bogotá).
Todo corre en **Netlify**: páginas estáticas, API en **Netlify Functions** y datos y fotos en **Netlify Blobs**. No necesita base de datos externa ni servidor propio.

| Ruta | Para quién | Qué hace |
|---|---|---|
| `/` | Huéspedes | Habitaciones con fotos y precios, disponibilidad por fechas, solicitud de reserva, estado de «Mis solicitudes», contacto por WhatsApp |
| `/admin` | Administración (con contraseña) | Hoy, calendario de disponibilidad, motor de reservas, reservas, solicitudes del sitio, huéspedes (TRA/SIRE), habitaciones y fotos, ficha del alojamiento, respaldo JSON |

## Estructura

```
netlify.toml                 Configuración de publicación, funciones y cabeceras
package.json                 Dependencia @netlify/blobs
lib/seed.mjs                 Datos iniciales: ficha del hotel y las 10 habitaciones
netlify/functions/api.mjs    API: /api/public, /api/requests, /api/photos, /api/login, /api/admin/*
public/index.html            Sitio público
public/admin.html            Panel de administración
public/assets/               styles.css, common.js, guest.js, admin.js
```

## Despliegue (GitHub + Netlify)

1. **Sube el código a GitHub**
   ```bash
   cd portal-norte-170-web
   git init && git add . && git commit -m "Sitio de reservas Portal Norte 170"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/hotel-portal-norte-170.git
   git push -u origin main
   ```
2. **Crea el sitio en Netlify:** *Add new site → Import an existing project → GitHub* y elige el repositorio. Netlify toma la configuración de `netlify.toml` (no hay comando de build; la carpeta publicada es `public`).
3. **Configura las variables de entorno** en *Site configuration → Environment variables*:
   | Variable | Valor |
   |---|---|
   | `ADMIN_PASSWORD` | La contraseña del panel. Usa una larga y única. |
   | `TOKEN_SECRET` | Una cadena aleatoria de 32+ caracteres. Genera una con `openssl rand -hex 32`. |
4. **Vuelve a desplegar** (*Deploys → Trigger deploy*) para que la función lea las variables.
5. Entra a `https://<tu-sitio>.netlify.app/admin` con la contraseña. En la primera carga se crean la ficha del hotel y las 10 habitaciones.
6. En el panel: escribe el **WhatsApp** del hotel en *Alojamiento → Editar ficha*, ajusta tarifas y sube las **fotos** de cada habitación.
7. Opcional: conecta tu dominio en *Domain management*.

Cada `git push` a `main` vuelve a publicar el sitio. Los datos viven en Netlify Blobs y no se pierden al desplegar.

## Desarrollo local

```bash
npm install
npx netlify-cli login
npx netlify-cli link        # enlaza la carpeta con el sitio de Netlify (necesario para Blobs)
npx netlify-cli dev         # http://localhost:8888
```
Crea un archivo `.env` (no se sube a Git) con `ADMIN_PASSWORD` y `TOKEN_SECRET` para probar el login.

## Cómo funciona

- **Disponibilidad:** el servidor la calcula a partir de las reservas activas. El sitio público solo recibe fechas ocupadas por habitación, nunca nombres ni datos de huéspedes.
- **Sin sobreventa:** la API rechaza reservas o solicitudes que se crucen con otra reserva activa de la misma habitación (salida y entrada el mismo día sí se permiten).
- **Solicitudes:** el huésped envía nombre, documento, teléfono y autorización de datos (Ley 1581 de 2012). Recibe un código y puede consultar el estado desde el mismo navegador con su teléfono. En el panel, *Solicitudes → Crear reserva* la convierte en reserva con el canal «Sitio web».
- **Seguridad:** el panel usa una sola contraseña (`ADMIN_PASSWORD`) y un token firmado con `TOKEN_SECRET` que vence a los 7 días. Para cerrar todas las sesiones abiertas, cambia `TOKEN_SECRET` y vuelve a desplegar. El formulario público tiene un campo trampa contra bots.
- **Fotos:** se reducen a 1800 px en el navegador antes de subirse (máx. 5 MB, JPG/PNG/WebP) y se sirven desde `/api/photos/<id>` con caché larga.

## Identidad visual

Logo definitivo: hongo-casa con puerta de madera y pasto. Archivos en `public/assets/`:

| Archivo | Uso |
|---|---|
| `logo-web.png` | Logo completo con fondo transparente (pie de página, ingreso al panel) |
| `logo-mark.png` | Solo el hongo, transparente (barra superior, banda de contacto, tarjetas sin foto, encabezado del panel) |
| `favicon-32.png`, `favicon-64.png` | Pestaña del navegador |
| `apple-touch-icon.png`, `icon-512.png` | Ícono del celular y foto de perfil (fondo crema) |
| `og-image.png` | Imagen al compartir el enlace |

Paleta (variables en `public/assets/styles.css`): marino para bandas y textos, rojo del logo para acciones, crema para fondos.

| Color | Hex | Uso |
|---|---|---|
| Marino | `#0E2A42` / `#091C2E` | Encabezados, bandas oscuras, pie, panel de administración |
| Rojo acción | `#C62D24` | Botones y enlaces (del sombrero del logo) |
| Rojo hongo | `#E2362B` | Pestaña activa y acentos |
| Crema / arena | `#FBEFD9` / `#F4EDE2` | Fondos de marca y secciones claras |
| Fondo | `#FAF7F2` | Fondo general |
| Madera | `#9D582C` | Acentos cálidos |
| Pasto | `#3E7A1F` | Disponibilidad y estados positivos |

Tipografía: Source Serif 4 (títulos, con cursiva de acento) y Plus Jakarta Sans (texto).

## Mantenimiento

- **Respaldo:** botón *Descargar respaldo* en el panel (JSON con hotel, habitaciones, huéspedes, reservas y solicitudes). Hazlo con regularidad.
- **Datos personales:** el sistema guarda datos de huéspedes. Publica tu política de tratamiento de datos y limita quién conoce la contraseña.
- **Concurrencia:** Netlify Blobs aplica «la última escritura gana». Para un hotel de 10 habitaciones con uno o dos administradores es suficiente; si varias personas editan la misma reserva a la vez, prevalece el último guardado.
- **Límites:** revisa los límites de funciones y almacenamiento de tu plan de Netlify.

## Pendiente / siguientes pasos

- Sincronización de calendario con Booking y Airbnb (iCal) para bloquear fechas automáticamente.
- Pago en línea del anticipo (Wompi, Mercado Pago o PayU).
- Usuarios individuales para el equipo (en lugar de una sola contraseña).
