import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../main.dart';
import 'addresses_screen.dart';
import 'info_screen.dart';
import 'login_screen.dart';
import 'loyalty_screen.dart';
import 'orders_screen.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    if (!state.isSignedIn) {
      return ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.cream,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              children: [
                const CircleAvatar(
                  radius: 34,
                  backgroundColor: AppColors.lime,
                  child: Icon(Icons.person_outline,
                      size: 36, color: AppColors.ink),
                ),
                const SizedBox(height: 16),
                Text(
                  'Your NOVA MART account',
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Sign in to checkout, manage addresses, track orders and view loyalty points.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.muted, height: 1.5),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () => Navigator.push<void>(
                      context,
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                    ),
                    child: const Text('Sign in with OTP'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const _PublicLinks(),
        ],
      );
    }

    final customer = state.customer!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
      children: [
        Row(
          children: [
            const CircleAvatar(
              radius: 30,
              backgroundColor: AppColors.brand,
              child: Icon(Icons.person, color: Colors.white, size: 30),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    customer.preferredName ?? 'NOVA MART customer',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    customer.phoneMasked ??
                        customer.email ??
                        'Verified account',
                    style: const TextStyle(color: AppColors.muted),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Card(
          child: Column(
            children: [
              _AccountTile(
                icon: Icons.receipt_long_outlined,
                title: 'My orders',
                subtitle: 'Track and manage your purchases',
                onTap: () => Navigator.push<void>(
                  context,
                  MaterialPageRoute(builder: (_) => const OrdersScreen()),
                ),
              ),
              const Divider(height: 1, indent: 58),
              _AccountTile(
                icon: Icons.location_on_outlined,
                title: 'Saved addresses',
                subtitle: 'Delivery addresses and defaults',
                onTap: () => Navigator.push<void>(
                  context,
                  MaterialPageRoute(builder: (_) => const AddressesScreen()),
                ),
              ),
              const Divider(height: 1, indent: 58),
              _AccountTile(
                icon: Icons.stars_outlined,
                title: 'NOVA Rewards',
                subtitle: 'Balance and points history',
                onTap: () => Navigator.push<void>(
                  context,
                  MaterialPageRoute(builder: (_) => const LoyaltyScreen()),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const _PublicLinks(),
        const SizedBox(height: 18),
        OutlinedButton.icon(
          onPressed: () async {
            await state.logout();
            if (context.mounted) {
              ScaffoldMessenger.of(context)
                  .showSnackBar(const SnackBar(content: Text('Signed out')));
            }
          },
          icon: const Icon(Icons.logout),
          label: const Text('Sign out'),
        ),
      ],
    );
  }
}

class _PublicLinks extends StatelessWidget {
  const _PublicLinks();
  @override
  Widget build(BuildContext context) => Card(
        child: Column(
          children: [
            _AccountTile(
              icon: Icons.help_outline,
              title: 'Help and FAQ',
              onTap: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => const InfoScreen(type: InfoType.help),
                ),
              ),
            ),
            const Divider(height: 1, indent: 58),
            _AccountTile(
              icon: Icons.privacy_tip_outlined,
              title: 'Privacy policy',
              onTap: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => const InfoScreen(type: InfoType.privacy),
                ),
              ),
            ),
            const Divider(height: 1, indent: 58),
            _AccountTile(
              icon: Icons.description_outlined,
              title: 'Terms and conditions',
              onTap: () => Navigator.push<void>(
                context,
                MaterialPageRoute(
                  builder: (_) => const InfoScreen(type: InfoType.terms),
                ),
              ),
            ),
          ],
        ),
      );
}

class _AccountTile extends StatelessWidget {
  const _AccountTile({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icon, color: AppColors.brand),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      );
}
