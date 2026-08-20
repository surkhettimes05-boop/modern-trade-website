import { z } from "zod";

export const MARKET_CONFIGS = {
  NP: {
    countryCode: "NP",
    countryName: "Nepal",
    currencyCode: "NPR",
    locale: "en-NP",
    timezone: "Asia/Kathmandu",
    taxRegime: "IRD",
    taxLabel: "IRD/VAT",
    standardTaxRate: 0.13,
    phoneCountryCode: "+977",
    phonePattern: /^(?:\+977[ -]?)?9[6-9]\d{8}$/,
    postalCodePattern: /^\d{5}$/,
    addressLabels: {
      province: "Province",
      district: "District",
      municipality: "Municipality",
      ward: "Ward",
      locality: "Tole / locality",
    },
    launchPaymentMethods: ["COD", "CASH"],
  },
  IN: {
    countryCode: "IN",
    countryName: "India",
    currencyCode: "INR",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
    taxRegime: "GST",
    taxLabel: "GST",
    standardTaxRate: 0.18,
    phoneCountryCode: "+91",
    phonePattern: /^(?:\+91[ -]?)?[6-9]\d{9}$/,
    postalCodePattern: /^\d{6}$/,
    addressLabels: {
      province: "State",
      district: "District",
      municipality: "City",
      ward: "Locality",
      locality: "Street address",
    },
    launchPaymentMethods: ["COD", "CASH"],
  },
} as const;

export type MarketCode = keyof typeof MARKET_CONFIGS;
export const LAUNCH_MARKET_CODE = "NP" as const;
export const MARKET = MARKET_CONFIGS[LAUNCH_MARKET_CODE];

const MarketEnvironmentSchema = z.object({
  ACTIVE_MARKET: z.enum(["NP", "IN"]).default(LAUNCH_MARKET_CODE),
  DEFAULT_COUNTRY_CODE: z.enum(["NP", "IN"]).optional(),
  DEFAULT_CURRENCY_CODE: z.string().length(3).optional(),
  DEFAULT_LOCALE: z.string().min(2).optional(),
  DEFAULT_TIMEZONE: z.string().min(3).optional(),
  DEFAULT_TAX_REGIME: z.string().min(2).optional(),
});

export function getActiveMarket(env: NodeJS.ProcessEnv = process.env) {
  const values = MarketEnvironmentSchema.parse(env);
  if (values.ACTIVE_MARKET !== LAUNCH_MARKET_CODE) {
    throw new Error(
      `ACTIVE_MARKET=${values.ACTIVE_MARKET} is not certified; the production pilot launch market is NP`,
    );
  }

  const expected = MARKET_CONFIGS[values.ACTIVE_MARKET];
  const configured = {
    DEFAULT_COUNTRY_CODE: values.DEFAULT_COUNTRY_CODE,
    DEFAULT_CURRENCY_CODE: values.DEFAULT_CURRENCY_CODE,
    DEFAULT_LOCALE: values.DEFAULT_LOCALE,
    DEFAULT_TIMEZONE: values.DEFAULT_TIMEZONE,
    DEFAULT_TAX_REGIME: values.DEFAULT_TAX_REGIME,
  };
  const required = {
    DEFAULT_COUNTRY_CODE: expected.countryCode,
    DEFAULT_CURRENCY_CODE: expected.currencyCode,
    DEFAULT_LOCALE: expected.locale,
    DEFAULT_TIMEZONE: expected.timezone,
    DEFAULT_TAX_REGIME: expected.taxRegime,
  };

  for (const [key, value] of Object.entries(configured)) {
    if (value && value !== required[key as keyof typeof required]) {
      throw new Error(
        `${key}=${value} conflicts with ACTIVE_MARKET=${values.ACTIVE_MARKET}; expected ${required[key as keyof typeof required]}`,
      );
    }
  }
  return expected;
}

export function validateMarketEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const market = getActiveMarket(env);
  if (env.NODE_ENV === "production") {
    const requiredKeys = [
      "ACTIVE_MARKET",
      "DEFAULT_COUNTRY_CODE",
      "DEFAULT_CURRENCY_CODE",
      "DEFAULT_LOCALE",
      "DEFAULT_TIMEZONE",
      "DEFAULT_TAX_REGIME",
    ] as const;
    const missing = requiredKeys.filter((key) => !env[key]?.trim());
    if (missing.length) {
      throw new Error(
        `Missing explicit production market configuration: ${missing.join(", ")}`,
      );
    }
  }
  if (!market.launchPaymentMethods.includes("COD")) {
    throw new Error("The Nepal pilot must keep COD enabled");
  }
}
