# 🚀 Guía de Lanzamiento — TrackerSaaS

Esta guía te lleva de cero a tener el sistema funcionando en internet.
**No necesitás saber programar.** Seguí los pasos en orden.

---

## Antes de empezar: lo que vas a crear

| Servicio | Para qué sirve | Costo |
|---|---|---|
| **Node.js** | Programa en tu computadora para entender el código | Gratis |
| **GitHub Desktop** | App para guardar el código en la nube | Gratis |
| **Supabase** | La base de datos (donde se guardan los eventos) | Gratis |
| **Upstash** | Memoria rápida (para que los eventos no se dupliquen) | Gratis |
| **Vercel** | El servidor donde vive tu app en internet | Gratis |

---

## PASO 1 — Instalar Node.js

1. Andá a **https://nodejs.org**
2. Hacé clic en el botón verde **"LTS"**
3. Descargá e instalá (siguiente → siguiente → finalizar)
4. Reiniciá la computadora

✅ **Verificación:** Abrí el "Símbolo del sistema" (Windows) o "Terminal" (Mac), escribí `node --version` y presioná Enter. Si ves algo como `v20.x.x`, está listo.

---

## PASO 2 — Instalar GitHub Desktop y subir el código

### 2.1 Instalar GitHub Desktop
1. Andá a **https://desktop.github.com**
2. Descargá e instalá
3. Abrilo y hacé clic en **"Sign in to GitHub.com"**
4. Creá una cuenta gratis en github.com si no tenés

### 2.2 Descomprimir el proyecto
1. Buscá el archivo `tracker-saas-mvp.zip` que descargaste
2. Hacé clic derecho → **Extraer todo** → elegí una carpeta fácil de encontrar (ej: Escritorio)

### 2.3 Subir a GitHub
1. En GitHub Desktop: **File → Add Local Repository**
2. Buscá la carpeta `tracker-saas` que descomprimiste
3. Si pregunta "create repository here" → hacé clic en ese botón
4. En el campo de descripción abajo a la izquierda escribí: `Initial commit`
5. Hacé clic en **"Commit to main"**
6. Luego hacé clic en **"Publish repository"**
7. Asegurate de que diga **"Keep this code private"** ✓
8. Hacé clic en **"Publish Repository"**

---

## PASO 3 — Configurar Supabase (la base de datos)

1. Andá a **https://supabase.com** → **Start your project**
2. Registrate con tu email o con Google
3. Hacé clic en **"New project"**
4. Completá:
   - **Name:** tracker-saas
   - **Database Password:** Inventá una contraseña fuerte y **GUARDALA en un bloc de notas**
   - **Region:** elegí la más cercana a donde estarán tus clientes
5. Esperá ~2 minutos mientras crea el proyecto

### 3.1 Correr el schema (crear las tablas)
1. En el menú lateral hacé clic en **"SQL Editor"**
2. Hacé clic en **"New query"**
3. Abrí el archivo `supabase/schema.sql` del proyecto (con el Bloc de Notas o cualquier editor)
4. Copiá TODO el contenido y pegalo en el SQL Editor
5. Hacé clic en **"Run"** (o presioná Ctrl+Enter)
6. Deberías ver "Success. No rows returned"

### 3.2 Copiar las credenciales
1. En el menú izquierdo andá a **Project Settings → API**
2. Copiá y pegá en tu bloc de notas:
   - **Project URL** → (algo como `https://abcxyz.supabase.co`)
   - **anon public key** → (cadena larga)
   - **service_role secret** → (cadena larga, hacé clic en "Reveal")

### 3.3 Configurar Auth
1. En el menú izquierdo andá a **Authentication → URL Configuration**
2. En **"Site URL"** escribí: `https://tracker-saas.vercel.app` (lo cambiaremos después)
3. Hacé clic en **"Save"**

---

## PASO 4 — Configurar Upstash (memoria rápida)

1. Andá a **https://upstash.com** → **Start for free**
2. Registrate
3. Hacé clic en **"Create Database"**
4. Completá:
   - **Name:** tracker-redis
   - **Type:** Regional
   - **Region:** la más cercana
5. Hacé clic en **"Create"**
6. En la pantalla siguiente, copiá:
   - **UPSTASH_REDIS_REST_URL** → guardalo en el bloc de notas
   - **UPSTASH_REDIS_REST_TOKEN** → guardalo en el bloc de notas

---

## PASO 5 — Lanzar en Vercel

1. Andá a **https://vercel.com** → **Start Deploying**
2. Hacé clic en **"Continue with GitHub"** y conectá tu cuenta
3. Verás la lista de repositorios → buscá `tracker-saas` → hacé clic en **"Import"**
4. En la configuración del proyecto:
   - **Framework Preset:** Next.js (lo detecta automático)
   - No cambies nada más

### 5.1 Agregar las variables de entorno
Antes de hacer clic en "Deploy", hay que agregar las variables. Hacé clic en **"Environment Variables"** y agregá estas una por una:

```
NEXT_PUBLIC_SUPABASE_URL         = (tu Project URL de Supabase)
NEXT_PUBLIC_SUPABASE_ANON_KEY    = (tu anon public key de Supabase)
SUPABASE_SERVICE_ROLE_KEY        = (tu service_role secret de Supabase)
UPSTASH_REDIS_REST_URL           = (tu URL de Upstash)
UPSTASH_REDIS_REST_TOKEN         = (tu Token de Upstash)
NEXT_PUBLIC_APP_URL              = https://tracker-saas.vercel.app
ENCRYPTION_KEY                   = (inventá 32 caracteres random: ej. abc123def456ghi789jkl012mno34567)
STRIPE_WEBHOOK_SECRET            = (lo completarás después cuando configures Stripe)
```

5. Hacé clic en **"Deploy"**
6. Esperá ~3 minutos

### 5.2 Copiar la URL real
Cuando termine, Vercel te muestra la URL de tu app, algo como `https://tracker-saas-xyz.vercel.app`.
Copiá esa URL y volvé a Supabase → Authentication → URL Configuration → pegala en "Site URL".

---

## ✅ ¡Listo! Probá que funciona

1. Abrí tu URL de Vercel en el navegador
2. Deberías ver la página de login
3. Hacé clic en "Registrarse" y creá tu cuenta
4. Deberías entrar al dashboard

---

## 🔧 Próximos pasos después del lanzamiento

1. **Configurar las integraciones:** Andá a Integraciones y conectá Meta, ActiveCampaign, etc.
2. **Instalar el snippet:** Andá a "Instalar Snippet" y copiá el código a tu sitio
3. **Configurar Stripe webhooks:** En Stripe Dashboard → Webhooks → apuntá a tu URL
4. **Dominio propio:** En Vercel → Settings → Domains → agregás tu dominio

---

## ❓ ¿Algo salió mal?

Los errores más comunes:
- **"Invalid tracking ID"**: El snippet está bien pero las variables de entorno no se cargaron
- **"Build failed"**: Alguna variable de entorno falta → revisá el PASO 5.1
- **Pantalla en blanco**: Revisá que el schema de Supabase se haya corrido correctamente

Si tenés dudas, escribime y lo resolvemos juntos.
