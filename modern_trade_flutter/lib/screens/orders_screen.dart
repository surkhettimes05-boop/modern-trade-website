import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../core/api_client.dart';
import '../main.dart';
import '../models/models.dart';
import '../widgets/common.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  late Future<List<CustomerOrder>> _orders;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _orders = AppScope.of(context).loadOrders();
  }

  Future<void> _reload() async {
    setState(() => _orders = AppScope.of(context).loadOrders());
    await _orders;
  }

  Future<void> _cancel(CustomerOrder order) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: const Text(
          'The store will stop fulfilment if the order is still eligible.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep order'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Cancel order'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await AppScope.of(context).api.post(
        '/api/customer/orders/${order.id}/cancel',
        body: {'reason': 'Cancelled by customer from Flutter app'},
      );
      _reload();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Order cancelled')),
        );
      }
    } catch (exception) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(userMessage(exception))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('My orders')),
        body: FutureBuilder<List<CustomerOrder>>(
          future: _orders,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return EmptyState(
                icon: Icons.cloud_off_outlined,
                title: 'Could not load orders',
                message: userMessage(snapshot.error!),
                action: ElevatedButton(
                    onPressed: _reload, child: const Text('Try again')),
              );
            }
            final orders = snapshot.data ?? const [];
            if (orders.isEmpty) {
              return const EmptyState(
                icon: Icons.receipt_long_outlined,
                title: 'No orders yet',
                message: 'Your completed checkouts will appear here.',
              );
            }
            return RefreshIndicator(
              onRefresh: _reload,
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: orders.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, index) => _OrderCard(
                  order: orders[index],
                  onCancel: () => _cancel(orders[index]),
                ),
              ),
            );
          },
        ),
      );
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.onCancel});
  final CustomerOrder order;
  final VoidCallback onCancel;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      order.orderNumber ?? 'Order ${order.id.substring(0, 8)}',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE7F2ED),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      order.status.replaceAll('_', ' '),
                      style: const TextStyle(
                        color: AppColors.brand,
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(
                    order.deliveryType == 'PICKUP'
                        ? Icons.store_outlined
                        : Icons.local_shipping_outlined,
                    size: 19,
                    color: AppColors.muted,
                  ),
                  const SizedBox(width: 8),
                  Text(order.deliveryType ?? 'DELIVERY'),
                  const Spacer(),
                  Text(formatNpr(order.total),
                      style: const TextStyle(fontWeight: FontWeight.w900)),
                ],
              ),
              if (order.orderDate != null) ...[
                const SizedBox(height: 8),
                Text(
                  order.orderDate!.toLocal().toString().split('.').first,
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ],
              if (order.status == 'PENDING_PAYMENT' ||
                  order.status == 'CONFIRMED') ...[
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: onCancel,
                    child: const Text('Cancel order'),
                  ),
                ),
              ],
            ],
          ),
        ),
      );
}
