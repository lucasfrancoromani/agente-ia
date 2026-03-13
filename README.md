# WhatsApp AI Agent MVP

Este es el MVP de un agente de WhatsApp para gestionar reservas del "Restaurante La Playa", impulsado por Node.js, Express, la API de WhatsApp Cloud y Gemini AI.

## Requisitos Previos

- [Node.js](https://nodejs.org/) instalado.
- [ngrok](https://ngrok.com/) instalado en tu sistema.
- Una cuenta de desarrollador en [Meta for Developers](https://developers.facebook.com/) configurada con una App y un número de prueba de WhatsApp.
- Una API Key de [Google AI Studio (Gemini)](https://aistudio.google.com/).

## Instrucciones de Instalación y Ejecución

1. **Instalar Dependencias**
   Abre una terminal en esta carpeta y ejecuta:
   ```bash
   npm install
   ```

2. **Configurar Variables de Entorno**
   - Haz una copia del archivo `.env.template` y renómbralo a `.env`.
   - Rellena las variables con tus credenciales:
     - `PORT`: 3000 (o el puerto que elijas).
     - `WHATSAPP_TOKEN`: Tu token (temporal o permanente) de la API de WhatsApp Cloud.
     - `VERIFY_TOKEN`: Un string inventado por ti (ejemplo: `mi_secreto_super_seguro`) que Meta usará para verificar tu webhook.
     - `PHONE_NUMBER_ID`: El ID del número de teléfono en Meta Developers.
     - `GEMINI_API_KEY`: Tu clave de API de Gemini.

3. **Levantar el Servidor Local**
   ```bash
   npm start
   ```
   *(El servidor debería iniciar indicando que corre en el puerto 3000).*

4. **Exponer el Servidor a Internet usando ngrok**
   Abre una nueva terminal y ejecuta ngrok apuntando al puerto de tu servidor:
   ```bash
   ngrok http 3000
   ```
   *Copia la URL segura (la que empieza con `https://`) que ngrok te proporcionará en la terminal.*

5. **Configurar el Webhook en Meta Developers**
   - Ve a tu App en Meta Developers > **WhatsApp** > **Configuration**.
   - Haz clic en **Edit** en la sección Webhook.
   - En **Callback URL**, pega tu URL de ngrok seguida de `/webhook` (ejemplo: `https://abcd-123.ngrok.app/webhook`).
   - En **Verify token**, introduce el mismo valor que pusiste en tu variable `VERIFY_TOKEN` del `.env`.
   - Haz clic en **Verify and save**.
   - Por último, haz clic en **Manage** (en Webhook fields) y asegúrate de suscribirte al evento `messages`.

¡Listo! Ya puedes enviar mensajes de texto al número de prueba de WhatsApp y recibir respuestas automatizadas del asistente.
