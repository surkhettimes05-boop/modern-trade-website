import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../core/api_client.dart';
import '../main.dart';
import '../widgets/common.dart';

class LoyaltyScreen extends StatefulWidget {
  const LoyaltyScreen({super.key});

  @override
  State<LoyaltyScreen> createState() => _LoyaltyScreenState();
}

class _LoyaltyScreenState extends State<LoyaltyScreen> {
  late Future<dynamic> _summary;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _summary = AppScope.of(context).api.get('/api/loyalty/me');
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('NOVA Rewards')),
        body: FutureBuilder<dynamic>(
          future: _summary,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return EmptyState(
                icon: Icons.stars_outlined,
                title: 'Rewards are not available yet',
                message: userMessage(snapshot.error!),
              );
            }
            final data = snapshot.data is Map ? snapshot.data as Map : const {};
            final balance = data['available_points'] ?? data['balance'] ?? 0;
            final history =
                data['history'] is List ? data['history'] as List : const [];
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppColors.brand,
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('AVAILABLE POINTS',
                          style: TextStyle(
                            color: AppColors.lime,
                            letterSpacing: 1.4,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          )),
                      const SizedBox(height: 8),
                      Text('$balance',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 44,
                            fontWeight: FontWeight.w900,
                          )),
                      const SizedBox(height: 8),
                      const Text(
                        'Earn 1 point for every NPR 100 on eligible completed purchases.',
                        style: TextStyle(color: Colors.white70, height: 1.5),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Text('Points history',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 10),
                if (history.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 28),
                    child: Text(
                      'No points activity yet.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.muted),
                    ),
                  )
                else
                  ...history.whereType<Map>().map(
                        (entry) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const CircleAvatar(
                            backgroundColor: AppColors.cream,
                            child: Icon(Icons.stars, color: AppColors.brand),
                          ),
                          title: Text(entry['description']?.toString() ??
                              'Points activity'),
                          trailing: Text(
                            '${entry['points'] ?? 0}',
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                        ),
                      ),
              ],
            );
          },
        ),
      );
}
