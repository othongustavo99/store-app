/// Histórico local das abas principais, independente das rotas de detalhe.
/// A aba Início (0) é sempre o último destino antes de sair do aplicativo.
class ClientTabHistory {
  ClientTabHistory({int initialIndex = 0}) {
    if (initialIndex < 0 || initialIndex > 4) {
      throw ArgumentError.value(initialIndex, 'initialIndex');
    }
    _visited.add(0);
    if (initialIndex != 0) _visited.add(initialIndex);
  }

  final List<int> _visited = [];

  int get current => _visited.last;
  bool get canGoBack => _visited.length > 1;

  /// Uma nova visita é registrada mesmo que a aba tenha sido usada antes.
  void visit(int index) {
    if (index < 0 || index > 4) throw ArgumentError.value(index, 'index');
    if (index == 0) {
      // Selecionar Início explicitamente termina o histórico anterior.
      _visited
        ..clear()
        ..add(0);
    } else if (index != current) {
      _visited.add(index);
    }
  }

  /// Retorna a aba anterior. Na Home, permanece na Home.
  int back() {
    if (canGoBack) _visited.removeLast();
    return current;
  }
}

/// Segundo toque em até [interval] autoriza sair; passado o intervalo reinicia.
class DoubleBackExitGuard {
  DoubleBackExitGuard({this.interval = const Duration(seconds: 2)});

  final Duration interval;
  DateTime? _lastAttempt;

  bool register(DateTime now) {
    final last = _lastAttempt;
    if (last != null &&
        !now.isBefore(last) &&
        now.difference(last) <= interval) {
      _lastAttempt = null;
      return true;
    }
    _lastAttempt = now;
    return false;
  }

  void reset() => _lastAttempt = null;
}
