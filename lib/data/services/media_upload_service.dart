import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';

class MediaUploadService {
  final FirebaseStorage _storage = FirebaseStorage.instance;

  Future<String> uploadImage(
    File file,
    String productId,
  ) async {
    final fileName = '${DateTime.now().millisecondsSinceEpoch}.jpg';

    final ref = _storage
        .ref()
        .child('products')
        .child(productId)
        .child('images')
        .child(fileName);

    await ref.putFile(
      file,
      SettableMetadata(
        contentType: 'image/jpeg',
      ),
    );

    return ref.getDownloadURL();
  }

  Future<String> uploadVideo(
    File file,
    String productId,
  ) async {
    final fileName = '${DateTime.now().millisecondsSinceEpoch}.mp4';

    final ref = _storage
        .ref()
        .child('products')
        .child(productId)
        .child('videos')
        .child(fileName);

    await ref.putFile(
      file,
      SettableMetadata(
        contentType: 'video/mp4',
      ),
    );

    return ref.getDownloadURL();
  }
}
