import '../../core/network/loja_api.dart';

/// Planejamento por loja. Não recebe senhas, tokens nem configura gateways.
abstract class CommercialRolloutSource {
  Future<Map<String, dynamic>> load();
  Future<Map<String, dynamic>> save(Map<String, dynamic> payload);
}

class RailwayCommercialRolloutRepository implements CommercialRolloutSource {
  RailwayCommercialRolloutRepository({LojaApi? api}) : _api = api ?? LojaApi.instance;
  final LojaApi _api;

  Future<String> _endpoint() async =>
      '/v1/stores/${await _api.fetchStoreId()}/commercial/rollout';

  @override
  Future<Map<String, dynamic>> load() async => _api.request(
      'GET', await _endpoint(), authenticated: true);

  @override
  Future<Map<String, dynamic>> save(Map<String, dynamic> payload) async =>
      _api.request('PUT', await _endpoint(), authenticated: true, body: payload);
}
