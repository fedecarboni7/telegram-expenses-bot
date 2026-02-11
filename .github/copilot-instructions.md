# Copilot Instructions

## Project Overview

This is a **Telegram bot for personal finance tracking**, built entirely with **Google Apps Script**. Users send text or voice messages via Telegram describing expenses, income, or transfers, and the bot uses the **Google Gemini API** to extract structured financial data, which is then stored in a **Google Spreadsheet**.

## Tech Stack & Runtime

- **Runtime**: Google Apps Script (V8 engine) — there is no `package.json`, Node.js, or npm.
- **Deployment**: Via [clasp](https://github.com/google/clasp) (Command Line Apps Script). CI/CD is configured in `.github/workflows/deploy.yml` using GitHub Actions to push and deploy on any push to `master` (including merges and direct pushes).
- **APIs**: Telegram Bot API, Google Gemini API (generative AI), Google Sheets via `SpreadsheetApp`.
- **Language**: JavaScript (Google Apps Script flavor). No TypeScript, no module system — all files share a single global scope.
- **Testing**: Manual only, via the Apps Script editor. There is no automated test framework. `Test.js` contains a simple manual test function.
- **Linting/Building**: None. There are no linters, formatters, or build steps configured.

## File Structure

| File | Purpose |
|---|---|
| `Config.js` | Centralized configuration — script properties, sheet names, dynamic loading of categories/accounts from the spreadsheet |
| `Webhook.js` | Main entry point (`doPost`). Handles incoming Telegram webhooks, confirmation flow (confirm/edit/cancel), message formatting |
| `GeminiApi.js` | Gemini API integration for processing text and audio messages into structured financial data |
| `TelegramApi.js` | Telegram Bot API wrapper functions (send messages, edit messages, handle callbacks) |
| `CommandHandler.js` | Slash command handling (`/categorias_gastos`, `/cuentas`, `/ayuda`, etc.) |
| `DataValidation.js` | Validates structured data against configured categories, accounts, and business rules |
| `SheetUtils.js` | Google Sheets operations — writing records (simple, installment, transfer), error logging, USD conversion |
| `Test.js` | Manual test helper for `doPost` |
| `appsscript.json` | Apps Script project manifest (timezone, scopes, webapp config) |

## Coding Conventions

### Language & Comments
- **User-facing strings** are in **Spanish** (Argentine Spanish). Bot messages, error messages, and sheet data all use Spanish.
- **Code comments** are mostly in Spanish, though some are in English. Follow the existing style of each file.
- Use **JSDoc-style comments** (`/** ... */`) for function documentation, including `@param` and `@return` tags.

### Patterns
- **Global scope**: All files share a single global namespace. Functions and constants defined in any file are available everywhere. There are no imports/exports.
- **Configuration**: Use `CONFIG` object from `Config.js` for all environment values. Script properties are read via `PropertiesService.getScriptProperties()`.
- **Error handling**: Wrap operations in try/catch. Log errors to the "Bot Errors" sheet using `logError(functionName, error, additionalInfo)`. Also attempt to notify the user via Telegram when errors occur.
- **Caching**: Use `CacheService.getUserCache()` for temporary data (pending expense confirmations, edit mode state).
- **Data validation**: All structured data from Gemini must pass through `validateData()` before being saved.
- **Currency**: Default is ARS (Argentine Pesos). USD is supported with automatic blue dollar rate conversion via `dolarapi.com`.

### Data Schema
- The "Registros" (Records) sheet has columns: Date, Amount, Account, Category, Subcategory, Description, (empty), Amount in ARS, Type (Gastos/Ingresos/Transferencias), Currency (ARS/USD).
- Subcategories use the format `"Category > Subcategory"` (e.g., `"Auto > Nafta"`).
- Expenses are stored as negative amounts; income and transfer destinations are positive.

## Deployment

- Pushes to `master` trigger automatic deployment via GitHub Actions.
- The workflow uses `clasp push --force` and `clasp deploy` with a specific deployment ID.
- Required GitHub secrets: `CLASPRC_JSON`, `SCRIPT_ID`, `DEPLOYMENT_ID`.
- The `.clasp.json` and `.claspignore` files are git-ignored.

## Important Notes

- Do **not** add `package.json`, npm dependencies, or Node.js tooling — this is a pure Google Apps Script project.
- Do **not** add module imports/exports (`require`, `import`) — Apps Script uses a shared global scope.
- When adding new functions, they are automatically available globally across all files.
- The bot is restricted to a single authorized user via `MY_CHAT_ID`.
