# Cuaderno Nutricional

App web mobile-first para registrar día a día lo que comés — desayuno,
almuerzo, merienda, cena, colación o extra — con foto, peso aproximado y
estimación automática de calorías por IA (Google Gemini). Los datos se
guardan en la nube (Firebase) así que se sincronizan entre tu celular y
cualquier otro dispositivo donde inicies sesión con la misma cuenta de
Google.

Es 100% estática: no tiene servidor propio. Se hostea gratis en GitHub
Pages y usa el nivel gratuito de Firebase y de Gemini.

No reemplaza el seguimiento de tu nutricionista — es una herramienta para
ver, comida a comida, si te estás acercando al plan que ella te dio.

---

## Lo que vas a necesitar

- Una cuenta de Google (para Firebase, para el login de la app, y para la
  API key de Gemini).
- Una cuenta de GitHub (ya la tenés).
- 15-20 minutos, una sola vez. Después de esto, usar la app es solo
  abrirla y tocar +.

---

## Paso 1 — Crear el proyecto en Firebase

1. Andá a [console.firebase.google.com](https://console.firebase.google.com/) y logueate con tu Google.
2. **Crear proyecto** → ponele un nombre (ej. `jon-nutricion`) → seguí los pasos por defecto (podés desactivar Google Analytics, no hace falta).
3. Dentro del proyecto, click en el ícono **web `</>`** para agregar una app web. Nombre: `Cuaderno Nutricional`. No hace falta "Firebase Hosting" (usamos GitHub Pages).
4. Te va a mostrar un bloque `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`. **Copiá esos valores**, los vas a pegar en el Paso 4.

## Paso 2 — Activar el login con Google

1. En el menú izquierdo: **Compilación → Authentication → Comenzar**.
2. Pestaña **Sign-in method** → **Google** → activalo → elegí un mail de soporte → **Guardar**.

## Paso 3 — Crear la base de datos (Firestore)

1. Menú izquierdo: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: cualquiera cercana (ej. `southamerica-east1`). Modo: **producción**.
3. Ya creada, andá a la pestaña **Reglas** y reemplazá todo el contenido por
   el de este proyecto, `firestore.rules`:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
4. **Publicar**. Esto asegura que cada quien solo pueda leer/escribir sus
   propios datos, aunque el código de la app sea público en GitHub.

## Paso 4 — Conectar la app a tu Firebase

1. En este proyecto, renombrá `firebase-config.sample.js` a
   `firebase-config.js`.
2. Pegá adentro los valores que copiaste en el Paso 1 (`apiKey`,
   `authDomain`, `projectId`, etc.), reemplazando los que dicen
   `TU_API_KEY`, `TU-PROYECTO`, etc.
3. Estos valores **no son secretos** — identifican tu proyecto, no dan
   acceso a los datos por sí solos (eso lo controlan las reglas del Paso
   3) — así que este archivo sí se sube a GitHub sin problema.

## Paso 5 — Conseguir tu API key de Gemini (gratis)

1. Andá a [aistudio.google.com/apikey](https://aistudio.google.com/apikey) con tu cuenta de Google.
2. **Create API key** → copiala.
3. Esta clave **sí es privada** — no va en ningún archivo del proyecto. Se
   carga directamente en la app, en **Ajustes → API key de Gemini**, una
   vez que la tengas funcionando, y queda guardada en tu cuenta dentro de
   Firestore (protegida por las reglas del Paso 3, nadie más la puede
   leer).
4. El nivel gratuito de Gemini alcanza de sobra para este uso (unas pocas
   fotos por día). Si en algún momento lo cambia Google, revisá los
   límites vigentes en la misma página de AI Studio.

## Paso 6 — Subir el proyecto a GitHub

1. En [github.com](https://github.com/new), creá un repositorio nuevo (por
   ejemplo `nutricion`). Puede ser público — no tiene nada sensible (ver
   "Privacidad" más abajo).
2. Subí **todos los archivos de esta carpeta** (incluido `firebase-config.js`
   ya editado, pero no hace falta subir el `.sample.js`) usando el botón
   **Add file → Upload files** de GitHub, arrastrando la carpeta entera, o
   con git si preferís:
   ```
   git init
   git add .
   git commit -m "Cuaderno nutricional"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/nutricion.git
   git push -u origin main
   ```

## Paso 7 — Activar GitHub Pages

1. En el repo: **Settings → Pages**.
2. **Source**: `Deploy from a branch`. **Branch**: `main`, carpeta `/root`.
3. **Save**. En un minuto te va a dar una URL tipo
   `https://tu-usuario.github.io/nutricion/`. Esa es tu app.

## Paso 8 — Agregar el acceso directo en tu celular

1. Abrí esa URL en Chrome (Android) o Safari (iPhone).
2. Menú del navegador → **Agregar a pantalla de inicio / Añadir a inicio**.
3. Te queda un ícono como cualquier app. Al abrirla, iniciá sesión con
   Google y en **Ajustes** pegá tu API key de Gemini (Paso 5).

---

## Cómo se usa día a día

- Tocás el botón **+** → elegís el tipo de comida (desayuno, almuerzo,
  merienda, cena, colación o extra) → le sacás una foto al plato y/o
  escribís qué comiste.
- **Analizar con IA** manda la foto (y lo que hayas escrito) a Gemini, que
  devuelve una descripción, el peso aproximado en gramos y las kcal
  estimadas. Siempre podés corregir esos valores a mano antes de guardar
  — la IA estima, no mide.
- La pantalla **Hoy** suma todo lo cargado en el día, lo compara contra el
  rango objetivo (por defecto 1000–1400 kcal, el que calculamos a partir
  del plan — ajustalo en **Ajustes** si tu nutricionista te da un número
  distinto), y marca un check por cada regla del plan: las 4 comidas,
  verduras en almuerzo/cena, proteína en ambas, un solo carbohidrato
  complejo al día, los 2 litros de agua y la actividad física.
- **Historial** muestra los últimos 14 días con su total y si quedaron
  dentro, por debajo o por encima del rango — para ver la tendencia, no
  solo el día suelto.

## Privacidad y seguridad — qué es público y qué no

- El **código** de la app (HTML/CSS/JS) y la configuración de Firebase
  (`firebase-config.js`) son públicos en GitHub. Eso es normal y no es un
  riesgo: esos valores solo le dicen al navegador a qué proyecto de
  Firebase conectarse.
- Lo que protege tus datos son las **reglas de Firestore** (Paso 3): solo
  vos, logueado con tu cuenta de Google, podés leer o escribir tus
  propias comidas, fotos o tu API key de Gemini.
- **Nunca** pongas tu API key de Gemini directamente en un archivo del
  repositorio — se carga solo desde la pantalla de Ajustes de la app ya
  desplegada.

## Si Google renombra el modelo de Gemini

La app usa el modelo `gemini-3.8-flash` (constante `GEMINI_MODEL` al
principio de `app.js`). Si en el futuro Google lo reemplaza, vas a
empezar a ver un error al analizar fotos: entrá a
[ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models),
fijate el nombre del modelo Flash vigente, y cambiá esa única línea.

## Qué le falta (ideas para más adelante)

- Gráfico semanal/mensual de evolución de kcal.
- Exportar el historial a CSV o PDF para llevarlo a la consulta.
- Reconocer automáticamente si dos comidas del mismo día se repiten mucho
  y sugerir variar según las opciones del plan original.
- Notificación/recordatorio si pasan más de 3 horas sin cargar nada.
