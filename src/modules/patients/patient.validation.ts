import { z } from "zod";

export const savePatientSchema = z.object({
  phoneNumber: z.string().min(5),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  age: z.number().int().min(0),
  gender: z.string().min(1),
  dob: z.string().optional(),
  country: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  stAddress: z.string().optional(),
  languages: z.string().optional(),
  mrNumber: z.string().optional(),
  profilePhoto: z.string().optional(),
  consentAccepted: z.boolean().optional(),
});

export type SavePatientInput = z.infer<typeof savePatientSchema>;