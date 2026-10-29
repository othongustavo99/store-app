import 'package:loja_roupas/router/app_back_button.dart';
import 'package:flutter/material.dart';
import '../../../core/network/loja_api.dart';
import '../../../models/product.dart';
import 'product_card.dart';

/// Catálogo por cursor: oferece listagem completa sem baixar centenas de itens.
class RailwayPagedCatalogScreen extends StatefulWidget {
 const RailwayPagedCatalogScreen({super.key,required this.title,this.categoryId,this.discounted=false});
 final String title;
 final String? categoryId;
 final bool discounted;
 @override State<RailwayPagedCatalogScreen> createState()=>_RailwayPagedCatalogScreenState();
}
class _RailwayPagedCatalogScreenState extends State<RailwayPagedCatalogScreen> {
 final _scroll=ScrollController();
 final List<Product> _items=[];
 String? _cursor,_error;
 bool _loaded=false,_loading=false;
 int _revision=0;
 @override void initState(){super.initState();_scroll.addListener(_nearEnd);
  WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)_load();});}
 void _nearEnd(){if(_scroll.hasClients&&_scroll.position.extentAfter<550)_load();}
 @override void dispose(){_revision++;_scroll.dispose();super.dispose();}
 void _reset(){_revision++;setState((){_items.clear();_cursor=null;_loaded=false;_error=null;_loading=false;});_load();}
 Future<void> _load() async {
  if(_loading||(_loaded&&_cursor==null))return;
  final v=_revision;
  setState((){_loading=true;_error=null;});
  try{
   final params=<String,String>{'limit':'24',if(widget.categoryId!=null)'categoryId':widget.categoryId!,
      if(widget.discounted)'discounted':'true',if(_cursor!=null)'cursor':_cursor!};
   final data=await LojaApi.instance.request('GET','${LojaApi.instance.publicCatalog}/search?${Uri(queryParameters:params).query}');
   if(!mounted||_revision!=v)return;
   setState((){
    final items=(data['products'] as List).map((x){final m=Map<String,dynamic>.from(x as Map);
      return Product.fromJson(m['id'] as String,m);});
    _items.addAll(items);
    _cursor=data['nextCursor'] as String?;
    _loaded=true;
   });
  }catch(e){if(mounted&&v==_revision)setState(()=>_error='$e');}
  finally{if(mounted&&v==_revision)setState(()=>_loading=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(leading: const AppBackButton(), title:Text(widget.title)),
  body:RefreshIndicator(onRefresh:()async=>_reset(),child:CustomScrollView(controller:_scroll,slivers:[
    if(_items.isEmpty&&!_loading&&_loaded)SliverFillRemaining(child:Center(child:Text(widget.discounted?'Nenhuma promoção disponível.':'Nenhum produto nesta categoria.')))
    else SliverPadding(padding:const EdgeInsets.all(12),sliver:SliverLayoutBuilder(builder:(context,constraints){
      final w=constraints.crossAxisExtent;
      final columns=w>=900?4:w>=600?3:2;
      return SliverGrid(delegate:SliverChildBuilderDelegate((context,i)=>ProductCard(product:_items[i]),childCount:_items.length),
        gridDelegate:SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:columns,mainAxisExtent:320,crossAxisSpacing:12,mainAxisSpacing:12));
    })),
    SliverToBoxAdapter(child:Padding(padding:const EdgeInsets.all(18),child:Center(
     child:_loading?const CircularProgressIndicator():_error!=null?TextButton(onPressed:_load,child:Text('Falha ao carregar — tentar novamente: $_error'))
      :_cursor==null?const SizedBox(height:12):TextButton(onPressed:_load,child:const Text('Carregar mais produtos'))))),
  ])),
 );
}
