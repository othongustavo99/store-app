import 'dart:io';
import 'dart:ui' as ui;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart' show SynchronousFuture;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:loja_roupas/data/repositories/cart_repository.dart';
import 'package:loja_roupas/models/category.dart';
import 'package:loja_roupas/models/product.dart';
import 'package:loja_roupas/models/review.dart';
import 'package:loja_roupas/providers/cart_providers.dart';
import 'package:loja_roupas/providers/category_providers.dart';
import 'package:loja_roupas/providers/product_providers.dart';
import 'package:loja_roupas/providers/review_providers.dart';
import 'package:loja_roupas/providers/store_profile_providers.dart';

const previewBoundary = ValueKey('stage03-preview');
String photo(String name) => 'https://preview.example.invalid/$name.png';
final previewProducts = List.generate(
    6,
    (index) => Product(
          id: '10000000-0000-4000-8000-${(index + 1).toString().padLeft(12, '0')}',
          name: [
            'Camisa de linho',
            'Vestido midi',
            'Calça reta',
            'Blusa essencial',
            'Tricô leve',
            'Jaqueta casual'
          ][index],
          description:
              'Uma peça versátil para combinar com seu dia. Consulte a composição, os cuidados e as medidas com a loja.',
          sizeGuide:
              'M: busto 96 cm, comprimento 64 cm. G: busto 102 cm, comprimento 66 cm.',
          price: [89.9, 159.9, 119.9, 59.9, 129.9, 189.9][index],
          oldPrice: index == 2 ? 149.9 : null,
          categoryId: 'cat-${index % 3}',
          images: [photo('piece-$index')],
          isFeatured: index < 2,
          isNew: index == 3 || index == 4,
          variants: [
            ProductVariant(
                color: 'Areia',
                size: 'M',
                stock: 30,
                imageUrl: photo('piece-$index')),
            ProductVariant(color: 'Areia', size: 'G', stock: 2),
            ProductVariant(
                color: 'Azul',
                size: 'M',
                stock: 3,
                imageUrl: photo('blue-$index')),
            const ProductVariant(color: 'Azul', size: 'G', stock: 0),
          ],
          createdAt: DateTime(2026, 10, index + 1),
        ));

final previewCategories = List.generate(
    3,
    (index) => Category(
        id: 'cat-$index',
        name: ['Camisas', 'Vestidos', 'Calças'][index],
        icon: '✦',
        imageUrl: photo('category-$index')));

/// Ilustrações desenhadas em código, usadas apenas nos testes/prévias fictícias.
bool _fontsLoaded = false;
Future<void> _loadPreviewFonts() async {
  if (_fontsLoaded) return;
  Directory? root;
  var directory = File(Platform.resolvedExecutable).parent;
  for (var index = 0; index < 10; index++) {
    if (File(
            '${directory.path}/bin/cache/artifacts/material_fonts/roboto-regular.ttf')
        .existsSync()) {
      root = directory;
      break;
    }
    if (directory.parent.path == directory.path) break;
    directory = directory.parent;
  }
  final configured = Platform.environment['FLUTTER_ROOT'];
  root ??= configured == null ? null : Directory(configured);
  if (root == null) return;
  final fonts = Directory('${root.path}/bin/cache/artifacts/material_fonts');
  final roboto = FontLoader('Stage03Preview');
  for (final weight in ['regular', 'medium', 'bold']) {
    final file = File('${fonts.path}/roboto-$weight.ttf');
    if (file.existsSync()) {
      roboto.addFont(
          SynchronousFuture(ByteData.sublistView(file.readAsBytesSync())));
    }
  }
  await roboto.load();
  final icons = File('${fonts.path}/materialicons-regular.otf');
  if (icons.existsSync()) {
    await (FontLoader('MaterialIcons')
          ..addFont(
              SynchronousFuture(ByteData.sublistView(icons.readAsBytesSync()))))
        .load();
  }
  _fontsLoaded = true;
}

Future<void> seedPreviewImages() async {
  await _loadPreviewFonts();
  PaintingBinding.instance.imageCache.maximumSizeBytes = 256 * 1024 * 1024;
  final urls = {
    ...previewProducts.expand((product) => [
          ...product.images,
          ...product.variants
              .map((variant) => variant.imageUrl)
              .whereType<String>()
        ]),
    ...previewCategories.map((category) => category.imageUrl)
  };
  for (final url in urls) {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawColor(const Color(0xFFF2EEE7), BlendMode.src);
    canvas.drawOval(const Rect.fromLTWH(110, 690, 380, 35),
        Paint()..color = const Color(0x18000000));
    final blue = url.contains('blue');
    final dress = url.contains('piece-1') || url.contains('piece-4');
    final fill = blue
        ? const Color(0xFF638897)
        : url.contains('piece-2')
            ? const Color(0xFF5B665B)
            : const Color(0xFFD2B897);
    final path = Path()
      ..moveTo(235, 130)
      ..lineTo(150, 165)
      ..lineTo(70, 270)
      ..lineTo(150, 330)
      ..lineTo(192, 275)
      ..lineTo(dress ? 140 : 180, 660)
      ..quadraticBezierTo(300, 690, dress ? 460 : 420, 660)
      ..lineTo(408, 275)
      ..lineTo(450, 330)
      ..lineTo(530, 270)
      ..lineTo(450, 165)
      ..lineTo(365, 130)
      ..quadraticBezierTo(300, 210, 235, 130)
      ..close();
    canvas.drawPath(path.shift(const Offset(0, 8)),
        Paint()..color = const Color(0x1F000000));
    canvas.drawPath(path, Paint()..color = fill);
    canvas.drawPath(
        path,
        Paint()
          ..color = Colors.black.withValues(alpha: .10)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2);
    canvas.drawLine(
        const Offset(300, 180),
        const Offset(300, 655),
        Paint()
          ..color = Colors.white.withValues(alpha: .35)
          ..strokeWidth = 2);
    for (var index = 0; index < 6; index++) {
      canvas.drawCircle(Offset(308, 230 + index * 64), 4,
          Paint()..color = Colors.white.withValues(alpha: .8));
    }
    final picture = recorder.endRecording();
    final image = picture.toImageSync(600, 800);
    picture.dispose();
    for (final provider in <ImageProvider>[
      CachedNetworkImageProvider(url),
      ResizeImage(CachedNetworkImageProvider(url), width: 600),
      ResizeImage(CachedNetworkImageProvider(url), width: 240),
      ResizeImage(CachedNetworkImageProvider(url), width: 1200),
    ]) {
      final key = await provider.obtainKey(ImageConfiguration.empty);
      PaintingBinding.instance.imageCache.putIfAbsent(
          key,
          () => OneFrameImageStreamCompleter(
              SynchronousFuture(ImageInfo(image: image.clone()))));
    }
    image.dispose();
  }
}

Widget previewApp(Widget home,
    {List<Product>? products, bool homeError = false, double textScale = 1}) {
  final catalog = products ?? previewProducts;
  return ProviderScope(
      overrides: [
        productsProvider.overrideWith((ref) => homeError
            ? Stream<List<Product>>.error(StateError('Home offline'))
            : Stream.value(catalog)),
        categoriesProvider
            .overrideWith((ref) => Stream.value(previewCategories)),
        storeProfileEventsProvider
            .overrideWith((ref) => const Stream<int>.empty()),
        storeProfileProvider.overrideWith((ref) async => {
              'displayName': 'Vila Moda',
              'tagline': 'Leveza para vestir o seu dia.',
              'description': 'Peças versáteis, escolhidas de perto.',
              'primaryColor': '#145B55',
              'secondaryColor': '#E9BB76',
            }),
        cartRepositoryProvider.overrideWithValue(CartRepository(
            loadProductsByIds: (ids) async =>
                catalog.where((product) => ids.contains(product.id)).toList())),
        for (final product in catalog)
          railwayProductByIdProvider(product.id)
              .overrideWith((ref) async => product),
        for (final product in catalog)
          productReviewsProvider(product.id)
              .overrideWith((ref) => Stream.value(const <Review>[])),
      ],
      child: Consumer(
          builder: (context, ref, _) => MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: ref.watch(storeThemeProvider).copyWith(
                    appBarTheme: ref
                        .watch(storeThemeProvider)
                        .appBarTheme
                        .copyWith(
                            titleTextStyle: ref
                                .watch(storeThemeProvider)
                                .appBarTheme
                                .titleTextStyle
                                ?.copyWith(fontFamily: 'Stage03Preview')),
                    textTheme: ref
                        .watch(storeThemeProvider)
                        .textTheme
                        .apply(fontFamily: 'Stage03Preview')),
                builder: (context, child) => RepaintBoundary(
                    key: previewBoundary,
                    child: MediaQuery(
                        data: MediaQuery.of(context)
                            .copyWith(textScaler: TextScaler.linear(textScale)),
                        child: child!)),
                home: home,
              )));
}

Future<void> savePreview(WidgetTester tester, String filename) async {
  if (!const bool.fromEnvironment('WRITE_STAGE03_PREVIEWS')) return;
  await tester.runAsync(() async {
    final boundary =
        tester.renderObject<RenderRepaintBoundary>(find.byKey(previewBoundary));
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final directory = Directory('build/stage03_previews')
      ..createSync(recursive: true);
    File('${directory.path}/$filename.png')
        .writeAsBytesSync(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
