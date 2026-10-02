import { ArrowRight, Check, Download, PackageSearch, ReceiptText, ScanLine, ShoppingBasket } from 'lucide-react';
import styles from '@/app/homepage.module.css';

export default function AppDownloadPanel({ appUrl }: { appUrl: string | null }) {
  const benefits = [
    { icon: PackageSearch, label: 'Browse products' },
    { icon: ShoppingBasket, label: 'Order groceries' },
    { icon: ReceiptText, label: 'View previous orders' },
  ];
  return (
    <section className={`${styles.appSection} shell`} id="pasalho-app" aria-labelledby="app-title">
      <div className={styles.appCopy}>
        <p className={styles.appEyebrow}>THE CUSTOMER APP</p><h2 id="app-title">Pasalho in your pocket.</h2>
        <p>The Pasalho app is designed to make regular grocery shopping easier—from product discovery to repeat orders.</p>
        <ul>{benefits.map(({ icon: Icon, label }) => <li key={label}><Icon aria-hidden="true" /> {label}</li>)}</ul>
        {appUrl ? <a className={styles.appButton} href={appUrl} target="_blank" rel="noreferrer"><Download aria-hidden="true" /> Get the Pasalho app <ArrowRight aria-hidden="true" /></a> : <div className={styles.appPending} role="status"><Check aria-hidden="true" /> Public download link coming soon</div>}
      </div>
      <div className={styles.phoneVisual} aria-hidden="true"><div className={styles.phoneSpeaker} /><span className={styles.phoneLogo}>P</span><p>Your regular shop,<br />ready when you are.</p><div className={styles.phoneRows}><span /><span /><span /></div></div>
      {!appUrl ? <div className={styles.qrPlaceholder} aria-label="QR code placeholder. A real code will be added with the public app download link."><ScanLine aria-hidden="true" /><strong>QR code space</strong><span>Added when the public app link is ready</span></div> : null}
    </section>
  );
}
