import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PASALHO',
    short_name: 'PASALHO',
    description: 'Your Money Deserves Proper Value. Shop groceries, fresh food and home essentials at dependable everyday prices across Nepal.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F5EF',
    theme_color: '#063B5C',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
      {
        src: '/brand/pasalho-symbol.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
