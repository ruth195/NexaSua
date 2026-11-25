import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import type { ZodSchema } from 'zod';

export function parseBody<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: result.error.issues[0]?.message || 'Invalid request input.',
      issues: result.error.issues,
    });
    return null;
  }
  return result.data;
}

export function validObjectId(id: string | undefined): string | null {
  if (!id || typeof id !== 'string' || !mongoose.isValidObjectId(id)) {
    return null;
  }
  return id;
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
