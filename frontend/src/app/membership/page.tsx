'use client';


import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { resilientFetch } from '@/lib/resilientFetch';
import { useShop } from '@/components/CommerceClient';

type Membership = {
  id: string;
  membership_number: number;
  founding_number: number | null;
  tier_key: 'REGISTERED_MEMBER' | 'FOUNDING_1000';
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  enrolled_at: string;
};

function csrfToken() {
  return decodeURIComponent(document.cookie.match(/(?:^|; )customer_csrf=([^;]+)/)?.[1] || '');
}

export default function MembershipPage() {
  const { selectedStore, items, reloadMemberPricing, refreshPricingQuote } = useShop();
  const [lang, setLang] = useState<'ne' | 'en'>('ne');
  const [name, setName] = useState('');
  const [ward, setWard] = useState('');
  const [consent, setConsent] = useState(false);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const t = (ne: string, en: string) => lang === 'ne' ? ne : en;
  const [membership, setMembership] = useState<Membership | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadMembership() {
    const response = await resilientFetch('/api/membership/me', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 401) {
      setAuthenticated(false);
      setMembership(null);
      return;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Could not load membership.');
    setAuthenticated(true);
    setMembership(body.membership || null);
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadMembership()
        .catch((reason) => {
          if (active) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Could not load membership.',
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  async function authenticate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await resilientFetch(otpSent ? '/api/auth/otp/verify' : '/api/auth/otp/request', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otpSent ? { phone, otp_code: otp, purpose: 'LOGIN' } : { phone, purpose: 'LOGIN' }),
      });
      if (!response.ok) throw new Error('OTP request failed');
      if (otpSent) { await loadMembership(); setOtp(''); }
      else setOtpSent(true);
    } catch {
      setError('OTP');
    } finally { setBusy(false); }
  }

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const response = await resilientFetch('/api/membership/enroll', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken() },
        body: JSON.stringify({ ...(selectedStore ? { store_id: selectedStore.id } : {}), profile: { name: name.trim(), ward: ward.trim(), language: lang, consent, policy_version: 'membership-v1' } }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Enrollment failed.');
      setMembership(body.membership);
      await reloadMemberPricing();
      if (items.length) {
        try {
          await refreshPricingQuote();
        } catch {
          setError('Membership is active, but pricing is temporarily unavailable. Checkout will remain blocked until a valid quote is available.');
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enrollment failed.');
    } finally {
      setBusy(false);
    }
  }

  const active = membership?.status === 'ACTIVE';
  const founding = membership?.tier_key === 'FOUNDING_1000';
  const button = 'w-full rounded-xl bg-[#1E382B] px-5 py-4 font-semibold text-[#F5F2EB] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4';
  const field = 'mt-2 w-full rounded-xl border border-[#1E382B]/30 bg-white px-4 py-3 text-lg focus:outline-[#1E382B]';
  return (
    <main lang={lang} className="min-h-screen bg-[#F5F2EB] px-4 py-8 text-[#1E382B] sm:py-14">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <span className="text-2xl font-black tracking-widest">PASALHO</span>
          <div className="flex rounded-full border border-[#1E382B]/20 p-1" aria-label="Language">
            {(['ne', 'en'] as const).map(value => <button key={value} type="button" aria-pressed={lang === value} onClick={() => setLang(value)} className={`rounded-full px-3 py-2 text-sm font-semibold ${lang === value ? 'bg-[#1E382B] text-white' : ''}`}>{value === 'ne' ? 'नेपाली' : 'English'}</button>)}
          </div>
        </header>
        <section className="rounded-3xl bg-[#1E382B] p-7 text-[#F5F2EB] sm:p-10">
          <p className="text-xs font-semibold tracking-[0.22em] text-[#D4AF37]">FOUNDING 1000</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">{t('हाम्रो सुरुवात, तपाईंको साथ।', 'Our beginning. Your place in it.')}</h1>
          <p className="mt-4 leading-relaxed">{t('पासलहोका पहिलो १,००० संस्थापक सदस्यहरूमध्ये एक बन्नुहोस्। सदस्यता आजीवन निःशुल्क छ।', 'Become one of our first 1,000 founding members. Membership is free for life.')}</p>
          <div className="mt-6 h-px bg-[#D4AF37]/50" />
          <p className="mt-4 text-sm">{t('सदस्य मूल्य र विशेष अफरहरू हाल सक्रिय छैनन्।', 'Member prices and special offers are not active yet.')}</p>
        </section>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-red-800">{error === 'OTP' ? t('कोड पठाउन वा प्रमाणित गर्न सकिएन। फेरि प्रयास गर्नुहोस्।', 'Could not send or verify the code. Please try again.') : t('सदस्यता प्रक्रिया पूरा हुन सकेन। फेरि प्रयास गर्नुहोस्।', 'Membership request could not be completed. Please try again.')}</p>}
        {loading && <p role="status" className="rounded-2xl bg-white p-6">{t('लोड हुँदैछ…', 'Loading…')}</p>}
        {!loading && authenticated === false && <form onSubmit={authenticate} className="space-y-5 rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider">{otpSent ? '02 / 03' : '01 / 03'}</p>
          <h2 className="text-2xl font-bold">{otpSent ? t('मोबाइल प्रमाणित गर्नुहोस्', 'Verify your mobile') : t('निःशुल्क सदस्य बन्नुहोस्', 'Join for free')}</h2>
          {!otpSent ? <label className="block text-sm font-semibold">{t('मोबाइल नम्बर', 'Mobile number')}<input className={field} type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))} placeholder="98XXXXXXXX" required pattern="[0-9]{10}" /></label> : <label className="block text-sm font-semibold">{t('६ अङ्कको कोड', 'Six-digit code')}<input className={field} value={otp} onChange={e => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" /></label>}
          <p className="text-sm leading-relaxed">{otpSent ? t('तपाईंको मोबाइलमा पठाइएको कोड राख्नुहोस्।', 'Enter the code sent to your phone.') : t('तपाईंको नम्बर प्रमाणित गर्न एकपटक प्रयोग हुने कोड पठाइनेछ।', 'We will send a one-time code to verify your number.')}</p>
          <button className={button} disabled={busy || (otpSent ? otp.length !== 6 : phone.length !== 10)}>{busy ? t('कृपया पर्खनुहोस्…', 'Please wait…') : otpSent ? t('प्रमाणित गर्नुहोस्', 'Verify number') : t('कोड पठाउनुहोस्', 'Send verification code')}</button>
          {otpSent && <button type="button" disabled={busy} onClick={() => { setOtpSent(false); setOtp(''); setError(''); }} className="w-full underline">{t('नम्बर परिवर्तन गर्नुहोस् / पुनः कोड पठाउनुहोस्', 'Change number / request another code')}</button>}
        </form>}
        {!loading && authenticated && !membership && <section className="space-y-5 rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-xs font-bold tracking-wider">03 / 03</p>
          <h2 className="text-2xl font-bold">{t('सदस्यता पुष्टि गर्नुहोस्', 'Confirm membership')}</h2>
          <p>{t('संस्थापक स्थान बाँकी भए संस्थापक सदस्यता, नभए नियमित निःशुल्क सदस्यता प्राप्त हुनेछ।', 'You will receive founding membership if a place remains, otherwise free regular membership.')}</p>
          <label className="block text-sm font-semibold">{t('पूरा नाम', 'Full name')}<input className={field} autoComplete="name" maxLength={100} value={name} onChange={e => setName(e.target.value)} /></label>
          <label className="block text-sm font-semibold">{t('टोल / वडा (वैकल्पिक)', 'Neighbourhood / ward (optional)')}<input className={field} maxLength={100} value={ward} onChange={e => setWard(e.target.value)} /></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1E382B]" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>{t('म निःशुल्क सदस्यता लिन र सदस्यता व्यवस्थापनका लागि मेरो प्रमाणित मोबाइल नम्बर, नाम र दिएको टोल / वडा प्रयोग गर्न सहमत छु। विशेष मूल्य हाल सक्रिय छैन।', 'I agree to free membership and the use of my verified mobile number, name and supplied neighbourhood / ward to administer it. Member prices are not active yet.')}</span></label>
          <button className={button} disabled={busy || name.trim().length < 2 || !consent} onClick={enroll}>{busy ? t('दर्ता हुँदैछ…', 'Enrolling…') : t('सदस्यता लिनुहोस्', 'Confirm free membership')}</button>
        </section>}
        {!loading && membership && <section className="space-y-5 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">{active ? t('पासलहो परिवारमा स्वागत छ!', 'Welcome to the PASALHO family!') : t('तपाईंको सदस्यता', 'Your membership')}</h2>
          <div className="rounded-2xl border border-[#D4AF37] bg-[#1E382B] p-6 text-[#F5F2EB]">
            <p className="text-xl font-black tracking-widest">PASALHO</p>
            <p className="mt-5 text-xs font-bold tracking-widest text-[#D4AF37]">{founding ? 'FOUNDING 1000' : 'REGISTERED MEMBER'}</p>
            <p className="mt-2 text-4xl font-bold tabular-nums">#{String(membership.founding_number ?? membership.membership_number).padStart(4, '0')}</p>
            <p className="mt-3 text-sm">{active ? t('सक्रिय सदस्यता', 'Active membership') : membership.status === 'SUSPENDED' ? t('निलम्बित', 'Suspended') : t('रद्द गरिएको', 'Cancelled')}</p>
            {active && <div className="mt-6 inline-block rounded-xl bg-white p-3"><QRCodeSVG value={membership.id} size={144} level="M" aria-label={t('सदस्यता QR कोड', 'Membership QR code')} /></div>}
          </div>
          <p className="text-sm">{active ? t('यो कार्ड पछि पनि यही पृष्ठमा हेर्न सक्नुहुन्छ।', 'Return to this page anytime to view your card.') : t('सहयोगका लागि पासलहोसँग सम्पर्क गर्नुहोस्।', 'Contact PASALHO for assistance.')}</p>
          {active && <div className="rounded-xl border border-[#1E382B]/20 p-4 space-y-3"><h3 className="font-bold">{t('हाम्रो समुदायमा जोडिनुहोस्', 'Join our community')}</h3><p className="text-sm">{t('उद्घाटन र किनमेलसम्बन्धी जानकारीका लागि WhatsApp समुदायमा जोडिन सक्नुहुन्छ। यो वैकल्पिक हो।', 'Join our WhatsApp community for opening and shopping updates. This is optional.')}</p><a className={button + ' block text-center'} href="https://chat.whatsapp.com/LbyJYpCXxWT3RJ6aQ6Ln99" target="_blank" rel="noopener noreferrer">{t('WhatsApp समुदायमा जोडिनुहोस्', 'Join WhatsApp community')}</a></div>}
        </section>}
        <footer className="py-3 text-center text-xs">{t('सुर्खेतबाट सुरु भएको हाम्रो यात्रा।', 'Our journey begins in Surkhet.')}</footer>
      </div>
    </main>
  );
}
