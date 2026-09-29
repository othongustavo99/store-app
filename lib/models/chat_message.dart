class ChatMessage {
  final String id;
  final String userId;
  final String userName;
  final String text;
  final bool isFromStore; // true = resposta da loja
  final DateTime createdAt;

  const ChatMessage({
    required this.id,
    required this.userId,
    required this.userName,
    required this.text,
    this.isFromStore = false,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'userName': userName,
        'text': text,
        'isFromStore': isFromStore,
        'createdAt': createdAt.toIso8601String(),
      };

  factory ChatMessage.fromJson(String id, Map<String, dynamic> json) {
    return ChatMessage(
      id: id,
      userId: json['userId'] as String? ?? '',
      userName: json['userName'] as String? ?? '',
      text: json['text'] as String? ?? '',
      isFromStore: json['isFromStore'] == true,
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}
