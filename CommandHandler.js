/**
 * Maneja los comandos de Telegram
 * @param {Object} message - Mensaje de Telegram
 * @param {Number} chatId - ID del chat
 * @return {Boolean} - True si se procesó un comando
 */
function handleCommands(message, chatId) {
  if (!message.text || !message.text.startsWith('/')) {
    return false;
  }
  
  const parts = message.text.split(' ');
  const command = parts[0].toLowerCase();
  
  switch (command) {
    case '/categorias_gastos': {
      const { expense_categories } = CONFIG.loadConfigData();
      let msg = '<b>Categorías de gastos:</b>\n';
      for (const cat in expense_categories) {
        msg += `• <b>${cat}</b>\n`;
      }
      sendTelegramMessage(chatId, msg, { parse_mode: 'HTML' });
      return true;
    }
    case '/categorias_ingresos': {
      const { income_categories } = CONFIG.loadConfigData();
      let msg = '<b>Categorías de ingresos:</b>\n';
      for (const cat in income_categories) {
        msg += `• <b>${cat}</b>\n`;
      }
      sendTelegramMessage(chatId, msg, { parse_mode: 'HTML' });
      return true;
    }
    case '/subcategorias': {
      const { expense_categories, income_categories } = CONFIG.loadConfigData();
      const allCategories = { ...expense_categories, ...income_categories };
      const categoryParam = parts.slice(1).join(' ');
      if (categoryParam.trim() === '') {
        // Mostrar la lista de categorías disponibles como comandos clickeables
        const categoriesList = Object.keys(allCategories).map(c => {
          const normalizedCategory = removeDiacritics(c).replace(/\s+/g, '_');
          return `• /ls_${normalizedCategory}`;
        }).join('\n');
        const message = `📋 <b>Categorías disponibles:</b>\n\n${categoriesList}\n\n<i>Seleccione una categoría tocando en la opción deseada</i>`;
        sendTelegramMessage(chatId, message, { parse_mode: 'HTML' });
        return true;
      }
      listSubcategories(chatId, categoryParam, allCategories);
      return true;
    }
    // Manejar el comando con formato de guion bajo
    case (command.match(/^\/ls_/) || {}).input: {
      const { expense_categories, income_categories } = CONFIG.loadConfigData();
      const allCategories = { ...expense_categories, ...income_categories };
      const cmdCategory = command.replace('/ls_', '').replace(/_/g, ' ');
      const matchedCategory = findCategoryIgnoringAccents(cmdCategory, allCategories);
      if (matchedCategory) {
        listSubcategories(chatId, matchedCategory, allCategories);
      } else {
        sendTelegramMessage(chatId, `❌ No se encontró la categoría "${cmdCategory}"`);
      }
      return true;
    }
    case '/cuentas':
      listAccounts(chatId);
      return true;
    case '/ayuda':
      sendHelpMessage(chatId);
      return true;
    default:
      return false;
  }
}

/**
 * Lista las categorías
 */
// Lista las subcategorías de una categoría específica (gastos o ingresos)
function listSubcategories(chatId, category, allCategories) {
  if (allCategories[category]) {
    const message = `📋 <b>Subcategorías de ${category}:</b>\n\n` + 
                    allCategories[category].map(sc => `• ${sc}`).join('\n');
    sendTelegramMessage(chatId, message, { parse_mode: 'HTML' });
  } else {
    // Intentar encontrar la categoría ignorando tildes
    const matchedCategory = findCategoryIgnoringAccents(category, allCategories);
    if (matchedCategory) {
      const message = `📋 <b>Subcategorías de ${matchedCategory}:</b>\n\n` + 
                      allCategories[matchedCategory].map(sc => `• ${sc}`).join('\n');
      sendTelegramMessage(chatId, message, { parse_mode: 'HTML' });
    } else {
      const availableCategories = Object.keys(allCategories).join('\n• ');
      sendTelegramMessage(chatId, `❌ Categoría "${category}" no encontrada.\n\nCategorías disponibles:\n• ${availableCategories}`);
    }
  }
}

/**
 * Elimina tildes y signos diacríticos de una cadena
 * @param {string} str - Cadena a normalizar
 * @return {string} - Cadena sin tildes
 */
function removeDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Encuentra una categoría ignorando tildes
 * @param {string} searchCategory - Categoría a buscar
 * @return {string|null} - Categoría encontrada o null
 */
function findCategoryIgnoringAccents(searchCategory, allCategories) {
  const normalizedSearch = removeDiacritics(searchCategory.toLowerCase());
  for (const category of Object.keys(allCategories)) {
    if (removeDiacritics(category.toLowerCase()) === normalizedSearch) {
      return category;
    }
  }
  return null;
}

/**
 * Lista las cuentas
 */
function listAccounts(chatId) {
  const message = `💳 Cuentas disponibles:\n\n` + accounts.map(a => `• ${a}`).join('\n');
  sendTelegramMessage(chatId, message);
}

/**
 * Envía un mensaje de ayuda
 */
function sendHelpMessage(chatId) {
  const message = `🤖 Comandos disponibles:

/categorias_gastos - Ver categorías de gastos
/categorias_ingresos - Ver categorías de ingresos
/subcategorias [categoría] - Ver subcategorías de una categoría
/cuentas - Ver cuentas disponibles
/ayuda - Ver esta ayuda

💡 <b>Borrar registros:</b>
Respondé a un mensaje de registro confirmado para borrarlo.
• Para <b>borrar</b>: respondé con "borrar", "eliminar", etc.`;

  sendTelegramMessage(chatId, message);
}