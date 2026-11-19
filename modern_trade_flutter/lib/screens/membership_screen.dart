import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/app_theme.dart';
import '../main.dart';
import 'login_screen.dart';

class MembershipScreen extends StatefulWidget {
  const MembershipScreen({super.key});

  @override
  State<MembershipScreen> createState() => _MembershipScreenState();
}

class _MembershipScreenState extends State<MembershipScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _enroll() async {
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await state.enrollMembership();
    } catch (exception) {
      if (mounted) setState(() => _error = exception.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final membership = state.membership;
    return Scaffold(
      appBar: AppBar(title: const Text('Pasalho membership')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            color: AppColors.cream,
            child: Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'FREE MEMBERSHIP',
                    style: TextStyle(
                      color: AppColors.brand,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Member prices, verified by Pasalho',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Pricing and eligibility are checked securely by Pasalho when you shop. Your membership tier is assigned by the membership service.',
                    style: TextStyle(color: AppColors.muted, height: 1.5),
                  ),
                ],
              ),
            ),
          ),
          if (!state.isSignedIn) ...[
            const SizedBox(height: 20),
            const Text(
              'Sign in with a verified mobile number to view or join.',
            ),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () => Navigator.push<bool>(
                context,
                MaterialPageRoute(builder: (_) => const LoginScreen()),
              ),
              child: const Text('Sign in with OTP'),
            ),
          ] else if (membership == null && state.pricingError != null) ...[
            const SizedBox(height: 20),
            Text(
              state.pricingError!,
              style: const TextStyle(color: AppColors.danger),
            ),
            OutlinedButton(
              onPressed: state.reloadMemberPricing,
              child: const Text('Retry'),
            ),
          ] else if (membership == null) ...[
            const SizedBox(height: 20),
            if (state.pricingError != null)
              Text(
                state.pricingError!,
                style: const TextStyle(color: AppColors.danger),
              ),
            if (state.selectedStore == null)
              const Text('Choose an open store before enrolling.'),
            ElevatedButton(
              onPressed: _busy || state.selectedStore == null ? null : _enroll,
              child: Text(_busy ? 'Enrolling…' : 'Join for free'),
            ),
          ] else ...[
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  children: [
                    const CircleAvatar(
                      radius: 25,
                      backgroundColor: AppColors.brand,
                      child: Icon(
                        Icons.verified_user,
                        color: Colors.white,
                        size: 27,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Membership #${membership.number}',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      membership.tier == 'FOUNDING_1000'
                          ? 'Founding 1,000'
                          : 'Registered Member',
                      style: const TextStyle(
                        color: AppColors.brand,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (membership.foundingNumber != null)
                      Text('Founding member #${membership.foundingNumber}'),
                    const SizedBox(height: 8),
                    Text(
                      membership.status,
                      style: TextStyle(
                        color: membership.isActive
                            ? AppColors.brand
                            : AppColors.danger,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 18),
                    if (membership.isActive)
                      QrImageView(
                        data: membership.id,
                        version: QrVersions.auto,
                        size: 190,
                        backgroundColor: Colors.white,
                        semanticsLabel: 'Membership QR reference',
                      ),
                    const SizedBox(height: 10),
                    Text(
                      membership.isActive
                          ? 'Show your membership reference in store. Prices are rechecked for each purchase.'
                          : 'Member pricing is unavailable while this membership is inactive.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: AppColors.muted,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: AppColors.danger)),
          ],
        ],
      ),
    );
  }
}
