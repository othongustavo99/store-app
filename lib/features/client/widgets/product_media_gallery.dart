import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';

class ProductMediaGallery extends StatefulWidget {
  const ProductMediaGallery(
      {super.key, required this.images, required this.onOpen});
  final List<String> images;
  final ValueChanged<int> onOpen;
  @override
  State<ProductMediaGallery> createState() => _ProductMediaGalleryState();
}

class _ProductMediaGalleryState extends State<ProductMediaGallery> {
  final _pages = PageController();
  int _current = 0;
  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        child: Stack(children: [
          Positioned.fill(
              child: widget.images.isEmpty
                  ? const Center(
                      child: Icon(Icons.checkroom_outlined, size: 72))
                  : PageView.builder(
                      controller: _pages,
                      itemCount: widget.images.length,
                      onPageChanged: (index) =>
                          setState(() => _current = index),
                      itemBuilder: (context, index) => Semantics(
                          label:
                              'Foto ${index + 1} de ${widget.images.length}. Toque para ampliar.',
                          button: true,
                          child: GestureDetector(
                              onTap: () => widget.onOpen(index),
                              child: CachedNetworkImage(
                                imageUrl: widget.images[index],
                                memCacheWidth: 1200,
                                fit: BoxFit.contain,
                                placeholder: (_, __) => const Center(
                                    child: CircularProgressIndicator()),
                                errorWidget: (_, __, ___) => const Center(
                                    child: Icon(
                                        Icons.image_not_supported_outlined,
                                        size: 60)),
                              ))))),
          if (widget.images.isNotEmpty)
            Positioned(
                right: 16,
                bottom: 16,
                child: Material(
                    color: Theme.of(context)
                        .colorScheme
                        .surface
                        .withValues(alpha: .95),
                    borderRadius: BorderRadius.circular(24),
                    child: InkWell(
                        borderRadius: BorderRadius.circular(24),
                        onTap: () => widget.onOpen(_current),
                        child: Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 10),
                            child:
                                Row(mainAxisSize: MainAxisSize.min, children: [
                              const Icon(Icons.zoom_in, size: 18),
                              const SizedBox(width: 6),
                              Text('${_current + 1}/${widget.images.length}')
                            ]))))),
        ]),
      );
}
