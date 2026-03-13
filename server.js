require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
        args: ['--no-sandbox', '--disable-setuid-sandbox']
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
        // Si el mensaje es saliente (enviado por el dueño), el destinatario es 'message.to'
        // Si el mensaje es entrante (enviado por el cliente), el remitente es 'message.from'
        const chatId = message.fromMe ? message.to : message.from;
        const userText = message.body;

        // Filtro de grupos: ignorar si no es un mensaje privado
        if (!chatId.endsWith('@c.us')) {
            return;
        }

        // Filtro de Agenda: si está en los contactos del teléfono, ignorarlo
        const contact = await message.getContact();
        if (contact.isMyContact) {
            return;
        }

        // 1- En el sistema de memoria, inicializamos objeto con botActivo en true
        if (!sessions.has(chatId)) {
            let isCliente = true;

            // Clasificación Silenciosa (Solo para números no guardados que escriben por primera vez)
            if (!message.fromMe) {
                try {
                    const promptClasificacion = "Clasifica este mensaje de WhatsApp que llegó a un restaurante. Si el usuario pide reservar, pregunta horarios, menú o ubicación, responde únicamente 'CLIENTE'. Si el usuario parece un proveedor, ofrece servicios, es spam o habla de temas ajenos a comer en el local, responde únicamente 'OTRO'. REGLA VITAL: Si el mensaje es únicamente un saludo genérico (como 'Hola', 'Buenos días', '¿Qué tal?'), asume que es un comensal y clasifícalo como 'CLIENTE' por defecto.";
                    const clasificacionReq = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: 'system', content: promptClasificacion },
                            { role: 'user', content: userText }
                        ],
                    });

                    const respuestaClasificacion = clasificacionReq.choices[0].message.content.trim();
                    if (respuestaClasificacion === 'OTRO') {
                        isCliente = false;
                    }
                } catch (err) {
                    console.log('Error en la clasificación silenciada. Se asume CLIENTE:', err);
                }
            }

            sessions.set(chatId, {
                botActivo: isCliente,
                ultimoMensajeBot: "",
                history: [
                    { role: 'system', content: SYSTEM_PROMPT }
                ]
            });

            // Si se identificó como OTRO, ignoramos el mensaje y silencíamos definitivamente al bot
            if (!isCliente && !message.fromMe) {
                console.log(`[Clasificación] Etiquetado como OTRO para el remitente ${chatId}. Bot silenciado.`);
                return;
            }
        }

        const session = sessions.get(chatId);

        // 3- Lógica de Silencio (fromMe)
        if (message.fromMe) {
            if (userText === '!bot on') {
                session.botActivo = true;
                console.log(`[Bot Activado] Reanudando IA para: ${chatId}`);
            } else if (userText === session.ultimoMensajeBot) {
                return; // Es el propio bot hablando, ignoramos
            } else {
                session.botActivo = false;
                console.log(`[Bot Silenciado] Intervención humana detectada hacia: ${chatId}`);
            }
            return; // Nunca respondemos a nuestros propios mensajes
        }

        // 4- Lógica de Respuesta de clientes
        if (session.botActivo === false) {
            // El bot está silenciado
            return;
        }

        console.log(`[Mensaje Recibido] De: ${chatId} | Texto: ${userText}`);

        // 1. Generar respuesta con la IA de OpenAI pasando el contexto por número
        const responseText = await getOpenAIResponse(chatId, userText);
        console.log(`[Respuesta IA] Para: ${chatId} | Texto: ${responseText}`);

        // Actualizar el último mensaje del bot en la sesión
        session.ultimoMensajeBot = responseText;

        // 2. Enviar la respuesta vía mensaje a WhatsApp
        await message.reply(responseText);

    } catch (error) {
        console.error('Error al procesar el mensaje:', error);
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
