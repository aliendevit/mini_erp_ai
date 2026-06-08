import { z } from 'zod';

export type Locale = 'de' | 'en' | 'ar';

export type ValidationCopy = {
  required: (field: string) => string;
  invalidEmail: string;
  invalidPhone: string;
  invalidNumber: string;
  positiveNumber: string;
  invalidDate: string;
  optional: string;
  requiredLabel: string;
};

export function validationCopy(locale: Locale): ValidationCopy {
  if (locale === 'ar') {
    return {
      required: (field) => `${field} \u0645\u0637\u0644\u0648\u0628.`,
      invalidEmail: '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0628\u0631\u064a\u062f \u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0635\u062d\u064a\u062d \u0645\u062b\u0644 name@example.com.',
      invalidPhone: '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0623\u0631\u0642\u0627\u0645 \u0641\u0642\u0637. \u064a\u0645\u0643\u0646 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 + \u0641\u064a \u0627\u0644\u0628\u062f\u0627\u064a\u0629 \u0641\u0642\u0637.',
      invalidNumber: '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u0631\u0642\u0645 \u0635\u062d\u064a\u062d.',
      positiveNumber: '\u064a\u062c\u0628 \u0623\u0646 \u062a\u0643\u0648\u0646 \u0627\u0644\u0642\u064a\u0645\u0629 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631.',
      invalidDate: '\u064a\u0631\u062c\u0649 \u0625\u062f\u062e\u0627\u0644 \u062a\u0627\u0631\u064a\u062e \u0635\u062d\u064a\u062d.',
      optional: '\u0627\u062e\u062a\u064a\u0627\u0631\u064a',
      requiredLabel: '\u062d\u0642\u0644 \u0645\u0637\u0644\u0648\u0628',
    };
  }
  if (locale === 'de') {
    return {
      required: (field) => `${field} ist erforderlich.`,
      invalidEmail: 'Bitte eine gueltige E-Mail wie name@example.com eingeben.',
      invalidPhone: 'Bitte nur Zahlen eingeben. Ein + ist nur am Anfang erlaubt.',
      invalidNumber: 'Bitte eine gueltige Zahl eingeben.',
      positiveNumber: 'Der Wert muss groesser als null sein.',
      invalidDate: 'Bitte ein gueltiges Datum eingeben.',
      optional: 'optional',
      requiredLabel: 'erforderlich',
    };
  }
  return {
    required: (field) => `${field} is required.`,
    invalidEmail: 'Enter a valid email address like name@example.com.',
    invalidPhone: 'Use numbers only. A leading + is allowed for international codes.',
    invalidNumber: 'Enter a valid number.',
    positiveNumber: 'Value must be greater than zero.',
    invalidDate: 'Enter a valid date.',
    optional: 'optional',
    requiredLabel: 'required',
  };
}

export function sanitizePhoneInput(value: string): string {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export function sanitizeDecimalInput(value: string): string {
  return value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
}

export function requiredString(copy: ValidationCopy, field: string, max = 180) {
  return z.string().trim().min(1, copy.required(field)).max(max);
}

export function optionalString(max = 500) {
  return z.string().trim().max(max).optional().transform((value) => value === '' ? undefined : value);
}

export function optionalEmail(copy: ValidationCopy) {
  return optionalString(254).pipe(z.string().email(copy.invalidEmail).optional());
}

export function requiredEmail(copy: ValidationCopy, field: string) {
  return requiredString(copy, field, 254).pipe(z.string().email(copy.invalidEmail));
}

export function optionalPhone(copy: ValidationCopy) {
  return optionalString(24).pipe(z.string().regex(/^\+?\d{6,18}$/, copy.invalidPhone).optional());
}

export function requiredPhone(copy: ValidationCopy, field: string) {
  return requiredString(copy, field, 24).pipe(z.string().regex(/^\+?\d{6,18}$/, copy.invalidPhone));
}

export function optionalPositiveDecimal(copy: ValidationCopy) {
  return optionalString(32).pipe(
    z.string()
      .regex(/^\d+(\.\d{1,2})?$/, copy.invalidNumber)
      .refine((value) => Number(value) > 0, copy.positiveNumber)
      .optional(),
  );
}

export function requiredPositiveDecimal(copy: ValidationCopy, field: string) {
  return z.string()
    .trim()
    .min(1, copy.required(field))
    .regex(/^\d+(\.\d{1,2})?$/, copy.invalidNumber)
    .refine((value) => Number(value) > 0, copy.positiveNumber);
}

export function optionalIsoDate(copy: ValidationCopy) {
  return optionalString(10).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, copy.invalidDate).optional());
}

export type CustomerFormShape = {
  companyName: string;
  street: string;
  zipCode?: string;
  city: string;
  country: string;
  vatId: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  notes: string;
};

export function customerSchema(copy: ValidationCopy, labels: Partial<Record<keyof CustomerFormShape, string>> = {}) {
  return z.object({
    companyName: requiredString(copy, labels.companyName || 'Company name'),
    street: requiredString(copy, labels.street || 'Street'),
    zipCode: optionalString(32),
    city: requiredString(copy, labels.city || 'City'),
    country: requiredString(copy, labels.country || 'Country', 80),
    vatId: requiredString(copy, labels.vatId || 'VAT ID', 80),
    contactName: requiredString(copy, labels.contactName || 'Contact name', 120),
    contactPhone: requiredPhone(copy, labels.contactPhone || 'Phone'),
    contactEmail: optionalEmail(copy),
    notes: requiredString(copy, labels.notes || 'Notes', 1000),
  });
}

export type CustomerFormData = z.infer<ReturnType<typeof customerSchema>>;

export type OrderFormShape = {
  customerId: string;
  orderNumber: string;
  title: string;
  description: string;
  status: 'open' | 'paused' | 'closed';
  defaultHourlyRate?: string;
};

export function orderSchema(copy: ValidationCopy, labels: Partial<Record<keyof OrderFormShape, string>> = {}) {
  return z.object({
    customerId: requiredString(copy, labels.customerId || 'Customer'),
    orderNumber: requiredString(copy, labels.orderNumber || 'Order number', 80),
    title: requiredString(copy, labels.title || 'Title'),
    description: requiredString(copy, labels.description || 'Description', 1500),
    status: z.enum(['open', 'paused', 'closed']),
    defaultHourlyRate: optionalPositiveDecimal(copy),
  });
}

export type OrderFormData = z.infer<ReturnType<typeof orderSchema>>;

export type SiteFormShape = {
  orderId: string;
  siteName: string;
  street: string;
  zipCode?: string;
  city: string;
  notes: string;
  isActive: boolean;
};

export function siteSchema(copy: ValidationCopy, labels: Partial<Record<keyof SiteFormShape, string>> = {}) {
  return z.object({
    orderId: requiredString(copy, labels.orderId || 'Order'),
    siteName: requiredString(copy, labels.siteName || 'Site name'),
    street: requiredString(copy, labels.street || 'Street'),
    zipCode: optionalString(32),
    city: requiredString(copy, labels.city || 'City'),
    notes: requiredString(copy, labels.notes || 'Notes', 1000),
    isActive: z.boolean().default(true),
  });
}

export type SiteFormData = z.infer<ReturnType<typeof siteSchema>>;

export type WorkshopFormShape = {
  name: string;
  contactName: string;
  phone: string;
  email?: string;
  specialties: string;
  notes: string;
  availabilityStatus: 'available' | 'not_available';
  availabilityNote: string;
  isActive: boolean;
};

export function workshopSchema(copy: ValidationCopy, labels: Partial<Record<keyof WorkshopFormShape, string>> = {}) {
  return z.object({
    name: requiredString(copy, labels.name || 'Workshop name'),
    contactName: requiredString(copy, labels.contactName || 'Contact person', 120),
    phone: requiredPhone(copy, labels.phone || 'Phone'),
    email: optionalEmail(copy),
    specialties: requiredString(copy, labels.specialties || 'Specialties', 1000),
    notes: requiredString(copy, labels.notes || 'Notes', 1000),
    availabilityStatus: z.enum(['available', 'not_available']),
    availabilityNote: requiredString(copy, labels.availabilityNote || 'Availability note', 500),
    isActive: z.boolean(),
  });
}

export type WorkshopFormData = z.infer<ReturnType<typeof workshopSchema>>;

export const fieldClass = (hasError?: boolean) => hasError ? 'form-control-invalid' : undefined;
