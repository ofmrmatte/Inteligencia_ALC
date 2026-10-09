import { z } from "zod";

export const templateParameterNameSchema = z.enum([
  "nome_motorista", "customer_name", "nome_disparou", "product_name",
  "delivery_date", "delivery_time", "product_id", "purchase_value",
]);
export const templateButtonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }).strict(),
  z.object({ type: z.literal("URL"), text: z.string().min(1).max(25), url: z.url().max(2000) }).strict(),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phone_number: z.string().regex(/^\+?[1-9]\d{7,14}$/) }).strict(),
]);
export const templateCategorySchema = z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]);

// Editable copy only. The server binds the sender and derives the content hash.
export const templateContractDraftSchema = z.object({
  channel: z.enum(["driver", "client"]),
  name: z.enum(["pnraberta", "cliente_loss_v2"]), language: z.literal("pt_BR"),
  category: templateCategorySchema,
  bodyText: z.string().min(1).max(1024),
  headerText: z.string().min(1).max(60).nullable(),
  footerText: z.string().min(1).max(60).nullable(),
  buttons: z.array(templateButtonSchema).max(10),
  parameters: z.object({ header: z.array(templateParameterNameSchema).max(1), body: z.array(templateParameterNameSchema).max(7) }).strict(),
}).strict();
export type TemplateContractDraft = z.infer<typeof templateContractDraftSchema>;
