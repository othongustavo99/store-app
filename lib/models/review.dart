class Review {
  final String id;
  final String productId;
  final String userId;
  final String userName;
  final String? userPhoto;
  final double rating; // 1 a 5
  final String comment;
  final List<String> mediaUrls;
  final DateTime createdAt;

  const Review({
    required this.id,
    required this.productId,
    required this.userId,
    required this.userName,
    this.userPhoto,
    required this.rating,
    required this.comment,
    this.mediaUrls = const [],
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'userId': userId,
        'userName': userName,
        'userPhoto': userPhoto,
        'rating': rating,
        'comment': comment,
        'mediaUrls': mediaUrls,
        'createdAt': createdAt.toIso8601String(),
      };

  factory Review.fromJson(String id, Map<String, dynamic> json) {
    return Review(
      id: id,
      productId: json['productId'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      userName: json['userName'] as String? ?? '',
      userPhoto: json['userPhoto'] as String?,
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      comment: json['comment'] as String? ?? '',
      mediaUrls: (json['mediaUrls'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [],
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}
