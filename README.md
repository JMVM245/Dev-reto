# DevSync Empleos · demo de reclutamiento y Buk ATS

Panel local de reclutamiento inspirado en la vista de empleos publicados de LinkedIn. No consulta LinkedIn ni requiere acceso a esa plataforma. El reclutador puede revisar las vacantes de demostración, importar los postulantes de un CSV y enviar cada candidato a Buk desde el panel.

## Flujo de demostración

1. Abre **Empleos publicados** y selecciona una vacante activa.
2. Importa un archivo CSV exportado desde Excel o desde una fuente autorizada.
3. Revisa los candidatos y usa **Enviar a Buk** en la fila correspondiente.
4. La postulación enviada queda disponible en **Postulados en Buk** (`/postulados`).

El CSV debe incluir nombre y correo. También puede contener celular, ciudad, país, URL del CV, URL de LinkedIn, fecha de postulación y tipo o número de documento. Si el documento no viene en el archivo, el panel lo solicita antes del envío porque el contrato actual de Buk lo requiere. El PDF del CV debe tener una URL pública para que Buk pueda recibir el enlace; el demo no carga archivos locales.

## Conector

El endpoint `POST /api/postulacion` conserva la validación, el mapeo y la detección de duplicados del conector. Los registros importados y las postulaciones aceptadas se guardan en `data/postulantes.json` para que aparezcan en la bandeja ATS local.

El archivo `.env.local` está configurado en modo `mock` para la demostración y no escribe en una cuenta real de Buk. Para conectarlo a una cuenta de Buk se necesitan el entorno de pruebas, la API Key y los IDs reales de los procesos de selección.

## Motor de preselección integrado

Del paquete CEIBA se migró al backend la regla de evaluación por respuestas a preguntas del cargo. No se migró su interfaz estática ni su transporte `Netlify Forms`/`/api/v1/applicants`, porque no corresponde al flujo de Buk de este proyecto. DevSync conserva el registro en dos pasos que ya usa: crear ficha del postulante y luego crear su postulación asociada a un proceso de selección.

El motor se puede consultar sin enviar a Buk mediante `POST /api/evaluar-postulacion`:

```json
{
  "preguntas": [
    { "id": "experiencia", "texto": "¿Tiene 2 años de experiencia?", "tipo": "sino", "obligatoria": true, "respuestaAprobatoria": true },
    { "id": "anios", "texto": "Años de experiencia", "tipo": "numero", "obligatoria": false, "minimo": 2 },
    { "id": "stack", "texto": "Tecnología principal", "tipo": "lista", "obligatoria": false, "opcionesAprobatorias": ["TypeScript", "JavaScript"] }
  ],
  "respuestas": { "experiencia": "sí", "anios": "3", "stack": "TypeScript" }
}
```

También se puede incluir ese objeto como `screening` en `POST /api/postulacion`. El conector vuelve a calcular el resultado en el servidor: un fallo en una pregunta obligatoria o un puntaje menor al 60% detiene el envío; de 60% a 79% queda en revisión; desde 80% cumple. La evaluación y su detalle se guardan en la ficha local y aparecen en la respuesta de la API. No se agrega al payload de Buk ningún atributo de evaluación no confirmado para el tenant.

Las preguntas y respuestas llegan en el cuerpo de la petición; por eso esto sirve como motor de demostración e integración. Antes de usarlo para selección real, las preguntas deben mantenerse en configuración confiable del servidor, con autenticación y revisión humana. Este cálculo no lee ni interpreta el PDF ni obtiene información de LinkedIn.

En modo `BUK_MODE=real`, cada vacante requiere su propio ID en `BUK_VACANCY_MAP`; una referencia sin asignación explícita se rechaza en vez de caer en el ID por defecto. En modo `mock` se conserva el valor por defecto para facilitar la demostración.

## Formulario público desde LinkedIn

Cada vacante activa tiene un formulario del tipo `/postular?vacante=DEV-BE-2026`. En el panel, el botón **Postularse** abre directamente el formulario con esa vacante precargada. Para una publicación real en LinkedIn, el reclutador configura la URL pública HTTPS de DevSync en el campo de formulario externo/enlace de postulación de la publicación; LinkedIn abre ese formulario cuando la persona pulsa la acción de postularse. La persona completa sus datos, puede elegir otra vacante activa, adjunta un PDF y autoriza el tratamiento de datos.

El formulario obtiene las vacantes de `GET /api/vacantes`, guarda el PDF mediante `POST /api/cv` y envía la postulación a `POST /api/postulacion`. En local sin Supabase el archivo se escribe en `data/cv/`; con Supabase, el PDF va al bucket privado `hojas-de-vida` y la postulación queda en la tabla `postulaciones`. En Vercel Supabase es obligatorio porque las funciones no conservan archivos locales.

## Supabase para despliegue en Vercel

El formulario público está en `/postular` y la entrada principal `/` también abre ese formulario. La bandeja privada de Buk ATS está en `/buk`; `/postulados` redirige allí por compatibilidad. Cada envío aceptado se registra en Supabase y su PDF se guarda en el bucket privado `hojas-de-vida`. La bandeja genera enlaces temporales a los PDF. En local, si no se configuran variables Supabase, el demo continúa usando los archivos locales.

1. Crea un proyecto Supabase y abre **SQL Editor**.
2. Ejecuta el contenido de `supabase/migrations/001_create_postulaciones.sql`. Crea la tabla `postulaciones` y el bucket privado de CV.
3. Copia **Project URL** y **Secret key** de la sección API Keys del proyecto a `.env.local` con las variables `SUPABASE_URL` y `SUPABASE_SECRET_KEY`. La publishable key puede guardarse como `SUPABASE_PUBLISHABLE_KEY`, pero el servidor usa la Secret key para las operaciones de escritura. La Secret key no debe llevar prefijo `NEXT_PUBLIC_` ni subirse a Git.
4. Define `PANEL_PASSWORD` y `PANEL_SESSION_SECRET` en `.env.local`. Usa una contraseña del reclutador y un secreto aleatorio largo (mínimo 32 caracteres). En Vercel, crea esas mismas cuatro variables en **Settings → Environment Variables** para Preview; no es necesario configurar credenciales reales de Buk mientras `BUK_MODE=mock`.
5. Despliega una nueva versión. Comparte `/postular` con postulantes y mantén `/buk` para el reclutador, protegido por la contraseña configurada.

La configuración de producción debe usar las variables de entorno de Vercel, no el archivo `.env.local`. Las hojas de vida son información personal: usa datos de prueba con autorización, revisa quién tiene acceso a las variables del proyecto y no conviertas el bucket en público.

El enlace `localhost` solo sirve en el computador donde corre el demo. Para poner el formulario en una publicación real, DevSync debe estar desplegado bajo una URL HTTPS pública y esa URL debe configurarse en LinkedIn como enlace/formulario externo de postulación. Para que cada cargo llegue a su proceso real, configura el ID real de cada vacante en `BUK_VACANCY_MAP` antes de activar `BUK_MODE=real`.

## Puesta en marcha

Requisitos: Node.js 22 o superior y npm 10 o superior.

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Usa `/postulados` para abrir la bandeja ATS.
