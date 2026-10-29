import 'package:cloud_firestore/cloud_firestore.dart';
import '../../core/network/loja_api.dart';
import '../../models/review.dart';

class ReviewRepository {
  CollectionReference<Map<String, dynamic>> get _col =>
      FirebaseFirestore.instance.collection('reviews');

  Stream<List<Review>> watchByProduct(String productId) {
    if (LojaBackend.isRailway) return _railwayReviews(productId).asStream();
    return _col
        .where('productId', isEqualTo: productId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map((d) => Review.fromJson(d.id, d.data())).toList());
  }

  Future<void> add(Review review) async {
    if (LojaBackend.isRailway) {
      await LojaApi.instance.request('POST',
        '${LojaApi.instance.publicCatalog}/products/${review.productId}/reviews',
        authenticated: true,
        body: {'rating': review.rating.toInt(), 'comment': review.comment.trim()});
      return;
    }
    await _col.add(review.toJson());
  }
}

extension _ReviewRailway on ReviewRepository {
  Future<List<Review>> _railwayReviews(String productId) async {
    final result = await LojaApi.instance.request('GET',
      '${LojaApi.instance.publicCatalog}/products/$productId/reviews');
    return (result['reviews'] as List? ?? const []).map((raw) {
      final item = Map<String,dynamic>.from(raw as Map);
      return Review.fromJson(item['id'].toString(), item);
    }).toList();
  }
}
