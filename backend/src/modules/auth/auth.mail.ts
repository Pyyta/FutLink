import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../config/logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Punto único de salida de correo; en producción se reemplaza por un proveedor real. */
export interface MailService {
  send(message: MailMessage): Promise<void>;
}

const OUTBOX_DIR = fileURLToPath(new URL('../../../.mail-outbox/', import.meta.url));

/**
 * Implementación de desarrollo: escribe el correo en backend/.mail-outbox y registra
 * solo la ruta del archivo. El código nunca se envía a los logs (RNF-04/RNF-05).
 */
export class OutboxMailService implements MailService {
  async send(message: MailMessage): Promise<void> {
    await mkdir(OUTBOX_DIR, { recursive: true });

    const safeRecipient = message.to.replace(/[^a-z0-9@._-]/gi, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = randomBytes(4).toString('hex');
    const file = join(OUTBOX_DIR, `${timestamp}-${safeRecipient}-${suffix}.txt`);

    await writeFile(
      file,
      `Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n`,
      'utf8',
    );

    logger.info({ file }, 'Correo simulado guardado en .mail-outbox');
  }
}

/** Implementación para pruebas: conserva los mensajes en memoria. */
export class MemoryMailService implements MailService {
  public readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }
}

let current: MailService = new OutboxMailService();

export function getMailService(): MailService {
  return current;
}

export function setMailService(service: MailService): void {
  current = service;
}

export function resetMailService(): void {
  current = new OutboxMailService();
}
