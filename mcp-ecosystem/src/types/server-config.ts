import { z } from "zod";
import {
  ClientAccessPolicySchema,
  UserAccessPolicySchema,
} from "./ecosystem-config.js";

const DNS_SAFE_SLUG = /^[a-z]([a-z0-9-]*[a-z0-9])?$/;

export const ServerConfigSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(DNS_SAFE_SLUG, {
    message:
      "Slug must be DNS-safe: lowercase, start with letter, may contain hyphens, end with alphanumeric",
  }),
  scope_profile: z.string().optional(),
  extra_scopes: z.array(z.string()).optional(),
  auth0: z
    .object({
      create_api_if_missing: z.boolean().default(true),
      existing_api_id: z.string().nullable().default(null),
    })
    .optional(),
  grants: z
    .object({
      client_groups: z.array(z.string()).optional(),
      client_overrides: z.record(z.string(), z.array(z.string())).optional(),
    })
    .optional(),
  access_policy: z
    .object({
      user: UserAccessPolicySchema.optional(),
      client: ClientAccessPolicySchema.optional(),
    })
    .optional(),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
