import { z } from "zod";

export const deployBodySchema = z.object({
  app: z.string().min(1),
  env: z.string().min(1),
  tag: z.string().min(1),
  domain: z.string().min(1).optional(),
  internal_port: z.number().int().positive().optional()
});

export const appEnvBodySchema = z.object({
  app: z.string().min(1),
  env: z.string().min(1)
});

export const statusQuerySchema = z.object({
  app: z.string().min(1),
  env: z.string().min(1)
});

export const artifactsQuerySchema = z.object({
  app: z.string().min(1),
  env: z.string().min(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
