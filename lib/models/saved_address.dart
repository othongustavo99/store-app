class SavedAddress {
  final String id;
  final String label;

  final String zipCode;
  final String street;
  final String number;
  final String complement;
  final String neighborhood;
  final String city;
  final String state;

  final bool isPrimary;

  const SavedAddress({
    required this.id,
    required this.label,
    required this.zipCode,
    required this.street,
    required this.number,
    required this.complement,
    required this.neighborhood,
    required this.city,
    required this.state,
    this.isPrimary = false,
  });

  SavedAddress copyWith({
    String? id,
    String? label,
    String? zipCode,
    String? street,
    String? number,
    String? complement,
    String? neighborhood,
    String? city,
    String? state,
    bool? isPrimary,
  }) {
    return SavedAddress(
      id: id ?? this.id,
      label: label ?? this.label,
      zipCode: zipCode ?? this.zipCode,
      street: street ?? this.street,
      number: number ?? this.number,
      complement: complement ?? this.complement,
      neighborhood: neighborhood ?? this.neighborhood,
      city: city ?? this.city,
      state: state ?? this.state,
      isPrimary: isPrimary ?? this.isPrimary,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'label': label,
      'zipCode': zipCode,
      'street': street,
      'number': number,
      'complement': complement,
      'neighborhood': neighborhood,
      'city': city,
      'state': state,
      'isPrimary': isPrimary,
    };
  }

  factory SavedAddress.fromJson(Map<String, dynamic> json) {
    return SavedAddress(
      id: json['id'] ?? '',
      label: json['label'] ?? '',
      zipCode: json['zipCode'] ?? '',
      street: json['street'] ?? '',
      number: json['number'] ?? '',
      complement: json['complement'] ?? '',
      neighborhood: json['neighborhood'] ?? '',
      city: json['city'] ?? '',
      state: json['state'] ?? '',
      isPrimary: json['isPrimary'] ?? false,
    );
  }

  String get formattedAddress {
    final complementText = complement.isEmpty ? '' : ', $complement';

    return '$street, $number$complementText - '
        '$neighborhood - $city/$state - CEP $zipCode';
  }
}
