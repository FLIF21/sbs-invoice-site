export type CalculationMethod =
  | "RECTANGULAR_DUCT"
  | "RECTANGULAR_ELBOW"
  | "RECTANGULAR_TRANSITION"
  | "ROUND_DAMPER"
  | "RECTANGULAR_DAMPER"
  | "CUSTOM_AREA";

export type ProductDimensions = {
  width?: number;
  height?: number;
  width2?: number;
  height2?: number;
  diameter?: number;
  length?: number;
  radius?: number;
  angle?: number;
  area?: number;
  rail?: string;
};

export type QuoteItemInput = {
  productCode: string;
  thicknessCode: string;
  quantity: number;
  dimensions: ProductDimensions;
};

export type PublicCatalog = {
  products: Array<{
    id: string;
    code: string;
    name: string;
    category: string;
    description: string | null;
    imagePath: string | null;
    defaultDimensions: ProductDimensions;
    calculationMethod: CalculationMethod;
    rates: Array<{
      id: string;
      thicknessCode: string;
      tierKey: string;
      minBoundary: number | null;
      maxBoundary: number | null;
      materialMultiplier: number;
      laborCost: number;
    }>;
  }>;
  thicknesses: Array<{
    id: string;
    code: string;
    millimeters: number;
    label: string;
    metalCost: number;
  }>;
  coefficients: Array<{
    id: string;
    key: string;
    name: string;
    value: number;
    enabled: boolean;
  }>;
  tax: { enabled: boolean; rate: number };
  company: CompanySnapshot;
  invoiceNumberPreview: string;
  pricesUpdatedAt: string;
};

export type CompanySnapshot = {
  name: string;
  legalName: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  bankName: string | null;
  bik: string | null;
  checking: string | null;
  correspondent: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl?: string | null;
};

export type CalculatedLine = {
  productId: string;
  productCode: string;
  productName: string;
  description: string;
  dimensions: ProductDimensions;
  thicknessCode: string;
  quantity: number;
  area: number;
  netUnitPrice: number;
  grossUnitPrice: number;
  netTotal: number;
  grossTotal: number;
  pricingSnapshot: Record<string, unknown>;
};

export type CalculatedQuote = {
  lines: CalculatedLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  tax: { enabled: boolean; rate: number };
};

export type InvoiceClientData = {
  name: string;
  inn?: string;
  kpp?: string;
  address?: string;
  phone?: string;
  email?: string;
};

export type InvoiceDocument = {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  project: string | null;
  requestNumber: string | null;
  applicant: string | null;
  notes: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  tax: { enabled: boolean; rate: number };
  company: CompanySnapshot;
  client: InvoiceClientData;
  items: CalculatedLine[];
};

export type PaymentPublicConfig = {
  available: boolean;
  testMode: boolean;
  provider: "disabled" | "test" | "yookassa";
};

export type PaymentCreationResult = {
  alreadyPaid: boolean;
  confirmationUrl: string | null;
  paymentId: string | null;
};
