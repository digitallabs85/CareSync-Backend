import { z } from "zod";

export const signupSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  name: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;