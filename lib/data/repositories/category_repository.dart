import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/category.dart';
import '../mock/mock_categories.dart';

class CategoryRepository {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection('categories');

  Stream<List<Category>> watchAll() {
    return _col.orderBy('name').snapshots().map(
          (snap) =>
              snap.docs.map((d) => Category.fromJson(d.id, d.data())).toList(),
        );
  }

  Future<List<Category>> getAll() async {
    final snap = await _col.orderBy('name').get();
    return snap.docs.map((d) => Category.fromJson(d.id, d.data())).toList();
  }

  Future<void> addCategory(Category category) async {
    await _col.doc(category.id).set(category.toJson(), SetOptions(merge: true));
  }

  Future<void> seedIfEmpty() async {
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
