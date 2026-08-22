import 'package:flutter/material.dart';

import '../core/app_theme.dart';
import '../core/api_client.dart';
import '../main.dart';
import '../widgets/common.dart';

class AddressesScreen extends StatefulWidget {
  const AddressesScreen({super.key});

  @override
  State<AddressesScreen> createState() => _AddressesScreenState();
}

class _AddressesScreenState extends State<AddressesScreen> {
  late Future<List<Map<String, dynamic>>> _addresses;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _addresses = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final state = AppScope.of(context);
    final response =
        await state.customerRepository.loadAddresses(state.customer!.id);
    if (response is! List) return const [];
    return response
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  void _reload() => setState(() => _addresses = _load());

  Future<void> _addAddress() async {
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _AddressForm(),
    );
    if (created == true) _reload();
  }

  Future<void> _delete(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete address?'),
        content: const Text('This saved address will be permanently removed.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Keep')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await AppScope.of(context).customerRepository.deleteAddress(id);
    _reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Saved addresses'),
          actions: [
            IconButton(onPressed: _addAddress, icon: const Icon(Icons.add)),
          ],
        ),
        body: FutureBuilder<List<Map<String, dynamic>>>(
          future: _addresses,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return EmptyState(
                icon: Icons.cloud_off_outlined,
                title: 'Could not load addresses',
                message: 'Please check your connection and try again.',
                action: ElevatedButton(
                    onPressed: _reload, child: const Text('Try again')),
              );
            }
            final addresses = snapshot.data ?? const [];
            if (addresses.isEmpty) {
              return EmptyState(
                icon: Icons.location_on_outlined,
                title: 'No saved addresses',
                message: 'Save a home or work address for quicker checkout.',
                action: ElevatedButton.icon(
                  onPressed: _addAddress,
                  icon: const Icon(Icons.add),
                  label: const Text('Add address'),
                ),
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: addresses.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final address = addresses[index];
                final title = address['address_type']?.toString() ?? 'ADDRESS';
                final parts = [
                  address['house_number'],
                  address['street'],
                  address['tole_locality'],
                  address['landmark'],
                  address['postal_code'],
                ]
                    .where((part) => part?.toString().trim().isNotEmpty == true)
                    .join(', ');
                return Card(
                  child: ListTile(
                    leading: Icon(
                      title == 'WORK'
                          ? Icons.work_outline
                          : Icons.home_outlined,
                      color: AppColors.brand,
                    ),
                    title: Row(
                      children: [
                        Text(title,
                            style:
                                const TextStyle(fontWeight: FontWeight.w900)),
                        if (address['is_default'] == true) ...[
                          const SizedBox(width: 8),
                          const Text('DEFAULT',
                              style: TextStyle(
                                color: AppColors.brand,
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                              )),
                        ],
                      ],
                    ),
                    subtitle:
                        Text(parts.isEmpty ? 'Saved delivery address' : parts),
                    trailing: IconButton(
                      tooltip: 'Delete address',
                      onPressed: () => _delete(address['id'].toString()),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ),
                );
              },
            );
          },
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _addAddress,
          icon: const Icon(Icons.add),
          label: const Text('Add address'),
        ),
      );
}

class _AddressForm extends StatefulWidget {
  const _AddressForm();

  @override
  State<_AddressForm> createState() => _AddressFormState();
}

class _AddressFormState extends State<_AddressForm> {
  final _form = GlobalKey<FormState>();
  final _tole = TextEditingController();
  final _street = TextEditingController();
  final _landmark = TextEditingController();
  final _postal = TextEditingController();
  final _phone = TextEditingController();
  final _instructions = TextEditingController();
  var _type = 'HOME';
  var _isDefault = false;
  var _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final controller in [
      _tole,
      _street,
      _landmark,
      _postal,
      _phone,
      _instructions
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await AppScope.of(context).customerRepository.createAddress({
        'tole_locality': _tole.text.trim(),
        if (_street.text.trim().isNotEmpty) 'street': _street.text.trim(),
        if (_landmark.text.trim().isNotEmpty) 'landmark': _landmark.text.trim(),
        if (_postal.text.trim().isNotEmpty) 'postal_code': _postal.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
        if (_instructions.text.trim().isNotEmpty)
          'delivery_instructions': _instructions.text.trim(),
        'address_type': _type,
        'is_default': _isDefault,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (exception) {
      setState(() => _error = userMessage(exception));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          bottom: MediaQuery.viewInsetsOf(context).bottom + 20,
        ),
        child: SingleChildScrollView(
          child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Add delivery address',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w900)),
                const SizedBox(height: 16),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'HOME', label: Text('Home')),
                    ButtonSegment(value: 'WORK', label: Text('Work')),
                    ButtonSegment(value: 'OTHER', label: Text('Other')),
                  ],
                  selected: {_type},
                  onSelectionChanged: (value) =>
                      setState(() => _type = value.first),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _tole,
                  validator: (value) =>
                      value?.trim().isEmpty == true ? 'Required' : null,
                  decoration:
                      const InputDecoration(labelText: 'Tole / locality'),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _street,
                  decoration: const InputDecoration(labelText: 'Street'),
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _landmark,
                  decoration: const InputDecoration(labelText: 'Landmark'),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _postal,
                        keyboardType: TextInputType.number,
                        decoration:
                            const InputDecoration(labelText: 'Postal code'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextFormField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(labelText: 'Phone'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextFormField(
                  controller: _instructions,
                  maxLines: 2,
                  decoration:
                      const InputDecoration(labelText: 'Delivery instructions'),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _isDefault,
                  onChanged: (value) => setState(() => _isDefault = value),
                  title: const Text('Use as default address'),
                ),
                if (_error != null)
                  Text(_error!,
                      style: const TextStyle(color: AppColors.danger)),
                const SizedBox(height: 8),
                ElevatedButton(
                  onPressed: _busy ? null : _save,
                  child: _busy
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Save address'),
                ),
              ],
            ),
          ),
        ),
      );
}
