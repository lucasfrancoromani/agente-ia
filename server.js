require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const OpenAI = require('openai');
const http = require('http'); // Añadido para que Railway no apague el bot
const puppeteer = require('puppeteer'); // Requerimos puppeteer entero para sacar la ruta exacta de Chromium

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Crear un servidor web "fantasma" en el puerto que pide Railway
// Esto es obligatorio en Railway porque de lo contrario asume que la app falló y la mata (SIGTERM)
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot de WhatsApp funcionando correctamente en Railway.\n');
});

server.listen(port, () => {
    console.log(`🌍 Servidor web fantasma escuchando en el puerto ${port} (Para Railway)`);
});

const SYSTEM_PROMPT = `"Eres el asistente virtual de reservas del 'Restaurante La Playa' en Gandia. Tu tono es cálido, súper amable y hospitalario, como el mejor anfitrión de la ciudad.
Tu objetivo es tomar 4 DATOS OBLIGATORIOS: Día, Hora, Cantidad de Personas y el NOMBRE de quien reserva.


Reglas de comportamiento:

Disponibilidad: Solo tomas reservas entre las 13:00-15:30 y 20:00-23:00. Si piden fuera de hora, ofréceles amablemente un horario cercano.

Menú y Comida: Si preguntan por el menú, responde con alegría que tienen excelentes arroces y pescados, y que el camarero les explicará los detalles. Nunca inventes platos.

Cancelaciones: Si cancelan, sé comprensivo y agradece el aviso.

El Nombre: NUNCA envíes el mensaje de confirmación final sin antes haberle preguntado el nombre al cliente. Si te da los otros 3 datos, respóndele: '¡Excelente! ¿A nombre de quién agendo la reserva?'

Confirmación Final: Solo cuando tengas los 4 datos juntos, lanza el mensaje final: '¡Perfecto! Tu reserva para [Cantidad] personas el [Día] a las [Hora] está confirmadísima a nombre de [Nombre]. ¡Los esperamos!'"`;

// Inicializar cliente de OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Mapa de sesiones para mantener el historial de contexto por usuario (Max 14 mensajes)
const sessions = new Map();

// Crear instancia del cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        // Obligamos a usar exactamente el binario que npm descargó durante el build en Railway
        executablePath: puppeteer.executablePath(),
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Evento: Generación de QR
client.on('qr', (qr) => {
    console.log('👇👇 COPIA ESTE TEXTO LARGO 👇👇');
    console.log(qr);
    qrcode.generate(qr, { small: true });
});

// Evento: Cliente listo
client.on('ready', () => {
    console.log('Bot de WhatsApp Web conectado y listo');
});

// Evento: Mensaje creado (entrante o saliente)
client.on('message_create', async (message) => {
    try {
        console.log('\n🔵 --- NUEVO MENSAJE RECIBIDO POR WA-WEB.JS ---');
        console.log('De:', message.from, '| Para:', message.to);
        console.log('Texto:', message.body);
        console.log('Es de mi teléfono (saliente)?', message.fromMe);
        console.log('Es un Estado de WA?', message.isStatus);

        const chatId = message.fromMe ? message.to : message.from;
        const userText = message.body;

        // 1. Filtro de Grupos y Estados (Súper estricto: Solo chats 1 a 1)
        // Acepta números tradicionales (@c.us) y el nuevo backend Multi-Dispositivo de WA (@lid)
        if ((!chatId.endsWith('@c.us') && !chatId.endsWith('@lid')) || message.isStatus) {
            console.log('❌ IGNORADO: Es un grupo o estado.');
            return; 
        }

        // 2. Filtro de Agenda: Ignorar si está guardado en los contactos del teléfono de La Playa (ej: proveedores)
        try {
            const contact = await message.getContact();
            if (contact.isMyContact) {
                console.log(`❌ IGNORADO: El contacto ${chatId} está agendado.`);
                return;
            }
        } catch (err) {
            console.error('Error al verificar contacto en la agenda:', err);
        }
        if (!sessions.has(chatId)) {
            sessions.set(chatId, {
                botActivo: true, // Asumimos que todos son clientes por defecto
                ultimoMensajeBot: "",
                history: [
                    { role: 'system', content: SYSTEM_PROMPT }
                ]
            });
        }

        const session = sessions.get(chatId);

        // 4. Lógica de Silencio (Si VOS escribís desde el WhatsApp del restaurante)
        if (message.fromMe) {
            if (userText === '!bot on') {
                session.botActivo = true;
                console.log(`[IA ACTIVADA] para: ${chatId}`);
            } else if (userText === session.ultimoMensajeBot) {
                return; // Es el bot hablando, lo ignoramos
            } else {
                session.botActivo = false;
                console.log(`[IA PAUSADA] Intervención humana detectada en: ${chatId}`);
            }
            return;
        }

        // Si la IA está pausada, no hace nada
        if (session.botActivo === false) {
            return;
        }

        console.log(`[✉️ MENSAJE] De: ${chatId} | Texto: ${userText}`);

        // Llamamos a OpenAI
        const responseText = await getOpenAIResponse(chatId, userText);
        console.log(`[🤖 RESPUESTA IA] Para: ${chatId} | Texto: ${responseText}`);

        session.ultimoMensajeBot = responseText;
        await message.reply(responseText);

    } catch (error) {
        console.error('Error fatal al procesar el mensaje:', error);
    }
});

async function getOpenAIResponse(chatId, userMessage) {
    try {
        const session = sessions.get(chatId);
        const history = session.history;

        // Añadir el nuevo mensaje del usuario al historial
        history.push({ role: 'user', content: userMessage });

        const fechaActual = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
        const messagesToSend = [...history];
        messagesToSend[0] = {
            role: 'system',
            content: `INFO DEL SISTEMA: Hoy es ${fechaActual}.\n\n` + messagesToSend[0].content
        };

        // Enviar el historial completo a OpenAI
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messagesToSend,
        });

        const aiText = response.choices[0].message.content;

        // Añadir la respuesta de la IA en el historial para contexto futuro
        history.push({ role: 'assistant', content: aiText });

        // Límite de memoria (el system prompt es el índice 0)
        // Guardamos el system + los últimos 14 mensajes
        if (history.length > 15) {
            const systemMessage = history[0];
            const recentMessages = history.slice(history.length - 14);
            history.length = 0; // Vaciar array original manteniendo referencia
            history.push(systemMessage, ...recentMessages);
        }

        return aiText;
    } catch (error) {
        console.error('Error al llamar a OpenAI API:', error);
        return 'Lo siento, estoy teniendo problemas técnicos en este momento. Por favor, intenta de nuevo más tarde.';
    }
}

// Inicializar el cliente
client.initialize();
