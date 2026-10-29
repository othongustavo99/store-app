import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/network/loja_api.dart';
import '../../../data/repositories/railway_catalog_repository.dart';
import '../../../models/product.dart';
import '../../../models/category.dart';
import '../widgets/product_card.dart';

/// Busca paginada por cursor no Railway: os filtros são aplicados no servidor,
/// antes da paginação, e o catálogo não é carregado inteiro no celular.
class RailwaySearchScreen extends StatefulWidget {
  const RailwaySearchScreen({super.key});
  @override
  State<RailwaySearchScreen> createState() => _RailwaySearchScreenState();
}
class _RailwaySearchScreenState extends State<RailwaySearchScreen> {
  final _text = TextEditingController();
  final _scroll = ScrollController();
  final _min = TextEditingController();
  final _max = TextEditingController();
  Timer? _debounce;
  List<Product> _items=[];
  List<Category> _categories=[];
  String? _cursor, _category, _color, _size;
  bool _available=false, _loading=false, _loaded=false;
  String? _error;
  int _revision=0;
  final _sizes=['PP','P','M','G','GG','XG','Único'];
  final _colors=['Preto','Branco','Azul','Vermelho','Verde','Rosa','Bege'];

  @override
  void initState(){
    super.initState();
    _scroll.addListener(() { if(_scroll.hasClients && _scroll.position.extentAfter<450 && !_loading && _cursor!=null) _loadPage(); });
    RailwayCatalogRepository().getCategories().then((cats){ if(mounted)setState(()=>_categories=cats); }).catchError((_){ });
    WidgetsBinding.instance.addPostFrameCallback((_){if(mounted)_reset();});
  }
  @override
  void dispose(){_debounce?.cancel();_text.dispose();_min.dispose();_max.dispose();_scroll.dispose();super.dispose();}
  void _reset(){
    _revision++;_cursor=null;_items=[];_loaded=false;_error=null;_loading=false;
    if(mounted)setState((){});
    _loadPage();
  }
  void _onText(String _){_debounce?.cancel();_debounce=Timer(const Duration(milliseconds:350),_reset);}
  Future<void> _loadPage() async {
    if(_loading || (_loaded && _cursor==null)) return;
    final rev=_revision;
    _loading=true;setState((){});
    try {
      final qp=<String,String>{'limit':'20'};
      if(_text.text.trim().isNotEmpty)qp['q']=_text.text.trim();
      if(_category!=null)qp['categoryId']=_category!;
      if(_color!=null)qp['color']=_color!;
      if(_size!=null)qp['size']=_size!;
      if(_available)qp['available']='true';
      if(_cursor!=null)qp['cursor']=_cursor!;
      double? money(String s)=>double.tryParse(s.replaceAll(',','.').trim());
      final min=money(_min.text),max=money(_max.text);
      if(min!=null)qp['minPrice']=min.toString();
      if(max!=null)qp['maxPrice']=max.toString();
      if(min!=null&&max!=null&&min>max)throw StateError('Preço mínimo maior que o máximo.');
      final query=Uri(queryParameters:qp).query;
      final result=await LojaApi.instance.request('GET','${LojaApi.instance.publicCatalog}/search?$query');
      if(!mounted||rev!=_revision)return;
      final next=(result['products'] as List).map((x){
        final v=Map<String,dynamic>.from(x as Map);
        return Product.fromJson(v['id'] as String,v);
      }).toList();
      setState((){
        _items.addAll(next);
        _cursor=result['nextCursor'] as String?;
        _loaded=true;_error=null;
      });
    }catch(e){if(mounted&&rev==_revision)setState(()=>_error='$e');}
    finally{if(mounted&&rev==_revision)setState(()=>_loading=false);}
  }
  Widget _filterDrop(String hint,String? value,List<String> options,ValueChanged<String?> changed){
    return DropdownButtonFormField<String>(initialValue:value,isExpanded:true,
      decoration:InputDecoration(labelText:hint,border:const OutlineInputBorder(),isDense:true),
      items:[const DropdownMenuItem<String>(value:null,child:Text('Todos')),
        for(final item in options)DropdownMenuItem(value:item,child:Text(item))],
      onChanged:(v){changed(v);_reset();});
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar:AppBar(title:const Text('Buscar produtos')),
    body:Column(children:[
      Padding(padding:const EdgeInsets.all(12),child:TextField(controller:_text,onChanged:_onText,
        decoration:InputDecoration(prefixIcon:const Icon(Icons.search),hintText:'Buscar por nome ou descrição',
          border:const OutlineInputBorder(),suffixIcon:IconButton(onPressed:(){_text.clear();_reset();},icon:const Icon(Icons.close))))),
      ExpansionTile(title:const Text('Filtros de produtos'),initiallyExpanded:false,children:[
        Padding(padding:const EdgeInsets.fromLTRB(12,0,12,12),child:Column(children:[
          DropdownButtonFormField<String>(initialValue:_category,isExpanded:true,
            decoration:const InputDecoration(labelText:'Categoria',border:OutlineInputBorder()),
            items:[const DropdownMenuItem<String>(value:null,child:Text('Todas')),
              for(final c in _categories)DropdownMenuItem(value:c.id,child:Text(c.name))],
            onChanged:(v){_category=v;_reset();}),
          const SizedBox(height:8),
          Row(children:[Expanded(child:_filterDrop('Cor',_color,_colors,(v)=>_color=v)),
            const SizedBox(width:8),Expanded(child:_filterDrop('Tamanho',_size,_sizes,(v)=>_size=v))]),
          const SizedBox(height:8),
          Row(children:[Expanded(child:TextField(controller:_min,keyboardType:TextInputType.number,
            decoration:const InputDecoration(labelText:'R\$ mínimo',border:OutlineInputBorder()),onSubmitted:(_)=>_reset())),
            const SizedBox(width:8),Expanded(child:TextField(controller:_max,keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'R\$ máximo',border:OutlineInputBorder()),onSubmitted:(_)=>_reset())),
            IconButton(tooltip:'Aplicar preço',onPressed:_reset,icon:const Icon(Icons.check))]),
          SwitchListTile(title:const Text('Somente em estoque'),value:_available,onChanged:(v){_available=v;_reset();}),
        ])),
      ]),
      Expanded(child:_items.isEmpty
        ? Center(child:_loading?const CircularProgressIndicator():Column(mainAxisSize:MainAxisSize.min,children:[
            Text(_error??'Nenhum produto encontrado.'),
            TextButton(onPressed:_reset,child:const Text('Tentar novamente'))]))
        : RefreshIndicator(onRefresh:()async{_reset();},child:CustomScrollView(controller:_scroll,slivers:[
            SliverPadding(padding:const EdgeInsets.all(12),sliver:SliverGrid(
              delegate:SliverChildBuilderDelegate((ctx,i)=>ProductCard(product:_items[i]),childCount:_items.length),
              gridDelegate:const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent:235,mainAxisExtent:318,mainAxisSpacing:12,crossAxisSpacing:12))),
            SliverToBoxAdapter(child:Center(child:_loading?const Padding(padding:EdgeInsets.all(16),child:CircularProgressIndicator())
              : _error!=null?TextButton(onPressed:_loadPage,child:Text('Erro ao carregar mais — tentar novamente'))
              : const SizedBox(height:20))),
          ]))),
    ]),
  );
}
