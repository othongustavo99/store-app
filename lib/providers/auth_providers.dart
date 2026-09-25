import 'package:flutter_riverpod/flutter_riverpod.dart';

enum UserRole { client, admin }

class AuthState {
  final bool isLoggedIn;
  final UserRole role;
  final String name;

  const AuthState({
    this.isLoggedIn = false,
    this.role = UserRole.client,
    this.name = '',
  });

  AuthState copyWith({
    bool? isLoggedIn,
    UserRole? role,
    String? name,
  }) {
    return AuthState(
      isLoggedIn: isLoggedIn ?? this.isLoggedIn,
      role: role ?? this.role,
      name: name ?? this.name,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState());

  // Login simulado do Admin
  bool loginAdmin(String email, String password) {
    // Credenciais de demonstração
    if (email == 'admin@loja.com' && password == '123456') {
      state = const AuthState(
        isLoggedIn: true,
        role: UserRole.admin,
        name: 'Administrador',
      );
      return true;
    }
    return false;
  }

  void logout() {
    state = const AuthState();
  }

  // Para a demo, o cliente não precisa de login real
  void enterAsClient() {
    state = const AuthState(
      isLoggedIn: true,
      role: UserRole.client,
      name: 'Cliente',
    );
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});