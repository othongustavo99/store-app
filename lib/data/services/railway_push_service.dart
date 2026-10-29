import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../../core/network/loja_api.dart';

/// Opcional. Só inicia com --dart-define=LOJA_PUSH_ENABLED=true.
class RailwayPushService {
 RailwayPushService._();
 static final instance=RailwayPushService._();
 static const enabled=bool.fromEnvironment('LOJA_PUSH_ENABLED',defaultValue:false);
 bool _ready=false;
 String? _token;
 bool get supported=>LojaBackend.isRailway && enabled && !kIsWeb && (Platform.isAndroid || Platform.isIOS);
 Future<void> initialize() async {
  if(!supported || _ready)return;
  await Firebase.initializeApp();
  FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
    _token=token;
    try{await registerToken(token);}catch(e){debugPrint('Push: atualização pendente.');}
  });
  _ready=true;
 }
 Future<bool> activate() async {
  if(!supported)return false;
  await initialize();
  final permission=await FirebaseMessaging.instance.requestPermission(alert:true,badge:true,sound:true);
  if(permission.authorizationStatus!=AuthorizationStatus.authorized &&
    permission.authorizationStatus!=AuthorizationStatus.provisional) {
    return false;
  }
  await FirebaseMessaging.instance.setAutoInitEnabled(true);
  final token=await FirebaseMessaging.instance.getToken();
  if(token==null||token.isEmpty)return false;
  _token=token;
  await registerToken(token);
  return true;
 }
 Future<void> registerToken(String token) async {
  if(!supported)return;
  await LojaApi.instance.request('POST','/v1/shops/${LojaBackend.storeSlug}/push/devices',authenticated:true,
   body:{'token':token,'platform':Platform.isAndroid?'ANDROID':'IOS'});
 }
 Future<void> deactivate() async {
  if (!supported) return;
  try {
    await initialize();
    final token=_token ?? await FirebaseMessaging.instance.getToken();
    if(token!=null && token.isNotEmpty) {
      try {await LojaApi.instance.request('DELETE','/v1/shops/${LojaBackend.storeSlug}/push/devices',
        authenticated:true,body:{'token':token});}catch(_){/* Sem rede, revogar token local. */}
    }
    await FirebaseMessaging.instance.deleteToken();
    await FirebaseMessaging.instance.setAutoInitEnabled(false);
  }catch(_){/* Logout nunca deve ser impedido por falha do serviço opcional. */}
  _token=null;
 }
}
