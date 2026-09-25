import 'cart_item.dart';

enum OrderStatus {
  received,
  preparing,
  shipped,
  delivered,
  cancelled,
}

extension OrderStatusExtension on OrderStatus {
  String get label {
    switch (this) {
      case OrderStatus.received:
        return 'Pedido recebido';
      case OrderStatus.preparing:
        return 'Em preparação';
      case OrderStatus.shipped:
        return 'Pedido enviado';
      case OrderStatus.delivered:
        return 'Pedido entregue';
      case OrderStatus.cancelled:
        return 'Pedido cancelado';
    }
  }

  String get shortLabel {
    switch (this) {
      case OrderStatus.received:
        return 'Recebido';
      case OrderStatus.preparing:
        return 'Preparando';
      case OrderStatus.shipped:
        return 'Enviado';
      case OrderStatus.delivered:
        return 'Entregue';
      case OrderStatus.cancelled:
        return 'Cancelado';
    }
  }

  static OrderStatus fromString(String value) {
    return OrderStatus.values.firstWhere(
      (e) => e.name == value,
      orElse: () => OrderStatus.received,
    );
  }
}

enum PaymentStatus {
  pending,
  approved,
  rejected,
}

extension PaymentStatusExtension on PaymentStatus {
  String get label {
    switch (this) {
      case PaymentStatus.pending:
        return 'Aguardando pagamento';
      case PaymentStatus.approved:
        return 'Pagamento aprovado';
      case PaymentStatus.rejected:
        return 'Pagamento recusado';
    }
  }

  static PaymentStatus fromString(String value) {
    return PaymentStatus.values.firstWhere(
      (e) => e.name == value,
      orElse: () => PaymentStatus.pending,
    );
  }
}

class OrderItem {
  final String productId;
  final String productName;
  final String color;
  final String size;
  final int quantity;
  final double unitPrice;
  final String imageUrl;

  const OrderItem({
    required this.productId,
    required this.productName,
    required this.color,
    required this.size,
    required this.quantity,
    required this.unitPrice,
    required this.imageUrl,
  });

  double get total => unitPrice * quantity;

  factory OrderItem.fromCartItem(CartItem item) {
    return OrderItem(
      productId: item.product.id,
      productName: item.product.name,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.product.price,
      imageUrl:
          item.product.images.isNotEmpty ? item.product.images.first : '',
    );
  }

  Map<String, dynamic> toJson() => {
        'productId': productId,
        'productName': productName,
        'color': color,
        'size': size,
        'quantity': quantity,
        'unitPrice': unitPrice,
        'imageUrl': imageUrl,
      };

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    return OrderItem(
      productId: json['productId'] as String? ?? '',
      productName: json['productName'] as String? ?? '',
      color: json['color'] as String? ?? '',
      size: json['size'] as String? ?? '',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      unitPrice: (json['unitPrice'] as num?)?.toDouble() ?? 0,
      imageUrl: json['imageUrl'] as String? ?? '',
    );
  }
}

class Order {
  final String id;
  final List<OrderItem> items;
  final double subtotal;
  final double shipping;
  final double discount;
  final double total;
  final OrderStatus status;
  final PaymentStatus paymentStatus;
  final DateTime createdAt;
  final String customerName;
  final String customerPhone;
  final String zipCode;
  final String street;
  final String number;
  final String? complement;
  final String neighborhood;
  final String city;
  final String state;
  final String paymentMethod;
  final String? notes;

  const Order({
    required this.id,
    required this.items,
    required this.subtotal,
    required this.shipping,
    this.discount = 0,
    required this.total,
    required this.status,
    required this.paymentStatus,
    required this.createdAt,
    required this.customerName,
    required this.customerPhone,
    required this.zipCode,
    required this.street,
    required this.number,
    this.complement,
    required this.neighborhood,
    required this.city,
    required this.state,
    required this.paymentMethod,
    this.notes,
  });

  String get fullAddress {
    final complementText =
        complement != null && complement!.trim().isNotEmpty
            ? ' - ${complement!.trim()}'
            : '';
    return '$street, $number$complementText\n'
        '$neighborhood - $city/$state\n'
        'CEP $zipCode';
  }

  int get totalItems => items.fold(0, (t, i) => t + i.quantity);

  Order copyWith({
    OrderStatus? status,
    PaymentStatus? paymentStatus,
  }) {
    return Order(
      id: id,
      items: items,
      subtotal: subtotal,
      shipping: shipping,
      discount: discount,
      total: total,
      status: status ?? this.status,
      paymentStatus: paymentStatus ?? this.paymentStatus,
      createdAt: createdAt,
      customerName: customerName,
      customerPhone: customerPhone,
      zipCode: zipCode,
      street: street,
      number: number,
      complement: complement,
      neighborhood: neighborhood,
      city: city,
      state: state,
      paymentMethod: paymentMethod,
      notes: notes,
    );
  }

  Map<String, dynamic> toJson() => {
        'items': items.map((i) => i.toJson()).toList(),
        'subtotal': subtotal,
        'shipping': shipping,
        'discount': discount,
        'total': total,
        'status': status.name,
        'paymentStatus': paymentStatus.name,
        'createdAt': createdAt.toIso8601String(),
        'customerName': customerName,
        'customerPhone': customerPhone,
        'zipCode': zipCode,
        'street': street,
        'number': number,
        'complement': complement,
        'neighborhood': neighborhood,
        'city': city,
        'state': state,
        'paymentMethod': paymentMethod,
        'notes': notes,
      };

  factory Order.fromJson(String id, Map<String, dynamic> json) {
    return Order(
      id: id,
      items: (json['items'] as List<dynamic>?)
              ?.map((e) =>
                  OrderItem.fromJson(Map<String, dynamic>.from(e as Map)))
              .toList() ??
          [],
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      shipping: (json['shipping'] as num?)?.toDouble() ?? 0,
      discount: (json['discount'] as num?)?.toDouble() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
      status: OrderStatusExtension.fromString(
        json['status'] as String? ?? 'received',
      ),
      paymentStatus: PaymentStatusExtension.fromString(
        json['paymentStatus'] as String? ?? 'approved',
      ),
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
          : DateTime.now(),
      customerName: json['customerName'] as String? ?? '',
      customerPhone: json['customerPhone'] as String? ?? '',
      zipCode: json['zipCode'] as String? ?? '',
      street: json['street'] as String? ?? '',
      number: json['number'] as String? ?? '',
      complement: json['complement'] as String?,
      neighborhood: json['neighborhood'] as String? ?? '',
      city: json['city'] as String? ?? '',
      state: json['state'] as String? ?? '',
      paymentMethod: json['paymentMethod'] as String? ?? '',
      notes: json['notes'] as String?,
    );
  }
}