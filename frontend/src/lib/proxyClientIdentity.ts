import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export function addProxyClientIdentity(source: Headers, target: Headers): void {
  // This header is set by Vercel's edge, not forwarded from the public caller.
  // Outside Vercel retain ordinary backend IP-based limits.
  if (process.env.VERCEL !== '1') return;
  const secret = process.env.PROXY_AUTH_SECRET;
  const ip = source.get('x-vercel-forwarded-for')?.trim();
  if (!secret || secret.length < 32 || !ip || !isIP(ip)) {
    throw new Error('Trusted proxy identity is not configured');
  }
  const timestamp = String(Date.now());
  target.set('x-pasalho-client-ip', ip);
  target.set('x-pasalho-client-time', timestamp);
  target.set('x-pasalho-client-signature',
    createHmac('sha256', secret).update(`${timestamp}\n${ip}`).digest('hex'));
}
