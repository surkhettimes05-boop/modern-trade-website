/** Referral URLs must begin on the customer website so attribution cookies
 * belong to the same host as the customer registration request. */
export function creatorReferralLink(
  slug: string,
  webOrigin = process.env.CUSTOMER_WEB_URL,
) {
  const path = `/r/${encodeURIComponent(slug)}`;
  return {
    path,
    url: webOrigin ? new URL(path, webOrigin).toString() : null,
  };
}
