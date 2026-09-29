import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/review.dart';

class ReviewRepository {
  final _col = FirebaseFirestore.instance.collection('reviews');

  Stream<List<Review>> watchByProduct(String productId) {
    return _col
        .where('productId', isEqualTo: productId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) =>
            snap.docs.map((d) => Review.fromJson(d.id, d.data())).toList());
  }

  Future<void> add(Review review) async {
    await _col.add(review.toJson());
  }
}
