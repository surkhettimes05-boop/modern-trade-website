export const MARKET_CONFIGS = {
  NP: {
    countryCode: 'NP',
    countryName: 'Nepal',
    currencyCode: 'NPR',
    locale: 'en-NP',
    timezone: 'Asia/Kathmandu',
    taxRegime: 'IRD',
    taxLabel: 'IRD/VAT',
    phoneCountryCode: '+977',
    launchPaymentMethods: ['COD', 'CASH'],
  },
  IN: {
    countryCode: 'IN',
    countryName: 'India',
    currencyCode: 'INR',
    locale: 'en-IN',
    timezone: 'Asia/Kolkata',
    taxRegime: 'GST',
    taxLabel: 'GST',
    phoneCountryCode: '+91',
    launchPaymentMethods: ['COD', 'CASH'],
  },
} as const;

export const LAUNCH_MARKET_CODE = 'NP' as const;
export const MARKET = MARKET_CONFIGS[LAUNCH_MARKET_CODE];

const configuredMarket = process.env.NEXT_PUBLIC_ACTIVE_MARKET;
if (configuredMarket && configuredMarket !== LAUNCH_MARKET_CODE) {
  throw new Error(
    `NEXT_PUBLIC_ACTIVE_MARKET=${configuredMarket} is not certified; the pilot market is NP`,
  );
}

export const formatPrice = (value: number) =>
  new Intl.NumberFormat(MARKET.locale, {
    style: 'currency',
    currency: MARKET.currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
