import 'package:cloud_firestore/cloud_firestore.dart' hide Order;
import 'package:uuid/uuid.dart';

import '../../models/cart_item.dart';
import '../../models/order.dart';

class OrderRepository {
  final FirebaseFirestore _db = FirebaseFirestore.instance;
  final _uuid = const Uuid();

  CollectionReference<Map<String, dynamic>> get _col =>
      _db.collection('orders');

  Stream<List<Order>> watchAll() {
    return _col.orderBy('createdAt', descending: true).snapshots().map(
          (snap) =>
              snap.docs.map((d) => Order.fromJson(d.id, d.data())).toList(),
        );
  }

  Future<List<Order>> getAll() async {
    final snap = await _col.orderBy('createdAt', descending: true).get();
    return snap.docs.map((d) => Order.fromJson(d.id, d.data())).toList();
  }

  Future<Order?> getById(String id) async {
    final doc = await _col.doc(id).get();
    if (!doc.exists || doc.data() == null) return null;
    return Order.fromJson(doc.id, doc.data()!);
  }

  Future<void> clearAll() async {
    final snap = await _col.get();
    for (final doc in snap.docs) {
      await doc.reference.delete();
    }
  }

  Future<Order> createOrder({
    required List<CartItem> cartItems,
    required String customerName,
    required String customerPhone,
    required String zipCode,
    required String street,
    required String number,
    String? complement,
    required String neighborhood,
    required String city,
    required String state,
    required String paymentMethod,
    PaymentStatus paymentStatus = PaymentStatus.approved,
    double shipping = 15.90,
    double discount = 0,
    String? notes,
  }) async {
    final orderItems =
        cartItems.map((item) => OrderItem.fromCartItem(item)).toList();

    final subtotal = cartItems.fold<double>(0, (sum, item) => sum + item.total);
    final total = subtotal + shipping - discount;
    final id = 'PED-${_uuid.v4().substring(0, 8).toUpperCase()}';

    final order = Order(
      id: id,
      items: orderItems,
      subtotal: subtotal,
      shipping: shipping,
      discount: discount,
      total: total,
      status: OrderStatus.received,
      paymentStatus: paymentStatus,
      createdAt: DateTime.now(),
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

    await _col.doc(id).set(order.toJson());
    return order;
  }

  Future<bool> updateStatus(String orderId, OrderStatus newStatus) async {
    await _col.doc(orderId).update({'status': newStatus.name});
    return true;
  }

  Future<bool> updatePaymentStatus(
    String orderId,
    PaymentStatus newStatus,
  ) async {
    await _col.doc(orderId).update({'paymentStatus': newStatus.name});
    return true;
  }
}
