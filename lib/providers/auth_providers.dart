import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/services/auth_service.dart';

final authServiceProvider = Provider<AuthService>((ref) => AuthService());

final authStateProvider = StreamProvider<User?>((ref) {
  return ref.watch(authServiceProvider).authStateChanges;
});

enum UserRole { client, admin }

class AuthState {
  final bool isLoggedIn;
  final UserRole role;
  final String name;
  final String? email;
  final String? photoUrl;

  const AuthState({
    this.isLoggedIn = false,
    this.role = UserRole.client,
    this.name = '',
    this.email,
    this.photoUrl,
  });
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._authService) : super(const AuthState());

  final AuthService _authService;

  /// E-mails que são administradores (único critério de admin)
  static const adminEmails = {
    'admin@loja.com',
    'othon.gustavo92@gmail.com'
    // 'seuemail@gmail.com', // descomente e coloque o seu Google se for admin
  };

  bool _isAdminEmail(String? email) {
    if (email == null || email.isEmpty) return false;
    return adminEmails.contains(email.trim().toLowerCase());
  }

  void _applyUser(User user) {
    final email = user.email ?? '';
    final isAdmin = _isAdminEmail(email);

    state = AuthState(
      isLoggedIn: true,
      role: isAdmin ? UserRole.admin : UserRole.client,
      name: user.displayName ??
          (isAdmin ? 'Administrador' : (email.split('@').first)),
      email: email,
      photoUrl: user.photoURL,
    );
  }

  /// Login e-mail/senha (admin ou cliente)
  Future<String?> loginWithEmail(String email, String password) async {
    try {
      final cred = await _authService.signInWithEmail(email, password);
      if (cred.user == null) return 'Falha ao entrar.';
      _applyUser(cred.user!);
      return null; // sucesso
    } on FirebaseAuthException catch (e) {
      return _mapFirebaseError(e);
    } catch (e) {
      return 'Erro: $e';
    }
  }

  /// Criar conta (sempre como cliente, a menos que o e-mail seja o do admin)
  Future<String?> registerWithEmail(String email, String password) async {
    try {
      if (password.length < 6) {
        return 'A senha precisa ter pelo menos 6 caracteres.';
      }
      final cred = await _authService.registerWithEmail(email, password);
      if (cred.user == null) return 'Falha ao criar conta.';
      _applyUser(cred.user!);
      return null;
    } on FirebaseAuthException catch (e) {
      return _mapFirebaseError(e);
    } catch (e) {
      return 'Erro: $e';
    }
  }

  /// Login Google
  Future<String?> loginWithGoogle() async {
    try {
      final cred = await _authService.signInWithGoogle();
      if (cred == null || cred.user == null) {
        return 'Login com Google cancelado.';
      }
      _applyUser(cred.user!);
      return null;
    } on FirebaseAuthException catch (e) {
      return _mapFirebaseError(e);
    } catch (e) {
      return 'Erro no Google: $e';
    }
  }

  Future<void> logout() async {
    await _authService.signOut();
    state = const AuthState();
  }

  String _mapFirebaseError(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
        return 'Conta não encontrada. Crie uma conta.';
      case 'wrong-password':
        return 'Senha incorreta.';
      case 'invalid-email':
        return 'E-mail inválido.';
      case 'email-already-in-use':
        return 'Este e-mail já está cadastrado.';
      case 'weak-password':
        return 'Senha fraca. Use pelo menos 6 caracteres.';
      case 'invalid-credential':
        return 'E-mail ou senha incorretos.';
      default:
        return e.message ?? 'Erro de autenticação (${e.code}).';
    }
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authServiceProvider));
});
