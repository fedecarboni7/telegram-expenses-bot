// Índice de la columna K donde se almacena el ID del registro (base 0)
const RECORD_ID_COLUMN_INDEX = 10;

/**
 * Obtiene la cotización actual del dólar (USD a ARS)
 * @return {number} Cotización del dólar blue
 */
function getUsdToArsRate() {
  try {
    const response = UrlFetchApp.fetch('https://dolarapi.com/v1/dolares/blue', { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error(`Error al obtener cotización del dólar: HTTP ${response.getResponseCode()} - ${response.getContentText()}`);
    }
    const data = JSON.parse(response.getContentText());
    if (!data.venta || isNaN(data.venta) || data.venta <= 0) {
      throw new Error(`Cotización del dólar inválida: ${JSON.stringify(data)}`);
    }
    return data.venta;
  } catch (error) {
    logError('getUsdToArsRate', error);
    throw error;
  }
}

/**
 * Registra datos estructurados en la hoja de gastos
 * @param {Object} data - Datos estructurados del gasto
 * @param {number} timestamp - Marca de tiempo Unix
 * @param {string} [recordId] - ID único del registro (se genera si no se proporciona)
 * @return {string} ID único del registro guardado
 */
function logToExpenseSheet(data, timestamp, recordId) {
  try {
    const sheet = getExpensesSheet();
    // Generar ID único si no se proporcionó
    if (!recordId) {
      recordId = Utilities.getUuid();
    }

    // Usar la fecha proporcionada por el usuario si está disponible, de lo contrario usar timestamp
    let baseDate;
    if (data.fecha) {
      // Convertir fecha dd/MM/yyyy a objeto Date
      const [day, month, year] = data.fecha.split('/').map(Number);
      baseDate = new Date(year, month - 1, day);
    } else {
      baseDate = new Date(timestamp * 1000);
    }

    // Determinar el tipo de registro en la columna I
    const recordType = data.tipo === 'gasto' ? 'Gastos' : 
                      data.tipo === 'ingreso' ? 'Ingresos' : 
                      'Transferencias';

    // Determinar la moneda y obtener cotización si es necesario
    const currency = data.moneda === 'USD' ? 'USD' : 'ARS';
    const usdRate = currency === 'USD' ? getUsdToArsRate() : null;

    // Manejar según el tipo de registro
    if (data.tipo === 'transferencia') {
      // Transferencia: crear dos registros
      createTransferRecords(sheet, data, baseDate, recordType, currency, usdRate, recordId);
    } else if (data.tipo === 'gasto' && data.cuotas && data.cuotas > 1) {
      // Gasto con cuotas: crear un registro por cuota
      createInstallmentRecords(sheet, data, baseDate, recordType, currency, usdRate, recordId);
    } else {
      // Registro simple: gasto sin cuotas o ingreso
      createSimpleRecord(sheet, data, baseDate, recordType, currency, usdRate, recordId);
    }

    // Ordenar la hoja por la fecha (columna 1) en orden descendente
    const range = sheet.getDataRange();
    range.sort({ column: 1, ascending: false });

    return recordId;
  } catch (error) {
    logError('logToExpenseSheet', error);
    throw error;
  }
}

/**
 * Crea registros para transferencias (registro negativo origen + registro positivo destino)
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {Object} data - Datos del registro
 * @param {Date} baseDate - Fecha base del registro
 * @param {string} recordType - Tipo de registro
 * @param {string} currency - Moneda del registro ("ARS" o "USD")
 * @param {number|null} usdRate - Cotización del dólar (null si es ARS)
 * @param {string} recordId - ID único del registro
 */
function createTransferRecords(sheet, data, baseDate, recordType, currency, usdRate, recordId) {
  const formattedDate = Utilities.formatDate(baseDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
  const amount = Math.abs(data.monto);
  
  // Si es en USD, convertir a pesos para la columna H
  const amountInArs = currency === 'USD' ? amount * usdRate : amount;
  
  // Registro negativo para cuenta origen
  const lastRow1 = sheet.getLastRow() + 1;
  sheet.getRange(lastRow1, 1, 1, 11).setValues([
    [formattedDate, -amount, data.cuenta, "", "", 
     `Transferencia a ${data.cuenta_destino}`, "", -amountInArs, recordType, currency, recordId]
  ]);
  
  // Registro positivo para cuenta destino
  const lastRow2 = sheet.getLastRow() + 1;
  sheet.getRange(lastRow2, 1, 1, 11).setValues([
    [formattedDate, amount, data.cuenta_destino, "", "", 
     `Transferencia de ${data.cuenta}`, "", amountInArs, recordType, currency, recordId]
  ]);
}

/**
 * Crea registros para gastos en cuotas (un registro por cuota)
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {Object} data - Datos del registro
 * @param {Date} baseDate - Fecha base del registro
 * @param {string} recordType - Tipo de registro
 * @param {string} currency - Moneda del registro ("ARS" o "USD")
 * @param {number|null} usdRate - Cotización del dólar (null si es ARS)
 * @param {string} recordId - ID único del registro
 */
function createInstallmentRecords(sheet, data, baseDate, recordType, currency, usdRate, recordId) {
  const totalAmount = Math.abs(data.monto);
  const installments = parseInt(data.cuotas);
  const monthlyAmount = totalAmount / installments;
  
  // Si es en USD, convertir a pesos para la columna H
  const monthlyAmountInArs = currency === 'USD' ? monthlyAmount * usdRate : monthlyAmount;
  
  // Crear un registro por cada cuota
  for (let i = 0; i < installments; i++) {
    // Calcular la fecha de cada cuota (mes siguiente para cada cuota)
    const installmentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
    const formattedDate = Utilities.formatDate(installmentDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
    
    // Descripción con información de cuota
    const description = `${data.descripcion} (Cuota ${i + 1}/${installments})`;

    const lastRow = sheet.getLastRow() + 1;
    sheet.getRange(lastRow, 1, 1, 11).setValues([
      [formattedDate, -monthlyAmount, data.cuenta, data.categoria, data.subcategoria,
       description, "", -monthlyAmountInArs, recordType, currency, recordId]
    ]);
  }
}

/**
 * Crea un registro simple (gasto sin cuotas o ingreso)
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {Object} data - Datos del registro
 * @param {Date} baseDate - Fecha base del registro
 * @param {string} recordType - Tipo de registro
 * @param {string} currency - Moneda del registro ("ARS" o "USD")
 * @param {number|null} usdRate - Cotización del dólar (null si es ARS)
 * @param {string} recordId - ID único del registro
 */
function createSimpleRecord(sheet, data, baseDate, recordType, currency, usdRate, recordId) {
  const formattedDate = Utilities.formatDate(baseDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  // Determinar el signo del monto según el tipo
  let amount = Math.abs(data.monto);
  if (data.tipo === 'gasto') {
    amount = -amount; // Gastos son negativos
  }
  // Los ingresos quedan positivos
  
  // Si es en USD, convertir a pesos para la columna H
  const amountInArs = currency === 'USD' ? amount * usdRate : amount;
  
  const lastRow = sheet.getLastRow() + 1;
  sheet.getRange(lastRow, 1, 1, 11).setValues([
    [formattedDate, amount, data.cuenta, data.categoria, data.subcategoria, 
     data.descripcion, "", amountInArs, recordType, currency, recordId]
  ]);
}

/**
 * Obtiene la hoja de registros
 * @return {Sheet} Hoja de registros
 */
function getExpensesSheet() {
  const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.EXPENSES_SHEET_NAME);
  if (!sheet) {
    throw new Error(`Hoja "${CONFIG.EXPENSES_SHEET_NAME}" no encontrada en la planilla`);
  }
  return sheet;
}

/**
 * Busca filas en la hoja de registros por su ID de registro (columna K)
 * @param {string} recordId - ID único del registro
 * @param {Sheet} [sheet] - Hoja de cálculo (se obtiene automáticamente si no se proporciona)
 * @return {number[]} Array de números de fila donde se encontró el registro
 */
function findRowsByRecordId(recordId, sheet) {
  if (!sheet) {
    sheet = getExpensesSheet();
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return [];
  }

  // Leer solo la columna de IDs (columna K, índice base 1 = RECORD_ID_COLUMN_INDEX + 1)
  const idColumnRange = sheet.getRange(1, RECORD_ID_COLUMN_INDEX + 1, lastRow, 1);
  const idValues = idColumnRange.getValues();
  const rows = [];

  for (let i = 0; i < idValues.length; i++) {
    if (idValues[i][0] === recordId) {
      rows.push(i + 1); // +1 porque las filas en Sheets empiezan en 1
    }
  }
  return rows;
}

/**
 * Lee los datos de un registro desde la hoja por su recordId
 * @param {string} recordId - ID único del registro
 * @return {Object|null} Datos del registro o null si no se encontró
 */
function getRecordDataById(recordId) {
  const sheet = getExpensesSheet();
  const rows = findRowsByRecordId(recordId, sheet);
  
  if (rows.length === 0) {
    return null;
  }
  
  // Leer la primera fila encontrada (columnas A-K: fecha, monto, cuenta, categoría, subcategoría, descripción, vacío, monto ARS, tipo, moneda, recordId)
  const rowData = sheet.getRange(rows[0], 1, 1, 11).getValues()[0];
  
  // Mapear tipo de la planilla al formato interno
  const tipoMap = { 'Gastos': 'gasto', 'Ingresos': 'ingreso', 'Transferencias': 'transferencia' };
  const tipo = tipoMap[rowData[8]] || 'gasto';
  
  const data = {
    tipo: tipo,
    monto: Math.abs(rowData[1]),
    cuenta: rowData[2],
    categoria: rowData[3],
    subcategoria: rowData[4],
    descripcion: rowData[5],
    fecha: rowData[0],
    moneda: rowData[9] || 'ARS'
  };
  
  // Para transferencias, extraer cuenta destino de la segunda fila
  if (tipo === 'transferencia' && rows.length >= 2) {
    const secondRow = sheet.getRange(rows[1], 1, 1, 11).getValues()[0];
    data.cuenta_destino = secondRow[2];
  }
  
  // Para cuotas, calcular monto total y número de cuotas
  if (rows.length > 1 && tipo === 'gasto') {
    data.cuotas = rows.length;
    data.monto = Math.abs(rowData[1]) * rows.length;
    // Limpiar "(Cuota X/Y)" de la descripción
    data.descripcion = data.descripcion.replace(/\s*\(Cuota \d+\/\d+\)$/, '');
  }
  
  return data;
}

/**
 * Elimina todas las filas asociadas a un ID de registro
 * @param {string} recordId - ID único del registro a eliminar
 * @return {boolean} True si se eliminaron filas, false si no se encontraron
 */
function deleteRecordsByRecordId(recordId) {
  const sheet = getExpensesSheet();
  const rows = findRowsByRecordId(recordId, sheet);
  
  if (rows.length === 0) {
    return false;
  }
  
  // Eliminar filas de abajo hacia arriba para no alterar los índices
  rows.sort((a, b) => b - a);
  for (const row of rows) {
    sheet.deleteRow(row);
  }
  
  return true;
}

/**
 * Actualiza un registro existente en la hoja: elimina las filas antiguas y crea las nuevas
 * @param {string} recordId - ID único del registro a actualizar
 * @param {Object} data - Nuevos datos del registro
 * @param {number} timestamp - Marca de tiempo Unix
 * @return {boolean} True si se actualizó correctamente
 */
function updateRecordInSheet(recordId, data, timestamp) {
  // Primero eliminar las filas existentes
  const deleted = deleteRecordsByRecordId(recordId);
  if (!deleted) {
    return false;
  }
  
  // Crear los nuevos registros con el mismo recordId
  logToExpenseSheet(data, timestamp, recordId);
  return true;
}

/**
 * Registra errores en la hoja de errores
 * @param {string} functionName - Nombre de la función donde ocurrió el error
 * @param {Error} error - Objeto de error
 * @param {Object} additionalInfo - Información adicional opcional
 */
function logError(functionName, error, additionalInfo = {}) {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.ERROR_SHEET_NAME);
    
    // Si la hoja no existe, crearla
    if (!sheet) {
      const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
      const newSheet = ss.insertSheet(CONFIG.ERROR_SHEET_NAME);
      newSheet.appendRow(['Timestamp', 'Function', 'Error Message', 'Stack Trace', 'Additional Info']);
    }
    
    // Registrar el error
    const errorSheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.ERROR_SHEET_NAME);
    errorSheet.appendRow([
      new Date(),
      functionName,
      error.message || String(error),
      error.stack || 'No stack trace',
      JSON.stringify(additionalInfo)
    ]);
  } catch (e) {
    // Si falla el registro en la hoja, intentar con Logger
    Logger.log(`ERROR en ${functionName}: ${error.message || String(error)}`);
    Logger.log(`Error al registrar el error: ${e.message || String(e)}`);
  }
}