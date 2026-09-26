import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:uuid/uuid.dart';

import '../../models/product.dart';
import '../mock/mock_products.dart';

class ProductRepository {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final _uuid = const Uuid();

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection('products');

  /// Stream em tempo real de todos os produtos
  Stream<List<Product>> watchAll() {
    return _col.orderBy('createdAt', descending: true).snapshots().map(
          (snap) =>
              snap.docs.map((d) => Product.fromJson(d.id, d.data())).toList(),
        );
  }

  Future<List<Product>> getAll() async {
    final snap = await _col.orderBy('createdAt', descending: true).get();
    return snap.docs.map((d) => Product.fromJson(d.id, d.data())).toList();
  }

  Future<Product?> getById(String id) async {
    final doc = await _col.doc(id).get();
    if (!doc.exists || doc.data() == null) return null;
    return Product.fromJson(doc.id, doc.data()!);
  }

  Future<Product> addProduct(Product product) async {
    // Usa o id já gerado (ex.: antes do upload de mídia) ou cria um novo
    final id = product.id.isNotEmpty ? product.id : _uuid.v4();
    final newProduct = product.copyWith(
      id: id,
      createdAt: product.createdAt,
    );
    await _col.doc(id).set(newProduct.toJson());
    return newProduct;
  }

  Future<bool> updateProduct(Product updated) async {
    await _col.doc(updated.id).set(updated.toJson(), SetOptions(merge: true));
    return true;
  }

  Future<bool> deleteProduct(String id) async {
    await _col.doc(id).delete();
    return true;
  }

  Future<bool> decreaseStock(
    String productId,
    String color,
    String size,
    int quantity,
  ) async {
    if (quantity <= 0) {
      return false;
    }
    final productRef = _col.doc(productId);
    try {
      return await _db.runTransaction<bool>((transaction) async {
        final snapshot = await transaction.get(productRef);
        if (!snapshot.exists || snapshot.data() == null) {
          return false;
        }
        final product = Product.fromJson(
          snapshot.id,
          snapshot.data()!,
        );
        final variantIndex = product.variants.indexWhere(
          (v) => v.color == color && v.size == size,
        );
        if (variantIndex == -1) {
          return false;
        }
        final variant = product.variants[variantIndex];
        if (variant.stock < quantity) {
          return false;
        }
        final updatedVariants = List<ProductVariant>.from(
          product.variants,
        );
        updatedVariants[variantIndex] = variant.copyWith(
          stock: variant.stock - quantity,
        );
        final updatedProduct = product.copyWith(
          variants: updatedVariants,
        );
        transaction.set(
          productRef,
          updatedProduct.toJson(),
          SetOptions(merge: true),
        );
        return true;
      });
    } on FirebaseException catch (e) {
      print(
        'Erro ao atualizar estoque: ${e.code} - ${e.message}',
      );
      return false;
    } catch (e) {
      print('Erro ao atualizar estoque: $e');
      return false;
    }
  }

  Future<bool> updatePrice(String productId, double newPrice) async {
    final product = await getById(productId);
    if (product == null) return false;
    return updateProduct(product.copyWith(price: newPrice));
  }

  Future<bool> updateVariantStock(
    String productId,
    String color,
    String size,
    int newStock,
  ) async {
    final product = await getById(productId);
    if (product == null) return false;

    final variantIndex = product.variants.indexWhere(
      (v) => v.color == color && v.size == size,
    );
    if (variantIndex == -1) return false;

    final updatedVariants = List<ProductVariant>.from(product.variants);
    updatedVariants[variantIndex] = product.variants[variantIndex].copyWith(
      stock: newStock < 0 ? 0 : newStock,
    );

    return updateProduct(product.copyWith(variants: updatedVariants));
  }

  Future<bool> applyDiscount(String productId, double percent) async {
    final product = await getById(productId);
    if (product == null) return false;
    if (percent <= 0 || percent >= 100) return false;

    final basePrice = product.oldPrice ?? product.price;
    final newPrice =
        double.parse((basePrice * (1 - percent / 100)).toStringAsFixed(2));

    return updateProduct(
      product.copyWith(price: newPrice, oldPrice: basePrice),
    );
  }

  Future<bool> removeDiscount(String productId) async {
    final product = await getById(productId);
    if (product == null) return false;
    if (product.oldPrice == null) return true;

    return updateProduct(
      product.copyWith(price: product.oldPrice, clearOldPrice: true),
    );
  }

  /// Seed inicial: só roda se a collection estiver vazia

  Future<void> seedIfEmpty() async {
    try {
      final snap = await _col.limit(1).get();

      if (snap.docs.isNotEmpty) {
        return;
      }

      final batch = _db.batch();

      for (final product in mockProducts) {
        final ref = _col.doc(product.id);

        batch.set(
          ref,
          product.toJson(),
        );
      }

      await batch.commit();

      print(
        '${mockProducts.length} produtos iniciais adicionados.',
      );
    } on FirebaseException catch (e) {
      print(
        'Erro no seed dos produtos: '
        '${e.code} - ${e.message}',
      );

      rethrow;
    } catch (e) {
      print('Erro no seed dos produtos: $e');
      rethrow;
    }
  }

  Future<void> resetToMock() async {
    final snap = await _col.get();
    for (final doc in snap.docs) {
      await doc.reference.delete();
    }
    for (final p in mockProducts) {
      await _col.doc(p.id).set(p.toJson());
    }
  }
}
