import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ShoppingBag, ShieldCheck, Wallet, Leaf } from 'lucide-react';
import HomeProductRail from '@/components/home/HomeProductRail';
import { getCatalog } from '@/lib/serverCatalog';
import { buildMetadata } from '@/lib/seo';
export const metadata = buildMetadata({ title: 'Pasalho | Groceries & everyday essentials', description: 'Shop groceries, snacks and household essentials at Pasalho. Order online with cash on delivery in Nepal.', path: '/' });
export default async function Home() {
  const { products, categories } = await getCatalog();
  const pantry = products.filter(p => /rice|oil|noodle|water|dal|flour/i.test(p.name));
  const household = products.filter(p => /shampoo|laundry|clean|care|detergent/i.test(p.name));
  return <div className="fresh-home shell">
    <section className="fresh-hero"><div><span className="hero-pill"><Leaf size={14} /> Everyday essentials, made easy</span><h1>Your everyday basket.<br /><span>A little greener.</span></h1><p>Groceries, snacks and home essentials.<br />Good things for your daily routine.</p><Link href="/shop" className="hero-shop">Start shopping <ArrowRight size={18} /></Link></div><div className="hero-art"><Image src="/category-chips-snacks.png" alt="Snacks and everyday grocery essentials" fill sizes="(max-width: 600px) 40vw, 450px" priority /></div></section>
    <section className="category-section" aria-labelledby="categories-title"><div className="fresh-heading"><h2 id="categories-title">Shop by category</h2><Link href="/shop">See all <ArrowRight size={16} /></Link></div><div className="fresh-categories">{categories.slice(0, 20).map((category, index) => <Link href={`/category/${category.slug}`} key={category.id} className="fresh-category"><div style={{ backgroundColor: ['#eef7e9','#fff4df','#edf5fa','#f9eef2'][index % 4] }}>{category.image ? <Image src={category.image} alt="" fill sizes="(max-width: 600px) 90px, 120px" /> : <ShoppingBag size={40} />}</div><span>{category.name}</span></Link>)}</div></section>
    <section className="fresh-section"><div className="fresh-heading"><h2>Everyday essentials</h2><Link href="/shop">See all <ArrowRight size={16} /></Link></div><HomeProductRail products={pantry.length ? pantry : products} /></section>
    <div className="fresh-promos"><Link href="/category/chips-snacks" className="snack-promo"><div><small>THE SNACK BREAK</small><h2>Make room for<br />your favourites.</h2><span>Explore snacks <ArrowRight size={16} /></span></div><Image src="/category-chocolate-confectionery.png" alt="Chocolate and sweet treats" width={180} height={160} /></Link><Link href="/category/household-cleaning" className="care-promo"><div><small>A LITTLE CARE, EVERY DAY</small><h2>Happy home.<br />Everyday essentials.</h2><span>Shop home & care <ArrowRight size={16} /></span></div><ShieldCheck size={100} strokeWidth={1} /></Link></div>
    <section className="fresh-section"><div className="fresh-heading"><h2>Home & personal care</h2><Link href="/shop">See all <ArrowRight size={16} /></Link></div><HomeProductRail products={household.length ? household : products} /></section>
    <section className="fresh-benefits"><div><ShoppingBag /><span><strong>Your daily needs, together</strong><small>Browse groceries and home essentials</small></span></div><div><Wallet /><span><strong>Pay when it arrives</strong><small>Cash on delivery at checkout</small></span></div><div><ShieldCheck /><span><strong>Your orders, in one place</strong><small>Follow your order from your account</small></span></div></section>

  </div>;
}
