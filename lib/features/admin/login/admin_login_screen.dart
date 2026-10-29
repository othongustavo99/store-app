import 'package:loja_roupas/router/app_back_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../providers/auth_providers.dart';
import '../../../core/network/loja_api.dart';
import '../../client/widgets/railway_storefront_identity.dart';

class AdminLoginScreen extends ConsumerStatefulWidget {
  const AdminLoginScreen({super.key});

  @override
  ConsumerState<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends ConsumerState<AdminLoginScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  late final Future<bool> _demoLoginAvailable;

  final _loginFormKey = GlobalKey<FormState>();
  final _registerFormKey = GlobalKey<FormState>();

  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _registerEmailController = TextEditingController();
  final _registerPasswordController = TextEditingController();
  final _registerConfirmController = TextEditingController();

  bool _obscureLogin = true;
  bool _obscureRegister = true;
  bool _obscureConfirm = true;
  bool _isLoading = false;
  bool _isGoogleLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _demoLoginAvailable = LojaBackend.isRailway
        ? LojaApi.instance.request('GET',
            '/v1/shops/${LojaBackend.storeSlug}/checkout/availability')
          .then((data) => data['demoLoginEnabled'] == true).catchError((Object _) => false)
        : Future<bool>.value(false);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _registerEmailController.dispose();
    _registerPasswordController.dispose();
    _registerConfirmController.dispose();
    super.dispose();
  }

  void _goAfterLogin() {
    final from = GoRouterState.of(context).uri.queryParameters['from'];
    if (from != null && from.startsWith('/') && !from.startsWith('//') &&
        !from.startsWith('/login')) {
      context.go(from);
      return;
    }
    final auth = ref.read(authProvider);
    if (auth.role == UserRole.admin) {
      context.go('/admin');
    } else {
      context.go('/');
    }
  }

  Future<void> _loginAsDemoCustomer() async {
    setState(() { _isLoading=true; _errorMessage=null; });
    final error=await ref.read(authProvider.notifier).loginDemoCustomer();
    if (!mounted) return;
    setState(() => _isLoading=false);
    if (error != null) {setState(() => _errorMessage=error);return;}
    _goAfterLogin();
  }

  Future<void> _login() async {
    if (!_loginFormKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final error = await ref.read(authProvider.notifier).loginWithEmail(
          _emailController.text.trim(),
          _passwordController.text,
        );

    if (!mounted) return;
    setState(() => _isLoading = false);

    if (error != null) {
      setState(() => _errorMessage = error);
      return;
    }
    _goAfterLogin();
  }

  Future<void> _register() async {
    if (!_registerFormKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final error = await ref.read(authProvider.notifier).registerWithEmail(
          _registerEmailController.text.trim(),
          _registerPasswordController.text,
        );

    if (!mounted) return;
    setState(() => _isLoading = false);

    if (error != null) {
      setState(() => _errorMessage = error);
      return;
    }
    _goAfterLogin();
  }

  Future<void> _forgotRailwayPassword() async {
    final formKey = GlobalKey<FormState>();
    final email = TextEditingController(text: _emailController.text.trim());
    try {
      final requested = await showDialog<String>(context: context, builder: (dialogContext) => AlertDialog(
        title: const Text('Recuperar senha'),
        content: SizedBox(width: 360, child: Form(key: formKey,
          child: TextFormField(controller: email, autofocus: true,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Email cadastrado'),
            validator: (text) => (text?.contains('@') ?? false) ? null : 'Informe um email válido.'))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancelar')),
          FilledButton(onPressed: () {
            if (formKey.currentState!.validate()) Navigator.pop(dialogContext, email.text.trim());
          }, child: const Text('Enviar link')),
        ],
      ));
      if (!mounted || requested == null) return;
      setState(() { _isLoading = true; _errorMessage = null; });
      try {
        await LojaApi.instance.request('POST', '/v1/auth/password/forgot',
          body: {'email': requested});
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Se o email estiver cadastrado, você receberá um link válido por 30 minutos.')));
      } on LojaApiException catch (error) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      } finally { if (mounted) setState(() => _isLoading = false); }
    } finally { email.dispose(); }
  }

  Future<void> _loginWithGoogle() async {
    setState(() {
      _isGoogleLoading = true;
      _errorMessage = null;
    });

    final error = await ref.read(authProvider.notifier).loginWithGoogle();

    if (!mounted) return;
    setState(() => _isGoogleLoading = false);

    if (error != null) {
      setState(() => _errorMessage = error);
      return;
    }
    _goAfterLogin();
  }

  @override
  Widget build(BuildContext context) {
    final busy = _isLoading || _isGoogleLoading;

    return Scaffold(
      appBar: AppBar(leading: const AppBackButton(), title: const Text('Acesso à loja')),
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.storefront_rounded,
                    size: 42,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 24),
                LojaBackend.isRailway
                    ? const RailwayStorefrontIdentity(large: true)
                    : const Text('Loja de Roupas', style: TextStyle(
                        fontSize: 24, fontWeight: FontWeight.bold,
                        color: AppColors.textPrimary)),
                const SizedBox(height: 8),
                const Text(
                  'Sua loja, suas compras e seus pedidos em um só lugar',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 15,
                  ),
                ),
                if (LojaBackend.isRailway) ...[
                  OutlinedButton.icon(
                    onPressed: busy ? null : () => context.go('/'),
                    icon: const Icon(Icons.storefront_outlined),
                    label: const Text('Continuar como visitante'),
                  ),
                  const SizedBox(height: 8),
                  FutureBuilder<bool>(
                    future: _demoLoginAvailable,
                    builder: (context,snapshot) => snapshot.data == true
                      ? Padding(padding: const EdgeInsets.only(bottom: 12),
                          child: FilledButton.tonalIcon(
                            onPressed: busy ? null : _loginAsDemoCustomer,
                            icon: const Icon(Icons.science_outlined),
                            label: const Text('Entrar como cliente demo'),
                          ))
                      : const SizedBox.shrink(),
                  ),
                ],
                const SizedBox(height: 24),

                // Abas
                Container(
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: TabBar(
                    controller: _tabController,
                    indicator: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    labelColor: Colors.white,
                    unselectedLabelColor: AppColors.textSecondary,
                    indicatorSize: TabBarIndicatorSize.tab,
                    dividerColor: Colors.transparent,
                    tabs: const [
                      Tab(text: 'Entrar'),
                      Tab(text: 'Criar conta'),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                SizedBox(
                  height: LojaBackend.isRailway ? 330 : 300,
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      // ===== LOGIN =====
                      Form(
                        key: _loginFormKey,
                        child: Column(
                          children: [
                            TextFormField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              decoration: const InputDecoration(
                                labelText: 'E-mail',
                                prefixIcon: Icon(Icons.email_outlined),
                              ),
                              validator: (v) {
                                if (v == null || v.trim().isEmpty) {
                                  return 'Informe o e-mail';
                                }
                                if (!v.contains('@')) return 'E-mail inválido';
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _passwordController,
                              obscureText: _obscureLogin,
                              decoration: InputDecoration(
                                labelText: 'Senha',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscureLogin
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined,
                                  ),
                                  onPressed: () => setState(
                                    () => _obscureLogin = !_obscureLogin,
                                  ),
                                ),
                              ),
                              validator: (v) {
                                if (v == null || v.isEmpty) {
                                  return 'Informe a senha';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity,
                              height: 50,
                              child: ElevatedButton(
                                onPressed: busy ? null : _login,
                                child: _isLoading
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Text(
                                        'Entrar',
                                        style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      // ===== CRIAR CONTA =====
                      Form(
                        key: _registerFormKey,
                        child: Column(
                          children: [
                            TextFormField(
                              controller: _registerEmailController,
                              keyboardType: TextInputType.emailAddress,
                              decoration: const InputDecoration(
                                labelText: 'E-mail',
                                prefixIcon: Icon(Icons.email_outlined),
                              ),
                              validator: (v) {
                                if (v == null || v.trim().isEmpty) {
                                  return 'Informe o e-mail';
                                }
                                if (!v.contains('@')) return 'E-mail inválido';
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _registerPasswordController,
                              obscureText: _obscureRegister,
                              decoration: InputDecoration(
                                labelText: LojaBackend.isRailway ? 'Senha (mín. 12)' : 'Senha (mín. 6)',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscureRegister
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined,
                                  ),
                                  onPressed: () => setState(
                                    () => _obscureRegister = !_obscureRegister,
                                  ),
                                ),
                              ),
                              validator: (v) {
                                if (v == null || v.length < (LojaBackend.isRailway ? 12 : 6)) {
                                  return LojaBackend.isRailway ? 'Mínimo 12 caracteres' : 'Mínimo 6 caracteres';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _registerConfirmController,
                              obscureText: _obscureConfirm,
                              decoration: InputDecoration(
                                labelText: 'Confirmar senha',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscureConfirm
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined,
                                  ),
                                  onPressed: () => setState(
                                    () => _obscureConfirm = !_obscureConfirm,
                                  ),
                                ),
                              ),
                              validator: (v) {
                                if (v != _registerPasswordController.text) {
                                  return 'As senhas não coincidem';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: double.infinity,
                              height: 50,
                              child: ElevatedButton(
                                onPressed: busy ? null : _register,
                                child: _isLoading
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2.5,
                                          color: Colors.white,
                                        ),
                                      )
                                    : const Text(
                                        'Criar conta',
                                        style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                if (_errorMessage != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _errorMessage!,
                    style: const TextStyle(color: AppColors.error),
                    textAlign: TextAlign.center,
                  ),
                ],

                if (LojaBackend.isRailway) ...[
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: busy ? null : _forgotRailwayPassword,
                    icon: const Icon(Icons.lock_reset_outlined),
                    label: const Text('Esqueci minha senha'),
                  ),
                  const Text('Você receberá um link seguro por email, se sua conta existir.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                ] else ...[
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(child: Divider(color: Colors.grey.shade300)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Text(
                        'ou',
                        style: TextStyle(color: Colors.grey.shade600),
                      ),
                    ),
                    Expanded(child: Divider(color: Colors.grey.shade300)),
                  ],
                ),
                const SizedBox(height: 16),

                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: OutlinedButton.icon(
                    onPressed: busy || LojaBackend.isRailway ? null : _loginWithGoogle,
                    icon: _isGoogleLoading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.g_mobiledata, size: 28),
                    label: Text(
                      _isGoogleLoading
                          ? 'Conectando...'
                          : 'Continuar com Google',
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.black87,
                      side: BorderSide(color: Colors.grey.shade300),
                      backgroundColor: Colors.white,
                    ),
                  ),
                ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
