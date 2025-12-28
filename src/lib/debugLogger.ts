export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogContextData {
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  context: string;
  message: string;
  data?: LogContextData;
  timestamp: string;
}

/**
 * Determina se estamos em ambiente browser ou servidor.
 */
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Formata a entrada de log de forma consistente.
 */
function formatLog(entry: LogEntry): string {
  const base = `[${entry.timestamp}] [${entry.level}] [${entry.context}] ${entry.message}`;
  if (!entry.data || Object.keys(entry.data).length === 0) {
    return base;
  }
  return `${base} ${JSON.stringify(entry.data)}`;
}

/**
 * Logger central: usa apenas console.* para ser seguro em
 * ambiente Next.js (tanto no cliente como no servidor).
 */
function writeLog(entry: LogEntry): void {
  const formatted = formatLog(entry);

  if (isBrowser()) {
    switch (entry.level) {
      case "ERROR":
        console.error(formatted);
        break;
      case "WARN":
        console.warn(formatted);
        break;
      case "INFO":
        console.info(formatted);
        break;
      case "DEBUG":
      default:
        console.debug(formatted);
        break;
    }
  } else {
    switch (entry.level) {
      case "ERROR":
        console.error(formatted);
        break;
      case "WARN":
        console.warn(formatted);
        break;
      case "INFO":
        console.info(formatted);
        break;
      case "DEBUG":
      default:
        console.debug(formatted);
        break;
    }
  }
}

function baseLog(level: LogLevel, context: string, message: string, data?: LogContextData): void {
  const entry: LogEntry = {
    level,
    context,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  writeLog(entry);
}

export function logDebug(context: string, message: string, data?: LogContextData): void {
  baseLog("DEBUG", context, message, data);
}

export function logInfo(context: string, message: string, data?: LogContextData): void {
  baseLog("INFO", context, message, data);
}

export function logWarn(context: string, message: string, data?: LogContextData): void {
  baseLog("WARN", context, message, data);
}

export function logError(context: string, message: string, data?: LogContextData): void {
  baseLog("ERROR", context, message, data);
}

/**
 * Gera um ID de correlação simples, estável o suficiente para logs.
 * Não usa crypto para ser seguro em qualquer ambiente.
 * Se receber um contexto, inclui-o no ID para facilitar debugging.
 */
export function correlationId(context?: string): string {
  const random = Math.random().toString(16).slice(2, 10);
  const time = Date.now().toString(16);

  if (context && context.trim().length > 0) {
    const ctx = context.trim().replace(/\s+/g, "-").toLowerCase();
    return `${ctx}-${time}-${random}`;
  }

  return `${time}-${random}`;
}

/**
 * Máscara e-mails em logs, preservando apenas a primeira letra e o domínio.
 * Ex: joao.silva@example.com -> j***@example.com
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0) {
    return "***";
  }
  const firstChar = trimmed[0] ?? "";
  const domain = trimmed.slice(atIndex);
  return `${firstChar}***${domain}`;
}

/**
 * Normaliza qualquer valor de erro para uma estrutura segura para logging.
 */
export function safeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: error,
    };
  }

  try {
    return {
      name: "Error",
      message: JSON.stringify(error),
    };
  } catch {
    return {
      name: "Error",
      message: "Unknown error",
    };
  }
}

/**
 * Inicializa um logger de contexto com ID de correlação.
 * Pode ser chamado sem parâmetros (usa baseContext 'app' por defeito).
 */
export function initializeDebugLogger(baseContext?: string, existingCorrelationId?: string) {
  const effectiveBaseContext = baseContext && baseContext.trim().length > 0 ? baseContext : "app";
  const id = existingCorrelationId ?? correlationId(effectiveBaseContext);
  const context = `${effectiveBaseContext} [cid=${id}]`;

  return {
    correlationId: id,
    debug: (message: string, data?: LogContextData) => logDebug(context, message, data),
    info: (message: string, data?: LogContextData) => logInfo(context, message, data),
    warn: (message: string, data?: LogContextData) => logWarn(context, message, data),
    error: (message: string, data?: LogContextData) => logError(context, message, data),
  };
}