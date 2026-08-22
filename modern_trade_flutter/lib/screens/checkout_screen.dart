import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../core/api_client.dart';
import '../main.dart';
import '../models/models.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _postalCode = TextEditingController();
  final _notes = TextEditingController();
  String _deliveryType = 'DELIVERY';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final controller in [
      _name,
      _phone,
      _address,
      _city,
      _state,
      _postalCode,
      _notes,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _required(String? value) =>
      value?.trim().isEmpty == true ? 'Required' : null;

  Future<void> _placeOrder() async {
    if (!_form.currentState!.validate()) return;
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final order = await state.checkout(
        deliveryType: _deliveryType,
        name: _name.text.trim(),
        phone: _phone.text.trim(),
        address: _address.text.trim(),
        city: _city.text.trim(),
        state: _state.text.trim(),
        postalCode: _postalCode.text.trim(),
        notes: _notes.text.trim(),
      );
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          icon:
              const Icon(Icons.check_circle, color: AppColors.brand, size: 52),
          title: const Text('Order confirmed'),
          content: Text(
            'Your COD order ${order.orderNumber ?? order.id} has been received.',
            textAlign: TextAlign.center,
          ),
          actionsAlignment: MainAxisAlignment.center,
          actions: [
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ],
        ),
      );
      if (mounted) Navigator.pop(context);
    } catch (exception) {
      setState(() => _error = userMessage(exception));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
          children: [
            Text('Fulfilment',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(
                  value: 'DELIVERY',
                  icon: Icon(Icons.local_shipping_outlined),
                  label: Text('Delivery'),
                ),
                ButtonSegment(
                  value: 'PICKUP',
                  icon: Icon(Icons.store_outlined),
                  label: Text('Pickup'),
                ),
              ],
              selected: {_deliveryType},
              onSelectionChanged: (value) {
                setState(() => _deliveryType = value.first);
                _form.currentState?.validate();
              },
            ),
            if (_deliveryType == 'PICKUP') ...[
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.store, color: AppColors.brand),
                  title: Text(state.selectedStore?.name ?? 'No store selected'),
                  subtitle:
                      Text(state.selectedStore?.address ?? 'Pickup store'),
                ),
              ),
            ],
            const SizedBox(height: 24),
            Text('Contact and address',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w900)),
            const SizedBox(height: 12),
            TextFormField(
              controller: _name,
              validator: _required,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Full name'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              validator: (value) =>
                  RegExp(r'^(\+977)?9[6-9]\d{8}$').hasMatch(value?.trim() ?? '')
                      ? null
                      : 'Enter a valid Nepal mobile number',
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Mobile number'),
            ),
            const SizedBox(height: 12),
            if (_deliveryType == 'DELIVERY') ...[
              TextFormField(
                controller: _address,
                validator: _required,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(
                    labelText: 'Street, ward and locality'),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _city,
                      validator: _required,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                          labelText: 'City / municipality'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextFormField(
                      controller: _state,
                      validator: _required,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Province'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _postalCode,
                validator: _required,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Postal code'),
              ),
            ],
            const SizedBox(height: 12),
            TextFormField(
              controller: _notes,
              maxLines: 3,
              decoration: InputDecoration(
                  labelText:
                      '${_deliveryType == 'PICKUP' ? 'Pickup' : 'Delivery'} notes (optional)'),
            ),
            const SizedBox(height: 24),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.payments_outlined, color: AppColors.brand),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text('Cash on delivery',
                              style: TextStyle(fontWeight: FontWeight.w900)),
                        ),
                        Icon(Icons.check_circle, color: AppColors.brand),
                      ],
                    ),
                    const Divider(height: 28),
                    Row(
                      children: [
                        const Expanded(child: Text('Order subtotal')),
                        Text(formatNpr(state.cartSubtotal),
                            style:
                                const TextStyle(fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: AppColors.line)),
          ),
          child: ElevatedButton(
            onPressed: _busy ? null : _placeOrder,
            child: _busy
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : Text('Place COD order · ${formatNpr(state.cartSubtotal)}'),
          ),
        ),
      ),
    );
  }
}
