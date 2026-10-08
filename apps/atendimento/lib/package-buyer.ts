import { z } from "zod";
import { phone } from "./domain";
export const packageBuyerSchema = z
  .object({
    shipmentId: z.string().regex(/^\d{1,30}$/),
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(1).max(80),
    document: z.string().trim().max(100).optional(),
    address: z.string().trim().max(500).optional(),
    addressFields: z
      .object({
        street: z.string().max(500),
        number: z.string().max(500),
        postalCode: z.string().max(500),
        neighborhood: z.string().max(500),
        city: z.string().max(500),
        state: z.string().max(500),
        extra: z.string().max(500),
        reference: z.string().max(500),
        type: z.string().max(500),
      })
      .optional(),
    sourceUrl: z.url().max(1000),
    capturedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const source = new URL(value.sourceUrl);
    if (
      source.protocol !== "https:" ||
      source.hostname !== "envios.adminml.com" ||
      source.port ||
      source.username ||
      source.password ||
      source.search ||
      source.hash ||
      source.pathname !==
        `/logistics/package-management/package/${value.shipmentId}`
    )
      ctx.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "Fonte não corresponde ao envio.",
      });
    if (!phone(value.phone))
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Telefone do comprador inválido.",
      });
  });
export function packageBuyerFields(
  raw: z.infer<typeof packageBuyerSchema> | undefined,
  shipmentId: string,
) {
  if (!raw) return {};
  const buyer = packageBuyerSchema.parse(raw);
  if (buyer.shipmentId !== shipmentId)
    throw new Error("O comprador coletado não corresponde ao envio.");
  return {
    customerName: buyer.name,
    customerPhone: phone(buyer.phone),
    customerVerified: true,
    ...(buyer.document ? { customerDocument: buyer.document } : {}),
    ...(buyer.address ? { customerAddress: buyer.address } : {}),
    ...(buyer.addressFields
      ? { customerAddressFields: buyer.addressFields }
      : {}),
    customerSource: buyer.sourceUrl,
    customerCapturedAt: buyer.capturedAt,
  };
}
