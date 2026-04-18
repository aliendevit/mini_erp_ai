import { Prisma } from '@prisma/client';
import { Response } from 'express';

export function isPrismaKnownError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

export function sendDeleteBlocked(res: Response, entityGerman: string, hintsGerman?: string) {
  const extra = hintsGerman ? ` ${hintsGerman}` : '';
  return res.status(409).json({ message: `Löschen nicht möglich: ${entityGerman} ist noch verknüpft.${extra}` });
}

export function handlePrismaDeleteError(res: Response, err: unknown, entityGerman: string, hintsGerman?: string) {
  if (isPrismaKnownError(err) && err.code === 'P2003') {
    return sendDeleteBlocked(res, entityGerman, hintsGerman);
  }
  // fallback
  console.error(err);
  return res.status(500).json({ message: 'Interner Serverfehler.' });
}
