import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pasalho',
    short_name: 'Pasalho',
    description: 'Your Money Deserves Proper Value. Shop groceries, fresh food and home essentials at dependable everyday prices across Nepal.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F5EF',
    theme_color: '#063B5C',
    icons: [
      {
        src: '/assets/logo/pasalho-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/assets/logo/pasalho-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
