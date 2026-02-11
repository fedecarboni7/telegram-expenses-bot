// Palabras clave que indican intención de borrar un registro
const DELETE_KEYWORDS = ['borrar', 'borralo', 'eliminar', 'eliminalo', 'delete', 'quitar', 'sacalo', 'bórralo', 'eliminá', 'borrá'];

/**
 * Configura el webhook de Telegram para recibir mensajes
 */
function setWebhook() {
  const url = `${CONFIG.TELEGRAM_API_URL}/setwebhook?url=${CONFIG.APP_URL}`;
  Logger.log(url);
  try {
    const response = UrlFetchApp.fetch(url).getContentText();
    Logger.log(response);
    return response;
  } catch (error) {
    logError('setWebhook', error);
    throw error;
  }
}

/**
 * Manejador del webhook para los mensajes de Telegram
 * @param {Object} e - Evento de Google Apps Script
 * @return {Object} Respuesta del servidor
 */
function doPost(e) {
  let webhookData;
  try {
    // Parsear los datos del webhook
    webhookData = JSON.parse(e.postData.contents);
    const chatId = webhookData.message?.chat?.id || webhookData.callback_query?.message?.chat?.id;
    
    // Manejar callback de confirmación
    if (webhookData.callback_query) {
      return handleCallbackQuery(webhookData.callback_query);
    }
    
    const message = webhookData.message;

    Logger.log(message);
    
    // Restrict to your chat ID
    if (chatId != CONFIG.MY_CHAT_ID) {
      // sendTelegramMessage(chatId, "Chat ID Inválido: " + chatId); Lo dejo comentado para no gastarme en enviar mensajes
      return;
    }

    // Verificar si es un comando
    if (message.text && handleCommands(message, chatId)) {
      Logger.log("Command detected.");
      return;
    }
    
    // Verificar si es un reply a un registro confirmado
    if (message.reply_to_message && processReplyToRecord(message, chatId)) {
      Logger.log("Reply to record processed.");
      return;
    }
    
    let structuredData;
    
    // Manejar mensajes de texto
    if (message.text) {
      structuredData = processTextWithGemini(message.text);
    }
    // Manejar mensajes de voz
    else if (message.voice) {
      const fileId = message.voice.file_id;
      const audioBlob = getAudioBlob(fileId);
      structuredData = processAudioWithGemini(audioBlob, message.voice.mime_type);
    }
    
    // Verificar que structuredData existe antes de validar
    if (structuredData) {
      const validation = validateData(structuredData);
      if (validation.valid) {
        // Log para pruebas
        Logger.log("Generated data:" + JSON.stringify(structuredData));

        // Editar descripción para que siempre comience con mayúscula
        if (structuredData && structuredData.descripcion) {
          structuredData.descripcion = structuredData.descripcion.charAt(0).toUpperCase() + structuredData.descripcion.slice(1);
        }

        // En lugar de guardar directamente, enviar mensaje de confirmación
        sendConfirmationMessage(chatId, structuredData, message.date);
      } else {
        // Informar del error al usuario con detalle
        sendTelegramMessage(chatId, validation.error || "❌ No pude procesar correctamente tu registro. Por favor intenta de nuevo con información más clara.");
      }
    } else {
      // Informar del error al usuario
      sendTelegramMessage(chatId, "❌ No pude procesar correctamente tu registro. Por favor intenta de nuevo con información más clara.");
    }
  } catch (error) {
    logError('doPost', error);
    try {
      // Intentar informar al usuario del error
      if (webhookData && (webhookData.message?.chat || webhookData.callback_query?.message?.chat)) {
        const chatId = webhookData.message?.chat?.id || webhookData.callback_query?.message?.chat?.id;
        sendTelegramMessage(chatId, "❌ Ocurrió un error procesando tu mensaje. Por favor intenta de nuevo.");
      }
    } catch (e) {
      // Error al informar del error, solo registrarlo
      logError('doPost-errorNotification', e);
    }
  }
}

/**
 * Formatea un número como moneda con $ al inicio, puntos para miles y comas para decimales
 * @param {number} amount - Monto a formatear
 * @return {string} Monto formateado
 */
function formatCurrency(amount) {
  return '$' + amount.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Obtiene la fecha formateada del gasto, ya sea desde el campo date o desde el timestamp
 * @param {Object} data - Datos del gasto
 * @param {number} timestamp - Timestamp UNIX del mensaje
 * @return {string} Fecha formateada en dd/MM/yyyy
 */
function getFormattedDate(data, timestamp) {
  if ('fecha' in data && data.fecha) {
    return data.fecha;
  } else {
    const date = new Date(timestamp * 1000);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MM/yyyy");
  }
}

/**
 * Formatea los datos del registro para mostrarlos en un mensaje
 * @param {Object} data - Datos del registro
 * @param {string} dateStr - Fecha formateada
 * @param {string} prefix - Prefijo para el mensaje (opcional)
 * @return {string} Mensaje formateado
 */
function formatExpenseForDisplay(data, dateStr, prefix = null) {
  // Determinar el prefijo según el tipo si no se proporciona
  if (!prefix) {
    const typeEmoji = data.tipo === 'gasto' ? '💸' : 
                     data.tipo === 'ingreso' ? '💰' : '🔄';
    const typeText = data.tipo === 'gasto' ? 'Gasto registrado' : 
                    data.tipo === 'ingreso' ? 'Ingreso registrado' : 'Transferencia registrada';
    prefix = `✅ <b>${typeText}</b> ${typeEmoji}`;
  }

  let message = `${prefix}\n🗓️ ${dateStr}\n💰 ${formatCurrency(data.monto)}`;

  // Mostrar moneda si es USD
  if (data.moneda === 'USD') {
    message += ` (USD)`;
  }

  // Agregar información específica según el tipo
  if (data.tipo === 'transferencia') {
    message += `\n📤 Origen: ${data.cuenta}`;
    message += `\n📥 Destino: ${data.cuenta_destino}`;
  } else {
    // Para gastos e ingresos, mostrar la cuenta
    message += `\n💳 ${data.cuenta}`;
    
    // Agregar información de cuotas si existe (solo para gastos)
    if (data.tipo === 'gasto' && data.cuotas && data.cuotas > 1) {
      const monthlyAmount = parseFloat(data.monto) / parseInt(data.cuotas);
      message += `\n🔢 ${data.cuotas} cuotas de ${formatCurrency(monthlyAmount)}`;
    }

    message += `\n📝 ${data.descripcion}\n🏷️ ${data.subcategoria}`;
  }
  
  return message;
}

/**
 * Normaliza la respuesta de Gemini para extraer los datos correctos
 * @param {Object} response - Respuesta de Gemini que puede tener diferentes formatos
 * @return {Object} Datos normalizados
 */
function normalizeGeminiResponse(response) {
  // Si la respuesta es null o undefined, devolver null
  if (!response) {
    return null;
  }
  
  // Si la respuesta tiene un array 'data' con elementos
  if (response.data && Array.isArray(response.data) && response.data.length > 0) {
    // Tomar el primer elemento del array
    return response.data[0];
  }
  
  // Si la respuesta es un array directamente
  if (Array.isArray(response) && response.length > 0) {
    return response[0];
  }
  
  // Si la respuesta es un objeto directo con los campos esperados
  if (response.type || response.amount || response.description) {
    return response;
  }
  
  // Si ningún formato es reconocido, devolver null
  return null;
}

/**
 * Maneja las respuestas de los botones de confirmación
 * @param {Object} callbackQuery - Objeto callback_query de Telegram
 */
function handleCallbackQuery(callbackQuery) {
  const callbackData = JSON.parse(callbackQuery.data);
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  
  // Recuperar los datos almacenados
  const cacheKey = `expense_${callbackData.id}`;
  const cache = CacheService.getUserCache();
  const savedDataJson = cache.get(cacheKey);
  
  if (!savedDataJson) {
    sendTelegramMessage(chatId, "❌ Lo siento, los datos del registro ya no están disponibles. Por favor ingresa el registro nuevamente.");
    return;
  }
  
  const savedData = JSON.parse(savedDataJson);
  
  // Responder al callback
  answerCallbackQuery(callbackQuery.id);
  
  if (callbackData.action === 'confirm') {
    // Guardar en la hoja de cálculo con un recordId
    const recordId = Utilities.getUuid();
    logToExpenseSheet(savedData.data, savedData.timestamp, recordId);
    
    // Obtener fecha formateada y actualizar el mensaje
    const displayDate = getFormattedDate(savedData.data, savedData.timestamp);
    
    // Actualizar el mensaje original con el registro confirmado
    editMessageText(
      chatId, 
      messageId, 
      formatExpenseForDisplay(savedData.data, displayDate) +
      `\n\n<i>💡 Respondé a este mensaje para borrarlo.</i>`
    );
    
    // Guardar solo el recordId para futuros replies (los datos se leen desde la planilla)
    const props = PropertiesService.getUserProperties();
    props.setProperty(`record_msg_${chatId}_${messageId}`, recordId);
  } else if (callbackData.action === 'cancel') {
    // Actualizar el mensaje original
    editMessageText(
      chatId, 
      messageId, 
      "❌ Registro cancelado."
    );
  }
  
  cache.remove(cacheKey);
}

/**
 * Envía mensaje de confirmación con botones
 * @param {string} chatId - ID del chat
 * @param {Object} data - Datos estructurados del gasto
 * @param {number} timestamp - Marca de tiempo
 */
function sendConfirmationMessage(chatId, data, timestamp) {
  // Generar ID único para este gasto
  const expenseId = Utilities.getUuid();
  
  // Almacenar los datos temporalmente
  const cacheData = {
    data: data,
    timestamp: timestamp
  };
  
  const cache = CacheService.getUserCache();
  cache.put(`expense_${expenseId}`, JSON.stringify(cacheData), 21600); // 6 horas de caché
  
  // Obtener fecha formateada para mostrar
  const displayDate = getFormattedDate(data, timestamp);
  
  // Crear mensaje con prefijo de confirmación
  const typeText = data.tipo === 'gasto' ? 'gasto' : 
                  data.tipo === 'ingreso' ? 'ingreso' : 'transferencia';
  const confirmPrefix = `⚠️ <b>Confirmar ${typeText}:</b>`;
  
  // Crear mensaje
  const message = formatExpenseForDisplay(data, displayDate, confirmPrefix);
  
  // Botones de confirmar y cancelar
  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: "✅ Confirmar",
          callback_data: JSON.stringify({ action: 'confirm', id: expenseId })
        },
        {
          text: "❌ Cancelar",
          callback_data: JSON.stringify({ action: 'cancel', id: expenseId })
        }
      ]
    ]
  };
  
  // Enviar mensaje con botones
  sendTelegramMessageWithButtons(chatId, message, inlineKeyboard);
}

/**
 * Procesa un reply a un mensaje de registro confirmado
 * @param {Object} message - Mensaje de Telegram (que es un reply)
 * @param {string} chatId - ID del chat
 * @return {boolean} True si se procesó como reply a un registro, false en caso contrario
 */
function processReplyToRecord(message, chatId) {
  const repliedMessageId = message.reply_to_message.message_id;
  const props = PropertiesService.getUserProperties();
  const recordId = props.getProperty(`record_msg_${chatId}_${repliedMessageId}`);
  
  if (!recordId) {
    return false; // No es un reply a un registro conocido
  }
  
  try {
    // Determinar el texto del usuario (texto o voz)
    let userText = '';
    if (message.text) {
      userText = message.text;
    } else if (message.voice) {
      const fileId = message.voice.file_id;
      const audioBlob = getAudioBlob(fileId);
      // Transcribir el audio con Gemini para obtener el texto
      const transcribePrompt = `Transcribe el siguiente mensaje de voz a texto. Devuelve ÚNICAMENTE el texto transcrito sin formato adicional.`;
      const transcription = processAudioTranscription(audioBlob, message.voice.mime_type, transcribePrompt);
      if (transcription) {
        userText = transcription;
      }
    }
    
    if (!userText) {
      sendTelegramMessage(chatId, "❌ No pude procesar tu mensaje. Enviá un texto o audio indicando qué querés hacer con el registro.");
      return true;
    }
    
    // Detectar intención de borrar
    const lowerText = userText.toLowerCase().trim();
    const isDeleteIntent = DELETE_KEYWORDS.some(keyword => lowerText.includes(keyword));
    
    if (isDeleteIntent) {
      // Borrar el registro
      const deleted = deleteRecordsByRecordId(recordId);
      if (deleted) {
        props.deleteProperty(`record_msg_${chatId}_${repliedMessageId}`);
        sendTelegramMessage(chatId, "✅ Registro eliminado correctamente de la planilla.");
      } else {
        sendTelegramMessage(chatId, "❌ No se encontró el registro en la planilla. Es posible que ya haya sido eliminado.");
      }
    } else {
      sendTelegramMessage(chatId, "❌ No entendí tu mensaje. Para borrar el registro, respondé con \"borrar\" o \"eliminar\".");
    }
    
    return true;
  } catch (error) {
    logError('processReplyToRecord', error);
    sendTelegramMessage(chatId, "❌ Ocurrió un error procesando tu solicitud. Por favor intenta de nuevo.");
    return true;
  }
}

/**
 * Maneja las solicitudes GET (método no permitido)
 * @return {Object} Mensaje de error
 */
function doGet(e) {
  return ContentService.createTextOutput("Method GET not allowed");
}