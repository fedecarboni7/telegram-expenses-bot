/**
 * Registra datos estructurados en la hoja de gastos
 * @param {Object} data - Datos estructurados del gasto
 * @param {number} timestamp - Marca de tiempo Unix
 */
function logToExpenseSheet(data, timestamp) {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.EXPENSES_SHEET_NAME);
    if (!sheet) {
      throw new Error(`Hoja "${CONFIG.EXPENSES_SHEET_NAME}" no encontrada en la planilla`);
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

    // Manejar según el tipo de registro
    if (data.tipo === 'transferencia') {
      // Transferencia: crear dos registros
      createTransferRecords(sheet, data, baseDate, recordType);
    } else if (data.tipo === 'gasto' && data.cuotas && data.cuotas > 1) {
      // Gasto con cuotas: crear un registro por cuota
      createInstallmentRecords(sheet, data, baseDate, recordType);
    } else {
      // Registro simple: gasto sin cuotas o ingreso
      createSimpleRecord(sheet, data, baseDate, recordType);
    }

    // Ordenar la hoja por la fecha (columna 1) en orden descendente
    const range = sheet.getDataRange();
    range.sort({ column: 1, ascending: false });

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
 */
function createTransferRecords(sheet, data, baseDate, recordType) {
  const formattedDate = Utilities.formatDate(baseDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
  const amount = Math.abs(data.monto);
  
  // Registro negativo para cuenta origen
  const lastRow1 = sheet.getLastRow() + 1;
  sheet.getRange(lastRow1, 1, 1, 10).setValues([
    [formattedDate, -amount, data.cuenta, "", "", 
     `Transferencia a ${data.cuenta_destino}`, "", -amount, recordType, "ARS"]
  ]);
  
  // Agregar fórmulas en las columnas K y L
  sheet.getRange(lastRow1, 11).setFormulaR1C1("=AND(RC1 >= 'Estadísticas'!R1C2; RC1 <= 'Estadísticas'!R2C2)");
  sheet.getRange(lastRow1, 12).setFormulaR1C1('=TEXT(RC1; "YYYY-MM")');
  
  // Registro positivo para cuenta destino
  const lastRow2 = sheet.getLastRow() + 1;
  sheet.getRange(lastRow2, 1, 1, 10).setValues([
    [formattedDate, amount, data.cuenta_destino, "", "", 
     `Transferencia de ${data.cuenta}`, "", amount, recordType, "ARS"]
  ]);
  
  // Agregar fórmulas en las columnas K y L
  sheet.getRange(lastRow2, 11).setFormulaR1C1("=AND(RC1 >= 'Estadísticas'!R1C2; RC1 <= 'Estadísticas'!R2C2)");
  sheet.getRange(lastRow2, 12).setFormulaR1C1('=TEXT(RC1; "YYYY-MM")');
}

/**
 * Crea registros para gastos en cuotas (un registro por cuota)
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {Object} data - Datos del registro
 * @param {Date} baseDate - Fecha base del registro
 * @param {string} recordType - Tipo de registro
 */
function createInstallmentRecords(sheet, data, baseDate, recordType) {
  const totalAmount = Math.abs(data.monto);
  const installments = parseInt(data.cuotas);
  const monthlyAmount = totalAmount / installments;
  
  // Crear un registro por cada cuota
  for (let i = 0; i < installments; i++) {
    // Calcular la fecha de cada cuota (mes siguiente para cada cuota)
    const installmentDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
    const formattedDate = Utilities.formatDate(installmentDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
    
    // Descripción con información de cuota
    const description = `${data.descripcion} (Cuota ${i + 1}/${installments})`;

    const lastRow = sheet.getLastRow() + 1;
    sheet.getRange(lastRow, 1, 1, 10).setValues([
      [formattedDate, -monthlyAmount, data.cuenta, data.categoria, data.subcategoria,
       description, "", -monthlyAmount, recordType, "ARS"]
    ]);
    
    // Agregar fórmulas en las columnas K y L
    sheet.getRange(lastRow, 11).setFormulaR1C1("=AND(RC1 >= 'Estadísticas'!R1C2; RC1 <= 'Estadísticas'!R2C2)");
    sheet.getRange(lastRow, 12).setFormulaR1C1('=TEXT(RC1; "YYYY-MM")');
  }
}

/**
 * Crea un registro simple (gasto sin cuotas o ingreso)
 * @param {Sheet} sheet - Hoja de cálculo
 * @param {Object} data - Datos del registro
 * @param {Date} baseDate - Fecha base del registro
 * @param {string} recordType - Tipo de registro
 */
function createSimpleRecord(sheet, data, baseDate, recordType) {
  const formattedDate = Utilities.formatDate(baseDate, Session.getScriptTimeZone(), "dd/MM/yyyy");
  
  // Determinar el signo del monto según el tipo
  let amount = Math.abs(data.monto);
  if (data.tipo === 'gasto') {
    amount = -amount; // Gastos son negativos
  }
  // Los ingresos quedan positivos
  
  const lastRow = sheet.getLastRow() + 1;
  sheet.getRange(lastRow, 1, 1, 10).setValues([
    [formattedDate, amount, data.cuenta, data.categoria, data.subcategoria, 
     data.descripcion, "", amount, recordType, "ARS"]
  ]);
  
  // Agregar fórmulas en las columnas K y L
  sheet.getRange(lastRow, 11).setFormulaR1C1("=AND(RC1 >= 'Estadísticas'!R1C2; RC1 <= 'Estadísticas'!R2C2)");
  sheet.getRange(lastRow, 12).setFormulaR1C1('=TEXT(RC1; "YYYY-MM")');
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