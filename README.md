# Telegram Expenses Bot

This repository contains the code for a Telegram bot that helps manage expenses. The bot is designed to be deployed using Google Apps Script and integrates with Google Sheets to store and organize your expense data.

## Features

- Track and manage expenses via Telegram using text or voice messages
- AI-powered expense processing using Google Gemini API
- Automatic categorization of expenses
- Easy configuration through Google Sheets
- Dynamic management of categories and accounts
- Secure usage limited to authorized users
- Detailed error logging for troubleshooting

## Prerequisites

- A Telegram account
- Google account to use Google Apps Script and Google Sheets
- Google Gemini API key for AI-powered expense processing

## Project Structure

- `Config.js`: Environment variables and configuration management
- `CommandHandler.js`: Telegram bot command processing
- `DataValidation.js`: Validation logic for expense data
- `GeminiApi.js`: Integration with Google Gemini for AI processing
- `SheetUtils.js`: Google Sheets operations
- `TelegramApi.js`: Telegram API communication
- `Webhook.js`: Webhook handling for Telegram updates

## Getting Started

### 1. Create a Telegram Bot

1. Open Telegram and search for the BotFather.
2. Start a chat with BotFather and send the command `/newbot`.
3. Follow the instructions to create your bot. You will receive a token, which you will use later.

### 2. Set Up Google Apps Script

1. Go to [Google Apps Script](https://script.google.com/).
2. Create a new project.
3. Copy the code from this repository and paste it into the Apps Script editor.
4. Alternatively, if you have `clasp` installed, you can clone this repository and use `clasp push` to upload it.

### 3. Configure the Bot

1. In the Apps Script editor, go to `Project Settings` > `Script Properties`.
2. Add the following script properties:
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from BotFather
   - `GEMINI_API_KEY`: Your Google Gemini API key (you can obtain it for free from [Google AI Studio](https://aistudio.google.com/))
   - `SHEET_ID`: The ID of your Google Spreadsheet (from the URL)
   - `MY_CHAT_ID`: Your Telegram user ID for admin access
   - `APP_URL`: The deployment URL of your Google Apps Script web app (you'll get this after deployment)

### 4. Create Google Spreadsheet

1. Create a new Google Spreadsheet.
2. Add the following sheets:
   - `Registros`: For storing expense records
   - `Categorías y subcategorías`: For configuring expense categories and accounts
   - `Bot Errors`: For logging errors

3. Configure the "Categorías y subcategorías" sheet with these columns:
   - Column A: Tipo (Type) - e.g., "Gastos" (Expenses)
   - Column B: Categorías (Categories)
   - Column C: Subcategorías (Subcategories)
   - Column D: Cuentas (Accounts)

   Add your desired expense categories, subcategories, and accounts. The "Tipo" column should contain "Gastos" for expense categories.

4. The "Registros" sheet will store expenses with the following structure:
   - Date
   - Amount (negative for expenses)
   - Account
   - Category
   - Subcategory
   - Description
   - Additional data fields and formulas for reporting

### 5. Deploy the Script

1. Click on `Deploy` > `New deployment`.
2. Select `Web app`.
3. Set the `Project version` to `New` and give it a description (e.g., Initial deployment).
4. Set `Execute the app as` to `Me`.
5. Set `Who has access` to `Anyone`.
6. Click `Deploy`.
7. You will receive a URL. Copy this URL and add it to your script properties as `APP_URL`.

### 6. Set Up Webhook

1. After deploying your script, run the `setWebhook` function from the Apps Script editor:
   - In the Apps Script editor, select `setWebhook` from the function dropdown menu at the top.
   - Click the "Run" button.
   - The function will use your script properties to automatically set up the webhook.
   - Check the logs to confirm that the webhook was set successfully.

### 7. Using the Bot

Open Telegram and start a chat with your bot. The bot is restricted to your chat ID (set in `MY_CHAT_ID`). You can use the following features:

- **Direct Text Messages**:
  Send a text message with expense information, and the bot will use Gemini to extract the expense details.
  Example: "50 euros for dinner at a restaurant"

- **Voice Messages**:
  Send a voice message describing your expense, and the bot will process it to extract the expense details.
  Example: Record a message saying "I spent 30 dollars on gas yesterday"

- **Configuration Commands**:
  - `/reload` - Reload configuration from spreadsheet
  - `/listacategorias` - View available expense categories
  - `/listasubcategorias [categoría]` - View subcategories for a specific category
  - `/listacuentas` - View available accounts
  - `/agregarcategoria [nombre]` - Add a new category
  - `/agregarcuenta [nombre]` - Add a new account
  - `/borrarcategoria [nombre]` - Delete a category
  - `/borrarcuenta [nombre]` - Delete an account
  - `/ayuda` - Display help information

After successfully processing your expense, the bot will confirm with a message showing the amount, description, category, and account.

## Expense Recording Details

When you send an expense message, the bot:

1. Uses Gemini AI to extract expense amount, description, category, and account
2. Records the expense with a negative amount in your spreadsheet
3. Automatically sorts expenses by date in descending order
4. Validates that the expense has all required fields before recording

## Troubleshooting

- If the bot doesn't respond, check the Bot Errors sheet in your spreadsheet
- Make sure your Telegram chat ID matches the one in script properties
- Verify that your webhook is properly set up by running the setWebhook function again
- For voice messages, ensure that the correct MIME type is being processed

## Contributing

Feel free to fork this repository and submit pull requests. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
