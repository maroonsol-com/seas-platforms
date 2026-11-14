import { z } from "zod";

import { applicationIds, productSlugs } from "../types";

export const applicationIdSchema = z.enum(applicationIds);

export const productSlugSchema = z.enum(productSlugs);

export const emailSchema = z.email();

export const requiredTextSchema = z.string().trim().min(1);
