import { z } from "zod";

export const uploadFieldsSchema = z.object({
  app: z.string().min(1),
  env: z.string().min(1),
  tag: z.string().min(1),
  image_repo: z.string().min(1),
  domain: z.string().min(1).optional(),
  init_deploy: z.string().optional(),
  internal_port: z.string().optional()
});
