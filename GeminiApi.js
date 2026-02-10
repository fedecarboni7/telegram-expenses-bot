/**
 * Process text with Gemini API
 * @param {string} text - Text to process
 * @param {string} customPrompt - Optional custom prompt to use instead of the default
 * @return {Object} - Structured data
 */
function processTextWithGemini(text, customPrompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';
  const apiKey = CONFIG.GEMINI_API_KEY;
  
  // Obtener la fecha actual para resolver referencias relativas
  const today = new Date();
  const currentDateString = Utilities.formatDate(today, Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  // Usar el prompt personalizado si se proporciona, de lo contrario usar el predeterminado
  const prompt = customPrompt || `
### TAREA:
Analiza el siguiente mensaje para extraer información financiera.

### INFORMACIÓN A EXTRAER:
- **tipo**: "gasto", "ingreso", o "transferencia"
- **monto**: número positivo (sin símbolos de moneda)
- **descripcion**: descripción del movimiento
- **categoria**: categoría principal
- **subcategoria**: formato "Categoría > Subcategoría"
- **cuenta**: cuenta utilizada
- **cuenta_destino**: (solo transferencias)
- **fecha**: formato dd/MM/yyyy
- **cuotas**: número de cuotas (opcional: solo si se menciona)
- **moneda**: "ARS" o "USD"

### REGLAS DE MONEDA:
- Por defecto siempre usar "ARS" (pesos argentinos)
- Solo usar "USD" si el usuario menciona explícitamente dólares, USD, dólar, usd, dolares, o similar
- Si no se menciona moneda → usar "ARS"

### REGLAS DE FECHA:
- Si no se menciona fecha, poner la fecha actual: ${currentDateString}.
- Si menciona "ayer" → calcular fecha anterior
- Si menciona "el lunes", "hace 3 días", etc. → calcular fecha específica

### REGLAS DE CUOTAS:
- Si menciona cuotas → poner un valor del 1 al 60
- Si no se mencionan cuotas → no incluir el campo "cuotas"

### CUENTAS DISPONIBLES:
${accounts.join(', ')}
- Si no especifica cuenta → usar "No definido"

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

### MENSAJE A PROCESAR:
"${text}"

### RESPUESTA:
Devuelve ÚNICAMENTE un JSON válido con los campos extraídos.`;
  
  const payload = {
    "contents": [{
      "parts": [{
        "text": prompt
      }]
    }]
  };
  
  const options = {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  // Usar el parámetro de consulta en la URL en lugar del encabezado de autorización
  const requestUrl = `${url}?key=${apiKey}`;
  const response = UrlFetchApp.fetch(requestUrl, options);
  
  // Verificar el código de respuesta
  if (response.getResponseCode() !== 200) {
    throw new Error(`Error en la API de Gemini: ${response.getContentText()}`);
  }
  
  const json = JSON.parse(response.getContentText());
  // Asegurarse de que el texto de respuesta sea JSON válido (eliminar posibles backticks o formato markdown)
  const responseText = json.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
  const extractedJson = JSON.parse(responseText);
  return extractedJson;
}

/**
 * Process audio with Gemini API
 * @param {Blob} audioBlob - Audio blob to process
 * @param {string} mimeType - MIME type of the audio
 * @param {string} customPrompt - Optional custom prompt to use instead of the default
 * @return {Object} - Structured data
 */
function processAudioWithGemini(audioBlob, mimeType, customPrompt) {
  const apiKey = CONFIG.GEMINI_API_KEY;
  const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
  const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`;

  // Obtener la fecha actual para resolver referencias relativas
  const today = new Date();
  const currentDateString = Utilities.formatDate(today, Session.getScriptTimeZone(), "dd/MM/yyyy");

  // Paso 1: Subir el archivo de audio
  const uploadOptions = {
    method: 'POST',
    headers: {
      'Content-Type': mimeType // e.g., 'audio/ogg' para mensajes de voz de Telegram
    },
    payload: audioBlob,
    muteHttpExceptions: true
  };

  const uploadResponse = UrlFetchApp.fetch(uploadUrl, uploadOptions);
  if (uploadResponse.getResponseCode() !== 200) {
    throw new Error(`Error al subir el audio a Gemini: ${uploadResponse.getContentText()}`);
  }
  const uploadResult = JSON.parse(uploadResponse.getContentText());
  const fileUri = uploadResult.file.uri;

  // Paso 2: Procesar el audio con Gemini
  // Usar el prompt personalizado si se proporciona, de lo contrario usar el predeterminado
  const prompt = customPrompt || `
### TAREA:
Analiza el mensaje de voz para extraer información de registro financiero.

### INFORMACIÓN A EXTRAER:
- **tipo**: "gasto", "ingreso", o "transferencia"
- **monto**: número positivo (ignorar símbolos de moneda)
- **descripcion**: descripción del movimiento
- **categoria**: categoría principal
- **subcategoria**: formato "Categoría > Subcategoría"
- **cuenta**: cuenta utilizada
- **cuenta_destino**: (solo transferencias)
- **fecha**: formato dd/MM/yyyy
- **cuotas**: número de cuotas (opcional: solo si se menciona)
- **moneda**: "ARS" o "USD"

### REGLAS DE MONEDA:
- Por defecto siempre usar "ARS" (pesos argentinos)
- Solo usar "USD" si el usuario menciona explícitamente dólares, USD, dólar, usd, dolares, o similar
- Si no se menciona moneda → usar "ARS"

### REGLAS DE FECHA:
- Si no se menciona fecha, poner la fecha actual: ${currentDateString}.
- Si menciona "ayer" → calcular fecha anterior
- Si menciona "el lunes", "hace 3 días", etc. → calcular fecha específica

### REGLAS DE CUOTAS:
- Si menciona cuotas → poner un valor del 1 al 60
- Si no se mencionan cuotas → no incluir el campo "cuotas"

### CUENTAS DISPONIBLES:
${accounts.join(', ')}
- Si no especifica cuenta → usar "No definido"

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

### RESPUESTA:
Devuelve ÚNICAMENTE un JSON válido con los campos extraídos.`;

  const payload = {
    "contents": [
      {
        "parts": [
          { "text": prompt },
          { "fileData": { "mimeType": mimeType, "fileUri": fileUri } }
        ]
      }
    ]
  };

  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(generateUrl, options);
  if (response.getResponseCode() !== 200) {
    throw new Error(`Error en la API de Gemini (procesamiento): ${response.getContentText()}`);
  }

  const json = JSON.parse(response.getContentText());
  const responseText = json.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(responseText);
}