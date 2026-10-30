import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../providers/store_profile_providers.dart';

/// A marca reutiliza o perfil e a assinatura compartilhados pelo aplicativo.
class RailwayStorefrontIdentity extends ConsumerWidget {
  const RailwayStorefrontIdentity(
      {super.key, this.banner = false, this.large = false});
  final bool banner, large;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(storeProfileProvider).valueOrNull ??
        const <String, dynamic>{};
    final name = ref.watch(storeNameProvider);
    final scheme = Theme.of(context).colorScheme;
    final logo = profile['logoUrl']?.toString() ?? '';
    if (!banner) {
      return Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
            width: large ? 44 : 36,
            height: large ? 44 : 36,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
                color: scheme.surfaceContainerLow,
                borderRadius: BorderRadius.circular(12)),
            child: logo.isEmpty
                ? Icon(Icons.storefront_outlined, color: scheme.primary)
                : CachedNetworkImage(
                    imageUrl: logo,
                    memCacheWidth: 144,
                    fit: BoxFit.contain,
                    errorWidget: (_, __, ___) => Icon(Icons.storefront_outlined,
                        color: scheme.primary))),
        const SizedBox(width: 10),
        Flexible(
            child: Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: large ? 24 : 18,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -.4))),
      ]);
    }
    final image = profile['bannerUrl']?.toString().trim() ?? '';
    final tagline = profile['tagline']?.toString().trim() ?? '';
    final description = profile['description']?.toString().trim() ?? '';
    final foreground = image.isEmpty ? scheme.onPrimary : Colors.white;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 2),
      child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: ColoredBox(
            color: scheme.primary,
            child: Stack(children: [
              if (image.isNotEmpty)
                Positioned.fill(
                    child: CachedNetworkImage(
                        imageUrl: image,
                        memCacheWidth: 1600,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) =>
                            ColoredBox(color: scheme.primary))),
              if (image.isNotEmpty)
                Positioned.fill(
                    child: DecoratedBox(
                        decoration: BoxDecoration(
                            gradient: LinearGradient(colors: [
                  Colors.black.withValues(alpha: .72),
                  Colors.black.withValues(alpha: .25)
                ])))),
              Padding(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 540),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('ESCOLHAS DA LOJA',
                                style: TextStyle(
                                    color: foreground.withValues(alpha: .85),
                                    fontSize: 11,
                                    letterSpacing: 1.7,
                                    fontWeight: FontWeight.w700)),
                            const SizedBox(height: 12),
                            Text(
                                tagline.isEmpty
                                    ? 'Sua próxima peça favorita.'
                                    : tagline,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    color: foreground,
                                    fontSize: 28,
                                    height: 1.12,
                                    letterSpacing: -.8,
                                    fontWeight: FontWeight.w800)),
                            const SizedBox(height: 10),
                            Text(
                                description.isEmpty
                                    ? 'Explore a coleção e encontre o que combina com você.'
                                    : description,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    color: foreground.withValues(alpha: .9),
                                    height: 1.4)),
                            const SizedBox(height: 20),
                            FilledButton.icon(
                                style: FilledButton.styleFrom(
                                    backgroundColor: scheme.surface,
                                    foregroundColor: scheme.onSurface),
                                onPressed: () => context.push('/search'),
                                icon: const Icon(Icons.arrow_forward_rounded,
                                    size: 18),
                                label: const Text('Ver coleção')),
                          ]))),
            ]),
          )),
    );
  }
}
