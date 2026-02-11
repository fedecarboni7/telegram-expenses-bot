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
    
    // Verificar si estamos en modo de edición
    if (processEditMessage(message, chatId)) {
      Logger.log("Edit mode message processed.");
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
  } else if (callbackData.action === 'edit') {
    // Iniciar flujo de edición
    startEditFlow(chatId, messageId, savedData, callbackData.id);
  }
  
  // Solo eliminar caché si confirmó o canceló (no para edición)
  if (callbackData.action !== 'edit') {
    cache.remove(cacheKey);
  }
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
  
  // Botones de confirmar, editar y cancelar
  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: "✅ Confirmar",
          callback_data: JSON.stringify({ action: 'confirm', id: expenseId })
        },
        {
          text: "✏️ Editar",
          callback_data: JSON.stringify({ action: 'edit', id: expenseId })
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
 * Inicia el flujo de edición de un gasto
 * @param {string} chatId - ID del chat
 * @param {number} messageId - ID del mensaje original
 * @param {Object} savedData - Datos del gasto guardados
 * @param {string} expenseId - ID único del gasto
 */
function startEditFlow(chatId, messageId, savedData, expenseId) {
  // Obtener fecha formateada
  const displayDate = getFormattedDate(savedData.data, savedData.timestamp);
  
  // Crear prefijo de edición
  const typeText = savedData.data.tipo === 'gasto' ? 'gasto' : 
                  savedData.data.tipo === 'ingreso' ? 'ingreso' : 'transferencia';
  const editPrefix = `✏️ <b>Editando ${typeText}:</b>`;
  
  // Actualizar el mensaje original para indicar que está en modo edición
  editMessageText(
    chatId,
    messageId,
    formatExpenseForDisplay(savedData.data, displayDate, editPrefix) + 
    "\n\n<i>Por favor, enviá un mensaje indicando qué querés modificar.</i>"
  );
  
  // Guardar información de que estamos en modo edición para este chat
  const cache = CacheService.getUserCache();
  cache.put(`edit_mode_${chatId}`, JSON.stringify({
    expenseId: expenseId,
    originalData: savedData
  }), 3600); // 1 hora para completar la edición
}

/**
 * Procesa un mensaje de edición
 * @param {Object} message - Mensaje de Telegram
 * @param {string} chatId - ID del chat
 * @return {boolean} - True si se procesó como edición, false en caso contrario
 */
function processEditMessage(message, chatId) {
  const cache = CacheService.getUserCache();
  const editModeJson = cache.get(`edit_mode_${chatId}`);
  
  if (!editModeJson) {
    return false; // No estamos en modo edición
  }
  
  const editMode = JSON.parse(editModeJson);
  const originalData = editMode.originalData;
  
  try {
    // Obtener la fecha actual para el prompt de Gemini
    const today = new Date();
    const currentDateString = Utilities.formatDate(today, Session.getScriptTimeZone(), "dd/MM/yyyy");
    
    // Procesar la edición con Gemini
    let updatedData;
    if (message.text) {
      // Definir un prompt específico para edición
      const editPrompt = `
### TAREA:
Tienes que actualizar un registro financiero existente. Identifica qué campos quiere modificar el usuario y actualiza ÚNICAMENTE los campos mencionados.

### DATOS ACTUALES DEL REGISTRO:
- **tipo**: ${originalData.data.tipo}
- **monto**: ${originalData.data.monto}
- **descripcion**: ${originalData.data.descripcion}
- **categoria**: ${originalData.data.categoria}
- **subcategoria**: ${originalData.data.subcategoria}
- **cuenta**: ${originalData.data.cuenta}
- **cuenta_destino**: ${originalData.data.cuenta_destino || 'No especificada'}
- **fecha**: ${originalData.data.fecha}
- **cuotas**: ${originalData.data.cuotas || 'No especificado'}
- **moneda**: ${originalData.data.moneda || 'ARS'}

### REGLAS DE MONEDA:
- Por defecto siempre usar "ARS" (pesos argentinos)
- Solo usar "USD" si el usuario menciona explícitamente dólares, USD, dólar, usd, dolares, o similar
- Si no se menciona moneda → mantener el valor actual

### REGLAS DE FECHA:
- Hoy es ${currentDateString}.
- Si menciona "ayer" → calcular fecha anterior
- Si menciona "el lunes", "hace 3 días", etc. → calcular fecha específica

### REGLAS DE CUOTAS:
- Si menciona cuotas → actualizar el campo "cuotas"
- Si no había cuotas especificadas y no se mencionan nuevas → no incluir el campo "cuotas"

### CUENTAS DISPONIBLES:
${accounts.join(', ')}

### CATEGORÍAS DE GASTOS:
${Object.entries(expense_categories).map(([cat, subcats]) => 
  `**${cat}:**\n${subcats.map(subcat => `  - ${subcat.split(' > ')[1]}`).join('\n')}`
).join('\n\n')}

### CATEGORÍAS DE INGRESOS:
${Object.entries(income_categories).map(([cat, subcats]) => 
  `**${cat}:**\n${subcats.map(subcat => `  - ${subcat.split(' > ')[1]}`).join('\n')}`
).join('\n\n')}

### FORMATO DE SUBCATEGORÍA:
- La subcategoría debe devolverse en formato "Categoría > Subcategoría"
- Ejemplo: Si eliges "Nafta" de la categoría "Auto", devuelve "Auto > Nafta"

### INSTRUCCIÓN DEL USUARIO:
"${message.text}"

### RESPUESTA REQUERIDA:
Devuelve ÚNICAMENTE un JSON con TODOS los campos (modificados y sin modificar)`;
      
      updatedData = processTextWithGemini(message.text, editPrompt);
    } else if (message.voice) {
      const fileId = message.voice.file_id;
      const audioBlob = getAudioBlob(fileId);
      
      // Definir un prompt específico para edición con audio
      const editPrompt = `
### TAREA:
Tienes que actualizar un registro financiero existente. Identifica qué campos quiere modificar el usuario y actualiza ÚNICAMENTE los campos mencionados.

### DATOS ACTUALES DEL REGISTRO:
- **tipo**: ${originalData.data.tipo}
- **monto**: ${originalData.data.monto}
- **descripcion**: ${originalData.data.descripcion}
- **categoria**: ${originalData.data.categoria}
- **subcategoria**: ${originalData.data.subcategoria}
- **cuenta**: ${originalData.data.cuenta}
- **cuenta_destino**: ${originalData.data.cuenta_destino || 'No especificada'}
- **fecha**: ${originalData.data.fecha}
- **cuotas**: ${originalData.data.cuotas || 'No especificado'}
- **moneda**: ${originalData.data.moneda || 'ARS'}

### REGLAS DE MONEDA:
- Por defecto siempre usar "ARS" (pesos argentinos)
- Solo usar "USD" si el usuario menciona explícitamente dólares, USD, dólar, usd, dolares, o similar
- Si no se menciona moneda → mantener el valor actual

### REGLAS DE FECHA:
- Hoy es ${currentDateString}.
- Si menciona "ayer" → calcular fecha anterior
- Si menciona "el lunes", "hace 3 días", etc. → calcular fecha específica

### REGLAS DE CUOTAS:
- Si menciona cuotas → actualizar el campo "cuotas"
- Si no había cuotas especificadas y no se mencionan nuevas → no incluir el campo "cuotas"

### CUENTAS DISPONIBLES:
${accounts.join(', ')}

### CATEGORÍAS DE GASTOS:
${Object.entries(expense_categories).map(([cat, subcats]) => 
  `**${cat}:**\n${subcats.map(subcat => `  - ${subcat.split(' > ')[1]}`).join('\n')}`
).join('\n\n')}

### CATEGORÍAS DE INGRESOS:
${Object.entries(income_categories).map(([cat, subcats]) => 
  `**${cat}:**\n${subcats.map(subcat => `  - ${subcat.split(' > ')[1]}`).join('\n')}`
).join('\n\n')}

### FORMATO DE SUBCATEGORÍA:
- La subcategoría debe devolverse en formato "Categoría > Subcategoría"
- Ejemplo: Si eliges "Nafta" de la categoría "Auto", devuelve "Auto > Nafta"

### RESPUESTA REQUERIDA:
Devuelve ÚNICAMENTE un JSON con TODOS los campos (modificados y sin modificar)`;
      
      updatedData = processAudioWithGemini(audioBlob, message.voice.mime_type, editPrompt);
    }
    
    if (updatedData) {
      const validation = validateData(updatedData);
      if (validation.valid) {
        // Guardar los datos actualizados
        const cacheKey = `expense_${editMode.expenseId}`;
        cache.put(cacheKey, JSON.stringify(updatedData), 21600); // 6 horas

        // Eliminar el estado de edición
        cache.remove(`edit_mode_${chatId}`);

        // Enviar mensaje de confirmación con datos actualizados
        sendConfirmationMessage(chatId, updatedData, updatedData.timestamp);

        return true;
      } else {
        sendTelegramMessage(chatId, validation.error || "❌ No pude procesar correctamente tu edición. Por favor intenta nuevamente con información más clara.");
        return true;
      }
    } else {
      sendTelegramMessage(chatId, "❌ No pude procesar correctamente tu edición. Por favor intenta nuevamente con información más clara.");
      return true;
    }
  } catch (error) {
    logError('processEditMessage', error);
    sendTelegramMessage(chatId, "❌ Ocurrió un error procesando tu edición. Por favor intenta de nuevo.");
    return true;
  }
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