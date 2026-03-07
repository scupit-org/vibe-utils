import { z } from "zod";
import { AccessModeSchema, ClientProfileSchema } from "./ecosystem-config.js";

export const ReusePolicySchema = z.enum([
  "share_if_exact_match",
  "patch_if_safe",
  "never_share",
]);
export type ReusePolicy = z.infer<typeof ReusePolicySchema>;

export const ClientDescriptorSchema = z.object({
  descriptor_key: z.string().min(1),
  display_name: z.string().min(1),
  profile: ClientProfileSchema,
  access_mode: AccessModeSchema,
  supports_pkce: z.boolean().optional(),
  supports_device_flow: z.boolean().optional(),
  requires_refresh_tokens: z.boolean().optional(),
  requires_refresh_token_rotation: z.boolean().optional(),
  callback_urls: z.array(z.string()).optional(),
  logout_urls: z.array(z.string()).optional(),
  web_origins: z.array(z.string()).optional(),
  reuse_policy: ReusePolicySchema.default("share_if_exact_match"),
});

export type ClientDescriptor = z.infer<typeof ClientDescriptorSchema>;
