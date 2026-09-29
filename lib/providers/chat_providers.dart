import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/repositories/chat_repository.dart';
import '../models/chat_message.dart';
import 'auth_providers.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepository();
});

final chatMessagesProvider = StreamProvider<List<ChatMessage>>((ref) {
  final auth = ref.watch(authProvider);
  final userId = auth.email ?? '';
  if (userId.isEmpty) return Stream.value([]);
  return ref.watch(chatRepositoryProvider).watchMessages(userId);
});
