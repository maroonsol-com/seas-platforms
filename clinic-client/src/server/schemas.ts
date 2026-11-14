import { z } from "zod";

export const patientSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the patient name.").max(160),
  mobile: z.string().trim().min(8, "Enter a mobile number.").max(20),
  email: z.string().trim().max(160).optional(),
  dateOfBirth: z.string().trim().optional(),
  gender: z.enum(["female", "male", "other", "unknown"]),
  address: z.string().trim().max(500).optional(),
  bloodGroup: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]).optional(),
  emergencyContactName: z.string().trim().max(160).optional(),
  emergencyContactPhone: z.string().trim().max(20).optional(),
  allergies: z.string().trim().max(2000).optional(),
  history: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(4000).optional(),
  confirmDuplicate: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const catalogueSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(160),
  code: z.string().trim().max(40).optional(),
  description: z.string().trim().max(1000).optional(),
  unit: z.string().trim().max(40).optional(),
  sellingPrice: z.string().trim().min(1, "Enter a selling price."),
  purchasePrice: z.string().trim().optional(),
  taxClassification: z.string().trim().max(80).optional(),
  taxRate: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export function schemaError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
