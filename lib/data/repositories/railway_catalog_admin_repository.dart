import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import '../../core/network/loja_api.dart';

/// Administração do catálogo no Railway. Nunca edita estoque no PATCH do produto.
class RailwayCatalogAdminRepository {
  final LojaApi _api = LojaApi.instance;

  Future<String> _root() async {
    await _api.fetchStoreId();
    return '${_api.adminCatalog}/manage';
  }

  Future<Map<String, dynamic>> load() async {
    final root = await _root();
    final productResponse =
        await _api.request('GET', '$root/products', authenticated: true);
    final categoriesResponse =
        await _api.request('GET', '${_api.publicCatalog}/categories');
    final roles =
        await _api.request('GET', '/v1/stores/mine', authenticated: true);
    final membership = (roles['stores'] as List? ?? const [])
        .whereType<Map>()
        .where(
          (s) => s['id'] == _api.storeId,
        )
        .toList();
    final role =
        membership.isNotEmpty ? membership.first['role']?.toString() : '';
    return {
      'products': (productResponse['products'] as List? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
      'categories': (categoriesResponse['categories'] as List? ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList(),
      'canEdit': role == 'OWNER' || role == 'MANAGER',
    };
  }

  Future<void> createProduct(Map<String, dynamic> payload) async {
    await _api.request('POST', '${await _root()}/products',
        authenticated: true, body: payload);
  }

  Future<void> updateProduct(String id, Map<String, dynamic> payload) async {
    await _api.request('PATCH', '${await _root()}/products/$id',
        authenticated: true, body: payload);
  }

  Future<void> addVariant(
      String productId, Map<String, dynamic> payload) async {
    await _api.request('POST', '${await _root()}/products/$productId/variants',
        authenticated: true, body: payload);
  }

  Future<void> editVariant(
      String variantId, Map<String, dynamic> payload) async {
    await _api.request('PATCH', '${await _root()}/variants/$variantId',
        authenticated: true, body: payload);
  }

  Future<void> archiveProduct(String productId) async {
    await _api.fetchStoreId();
    await _api.request('DELETE', '${_api.adminCatalog}/products/$productId',
        authenticated: true);
  }

  Future<void> createCategory(String name,
      {String icon = '🏷️', String imageUrl = ''}) async {
    await _api.fetchStoreId();
    await _api.request('POST', '${_api.adminCatalog}/categories',
        authenticated: true,
        body: {'name': name, 'icon': icon, 'imageUrl': imageUrl});
  }

  /// Upload direto para Cloudinary, com assinatura fornecida APENAS após
  /// autenticação/autorizações pelo backend. Chave secreta jamais sai da API.
  Future<String> uploadImage(XFile image) async {
    final extension = image.name.split('.').last.toLowerCase();
    if (!{'jpg', 'jpeg', 'png', 'webp'}.contains(extension)) {
      throw const LojaApiException('Use uma imagem JPG, PNG ou WebP.');
    }
    final bytes = await image.readAsBytes();
    if (bytes.isEmpty || bytes.length > 8 * 1024 * 1024) {
      throw const LojaApiException('A imagem deve ter até 8 MB.');
    }
    final signed = await _api.request('POST', '${await _root()}/media/sign',
        authenticated: true);
    final cloudName = signed['cloudName'] as String;
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('https://api.cloudinary.com/v1_1/$cloudName/image/upload'),
    );
    request.fields.addAll({
      'api_key': signed['apiKey'].toString(),
      'timestamp': signed['timestamp'].toString(),
      'folder': signed['folder'].toString(),
      'signature': signed['signature'].toString(),
    });
    request.files
        .add(http.MultipartFile.fromBytes('file', bytes, filename: image.name));
    final client = http.Client();
    try {
      final streamed =
          await client.send(request).timeout(const Duration(seconds: 45));
      final result = await http.Response.fromStream(streamed);
      final parsed = jsonDecode(utf8.decode(result.bodyBytes));
      if (result.statusCode < 200 || result.statusCode >= 300) {
        final message = parsed is Map ? parsed['error']?.toString() : null;
        throw LojaApiException(
            'Cloudinary recusou a imagem (${result.statusCode}): ${message ?? 'verifique as credenciais'}');
      }
      final url = parsed is Map ? parsed['secure_url']?.toString() : null;
      if (url == null || !url.startsWith('https://')) {
        throw const LojaApiException('Upload sem URL segura.');
      }
      return url;
    } finally {
      client.close();
    }
  }
}
