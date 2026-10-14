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
lib/gcal.mjs                 Google Calendar (tiempo real) y enlace iCal privado
lib/ical.mjs                 Importación/exportación iCal con Booking.com y Airbnb
netlify/functions/api.mjs    API: /api/public, /api/requests, /api/photos, /api/login, /api/admin/*
netlify/functions/ical-sync.mjs  Tarea programada: lee los calendarios de los canales cada 15 min
lib/notify.mjs               Notificaciones por correo (Resend o Gmail)
public/reserva.html          Página del huésped: confirmación + check-in en línea (TRA, selfie y documento)
public/assets/pdf.js         Generador de PDF propio, sin librerías externas
public/assets/promo.js       Portada rotativa y galería por categorías del sitio público
public/assets/promo/         Fotos promocionales optimizadas (fachada, acceso, pasillos, cocina, zona retro, seguridad, barrio)
public/assets/docs.js        Confirmación, ficha de reserva con registro hotelero y listado en PDF; WhatsApp
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

## Google Calendar

Cada reserva se refleja en el calendario **cbernal@gesoltec.co**: se crea o actualiza al guardarla y se borra al cancelarla o eliminarla. El evento va del check-in (15:00) al check-out (11:00) y lleva el nombre del huésped, su teléfono, la habitación, el canal, el estado y el saldo. Hay dos formas de conectarlo. Puedes usar las dos a la vez.

### A) Sincronización en tiempo real (recomendada)

**Opción 1: cuenta de servicio**

1. En <https://console.cloud.google.com> crea un proyecto, por ejemplo «portal-norte-170».
2. Ve a *APIs y servicios → Biblioteca* y habilita **Google Calendar API**.
3. Ve a *IAM → Cuentas de servicio → Crear cuenta de servicio*. Ponle un nombre, por ejemplo «reservas»; no necesita roles.
4. Entra a la cuenta creada y ve a *Claves → Agregar clave → JSON*. Se descarga un archivo con `client_email` y `private_key`.
5. Abre Google Calendar con cbernal@gesoltec.co. En *Configuración → (tu calendario) → Compartir con personas específicas*, agrega el `client_email` con el permiso **«Hacer cambios en eventos»**.
6. En Netlify ve a *Site configuration → Environment variables* y agrega:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: el `client_email`.
   - `GOOGLE_PRIVATE_KEY`: la `private_key` completa, incluidas las líneas `-----BEGIN/END PRIVATE KEY-----`. Puedes dejar los `\n` tal como vienen.
   - `GOOGLE_CALENDAR_ID` (opcional): por defecto es cbernal@gesoltec.co.
7. Haz *Deploys → Trigger deploy*. Luego, en el panel, ve a **Alojamiento → Google Calendar** y pulsa **Sincronizar todas las reservas** para pasar las reservas que ya existen.

**Opción 2: OAuth.** Úsala si Google Workspace no permite compartir el calendario con la cuenta de servicio.

1. En el mismo proyecto de Cloud, configura la *Pantalla de consentimiento OAuth* como interna o externa y agrega tu correo como usuario de prueba.
2. Ve a *Credenciales → Crear ID de cliente OAuth → Aplicación web*. Como URI de redirección usa `https://developers.google.com/oauthplayground`.
3. En <https://developers.google.com/oauthplayground>, abre el engranaje, marca *Use your own OAuth credentials* y pega el ID y el secreto.
4. Autoriza el alcance `https://www.googleapis.com/auth/calendar.events` con cbernal@gesoltec.co. Luego pulsa *Exchange authorization code for tokens* y copia el **refresh token**.
5. En Netlify agrega `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REFRESH_TOKEN`. Después vuelve a desplegar y sincroniza.

> **Importante:** con gesoltec.co (Google Workspace) elige el tipo de usuario **«Interno»** en la pantalla de consentimiento. Si queda «Externo» en modo **Prueba**, Google invalida el refresh token a los 7 días y la sincronización deja de funcionar sin aviso (el botón «Probar conexión» lo detecta).

**Qué se actualiza al instante** (en cuanto se guarda el cambio, sin esperar):

- Reserva creada, editada (fechas, habitación, estado, pagos, notas), cancelada o eliminada.
- Reservas aceptadas desde una solicitud del sitio web, y las que entran o cambian desde Booking/Airbnb.
- Check-in en línea completado por el huésped, contrato firmado o anulado.
- Cambios en la ficha del huésped (nombre, teléfono) o de la habitación (número, nombre): se actualizan todos sus eventos vigentes.
- Cambios en la hora de check-in/check-out, el nombre o la dirección del hotel: se mueven todos los eventos vigentes.

**Comprobar la conexión.** En **Alojamiento → Google Calendar** pulsa **Probar conexión**: crea y borra un evento de prueba y, si falla, muestra el error exacto de Google y qué corregir (calendario no compartido, API no habilitada, token vencido…). La tarjeta muestra también la última sincronización y su resultado.

**Si Google falla**, la reserva se guarda igual, el panel avisa y el cambio queda en una **cola de reintentos**: la función programada lo reintenta cada 15 minutos (hasta 12 horas), o puedes pulsar **Reintentar ahora**.

### B) Suscripción iCal (sin configuración)

En **Alojamiento → Google Calendar** está el enlace privado del feed (`/api/calendar/<token>.ics`). Para usarlo:

- Pulsa **Agregar a Google Calendar**, o en Google Calendar ve a *Otros calendarios → + → Desde URL* y pega el enlace.
- Google refresca las suscripciones cada pocas horas, así que el feed **no es instantáneo**. Es solo lectura.
- Si activas la opción A, **quita esta suscripción de Google Calendar** (o verás cada reserva dos veces). Suscribirla más de una vez también duplica los eventos.
- El enlace es privado. Si se filtra, cámbialo: define `CALENDAR_FEED_TOKEN` con un valor nuevo (o cambia `TOKEN_SECRET`) y vuelve a desplegar.

## Booking.com y Airbnb (iCal)

Las reservas y fechas cerradas de cada canal se importan solas **cada 15 minutos** con la función programada `ical-sync`. Las funciones programadas solo corren en el sitio publicado, no en las vistas previas de Netlify. Cada evento importado:

- se guarda como una reserva del canal y bloquea la habitación en el panel, en el motor y en el sitio público;
- se envía a Google Calendar (cbernal@gesoltec.co) si la sincronización en tiempo real está configurada, y aparece también en el enlace iCal privado;
- se actualiza si el canal cambia las fechas y se cancela sola si desaparece del canal antes de la llegada. Si vuelve a aparecer, se reactiva;
- si se cruza con otra reserva de la misma habitación, el panel muestra el aviso **«Posible sobreventa»**.

Los canales no envían todo:

- **Booking.com** no envía nombres ni valores. Marca igual las reservas y las fechas cerradas, por eso aparecen como «Ocupado en Booking.com».
- **Airbnb** envía el código de la reserva y los últimos 4 dígitos del teléfono.
- En ambos casos puedes editar la reserva para asociar el huésped, el valor y los pagos. Esos datos se conservan en las siguientes sincronizaciones. Las fechas siempre las manda el canal.

### Conectar una habitación

1. **Copia el enlace de exportación del canal:**
   - **Booking.com:** en el Extranet ve a *Tarifas y disponibilidad → Sincronizar calendarios*, elige la habitación, luego *Añadir conexión de calendario* y copia el enlace de exportación.
   - **Airbnb:** entra a *Calendario*, elige el anuncio y ve a *Disponibilidad → Conectar calendarios → Conectar a otro sitio web*. Copia el enlace «Exportar calendario».
2. En el panel ve a **Alojamiento → Booking y Airbnb → Configurar** (o abre *Habitaciones → Editar*). Pulsa **+ Agregar calendario**, elige el canal, pega el enlace y guarda. La primera sincronización corre en ese momento.
3. **Sentido contrario:** en el mismo formulario están los enlaces **«para pegar en cada canal»**.
   - Pega el de Booking en Booking (*Importar calendario*) y el de Airbnb en Airbnb (*Importar calendario*).
   - Así cada canal cierra las fechas vendidas aquí o en el otro canal.
   - Estos enlaces no contienen datos de huéspedes. Cada canal los lee a su propio ritmo: Airbnb aproximadamente cada 2–3 horas y Booking varias veces al día.

El botón **Sincronizar ahora** fuerza una lectura inmediata. Si un canal falla (enlace vencido, por ejemplo), lo ya importado no se toca y la tarjeta muestra el error.

> Como la información llega con retraso, el riesgo de sobreventa nunca es cero. Revisa el aviso «Posible sobreventa» en la pestaña Hoy.

## Notificaciones por correo

El sistema envía un correo cuando:

- alguien pide una reserva en el sitio web;
- un huésped completa el check-in en línea;
- entra o se cancela una reserva de Booking/Airbnb;
- hay una posible sobreventa;
- un calendario de canal deja de leerse.

Los avisos de canales llegan agrupados y una sola vez por novedad. El destino por defecto es **cbernal@gesoltec.co**. Se cambia en **Alojamiento → Notificaciones por correo**, donde se pueden poner varios correos separados por coma o pausar los avisos.

Configura **un** servicio de correo en Netlify (*Site configuration → Environment variables*) y vuelve a desplegar.

**Opción A: Resend (la más simple)**

1. Crea una cuenta gratuita en <https://resend.com> **con el correo cbernal@gesoltec.co**.
2. Ve a *API Keys → Create API Key* y copia la clave (`re_…`).
3. En Netlify agrega `RESEND_API_KEY` con esa clave.
4. Vuelve a desplegar y pulsa **Enviar correo de prueba** en el panel.

Sin verificar un dominio, Resend solo entrega al correo dueño de la cuenta. Para enviar a otros correos, verifica el dominio gesoltec.co en Resend (*Domains*, son unos registros DNS). Después agrega `NOTIFY_FROM`, por ejemplo `Portal Norte 170 <reservas@gesoltec.co>`.

**Opción B: Gmail de tu cuenta de Google.** Sirve si ya conectaste Google Calendar con OAuth (opción 2 de esa sección).

1. Genera el refresh token en OAuth Playground con **dos** permisos: `https://www.googleapis.com/auth/calendar.events` y `https://www.googleapis.com/auth/gmail.send`.
2. Habilita **Gmail API** en el proyecto de Google Cloud.
3. Reemplaza `GOOGLE_REFRESH_TOKEN` en Netlify y vuelve a desplegar.

Si las dos opciones están configuradas, se usa Resend. Un correo que falla nunca bloquea la reserva; el panel muestra el último resultado.

## Check-in en línea, fotos y documentos

Cada reserva tiene un **enlace privado del huésped** (`/reserva?r=…&t=…`). Está en el detalle de la reserva, en la tarjeta **Huésped en línea**, con los botones *Copiar enlace* y *Enviar por WhatsApp*. El mensaje de WhatsApp ya va escrito con los datos de la reserva.

**Qué hace el huésped en el enlace:**

- Ve su confirmación, la descarga en PDF o la comparte, y abre la ubicación y el WhatsApp del hotel.
- Hace el **check-in en línea** para cada persona, incluidos los niños.
  - Llena los datos de la TRA: documento, nacionalidad, fecha de nacimiento, procedencia, destino, motivo y transporte.
  - Toma o sube su **selfie** y la **foto del documento** (frente obligatorio, reverso opcional).
  - Para menores de edad la selfie es opcional.
- Acepta la autorización de datos (Ley 1581 de 2012).

**Qué pasa al enviar:**

- Se crean o actualizan las fichas de huéspedes, con las fotos.
- La reserva queda marcada con «Check-in en línea» y el nombre del titular.
- Te llega un correo.
- Si lo envía de nuevo, se corrigen las mismas fichas sin duplicarlas.

**Privacidad:**

- Las fotos de identidad van en un almacén separado (`portal-norte-ids`). No tienen URL pública: solo se ven con la sesión del panel.
- Se borran al eliminar la ficha del huésped o al reemplazar la foto.
- El enlace del huésped solo funciona con su código y vence 30 días después de la salida.
- El check-in en línea se cierra si la reserva se cancela o finaliza.

En la ficha del huésped (pestaña Huéspedes) también puedes tomar o subir la selfie y el documento desde el panel.

## Contrato de hospedaje y políticas (firma electrónica)

Al hacer el check-in, el huésped titular lee y firma el **contrato de hospedaje**. El contrato incluye las políticas del hotel, los términos y condiciones generales y la cláusula de no reembolso.

**Dónde se firma:**
- **En línea:** en su enlace de reserva, después de enviar el check-in (paso 4 · Contrato).
- **En recepción:** al pulsar *Check-in* en el panel, si la reserva no tiene contrato, se abre la ventana de firma para entregarle el dispositivo al huésped. También está el botón *Firmar en recepción* en el detalle de la reserva. Existe la opción «Check-in sin firma», con doble confirmación, para casos excepcionales.

**Qué debe hacer el huésped:**
1. Desplazarse hasta el final del texto.
2. Marcar las tres declaraciones: acepta las políticas y los términos, acepta que la reserva no es reembolsable y autoriza el tratamiento de datos.
3. Escribir su nombre y documento.
4. Firmar con el dedo, un lápiz o el mouse.

**Qué se guarda en la reserva:**
- El nombre y el documento de quien firma.
- La fecha y hora (Bogotá) y el medio (enlace o recepción).
- La dirección IP y el dispositivo.
- La versión del texto y un **código de verificación**: la huella SHA-256 del texto, la reserva, el firmante, la fecha y la imagen de la firma.
- El **PDF del contrato**, generado en el servidor al momento de firmar. Se guarda en el almacén privado (`portal-norte-ids`) junto con su propia huella; el huésped lo descarga desde su enlace y el panel lo abre con *Ver contrato (PDF)*.
- *Anular firma* conserva la firma anterior en el historial y permite volver a firmar.
- Los datos de la firma no se pueden modificar desde el panel.

El texto se edita en **Alojamiento → Contrato y políticas**. Formato: «# » título, «## » subtítulo, «- » viñeta, «> » cláusula destacada. Cada cambio crea una versión nueva, y los contratos ya firmados conservan la suya.

En la misma tarjeta se configura el **Wi‑Fi**, que el huésped ve solo después de firmar.

> Recomendación: pide a un abogado que revise el texto del contrato, en especial la cláusula de no reembolso frente al Estatuto del Consumidor (Ley 1480 de 2011). La firma electrónica con registro de evidencias se apoya en la Ley 527 de 1999.

## Imprimir y compartir

Los PDF se generan en el navegador, sin servicios externos:

- **Confirmación de reserva:** datos de la estadía, pago, saldo, enlace de check-in, cómo llegar y políticas. Está en el detalle de la reserva con *Descargar PDF*, *Imprimir* y *Compartir PDF*. En el celular, «Compartir PDF» abre la hoja de compartir, y desde ahí se elige WhatsApp.
- **Ficha de reserva y registro hotelero:** estancia, pago y una tarjeta por huésped con los datos TRA, la selfie y las fotos del documento. Al final lleva la autorización y las líneas de firma.
- **Listado de reservas:** pestaña Reservas → *Imprimir listado*. Usa los filtros que tengas aplicados (fechas, estado, canal, búsqueda) e incluye los totales.

## Fotos promocionales del sitio

La portada y la galería usan las fotos de `public/assets/promo/`, ya optimizadas y con la marca de agua del hotel. Para cambiarlas:

1. Reemplaza el archivo manteniendo el mismo nombre, o agrega uno nuevo.
2. Si es nuevo, regístralo en `public/assets/promo.js`: en `HERO` si va en la portada, o en `PHOTOS` con su categoría y su texto.

Si en el panel eliges una «foto de portada», esa entra primero en la rotación. Las fotos de cada habitación se siguen administrando desde el panel.

## Mantenimiento

- **Respaldo:** botón *Descargar respaldo* en el panel (JSON con hotel, habitaciones, huéspedes, reservas y solicitudes). Hazlo con regularidad.
- **Datos personales:** el sistema guarda datos de huéspedes. Publica tu política de tratamiento de datos y limita quién conoce la contraseña.
- **Concurrencia:** Netlify Blobs aplica «la última escritura gana». Para un hotel de 10 habitaciones con uno o dos administradores es suficiente; si varias personas editan la misma reserva a la vez, prevalece el último guardado.
- **Límites:** revisa los límites de funciones y almacenamiento de tu plan de Netlify.

## Pendiente / siguientes pasos

- Channel manager con API (tarifas y disponibilidad en tiempo real) si el volumen de reservas en OTAs crece.
- Pago en línea del anticipo (Wompi, Mercado Pago o PayU).
- Usuarios individuales para el equipo (en lugar de una sola contraseña).
