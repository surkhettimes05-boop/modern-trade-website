import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  Clock3,
  CookingPot,
  HeartHandshake,
  Home as HomeIcon,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store as StoreIcon,
  Tags,
  Wheat,
} from 'lucide-react';
import AppDownloadPanel from '@/components/home/AppDownloadPanel';
import HomeProductRail from '@/components/home/HomeProductRail';
import JsonLd from '@/components/JsonLd';
import { HOME_COPY } from '@/lib/homepageContent';
import type { StorefrontCategory } from '@/lib/catalog';
import { getCatalog } from '@/lib/serverCatalog';
import { buildMetadata, SITE } from '@/lib/seo';
import styles from './homepage.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'Pasalho grocery shopping in Nepal',
  description:
    'Discover groceries, everyday essentials, current offers and published Pasalho stores in Nepal. Shop online or learn about the Pasalho app and own brands.',
  path: '/',
});

const categoryIcons = [Wheat, CookingPot, ShoppingBasket, Sparkles, HomeIcon];

function SectionHeading({
  eyebrow,
  title,
  description,
  href,
  linkLabel,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {href && linkLabel ? (
        <Link href={href} className={styles.textLink}>
          {linkLabel} <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

function CategoryCard({ category, index }: { category: StorefrontCategory; index: number }) {
  const Icon = categoryIcons[index % categoryIcons.length];
  return (
    <Link href={`/category/${category.slug}`} className={styles.categoryCard}>
      <span className={styles.categoryIcon} aria-hidden="true"><Icon /></span>
      <span>{category.name}</span>
      <ChevronRight aria-hidden="true" />
    </Link>
  );
}

function formatOfferDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return new Intl.DateTimeFormat('en-NP', { day: 'numeric', month: 'short' }).format(date);
}

export default async function Home() {
  const { products, categories, stores, offers } = await getCatalog();
  const liveProducts = products.filter((product) => !product.id.startsWith('opening-'));
  const dealProducts = liveProducts
    .filter((product) => product.originalPrice && product.originalPrice > product.price)
    .slice(0, 6);
  const everydayProducts = liveProducts
    .filter((product) => !dealProducts.some((deal) => deal.id === product.id))
    .slice(0, 8);
  const visibleCategories = categories.slice(0, 10);
  const visibleStores = stores.slice(0, 3);
  const visibleOffers = offers.slice(0, 3);
  const appUrl = process.env.NEXT_PUBLIC_PASALHO_APP_URL?.trim() || null;

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    description: HOME_COPY.entityDescription,
    areaServed: { '@type': 'Country', name: 'Nepal' },
    brand: [
      { '@type': 'Brand', name: 'SAANJH' },
      { '@type': 'Brand', name: 'GHARCHAMAK by Pasalho' },
    ],
  };
  const pageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${SITE.url}/#home`,
    url: SITE.url,
    name: 'Pasalho grocery shopping in Nepal',
    description: HOME_COPY.entityDescription,
    about: { '@id': `${SITE.url}/#organization` },
    inLanguage: SITE.language,
  };

  return (
    <div className={styles.home}>
      <JsonLd data={[organizationSchema, pageSchema]} />

      <section className={`${styles.hero} shell`} data-home-hero aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.heroKicker}>PASALHO · MODERN GROCERY RETAIL IN NEPAL</p>
          <h1 id="home-title">{HOME_COPY.hero.title}</h1>
          <p className={styles.heroLead}>{HOME_COPY.hero.description}</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryButton} href="/shop">Shop now <ArrowRight aria-hidden="true" /></Link>
            <a className={styles.secondaryButton} href="#pasalho-app"><Smartphone aria-hidden="true" /> Download app</a>
          </div>
          <Link className={styles.appTextLink} href="/offers"><Tags aria-hidden="true" /> See current offers</Link>
        </div>

        <div className={styles.heroVisual}>
          <Image
            src="/category-chips-snacks.png"
            alt="A selection of packaged snacks and pantry foods"
            fill
            priority
            sizes="(max-width: 860px) 100vw, 42vw"
          />
          <div className={styles.heroScrim} aria-hidden="true" />
          <div className={styles.valueStamp}><BadgeCheck aria-hidden="true" /><span>FAIR VALUE</span></div>
          <div className={styles.heroVisualCopy}><span>GROCERIES · HOME · PERSONAL CARE</span><p>Everyday essentials, arranged for easy discovery.</p></div>
        </div>
      </section>

      <div className={`${styles.trustStrip} shell`} aria-label="Ways to shop with Pasalho">
        <span><StoreIcon aria-hidden="true" /> Shop in store</span>
        <span><ShoppingBasket aria-hidden="true" /> Browse online</span>
        <span><PackageCheck aria-hidden="true" /> Order through existing checkout</span>
      </div>

      <section className={`${styles.section} shell`} id="categories" aria-labelledby="categories-title">
        <div id="categories-title"><SectionHeading eyebrow="FIND IT FASTER" title="Shop by category" description="Go straight to the departments you use most." href="/shop" linkLabel="View all categories" /></div>
        {visibleCategories.length ? (
          <div className={styles.categoryGrid}>
            {visibleCategories.map((category, index) => <CategoryCard category={category} index={index} key={category.id} />)}
          </div>
        ) : (
          <div className={styles.emptyState}><h3>Categories are being updated</h3><p>Browse the shop while the category directory refreshes.</p><Link href="/shop">Browse products <ArrowRight aria-hidden="true" /></Link></div>
        )}
      </section>

      <section className={`${styles.section} ${styles.offersSection}`} aria-labelledby="offers-title">
        <div className="shell">
          <div id="offers-title"><SectionHeading eyebrow="CURRENT VALUE" title="Today’s offers" description="Only published campaigns and genuine catalog savings appear here." href="/offers" linkLabel="View all offers" /></div>
          {dealProducts.length ? <HomeProductRail products={dealProducts} /> : null}
          {!dealProducts.length && visibleOffers.length ? (
            <div className={styles.offerGrid}>
              {visibleOffers.map((offer) => {
                const start = formatOfferDate(offer.start_date);
                const end = formatOfferDate(offer.end_date);
                return (
                  <article className={styles.offerCard} key={offer.id}>
                    <Tags aria-hidden="true" /><p className={styles.cardLabel}>{offer.is_featured ? 'FEATURED OFFER' : 'CURRENT OFFER'}</p>
                    <h3>{offer.title}</h3><p>{offer.description}</p>
                    {start && end ? <small>Published for {start}–{end}</small> : null}
                  </article>
                );
              })}
            </div>
          ) : null}
          {!dealProducts.length && !visibleOffers.length ? (
            <div className={styles.emptyState}><Tags aria-hidden="true" /><h3>No active offers right now</h3><p>Published Pasalho offers will appear here as soon as they are available.</p><Link href="/shop">Browse the catalog <ArrowRight aria-hidden="true" /></Link></div>
          ) : null}
        </div>
      </section>

      <section className={`${styles.section} shell`} aria-labelledby="essentials-title">
        <div id="essentials-title"><SectionHeading eyebrow="FOR THE EVERYDAY LIST" title="Everyday essentials" description="A quick route into currently published grocery and household products." href="/shop" linkLabel="Shop all products" /></div>
        {everydayProducts.length ? <HomeProductRail products={everydayProducts} compact /> : (
          <div className={styles.emptyState}><ShoppingBasket aria-hidden="true" /><h3>Products will appear when the live catalog is available</h3><p>You can still open the shop to check the latest published selection.</p><Link href="/shop">Open the shop <ArrowRight aria-hidden="true" /></Link></div>
        )}
      </section>

      <section className={`${styles.section} ${styles.valueSection}`} aria-labelledby="value-title">
        <div className="shell">
          <div id="value-title"><SectionHeading eyebrow="WHY PASALHO" title="Built around the everyday shop" description="A practical grocery experience for families who value clarity, choice and convenience." /></div>
          <div className={styles.valueGrid}>
            <article><Tags aria-hidden="true" /><h3>Fair value</h3><p>Clear pricing and useful offers on the products people buy regularly.</p></article>
            <article><ShoppingBasket aria-hidden="true" /><h3>Everyday essentials</h3><p>Grocery, pantry, personal-care and household categories in one place.</p></article>
            <article><Smartphone aria-hidden="true" /><h3>Convenient shopping</h3><p>Browse online today, with the customer app designed for repeat shopping.</p></article>
            <article><ShieldCheck aria-hidden="true" /><h3>Dependable service</h3><p>Store-based availability and existing customer support when you need help.</p></article>
          </div>
        </div>
      </section>

      <section className={`${styles.section} shell`} id="our-brands" aria-labelledby="brands-title">
        <div id="brands-title"><SectionHeading eyebrow="PASALHO OWN BRANDS" title="Our brands" description="Focused labels being built around familiar household needs." href="/#our-brands" linkLabel="Explore our brands" /></div>
        <div className={styles.brandGrid}>
          <article className={`${styles.brandCard} ${styles.saanjh}`}><p className={styles.cardLabel}>PANTRY &amp; STAPLES</p><h3>SAANJH</h3><p>A Pasalho label focused on pulses, dal and everyday pantry staples.</p><span>Brand discovery</span></article>
          <article className={`${styles.brandCard} ${styles.gharchamak}`}><p className={styles.cardLabel}>HOUSEHOLD CLEANING</p><h3>GHARCHAMAK <small>by Pasalho</small></h3><p>A household cleaning brand being developed within the Pasalho family.</p><span>Brand discovery</span></article>
        </div>
        <p className={styles.editorialNote}>Brand information is editorial. Product availability is shown only through the live catalog.</p>
      </section>

      <section className={`${styles.section} ${styles.storeSection}`} aria-labelledby="stores-title">
        <div className="shell">
          <div id="stores-title"><SectionHeading eyebrow="STORE DISCOVERY" title="Find a Pasalho near you" description="Published store details appear here directly from the Pasalho location directory." href="/stores" linkLabel="View stores" /></div>
          {visibleStores.length ? (
            <div className={styles.storeGrid}>
              {visibleStores.map((store) => (
                <article className={styles.storeCard} key={store.id}>
                  <div className={styles.storeIcon}><MapPin aria-hidden="true" /></div>
                  <div><h3>{store.name}</h3>{store.address ? <p>{store.address}</p> : null}{store.hours ? <span><Clock3 aria-hidden="true" /> {store.hours}</span> : null}</div>
                  {store.map_url ? <a href={store.map_url} target="_blank" rel="noreferrer">Directions</a> : null}
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}><MapPin aria-hidden="true" /><h3>The published store directory is currently unavailable</h3><p>Check the stores page for the latest location information.</p><Link href="/stores">View stores <ArrowRight aria-hidden="true" /></Link></div>
          )}
        </div>
      </section>

      <AppDownloadPanel appUrl={appUrl} />

      <section className={`${styles.businessSection} shell`} aria-labelledby="business-title">
        <div><p className={styles.eyebrow}>WORK WITH PASALHO</p><h2 id="business-title">Part of the grocery ecosystem?</h2></div>
        <nav aria-label="Business opportunities">
          <Link href="/contact"><HeartHandshake aria-hidden="true" /><span>Supply to Pasalho<small>Start a conversation</small></span><ChevronRight aria-hidden="true" /></Link>
          <Link href="/contact"><Building2 aria-hidden="true" /><span>B2B / Wholesale<small>Business enquiries</small></span><ChevronRight aria-hidden="true" /></Link>
          <Link href="/contact"><BriefcaseBusiness aria-hidden="true" /><span>Franchise &amp; careers<small>Explore opportunities</small></span><ChevronRight aria-hidden="true" /></Link>
        </nav>
      </section>
    </div>
  );
}
