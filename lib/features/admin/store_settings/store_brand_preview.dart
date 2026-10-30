import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';

class StoreBrandPreview extends StatelessWidget {
  const StoreBrandPreview(
      {super.key,
      required this.name,
      required this.tagline,
      required this.logoUrl,
      required this.bannerUrl,
      required this.primary,
      required this.secondary});
  final String name, tagline, logoUrl, bannerUrl;
  final Color primary, secondary;
  @override
  Widget build(BuildContext context) {
    final base = AppTheme.build(primary: primary, secondary: secondary);
    final theme = base.copyWith(
        textTheme: base.textTheme.apply(
            fontFamily: Theme.of(context).textTheme.bodyMedium?.fontFamily));
    final foreground =
        bannerUrl.isEmpty ? theme.colorScheme.onPrimary : Colors.white;
    return Theme(
        data: theme,
        child: Card(
            clipBehavior: Clip.antiAlias,
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(children: [
                        SizedBox(
                            width: 42,
                            height: 42,
                            child: logoUrl.isEmpty
                                ? Icon(Icons.storefront_outlined,
                                    color: theme.colorScheme.primary)
                                : CachedNetworkImage(
                                    imageUrl: logoUrl,
                                    memCacheWidth: 150,
                                    fit: BoxFit.contain,
                                    errorWidget: (_, __, ___) => Icon(
                                        Icons.storefront_outlined,
                                        color: theme.colorScheme.primary))),
                        const SizedBox(width: 10),
                        Expanded(
                            child: Text(name.isEmpty ? 'Nome da loja' : name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 20))),
                      ])),
                  ColoredBox(
                      color: theme.colorScheme.primary,
                      child: Stack(children: [
                        if (bannerUrl.isNotEmpty)
                          Positioned.fill(
                              child: CachedNetworkImage(
                                  imageUrl: bannerUrl,
                                  memCacheWidth: 900,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, __, ___) => ColoredBox(
                                      color: theme.colorScheme.primary))),
                        if (bannerUrl.isNotEmpty)
                          Positioned.fill(
                              child: ColoredBox(
                                  color: Colors.black.withValues(alpha: .58))),
                        Padding(
                            padding: const EdgeInsets.all(22),
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('ESCOLHAS DA LOJA',
                                      style: TextStyle(
                                          color: foreground,
                                          fontSize: 11,
                                          letterSpacing: 1.5,
                                          fontWeight: FontWeight.w700)),
                                  const SizedBox(height: 10),
                                  Text(
                                      tagline.isEmpty
                                          ? 'Sua próxima peça favorita.'
                                          : tagline,
                                      maxLines: 3,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                          color: foreground,
                                          fontWeight: FontWeight.w800,
                                          fontSize: 26,
                                          height: 1.15)),
                                  const SizedBox(height: 18),
                                  DecoratedBox(
                                      decoration: BoxDecoration(
                                          color: theme.colorScheme.surface,
                                          borderRadius:
                                              BorderRadius.circular(12)),
                                      child: Padding(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 16, vertical: 12),
                                          child: Text('Ver coleção',
                                              style: TextStyle(
                                                  color: theme
                                                      .colorScheme.onSurface,
                                                  fontWeight:
                                                      FontWeight.w600)))),
                                ])),
                      ])),
                ])));
  }
}
