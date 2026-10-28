import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/network/loja_api.dart';
import '../../../data/repositories/railway_store_profile_repository.dart';

/// Título e banner de cada loja, sem alterar a experiência legada Firebase.
class RailwayStorefrontIdentity extends StatefulWidget {
  const RailwayStorefrontIdentity({super.key, this.banner = false, this.large = false});
  final bool banner;
  final bool large;
  @override
  State<RailwayStorefrontIdentity> createState() => _RailwayStorefrontIdentityState();
}

class _RailwayStorefrontIdentityState extends State<RailwayStorefrontIdentity> {
  final repo = RailwayStoreProfileRepository();
  late Future<Map<String, dynamic>> data;
  StreamSubscription<int>? subscription;
  @override
  void initState() {
    super.initState();
    _load();
    // Revalida a marca quando outra sessão edita o perfil da loja.
    subscription = LojaApi.instance.catalogChanges().listen((_) {
      if (mounted) setState(_load);
    });
  }
  void _load() { data = repo.publicProfile(); }
  @override
  void dispose() { subscription?.cancel(); super.dispose(); }

  @override
  Widget build(BuildContext context) => FutureBuilder<Map<String, dynamic>>(
    future: data,
    builder: (context, snapshot) {
      if (!snapshot.hasData) {
        if (widget.banner) return const SizedBox.shrink();
        return Text('Loja', maxLines: 1, overflow: TextOverflow.ellipsis,
          style: widget.large ? const TextStyle(fontSize: 24, fontWeight: FontWeight.bold) : null);
      }
      final profile = Map<String, dynamic>.from(snapshot.data!['profile'] as Map);
      final store = Map<String, dynamic>.from(snapshot.data!['store'] as Map);
      final name = profile['displayName']?.toString() ?? store['name']?.toString() ?? 'Loja';
      if (!widget.banner) {
        final logo = profile['logoUrl']?.toString() ?? '';
        return Row(mainAxisSize: MainAxisSize.min, children: [
          if (logo.isNotEmpty) ...[
            Image.network(logo, height: 34, width: 34, fit: BoxFit.contain,
              errorBuilder: (context, error, stackTrace) => const Icon(Icons.storefront_outlined)),
            const SizedBox(width: 8),
          ],
          Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: widget.large ? const TextStyle(fontSize: 24, fontWeight: FontWeight.bold) : null)),
        ]);
      }
      final banner = profile['bannerUrl']?.toString() ?? '';
      final tagline = profile['tagline']?.toString() ?? '';
      final description = profile['description']?.toString() ?? '';
      final hex = profile['primaryColor']?.toString() ?? '#1C1B2F';
      final background = Color(int.parse(hex.substring(1), radix: 16) | 0xFF000000);
      return Container(
        height: 168, margin: const EdgeInsets.all(16),
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(16)),
        child: Stack(fit: StackFit.expand, children: [
          if (banner.isNotEmpty) Image.network(banner, fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => const SizedBox.shrink()),
          Container(color: Colors.black.withValues(alpha: 0.42)),
          Padding(padding: const EdgeInsets.all(20), child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold,
                color: Colors.white), maxLines: 2, overflow: TextOverflow.ellipsis),
              if (tagline.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6),
                child: Text(tagline, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 15))),
              if (tagline.isEmpty && description.isNotEmpty) Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(description, maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white70))),
            ],
          )),
        ]),
      );
    },
  );
}
