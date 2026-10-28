import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/network/loja_api.dart';
import '../../models/review.dart';

class ReviewRepository {
  CollectionReference<Map<String, dynamic>> get _col =>
      FirebaseFirestore.instance.collection('reviews');

  Stream<List<Review>> watchByProduct(String productId) {
    // Avaliações ainda não foram migradas para a API Railway.
    if (LojaBackend.isRailway) return Stream.value(const <Review>[]);
    return _col
        .where('productId', isEqualTo: productId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map((d) => Review.fromJson(d.id, d.data())).toList());
  }

  Future<void> add(Review review) async {
    if (LojaBackend.isRailway) {
      throw StateError('Avaliações ainda indisponíveis no modo Railway.');
    }
    await _col.add(review.toJson());
  }
}
