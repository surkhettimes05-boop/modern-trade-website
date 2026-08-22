import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_theme.dart';
import '../core/app_config.dart';

enum InfoType { help, privacy, terms }

class InfoScreen extends StatelessWidget {
  const InfoScreen({super.key, required this.type});
  final InfoType type;

  @override
  Widget build(BuildContext context) {
    final (title, intro, sections) = switch (type) {
      InfoType.help => (
          'Help and FAQ',
          'Quick answers for shopping with NOVA MART.',
          const [
            (
              'How do I place an order?',
              'Add available items to your cart, choose a live store, sign in with OTP, and complete the cash-on-delivery checkout.'
            ),
            (
              'Can I collect my order?',
              'Yes. Select Pickup during checkout. The selected store will prepare the order.'
            ),
            (
              'How do I cancel?',
              'Open My orders from your account. Eligible pending orders can be cancelled before fulfilment.'
            ),
            (
              'How does payment work?',
              'The certified Nepal pilot currently accepts cash on delivery or cash at pickup.'
            ),
          ],
        ),
      InfoType.privacy => (
          'Privacy policy',
          'How StoreSync handles customer information in the NOVA MART app.',
          const [
            (
              'Information we use',
              'We use account, contact, address, order, device, and support information to provide the shopping service.'
            ),
            (
              'Security',
              'Authentication data is stored using the device secure-storage service. All production API traffic must use HTTPS.'
            ),
            (
              'Your choices',
              'You can manage saved addresses, sign out, and contact support about your customer data.'
            ),
            (
              'Retention',
              'Order and transaction information may be retained where required for operational, tax, fraud-prevention, and legal purposes.'
            ),
          ],
        ),
      InfoType.terms => (
          'Terms and conditions',
          'The basic terms for the Nepal production pilot.',
          const [
            (
              'Orders',
              'Orders remain subject to stock, price, serviceability, and store confirmation.'
            ),
            (
              'Pricing',
              'Prices are shown in Nepalese rupees. The server validates authoritative prices during checkout.'
            ),
            (
              'Delivery and pickup',
              'Availability, preparation, and delivery timing vary by store and location.'
            ),
            (
              'Cancellations',
              'Cancellation is available only while an order remains in an eligible pre-fulfilment state.'
            ),
          ],
        ),
    };
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1,
                ),
          ),
          const SizedBox(height: 8),
          Text(intro,
              style: const TextStyle(color: AppColors.muted, height: 1.5)),
          const SizedBox(height: 24),
          ...sections.map(
            (section) => Padding(
              padding: const EdgeInsets.only(bottom: 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(section.$1,
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 7),
                  Text(section.$2,
                      style:
                          const TextStyle(color: AppColors.muted, height: 1.6)),
                ],
              ),
            ),
          ),
          if (type == InfoType.help && AppConfig.supportPhone.isNotEmpty) ...[
            const Divider(),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: () => launchUrl(Uri.parse(
                  'https://wa.me/${AppConfig.supportPhone.replaceAll(RegExp(r'\D'), '')}')),
              icon: const Icon(Icons.chat_outlined),
              label: const Text('Contact support on WhatsApp'),
            ),
          ],
          if (type == InfoType.privacy && AppConfig.privacyUrl.isNotEmpty)
            TextButton.icon(
                onPressed: () => launchUrl(Uri.parse(AppConfig.privacyUrl)),
                icon: const Icon(Icons.open_in_new),
                label: const Text('View current privacy policy')),
          if (type == InfoType.terms && AppConfig.termsUrl.isNotEmpty)
            TextButton.icon(
                onPressed: () => launchUrl(Uri.parse(AppConfig.termsUrl)),
                icon: const Icon(Icons.open_in_new),
                label: const Text('View current terms')),
          const Text(
            'Last updated: August 2026',
            style: TextStyle(color: AppColors.muted, fontSize: 11),
          ),
        ],
      ),
    );
  }
}
