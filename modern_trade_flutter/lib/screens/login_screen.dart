import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api_client.dart';
import '../core/app_theme.dart';
import '../main.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _otpSent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!_otpSent) {
        if (!RegExp(r'^(\+977)?9[6-9]\d{8}$').hasMatch(_phone.text.trim())) {
          throw const ApiException('Enter a valid Nepal mobile number');
        }
        await state.requestOtp(_phone.text.trim());
        setState(() => _otpSent = true);
      } else {
        if (_otp.text.trim().length != 6) {
          throw const ApiException('Enter the 6-digit OTP');
        }
        await state.verifyOtp(_phone.text.trim(), _otp.text.trim());
        if (mounted) Navigator.pop(context, true);
      }
    } catch (exception) {
      setState(() => _error = userMessage(exception));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(),
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Align(child: NovaLogo()),
                    const SizedBox(height: 34),
                    Text(
                      _otpSent ? 'Enter your code' : 'Welcome back',
                      textAlign: TextAlign.center,
                      style:
                          Theme.of(context).textTheme.headlineMedium?.copyWith(
                                fontWeight: FontWeight.w900,
                                letterSpacing: -1,
                              ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _otpSent
                          ? 'We sent a 6-digit code to ${_phone.text}.'
                          : 'Sign in with your Nepal mobile number to checkout and view orders.',
                      textAlign: TextAlign.center,
                      style:
                          const TextStyle(color: AppColors.muted, height: 1.5),
                    ),
                    const SizedBox(height: 28),
                    if (!_otpSent)
                      TextField(
                        controller: _phone,
                        autofocus: true,
                        keyboardType: TextInputType.phone,
                        textInputAction: TextInputAction.done,
                        onSubmitted: (_) => _submit(),
                        decoration: const InputDecoration(
                          labelText: 'Mobile number',
                          hintText: '98XXXXXXXX',
                          prefixIcon: Icon(Icons.phone_outlined),
                        ),
                      )
                    else
                      TextField(
                        controller: _otp,
                        autofocus: true,
                        keyboardType: TextInputType.number,
                        textInputAction: TextInputAction.done,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                          LengthLimitingTextInputFormatter(6),
                        ],
                        onSubmitted: (_) => _submit(),
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 24, letterSpacing: 9),
                        decoration: const InputDecoration(
                            labelText: 'One-time password'),
                      ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.danger,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    const SizedBox(height: 18),
                    ElevatedButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox.square(
                              dimension: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : Text(_otpSent ? 'Verify and sign in' : 'Send OTP'),
                    ),
                    if (_otpSent)
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () => setState(() {
                                  _otpSent = false;
                                  _otp.clear();
                                  _error = null;
                                }),
                        child: const Text('Change phone number'),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
