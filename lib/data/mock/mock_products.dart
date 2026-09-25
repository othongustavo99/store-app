import '../../models/product.dart';

final mockProducts = [
  // ==================== CAMISETAS ====================
  Product(
    id: 'prod_001',
    name: 'Camiseta Básica Premium',
    description:
        'Camiseta 100% algodão pima, modelagem regular, toque macio e durável. Ideal para o dia a dia.',
    price: 79.90,
    oldPrice: 99.90,
    categoryId: 'cat_camisetas',
    images: [
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Preto', size: 'P', stock: 12),
      ProductVariant(color: 'Preto', size: 'M', stock: 18),
      ProductVariant(color: 'Preto', size: 'G', stock: 9),
      ProductVariant(color: 'Branco', size: 'P', stock: 8),
      ProductVariant(color: 'Branco', size: 'M', stock: 15),
      ProductVariant(color: 'Branco', size: 'G', stock: 7),
      ProductVariant(color: 'Cinza', size: 'P', stock: 5),
      ProductVariant(color: 'Cinza', size: 'M', stock: 11),
      ProductVariant(color: 'Cinza', size: 'G', stock: 4),
    ],
    isFeatured: true,
    isNew: true,
    createdAt: DateTime(2025, 8, 10),
  ),

  Product(
    id: 'prod_002',
    name: 'Camiseta Oversized Street',
    description:
        'Modelagem oversized, ombro caído, 100% algodão. Estilo urbano e confortável.',
    price: 109.90,
    categoryId: 'cat_camisetas',
    images: [
      'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600',
      'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Preto', size: 'M', stock: 10),
      ProductVariant(color: 'Preto', size: 'G', stock: 8),
      ProductVariant(color: 'Preto', size: 'GG', stock: 6),
      ProductVariant(color: 'Bege', size: 'M', stock: 7),
      ProductVariant(color: 'Bege', size: 'G', stock: 5),
      ProductVariant(color: 'Bege', size: 'GG', stock: 3),
    ],
    isFeatured: true,
    createdAt: DateTime(2025, 9, 1),
  ),

  Product(
    id: 'prod_003',
    name: 'Camiseta Polo Clássica',
    description:
        'Polo de piqué, gola reforçada, acabamento premium. Perfeita para looks casuais elegantes.',
    price: 129.90,
    oldPrice: 159.90,
    categoryId: 'cat_camisetas',
    images: [
      'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=600',
      'https://images.unsplash.com/photo-1586790170083-2f9ceadc732d?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Azul Marinho', size: 'P', stock: 6),
      ProductVariant(color: 'Azul Marinho', size: 'M', stock: 12),
      ProductVariant(color: 'Azul Marinho', size: 'G', stock: 8),
      ProductVariant(color: 'Branco', size: 'P', stock: 4),
      ProductVariant(color: 'Branco', size: 'M', stock: 9),
      ProductVariant(color: 'Branco', size: 'G', stock: 5),
    ],
    isFeatured: false,
    createdAt: DateTime(2025, 7, 20),
  ),

  // ==================== CALÇAS ====================
  Product(
    id: 'prod_004',
    name: 'Calça Jeans Slim',
    description:
        'Jeans de lavagem média, modelagem slim, elastano para maior conforto. Cintura média.',
    price: 189.90,
    categoryId: 'cat_calcas',
    images: [
      'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600',
      'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Azul Médio', size: '38', stock: 7),
      ProductVariant(color: 'Azul Médio', size: '40', stock: 10),
      ProductVariant(color: 'Azul Médio', size: '42', stock: 8),
      ProductVariant(color: 'Azul Médio', size: '44', stock: 5),
      ProductVariant(color: 'Preto', size: '38', stock: 4),
      ProductVariant(color: 'Preto', size: '40', stock: 9),
      ProductVariant(color: 'Preto', size: '42', stock: 6),
    ],
    isFeatured: true,
    createdAt: DateTime(2025, 8, 5),
  ),

  Product(
    id: 'prod_005',
    name: 'Calça Cargo Utility',
    description:
        'Calça cargo com vários bolsos, tecido resistente e modelagem reta. Ideal para o dia a dia urbano.',
    price: 219.90,
    oldPrice: 249.90,
    categoryId: 'cat_calcas',
    images: [
      'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=600',
      'https://images.unsplash.com/photo-1506629082955-511b1aa78283?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Bege', size: '38', stock: 5),
      ProductVariant(color: 'Bege', size: '40', stock: 8),
      ProductVariant(color: 'Bege', size: '42', stock: 6),
      ProductVariant(color: 'Verde Militar', size: '38', stock: 3),
      ProductVariant(color: 'Verde Militar', size: '40', stock: 7),
      ProductVariant(color: 'Verde Militar', size: '42', stock: 4),
    ],
    isFeatured: true,
    isNew: true,
    createdAt: DateTime(2025, 9, 12),
  ),

  Product(
    id: 'prod_006',
    name: 'Calça Alfaiataria',
    description:
        'Calça de alfaiataria com elastano, caimento impecável e cintura alta. Para looks mais sociais.',
    price: 249.90,
    categoryId: 'cat_calcas',
    images: [
      'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Preto', size: '38', stock: 6),
      ProductVariant(color: 'Preto', size: '40', stock: 9),
      ProductVariant(color: 'Preto', size: '42', stock: 5),
      ProductVariant(color: 'Cinza', size: '38', stock: 4),
      ProductVariant(color: 'Cinza', size: '40', stock: 7),
      ProductVariant(color: 'Cinza', size: '42', stock: 3),
    ],
    createdAt: DateTime(2025, 6, 15),
  ),

  // ==================== TÊNIS ====================
  Product(
    id: 'prod_007',
    name: 'Tênis Casual Branco',
    description:
        'Tênis clean em couro sintético, sola borracha e conforto o dia todo. Combina com tudo.',
    price: 279.90,
    oldPrice: 329.90,
    categoryId: 'cat_tenis',
    images: [
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600',
      'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Branco', size: '39', stock: 4),
      ProductVariant(color: 'Branco', size: '40', stock: 8),
      ProductVariant(color: 'Branco', size: '41', stock: 10),
      ProductVariant(color: 'Branco', size: '42', stock: 7),
      ProductVariant(color: 'Branco', size: '43', stock: 5),
    ],
    isFeatured: true,
    isNew: true,
    createdAt: DateTime(2025, 9, 5),
  ),

  Product(
    id: 'prod_008',
    name: 'Tênis Runner Performance',
    description:
        'Tênis de performance com amortecimento responsivo, ideal para corrida e treinos.',
    price: 399.90,
    categoryId: 'cat_tenis',
    images: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600',
      'https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Preto/Vermelho', size: '40', stock: 6),
      ProductVariant(color: 'Preto/Vermelho', size: '41', stock: 9),
      ProductVariant(color: 'Preto/Vermelho', size: '42', stock: 7),
      ProductVariant(color: 'Preto/Vermelho', size: '43', stock: 4),
      ProductVariant(color: 'Cinza', size: '40', stock: 5),
      ProductVariant(color: 'Cinza', size: '41', stock: 8),
      ProductVariant(color: 'Cinza', size: '42', stock: 6),
    ],
    isFeatured: true,
    createdAt: DateTime(2025, 8, 22),
  ),

  Product(
    id: 'prod_009',
    name: 'Tênis High Top Urbano',
    description:
        'Cano alto, visual streetwear, solado robusto e ótimo acabamento.',
    price: 349.90,
    categoryId: 'cat_tenis',
    images: [
      'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600',
    ],
    variants: const [
      ProductVariant(color: 'Preto', size: '40', stock: 5),
      ProductVariant(color: 'Preto', size: '41', stock: 7),
      ProductVariant(color: 'Preto', size: '42', stock: 6),
      ProductVariant(color: 'Branco', size: '40', stock: 3),
      ProductVariant(color: 'Branco', size: '41', stock: 5),
      ProductVariant(color: 'Branco', size: '42', stock: 4),
    ],
    isNew: true,
    createdAt: DateTime(2025, 9, 15),
  ),
];
