import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/chat_message.dart';

class ChatRepository {
  CollectionReference<Map<String, dynamic>> _messages(String userId) {
    return FirebaseFirestore.instance
        .collection('chats')
        .doc(userId)
        .collection('messages');
  }

  Stream<List<ChatMessage>> watchMessages(String userId) {
    return _messages(userId).orderBy('createdAt').snapshots().map(
          (s) =>
              s.docs.map((d) => ChatMessage.fromJson(d.id, d.data())).toList(),
        );
  }

  Future<void> send({
    required String userId,
    required String userName,
    required String text,
    bool isFromStore = false,
  }) async {
    await _messages(userId).add({
      'userId': userId,
      'userName': userName,
      'text': text,
      'isFromStore': isFromStore,
      'createdAt': DateTime.now().toIso8601String(),
    });
  }
}
