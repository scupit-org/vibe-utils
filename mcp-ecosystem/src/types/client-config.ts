import { z } from "zod";
import {
  ClientProfileSchema,
  TokenEndpointAuthMethodSchema,
} from "./ecosystem-config.js";

const ENV_SAFE_CLIENT_KEY = /^[a-z]([a-z0-9-]*[a-z0-9])?$/;

export const ClientConfigSchema = z.object({
  client_key: z.string().min(1).regex(ENV_SAFE_CLIENT_KEY, {
    message:
      "client_key must be env-safe: lowercase, start with a letter, may contain digits or hyphens, and end with alphanumeric",
  }),
  display_name: z.string().min(1),
  descriptor: z.string().optional(),
  profile: ClientProfileSchema,
  auth0: z.object({
    create_if_missing: z.boolean().default(true),
  }),
  application_settings: z
    .object({
      callback_urls: z.array(z.string()).optional(),
      logout_urls: z.array(z.string()).optional(),
      web_origins: z.array(z.string()).optional(),
      token_endpoint_auth_method: TokenEndpointAuthMethodSchema.optional(),
    })
    .optional(),
  token_settings: z
    .object({
      use_refresh_tokens: z.boolean().optional(),
      refresh_token_rotation: z.boolean().optional(),
    })
    .optional(),
});

export type ClientConfig = z.infer<typeof ClientConfigSchema>;
