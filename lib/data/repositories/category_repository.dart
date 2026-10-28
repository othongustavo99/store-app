import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/network/loja_api.dart';
import 'railway_catalog_repository.dart';

import '../../core/config/app_environment.dart';

import '../../models/category.dart';
import '../mock/mock_categories.dart';

class CategoryRepository {
  // Lazy: jamais buscar FirebaseFirestore.instance ao criar o repositório Railway.
  FirebaseFirestore get _db => FirebaseFirestore.instance;
  final _railway = RailwayCatalogRepository();

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection('categories');

  Stream<List<Category>> watchAll() {
    if (LojaBackend.isRailway) return _railway.watchCategories();
    return _col.orderBy('name').snapshots().map(
          (snap) =>
              snap.docs.map((d) => Category.fromJson(d.id, d.data())).toList(),
        );
  }

  Future<List<Category>> getAll() async {
    if (LojaBackend.isRailway) return _railway.getCategories();
    final snap = await _col.orderBy('name').get();
    return snap.docs.map((d) => Category.fromJson(d.id, d.data())).toList();
  }

  Future<void> addCategory(Category category) async {
    if (LojaBackend.isRailway) return _railway.addCategory(category);
    await _col.doc(category.id).set(category.toJson(), SetOptions(merge: true));
  }

  Future<void> seedIfEmpty() async {
    if (LojaBackend.isRailway) return;
    AppEnvironment.requireDemoSeed();
    try {
      final snap = await _col.limit(1).get();
      if (snap.docs.isNotEmpty) return;

      final batch = _db.batch();
      for (final c in mockCategories) {
        batch.set(_col.doc(c.id), c.toJson());
      }
      await batch.commit();
    } catch (e) {
      print('Erro no seed de categorias: $e');
    }
  }
}
