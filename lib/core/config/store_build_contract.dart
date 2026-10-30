class StoreBuildContract {
  const StoreBuildContract(
      {required this.apiBaseUrl,
      required this.slug,
      this.expectedId = '',
      this.expectedMode = 'ANY',
      this.environment = ''});
  const StoreBuildContract.fromEnvironment()
      : apiBaseUrl = const String.fromEnvironment('LOJA_API_BASE_URL'),
        slug = const String.fromEnvironment('LOJA_STORE_SLUG'),
        expectedId = const String.fromEnvironment('LOJA_EXPECTED_STORE_ID'),
        expectedMode = const String.fromEnvironment('LOJA_EXPECTED_STORE_MODE',
            defaultValue: 'ANY'),
        environment = const String.fromEnvironment('LOJA_ENVIRONMENT');
  final String apiBaseUrl, slug, expectedId, expectedMode, environment;
  bool get bound => expectedId.isNotEmpty || expectedMode != 'ANY';
  void validateConfiguration() {
    final uri = Uri.tryParse(apiBaseUrl);
    if (uri == null ||
        uri.scheme != 'https' ||
        !uri.hasAuthority ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        !RegExp(r'^[a-z0-9]+(?:-[a-z0-9]+)*$').hasMatch(slug) ||
        slug.length < 3 ||
        slug.length > 48 ||
        !{'ANY', 'DEMO', 'LIVE'}.contains(expectedMode) ||
        !{'', 'demo', 'homologacao', 'producao'}.contains(environment) ||
        (expectedId.isNotEmpty &&
            !RegExp(r'^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$')
                .hasMatch(expectedId)) ||
        (environment == 'demo' && expectedMode != 'DEMO') ||
        (environment.isNotEmpty &&
            environment != 'demo' &&
            expectedMode != 'LIVE')) {
      throw StateError(
          'Configuração de loja inválida. Confira API, slug, UUID e ambiente do build.');
    }
  }

  void validateStore(Map<String, dynamic> store) {
    validateConfiguration();
    if (store['slug'] != slug ||
        (expectedId.isNotEmpty &&
            '${store['id']}'.toLowerCase() != expectedId.toLowerCase())) {
      throw StateError(
          'A loja retornada não corresponde à configuração deste aplicativo.');
    }
    if (expectedMode != 'ANY' && store['isDemo'] is! bool) {
      throw StateError('Não foi possível confirmar o modo desta loja.');
    }
    validateMode(store['isDemo'] == true);
  }

  void validateMode(bool demo) {
    if ((expectedMode == 'DEMO' && !demo) || (expectedMode == 'LIVE' && demo)) {
      throw StateError(
          'O modo da loja difere do ambiente esperado pelo aplicativo.');
    }
  }
}
