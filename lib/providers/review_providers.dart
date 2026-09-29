import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/repositories/review_repository.dart';
import '../models/review.dart';

final reviewRepositoryProvider = Provider<ReviewRepository>((ref) {
  return ReviewRepository();
});

final productReviewsProvider =
    StreamProvider.family<List<Review>, String>((ref, productId) {
  return ref.watch(reviewRepositoryProvider).watchByProduct(productId);
});
