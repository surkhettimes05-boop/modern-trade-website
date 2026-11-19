import 'dart:async';

import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../core/api_client.dart';
import '../main.dart';
import '../models/models.dart';
import '../repositories/checkout_repository.dart';

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
  final _postalCode = TextEditingController();
  final _notes = TextEditingController();
  List<CheckoutServiceArea> _serviceAreas = const [];
  int? _municipalityId;
  int? _wardId;
  CheckoutDeliveryQuote? _deliveryQuote;
  bool _areasLoading = false;
  bool _areasRequested = false;
  int _deliveryQuoteRequest = 0;
  String? _deliveryQuoteKey;
  String _deliveryType = 'DELIVERY';
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final controller in [_name, _phone, _address, _postalCode, _notes]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _required(String? value) =>
      value?.trim().isEmpty == true ? 'Required' : null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final state = AppScope.of(context);
    final store = state.selectedStore;
    if (!_areasRequested && !_areasLoading && store != null) {
      _areasRequested = true;
      unawaited(_loadServiceAreas(store.id));
    }
    final priceQuote = state.currentPricingQuote;
    if (_deliveryType == 'DELIVERY' &&
        priceQuote != null &&
        _municipalityId != null &&
        _wardId != null) {
      final nextKey = '${store?.id}|$_municipalityId|$_wardId|${priceQuote.id}';
      if (nextKey != _deliveryQuoteKey) {
        _deliveryQuoteKey = nextKey;
        unawaited(_refreshDeliveryQuote());
      }
    }
  }

  Future<void> _loadServiceAreas(String storeId) async {
    setState(() {
      _areasLoading = true;
      _error = null;
    });
    try {
      final areas = await AppScope.of(
        context,
      ).checkoutRepository.loadServiceAreas(storeId);
      if (mounted) setState(() => _serviceAreas = areas);
    } catch (exception) {
      if (mounted) setState(() => _error = userMessage(exception));
    } finally {
      if (mounted) setState(() => _areasLoading = false);
    }
  }

  Future<void> _refreshDeliveryQuote() async {
    final state = AppScope.of(context);
    final store = state.selectedStore;
    final municipalityId = _municipalityId;
    final wardId = _wardId;
    final productQuote = state.currentPricingQuote;
    if (store == null ||
        municipalityId == null ||
        wardId == null ||
        productQuote == null) {
      setState(() => _deliveryQuote = null);
      return;
    }
    _deliveryQuoteKey =
        '${store.id}|$municipalityId|$wardId|${productQuote.id}';
    final request = ++_deliveryQuoteRequest;
    try {
      final quote = await state.checkoutRepository.quoteDelivery(
        storeId: store.id,
        municipalityId: municipalityId,
        wardId: wardId,
        orderValueMinor: productQuote.finalTotalMinor,
      );
      if (mounted && request == _deliveryQuoteRequest) {
        setState(() => _deliveryQuote = quote);
      }
    } catch (exception) {
      if (mounted && request == _deliveryQuoteRequest) {
        setState(() {
          _deliveryQuote = null;
          _error = userMessage(exception);
        });
      }
    }
  }

  Future<void> _retryPricing() async {
    try {
      await AppScope.of(context).refreshPricingQuote();
    } catch (exception) {
      if (mounted) setState(() => _error = userMessage(exception));
    }
  }

  Future<void> _placeOrder() async {
    if (!_form.currentState!.validate()) return;
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final previousQuote = state.currentPricingQuote;
      final quoteExpired = previousQuote == null || previousQuote.isExpired;
      final acceptedQuote = await state.refreshPricingQuote();
      var acceptedDeliveryQuote = _deliveryQuote;
      if (_deliveryType == 'DELIVERY') {
        if (_municipalityId == null || _wardId == null) {
          throw const ApiException('Choose a valid municipality and ward.');
        }
        acceptedDeliveryQuote = await state.checkoutRepository.quoteDelivery(
          storeId: state.selectedStore!.id,
          municipalityId: _municipalityId!,
          wardId: _wardId!,
          orderValueMinor: acceptedQuote.finalTotalMinor,
        );
        if (!acceptedDeliveryQuote.serviceable) {
          throw const ApiException(
            'Delivery is not available for this address.',
          );
        }
      }
      final quoteChanged =
          previousQuote != null &&
          (previousQuote.regularSubtotalMinor !=
                  acceptedQuote.regularSubtotalMinor ||
              previousQuote.discountTotalMinor !=
                  acceptedQuote.discountTotalMinor ||
              previousQuote.finalTotalMinor != acceptedQuote.finalTotalMinor ||
              previousQuote.items.length != acceptedQuote.items.length ||
              previousQuote.items.asMap().entries.any((entry) {
                final next = acceptedQuote.items[entry.key];
                final old = entry.value;
                return old.sku != next.sku ||
                    old.quantity != next.quantity ||
                    old.regularUnitMinor != next.regularUnitMinor ||
                    old.appliedUnitMinor != next.appliedUnitMinor ||
                    old.lineDiscountMinor != next.lineDiscountMinor ||
                    old.lineTotalMinor != next.lineTotalMinor;
              }));
      final deliveryFeeChanged =
          _deliveryQuote?.deliveryFee != acceptedDeliveryQuote?.deliveryFee;
      if (state.pricingQuoteNeedsConfirmation ||
          quoteExpired ||
          quoteChanged ||
          deliveryFeeChanged) {
        final approved = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(
              state.pricingQuoteNeedsConfirmation ||
                      quoteChanged ||
                      deliveryFeeChanged
                  ? 'Checkout price updated'
                  : 'Price quote refreshed',
            ),
            content: Text(
              'Current product payable is ${formatNprMinor(acceptedQuote.finalTotalMinor)}${acceptedDeliveryQuote?.deliveryFee == null ? '' : ' plus delivery ${formatNprMinor(acceptedDeliveryQuote!.deliveryFee!)}'}. Review and confirm before placing your COD order.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Review cart'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Accept price'),
              ),
            ],
          ),
        );
        if (approved != true) return;
        state.confirmPricingQuote();
      }
      Future<CustomerOrder> submit(MemberPricingQuote quote) => state.checkout(
        deliveryType: _deliveryType,
        name: _name.text.trim(),
        phone: _phone.text.trim(),
        address: _address.text.trim(),
        postalCode: _postalCode.text.trim(),
        municipalityId: _municipalityId,
        wardId: _wardId,
        acceptedQuote: quote,
        notes: _notes.text.trim(),
      );
      late CustomerOrder order;
      try {
        order = await submit(acceptedQuote);
      } on ApiException catch (exception) {
        if (exception.statusCode != 409) rethrow;
        final refreshedQuote = await state.refreshPricingQuote();
        state.requirePricingQuoteConfirmation();
        final approved = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Price changed'),
            content: Text(
              'The server updated the price before order creation. The new payable amount is ${formatNprMinor(refreshedQuote.finalTotalMinor)}. Accept it to retry.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Review cart'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Accept price'),
              ),
            ],
          ),
        );
        if (approved != true) return;
        state.confirmPricingQuote();
        order = await submit(refreshedQuote);
      }
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          icon: const Icon(
            Icons.check_circle,
            color: AppColors.brand,
            size: 52,
          ),
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
    final pricingQuote = state.currentPricingQuote;
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
          children: [
            Text(
              'Fulfilment',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
            ),
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
                setState(() {
                  _deliveryType = value.first;
                  _deliveryQuote = null;
                  _deliveryQuoteKey = null;
                });
                if (_deliveryType == 'DELIVERY') {
                  unawaited(_refreshDeliveryQuote());
                }
                _form.currentState?.validate();
              },
            ),
            if (_deliveryType == 'PICKUP') ...[
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.store, color: AppColors.brand),
                  title: Text(state.selectedStore?.name ?? 'No store selected'),
                  subtitle: Text(
                    state.selectedStore?.address ?? 'Pickup store',
                  ),
                ),
              ),
            ],
            const SizedBox(height: 24),
            Text(
              'Contact and address',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w900),
            ),
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
                  labelText: 'Street, ward and locality',
                ),
              ),
              const SizedBox(height: 12),
              if (_areasLoading)
                const LinearProgressIndicator()
              else if (_serviceAreas.isEmpty)
                const Text(
                  'No verified delivery areas are available for this store.',
                  style: TextStyle(color: AppColors.danger),
                )
              else ...[
                DropdownButtonFormField<int>(
                  value: _municipalityId,
                  validator: (value) =>
                      value == null ? 'Choose a municipality' : null,
                  decoration: const InputDecoration(labelText: 'Municipality'),
                  items: _serviceAreas
                      .map(
                        (area) => DropdownMenuItem(
                          value: area.id,
                          child: Text(area.name),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    setState(() {
                      _municipalityId = value;
                      _wardId = null;
                      _deliveryQuote = null;
                      _deliveryQuoteKey = null;
                    });
                    _form.currentState?.validate();
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  value: _wardId,
                  validator: (value) => value == null ? 'Choose a ward' : null,
                  decoration: const InputDecoration(labelText: 'Ward'),
                  items: _serviceAreas
                      .where((area) => area.id == _municipalityId)
                      .expand((area) => area.wards)
                      .map(
                        (ward) => DropdownMenuItem(
                          value: ward.id,
                          child: Text('Ward ${ward.number}'),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    setState(() {
                      _wardId = value;
                      _deliveryQuote = null;
                      _deliveryQuoteKey = null;
                    });
                    _form.currentState?.validate();
                    unawaited(_refreshDeliveryQuote());
                  },
                ),
              ],
              const SizedBox(height: 12),
              TextFormField(
                controller: _postalCode,
                validator: (value) =>
                    RegExp(r'^\d{5}$').hasMatch(value?.trim() ?? '')
                    ? null
                    : 'Enter a 5-digit postal code',
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Postal code'),
              ),
              const SizedBox(height: 10),
              if (_deliveryQuote?.serviceable == true)
                Text(
                  'Delivery ${formatNprMinor(_deliveryQuote!.deliveryFee ?? 0)}',
                  style: const TextStyle(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                  ),
                )
              else if (_municipalityId != null && _wardId != null)
                Text(
                  _deliveryQuote == null
                      ? 'Checking delivery availability…'
                      : _deliveryQuote!.reason ??
                            'Delivery is unavailable for this address.',
                  style: const TextStyle(color: AppColors.danger),
                ),
            ],
            const SizedBox(height: 12),
            TextFormField(
              controller: _notes,
              maxLines: 3,
              decoration: InputDecoration(
                labelText:
                    '${_deliveryType == 'PICKUP' ? 'Pickup' : 'Delivery'} notes (optional)',
              ),
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
                          child: Text(
                            'Cash on delivery',
                            style: TextStyle(fontWeight: FontWeight.w900),
                          ),
                        ),
                        Icon(Icons.check_circle, color: AppColors.brand),
                      ],
                    ),
                    const Divider(height: 28),
                    if (pricingQuote != null) ...[
                      Row(
                        children: [
                          const Expanded(child: Text('Regular subtotal')),
                          Text(
                            formatNprMinor(pricingQuote.regularSubtotalMinor),
                          ),
                        ],
                      ),
                      if (pricingQuote == null &&
                          state.customer != null &&
                          state.cart.isNotEmpty &&
                          !state.pricingBusy)
                        TextButton.icon(
                          onPressed: _retryPricing,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Refresh authoritative price'),
                        ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Expanded(child: Text('Member savings')),
                          Text(
                            '-${formatNprMinor(pricingQuote.discountTotalMinor)}',
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                    ],
                    Row(
                      children: [
                        const Expanded(child: Text('Authoritative payable')),
                        Text(
                          pricingQuote == null
                              ? state.pricingBusy
                                    ? 'Updating…'
                                    : state.pricingError ?? 'Price unavailable'
                              : formatNprMinor(pricingQuote.finalTotalMinor),
                          style: const TextStyle(fontWeight: FontWeight.w900),
                        ),
                      ],
                    ),
                    if (_deliveryType == 'DELIVERY' &&
                        _deliveryQuote?.serviceable == true)
                      Row(
                        children: [
                          const Expanded(child: Text('Delivery')),
                          Text(
                            formatNprMinor(_deliveryQuote!.deliveryFee ?? 0),
                          ),
                        ],
                      ),
                    if (_deliveryType == 'DELIVERY' &&
                        _deliveryQuote?.serviceable == true)
                      Row(
                        children: [
                          const Expanded(
                            child: Text('Total including delivery'),
                          ),
                          Text(
                            formatNprMinor(
                              pricingQuote!.finalTotalMinor +
                                  (_deliveryQuote!.deliveryFee ?? 0),
                            ),
                          ),
                        ],
                      ),
                    if (pricingQuote != null)
                      ...pricingQuote.items.map(
                        (line) => Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: Text(
                              '${line.sku} × ${line.quantity}: ${formatNprMinor(line.regularUnitMinor)} regular · ${formatNprMinor(line.appliedUnitMinor)} applied${line.promotionName == null ? '' : ' · ${line.promotionName}'}',
                              style: const TextStyle(
                                color: AppColors.muted,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
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
            onPressed:
                _busy ||
                    pricingQuote == null ||
                    pricingQuote.isExpired ||
                    (_deliveryType == 'DELIVERY' &&
                        _deliveryQuote?.serviceable != true)
                ? null
                : _placeOrder,
            child: _busy
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    pricingQuote == null
                        ? 'Authoritative price unavailable'
                        : 'Place COD order · ${formatNprMinor(pricingQuote.finalTotalMinor)}',
                  ),
          ),
        ),
      ),
    );
  }
}
