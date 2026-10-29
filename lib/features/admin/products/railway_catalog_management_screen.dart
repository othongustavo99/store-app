import 'package:loja_roupas/router/app_back_button.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../../../core/network/loja_api.dart';
import '../../../data/repositories/railway_catalog_admin_repository.dart';

/// Administração Railway: catálogo e preços; quantidades ficam no Inventário.
class RailwayCatalogManagementScreen extends StatefulWidget {
  const RailwayCatalogManagementScreen({super.key});
  @override
  State<RailwayCatalogManagementScreen> createState() => _RailwayCatalogManagementScreenState();
}

class _RailwayCatalogManagementScreenState extends State<RailwayCatalogManagementScreen> {
  final _repo = RailwayCatalogAdminRepository();
  final _search = TextEditingController();
  final _currency = NumberFormat.currency(locale: 'pt_BR', symbol: 'R\$');
  late Future<Map<String, dynamic>> _data;
  StreamSubscription<int>? _subscription;
  String _filter = 'ALL';
  final bool _busy = false;

  @override
  void initState() {
    super.initState();
    _reload();
    _subscription = LojaApi.instance.catalogChanges().listen((_) {
      if (mounted && !_busy) setState(_reload);
    });
  }
  void _reload() { _data = _repo.load(); }
  Future<void> _refresh() async { setState(_reload); try { await _data; } catch (_) {} }
  @override
  void dispose() { _subscription?.cancel(); _search.dispose(); super.dispose(); }
  int _num(dynamic input) => int.tryParse(input?.toString() ?? '') ?? 0;
  String _price(dynamic cents) => _currency.format(_num(cents) / 100);
  String _moneyInput(dynamic cents) => (_num(cents) / 100).toStringAsFixed(2).replaceAll('.', ',');
  int? _parseCents(String text) {
    var cleaned = text.trim().replaceAll('R\$', '').replaceAll(' ', '');
    // Aceita 12,50; 12.50; 1.250,00; 1250.00.
    if (cleaned.contains(',')) {
      cleaned = cleaned.replaceAll('.', '').replaceAll(',', '.');
    } else if (RegExp(r'^(\d{1,3}\.)+\d{3}$').hasMatch(cleaned)) {
      cleaned = cleaned.replaceAll('.', '');
    }
    final value = double.tryParse(cleaned);
    if (value == null || !value.isFinite || value <= 0 || value > 1000000) return null;
    final cents = (value * 100).round();
    if ((value * 100 - cents).abs() > 0.00001) return null;
    return cents;
  }
  void _error(Object e) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'), backgroundColor: Theme.of(context).colorScheme.error));
  }
  String _statusLabel(String s) => switch (s) {
    'DRAFT' => 'Rascunho', 'PUBLISHED' => 'Publicado', 'HIDDEN' => 'Oculto',
    _ => s,
  };

  Future<void> _createCategory() async {
    final name = TextEditingController();
    try {
      final accepted = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
        title: const Text('Nova categoria'),
        content: SizedBox(width: 370, child: TextField(controller: name, autofocus: true, maxLength: 120,
          decoration: const InputDecoration(labelText: 'Nome da categoria', border: OutlineInputBorder()))),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Criar'))],
      ));
      if (accepted != true) return;
      if (name.text.trim().length < 2) { _error('Informe pelo menos 2 caracteres.'); return; }
      await _repo.createCategory(name.text.trim());
      if (mounted) await _refresh();
    } catch(e) { _error(e); }
    finally { name.dispose(); }
  }

  Future<void> _editProduct(Map<String, dynamic>? product, List<Map<String, dynamic>> categories) async {
    if (categories.isEmpty) { _error('Cadastre uma categoria antes de criar um produto.'); return; }
    final creating = product == null;
    final name = TextEditingController(text: product?['name']?.toString() ?? '');
    final description = TextEditingController(text: product?['description']?.toString() ?? '');
    final sizeGuide = TextEditingController(text: product?['sizeGuide']?.toString() ?? '');
    final price = TextEditingController(text: _moneyInput(product?['priceCents'] ?? 0));
    final oldPrice = TextEditingController(text: product?['oldPriceCents'] == null ? '' : _moneyInput(product?['oldPriceCents']));
    final sku = TextEditingController();
    final color = TextEditingController(text: 'Preto, Branco');
    final size = TextEditingController(text: 'P, M, G, GG');
    // Grade de variações: cores x tamanhos, cada combinação com estoque inicial.
    final gradeControllers = <String, TextEditingController>{};
    var grid = <({String color, String size, String key})>[];
    String? generateGrid() {
      final colors = color.text.split(',').map((x)=>x.trim()).where((x)=>x.isNotEmpty).toSet().toList();
      final sizes = size.text.split(',').map((x)=>x.trim()).where((x)=>x.isNotEmpty).toSet().toList();
      if(colors.isEmpty || sizes.isEmpty || colors.length*sizes.length>120) {
        return 'Escolha cores e tamanhos (até 120 combinações).';
      }
      if(colors.any((c)=>c.length>60)||sizes.any((v)=>v.length>50)) {
        return 'Cor ou tamanho excede o limite.';
      }
      grid = [for(final c in colors)for(final z in sizes)(color:c,size:z,key:'$c|$z')];
      for(final cell in grid){gradeControllers.putIfAbsent(cell.key,()=>TextEditingController(text:'0'));}
      return null;
    }
    generateGrid();
    final imageUrl = TextEditingController();
    final videoUrl = TextEditingController();
    String categoryId = product?['categoryId']?.toString() ?? categories.first['id'].toString();
    if (!categories.any((c) => c['id'] == categoryId)) categoryId = categories.first['id'].toString();
    String status = product?['status']?.toString() ?? 'DRAFT';
    bool featured = product?['isFeatured'] == true;
    bool isNew = product?['isNew'] == true;
    final images = List<String>.from(product?['images'] as List? ?? const []);
    final videos = List<String>.from(product?['videos'] as List? ?? const []);
    bool saving = false;
    String? error;
    try {
      final changed = await showDialog<bool>(context: context, barrierDismissible: false,
        builder: (outer) => StatefulBuilder(builder: (ctx, update) {
          Future<void> pickImage() async {
            try {
              final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85);
              if (picked == null) return;
              update(() { saving = true; error = null; });
              final url = await _repo.uploadImage(picked);
              update(() { images.add(url); saving = false; });
            } catch (e) { update(() {saving = false; error = '$e';}); }
          }
          void addUrl({required bool video}) {
            final controller = video ? videoUrl : imageUrl;
            final uri = Uri.tryParse(controller.text.trim());
            if (uri == null || uri.scheme != 'https' || !uri.hasAuthority) {
              update(() => error = 'Informe uma URL HTTPS válida.'); return;
            }
            update(() { (video ? videos : images).add(uri.toString()); controller.clear(); error = null; });
          }
          Future<void> save() async {
            final priceCents = _parseCents(price.text);
            final oldCents = oldPrice.text.trim().isEmpty ? null : _parseCents(oldPrice.text);
            if (name.text.trim().length < 2 || priceCents == null ||
                (oldPrice.text.trim().isNotEmpty && (oldCents == null || oldCents <= priceCents))) {
              update(() => error = 'Informe nome, preço válido e, se houver, preço anterior maior que o atual.'); return;
            }
            if (status == 'PUBLISHED' && images.isEmpty) {
              update(() => error = 'Adicione ao menos uma imagem antes de publicar.'); return;
            }
            final payload = <String, dynamic>{
              'name': name.text.trim(), 'description': description.text.trim(), 'sizeGuide':sizeGuide.text.trim(),
              'categoryId': categoryId, 'priceCents': priceCents, 'oldPriceCents': oldCents,
              'images': images, 'videos': videos,
              'isFeatured': featured, 'isNew': isNew, 'status': status,
            };
            if (creating) {
              final check = generateGrid();
              final prefix = sku.text.trim().toUpperCase();
              if (check != null || !RegExp(r'^[A-Z0-9][A-Z0-9._-]{1,75}$').hasMatch(prefix)) {
                update(() => error = check ?? 'Informe um SKU base com letras, números, pontos, hífens ou underline.');return;
              }
              if(grid.any((cell){final qty=int.tryParse(gradeControllers[cell.key]!.text.trim());return qty==null || qty<0 || qty>1000000;})){
                update(()=>error='Preencha os estoques de cada combinação com valores entre 0 e 1.000.000.');return;
              }
              payload['variants'] = [for(var i=0;i<grid.length;i++){
                'sku':'$prefix-${(i+1).toString().padLeft(3,'0')}',
                'color':grid[i].color, 'size':grid[i].size,
                'initialStock':int.parse(gradeControllers[grid[i].key]!.text.trim()),
              }];
            }
            update(() { saving = true; error = null; });
            try {
              if (creating) { await _repo.createProduct(payload); }
              else { await _repo.updateProduct(product['id'].toString(), payload); }
              if (ctx.mounted) Navigator.pop(ctx, true);
            } catch(e) { update(() {saving = false;error = '$e';}); }
          }
          return Scaffold(
            appBar: AppBar(title:Text(creating ? 'Cadastrar produto' : 'Editar produto'),
              leading:IconButton(tooltip:'Voltar',onPressed:saving?null:()=>Navigator.pop(ctx,false),
                icon:const Icon(Icons.arrow_back)),
              actions:[Padding(padding:const EdgeInsets.only(right:12),child:FilledButton(
                onPressed:saving?null:save,child:saving?const SizedBox(height:18,width:18,child:CircularProgressIndicator(strokeWidth:2)):
                  const Text('Salvar produto')))]),
            body:Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:720),
              child:SingleChildScrollView(padding:const EdgeInsets.all(18),child:Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: [
                TextField(controller: name, enabled: !saving, maxLength: 200, decoration: const InputDecoration(labelText: 'Nome *')),
                TextField(controller: description, enabled: !saving, minLines: 2, maxLines: 4,
                  decoration: const InputDecoration(labelText: 'Descrição')),
                const SizedBox(height:12),
                TextField(controller:sizeGuide,enabled:!saving,maxLength:3000,minLines:3,maxLines:7,
                  decoration:const InputDecoration(labelText:'Guia de medidas da peça (cm)',
                    hintText:'Ex.: M — busto 98 cm; cintura 78 cm; comprimento 65 cm.\nG — ...',
                    border:OutlineInputBorder())),
                DropdownButtonFormField<String>(initialValue: categoryId, isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Categoria'),
                  items: categories.map((c) => DropdownMenuItem(value: c['id'].toString(), child: Text(c['name'].toString()))).toList(),
                  onChanged: saving ? null : (v) { if (v != null) update(() => categoryId = v); }),
                const SizedBox(height: 8),
                Row(children: [Expanded(child: TextField(controller: price, enabled: !saving,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Preço (R\$) *'))),
                  const SizedBox(width: 12), Expanded(child: TextField(controller: oldPrice, enabled: !saving,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Preço anterior (R\$)')))]),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(initialValue: status,
                  decoration: const InputDecoration(labelText: 'Visibilidade'),
                  items: const [DropdownMenuItem(value:'DRAFT',child:Text('Rascunho')),
                    DropdownMenuItem(value:'PUBLISHED',child:Text('Publicado')),
                    DropdownMenuItem(value:'HIDDEN',child:Text('Oculto'))],
                  onChanged: saving ? null : (v) { if(v!=null) update(()=>status=v); }),
                SwitchListTile.adaptive(title: const Text('Destacar na vitrine'), value: featured,
                  onChanged: saving ? null : (v) => update(() => featured = v)),
                SwitchListTile.adaptive(title: const Text('Marcar como novidade'), value: isNew,
                  onChanged: saving ? null : (v) => update(() => isNew = v)),
                const Divider(),
                Text('Imagens • a primeira é a capa', style: Theme.of(ctx).textTheme.titleSmall),
                const SizedBox(height: 8),
                if (images.isNotEmpty) SizedBox(height: 96, child: ListView.builder(
                  scrollDirection: Axis.horizontal, itemCount: images.length, itemBuilder: (_,i) => Padding(
                    padding: const EdgeInsets.only(right: 8), child: SizedBox(width: 92, child: Column(children: [
                      Expanded(child: Image.network(images[i], width: 88, errorBuilder: (context, error, stackTrace) => const Icon(Icons.broken_image))),
                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        if(i>0) InkWell(onTap: saving ? null : () => update(() {
                          final img=images.removeAt(i); images.insert(i-1,img);
                        }), child: const Icon(Icons.arrow_back, size: 18)),
                        InkWell(onTap: saving ? null : () => update(() => images.removeAt(i)),
                          child: const Icon(Icons.delete_outline, size: 18)),
                      ]),
                    ]))),
                  )),
                Wrap(spacing: 8, children: [
                  OutlinedButton.icon(onPressed: saving ? null : pickImage,
                    icon: const Icon(Icons.add_photo_alternate_outlined), label: const Text('Enviar foto')),
                ]),
                Row(children: [Expanded(child: TextField(controller: imageUrl, enabled: !saving,
                  decoration: const InputDecoration(labelText:'Ou URL HTTPS da imagem'))),
                  IconButton(tooltip:'Adicionar URL', icon:const Icon(Icons.add_link), onPressed:saving ? null : () => addUrl(video:false))]),
                const SizedBox(height: 8),
                Text('Vídeos opcionais (links HTTPS)', style: Theme.of(ctx).textTheme.titleSmall),
                for(final v in videos) ListTile(dense:true, title:Text(v, maxLines:1, overflow:TextOverflow.ellipsis),
                  trailing: IconButton(onPressed: saving ? null : () => update(() => videos.remove(v)), icon:const Icon(Icons.close))),
                Row(children: [Expanded(child:TextField(controller:videoUrl, enabled: !saving,
                  decoration:const InputDecoration(labelText:'URL HTTPS do vídeo'))),
                  IconButton(tooltip:'Adicionar vídeo', icon:const Icon(Icons.add), onPressed:saving ? null : () => addUrl(video:true))]),
                if(creating) ...[
                  const Divider(),
                  Text('Grade de cores e tamanhos', style:Theme.of(ctx).textTheme.titleMedium),
                  const Text('Informe listas separadas por vírgula. Cada combinação vira um SKU único.'),
                  TextField(controller:sku,enabled:!saving,maxLength:75,
                    decoration:const InputDecoration(labelText:'Prefixo do SKU * (ex.: CAMISETA01)')),
                  TextField(controller:color,enabled:!saving,
                    decoration:const InputDecoration(labelText:'Cores (ex.: Preto, Branco, Azul)')),
                  TextField(controller:size,enabled:!saving,
                    decoration:const InputDecoration(labelText:'Tamanhos (ex.: P, M, G, GG)')),
                  OutlinedButton.icon(onPressed:saving?null:(){update(()=>error=generateGrid());},
                    icon:const Icon(Icons.grid_on),label:const Text('Gerar grade')),
                  Text('${grid.length} combinações • informe o estoque inicial',
                    style:Theme.of(ctx).textTheme.titleSmall),
                  for(final cell in grid) Padding(padding:const EdgeInsets.symmetric(vertical:4),
                    child:Row(children:[Expanded(child:Text('${cell.color} / ${cell.size}')),
                      SizedBox(width:125,child:TextField(controller:gradeControllers[cell.key],enabled:!saving,
                        keyboardType:TextInputType.number,
                        decoration:const InputDecoration(labelText:'Estoque',border:OutlineInputBorder(),isDense:true)))])),
                ] else const Padding(padding:EdgeInsets.symmetric(vertical:8),child:
                  Text('Para ajustar estoque e SKUs existentes, utilize Inventário e Variantes.',style:TextStyle(fontSize:12))),
                if(error != null) Padding(padding:const EdgeInsets.only(top:10),child:
                  Text(error!,style:TextStyle(color:Theme.of(ctx).colorScheme.error))),
              ],
            )))),
          );
        }),
      );
      if(changed == true && mounted) await _refresh();
    } finally {
      for(final c in [name, description, sizeGuide, price, oldPrice, sku, color, size, imageUrl, videoUrl, ...gradeControllers.values]) { c.dispose(); }
    }
  }

  Future<void> _variantDialog(Map<String,dynamic> product, Map<String,dynamic>? existing) async {
    final creating = existing == null;
    final sku = TextEditingController(text: existing?['sku']?.toString() ?? '');
    final color = TextEditingController(text: existing?['color']?.toString() ?? '');
    final size = TextEditingController(text: existing?['size']?.toString() ?? '');
    final image = TextEditingController(text: existing?['imageUrl']?.toString() ?? '');
    final stock = TextEditingController(text: '0');
    var active = existing?['status'] != 'INACTIVE';
    String? error; var busy = false;
    try {
      final changed = await showDialog<bool>(context:context,barrierDismissible:false,builder:(dialog)=>
        StatefulBuilder(builder:(ctx,update)=>AlertDialog(
          title:Text(creating?'Adicionar variante':'Editar variante'),
          content:SizedBox(width:430,child:Column(mainAxisSize:MainAxisSize.min,children:[
            TextField(controller:sku,enabled:!busy,decoration:const InputDecoration(labelText:'SKU único *')),
            TextField(controller:color,enabled:!busy,decoration:const InputDecoration(labelText:'Cor *')),
            TextField(controller:size,enabled:!busy,decoration:const InputDecoration(labelText:'Tamanho *')),
            TextField(controller:image,enabled:!busy,decoration:const InputDecoration(labelText:'Imagem específica (URL HTTPS, opcional)')),
            if(creating) TextField(controller:stock,enabled:!busy,keyboardType:TextInputType.number,
              decoration:const InputDecoration(labelText:'Estoque inicial')),
            if(!creating) SwitchListTile(title:const Text('Variante ativa'),value:active,
              onChanged:busy ? null : (v)=>update(()=>active=v)),
            if(!creating) const Text('Estoque não é alterado aqui. Use Inventário.',style:TextStyle(fontSize:12)),
            if(error!=null) Text(error!,style:TextStyle(color:Theme.of(ctx).colorScheme.error)),
          ])),
          actions:[TextButton(onPressed:busy?null:()=>Navigator.pop(ctx,false),child:const Text('Cancelar')),
            FilledButton(onPressed:busy?null:()async{
              final qty=int.tryParse(stock.text.trim());
              final uri=Uri.tryParse(image.text.trim());
              if(sku.text.trim().length<2||color.text.trim().isEmpty||size.text.trim().isEmpty||
                (image.text.trim().isNotEmpty && (uri?.scheme!='https'||uri?.hasAuthority!=true))||
                (creating && (qty==null || qty<0 || qty>1000000))) {
                update(()=>error='Preencha SKU, cor e tamanho válidos.'); return;
              }
              update((){busy=true;error=null;});
              try{
                final payload = <String,dynamic>{'sku':sku.text.trim(),'color':color.text.trim(),
                  'size':size.text.trim(),'imageUrl':image.text.trim().isEmpty?null:image.text.trim()};
                if(creating){ payload['initialStock']=qty; await _repo.addVariant(product['id'].toString(),payload); }
                else { payload['status']=active?'ACTIVE':'INACTIVE'; await _repo.editVariant(existing['id'].toString(),payload); }
                if(ctx.mounted) Navigator.pop(ctx,true);
              }catch(e){update((){busy=false;error='$e';});}
            },child:const Text('Salvar'))],
        )));
      if(changed==true && mounted) await _refresh();
    }finally{for(final c in [sku,color,size,image,stock]){c.dispose();}}
  }

  Future<void> _duplicate(Map<String,dynamic> product) async {
    try {
      final variants=List<Map<String,dynamic>>.from(product['variants'] as List? ?? const [])
        .where((v)=>v['status']=='ACTIVE').toList();
      if(variants.isEmpty){_error('O produto precisa ter ao menos uma variante ativa.');return;}
      final suffix=DateTime.now().microsecondsSinceEpoch.toRadixString(36).toUpperCase();
      await _repo.createProduct({
        'name':'${product['name']} (cópia)',
        'description':product['description']??'', 'sizeGuide':product['sizeGuide']??'', 'categoryId':product['categoryId'],
        'priceCents':_num(product['priceCents']), 'oldPriceCents':product['oldPriceCents']==null?null:_num(product['oldPriceCents']),
        'images':product['images']??[], 'videos':product['videos']??[],
        'isFeatured':false,'isNew':false, 'status':'DRAFT',
        'variants':[for(var i=0;i<variants.length;i++){
          'sku':'COP-$suffix-${i+1}', 'color':variants[i]['color'],
          'size':variants[i]['size'], 'initialStock':0,
        }],
      });
      if(mounted){ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('Rascunho duplicado com estoque zero.')));await _refresh();}
    }catch(e){_error(e);}
  }

  Future<void> _togglePublished(Map<String,dynamic> product) async {
    final next=product['status']=='PUBLISHED'?'HIDDEN':'PUBLISHED';
    try{
      await _repo.updateProduct(product['id'].toString(),{
        'name':product['name'],'description':product['description']??'', 'sizeGuide':product['sizeGuide']??'',
        'categoryId':product['categoryId'],'priceCents':_num(product['priceCents']),
        'oldPriceCents':product['oldPriceCents']==null?null:_num(product['oldPriceCents']),
        'images':product['images']??[], 'videos':product['videos']??[],
        'isFeatured':product['isFeatured']==true,'isNew':product['isNew']==true,'status':next,
      });
      if(mounted)await _refresh();
    }catch(e){_error(e);}
  }

  Future<void> _archive(Map<String,dynamic> product) async {
    final yes=await showDialog<bool>(context:context,builder:(ctx)=>AlertDialog(
      title:const Text('Arquivar produto?'),
      content:Text('"${product['name']}" deixará de aparecer na vitrine. Os pedidos anteriores permanecem registrados.'),
      actions:[TextButton(onPressed:()=>Navigator.pop(ctx,false),child:const Text('Cancelar')),
        FilledButton(onPressed:()=>Navigator.pop(ctx,true),child:const Text('Arquivar'))]));
    if(yes!=true)return;
    try{await _repo.archiveProduct(product['id'].toString());if(mounted)await _refresh();}
    catch(e){_error(e);}
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar:AppBar(leading: const AppBackButton(fallbackLocation: '/admin'), title:const Text('Produtos e categorias'),actions:[
      IconButton(tooltip:'Atualizar catálogo',onPressed:_refresh,icon:const Icon(Icons.refresh)),
    ]),
    body:FutureBuilder<Map<String,dynamic>>(future:_data,builder:(context,snapshot){
      if(!snapshot.hasData){return Center(child:snapshot.hasError
        ? Column(mainAxisSize:MainAxisSize.min,children:[Text('Falha: ${snapshot.error}'),
          FilledButton(onPressed:_refresh,child:const Text('Tentar novamente'))])
        : const CircularProgressIndicator());}
      final data=snapshot.data!;
      final canEdit=data['canEdit']==true;
      final categories=List<Map<String,dynamic>>.from(data['categories'] as List);
      final products=List<Map<String,dynamic>>.from(data['products'] as List);
      final query=_search.text.trim().toLowerCase();
      final filtered=products.where((p){
        if(_filter!='ALL' && p['status']!=_filter)return false;
        if(query.isEmpty)return true;
        return p['name'].toString().toLowerCase().contains(query)||
          (p['variants'] as List? ?? const []).any((v)=>v['sku'].toString().toLowerCase().contains(query));
      }).toList();
      return Column(children:[
        Padding(padding:const EdgeInsets.all(14),child:Column(children:[
          Wrap(spacing:8,runSpacing:8,children:[
            if(canEdit) FilledButton.icon(onPressed:()=>_editProduct(null,categories),icon:const Icon(Icons.add),label:const Text('Novo produto')),
            if(canEdit) OutlinedButton.icon(onPressed:_createCategory,icon:const Icon(Icons.category_outlined),label:const Text('Nova categoria')),
            OutlinedButton.icon(onPressed:()=>context.push('/admin/inventory'),icon:const Icon(Icons.inventory_2_outlined),label:const Text('Abrir inventário')),
          ]),
          const SizedBox(height:12),
          TextField(controller:_search,onChanged:(_)=>setState((){}),decoration:const InputDecoration(
            prefixIcon:Icon(Icons.search),labelText:'Pesquisar nome ou SKU',border:OutlineInputBorder())),
          const SizedBox(height:10),
          SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[
            for(final s in ['ALL','PUBLISHED','DRAFT','HIDDEN']) Padding(
              padding:const EdgeInsets.only(right:8),child:ChoiceChip(label:Text(s=='ALL'?'Todos':_statusLabel(s)),
                selected:_filter==s,onSelected:(_)=>setState(()=>_filter=s))),
          ])),
        ])),
        Expanded(child:RefreshIndicator(onRefresh:_refresh,child:filtered.isEmpty
          ? ListView(children:const [SizedBox(height:100),Center(child:Text('Nenhum produto encontrado.'))])
          : ListView.builder(itemCount:filtered.length,itemBuilder:(context,i){
          final p=filtered[i];
          final variants=List<Map<String,dynamic>>.from(p['variants'] as List? ?? const []);
          final images=List<String>.from(p['images'] as List? ?? const []);
          final available=variants.fold<int>(0,(sum,v)=>sum+_num(v['available']));
          return Card(margin:const EdgeInsets.fromLTRB(14,3,14,9),child:Padding(padding:const EdgeInsets.all(12),
            child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
                ClipRRect(borderRadius:BorderRadius.circular(8),child:SizedBox(width:76,height:88,
                  child:images.isEmpty?const Icon(Icons.image_not_supported_outlined)
                  :Image.network(images.first,fit:BoxFit.cover,errorBuilder:(context,error,stackTrace)=>const Icon(Icons.broken_image)))),
                const SizedBox(width:12),
                Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
                  Text(p['name'].toString(),style:Theme.of(context).textTheme.titleMedium),
                  Text('${_price(p['priceCents'])} • $available disponíveis'),
                  Text(_statusLabel(p['status'].toString()),style:Theme.of(context).textTheme.bodySmall),
                  Text('${variants.length} variantes',style:Theme.of(context).textTheme.bodySmall),
                ])),
              ]),
              const SizedBox(height:8),
              Wrap(spacing:8,runSpacing:8,children:[
                if(canEdit) OutlinedButton.icon(onPressed:()=>_editProduct(p,categories),
                  icon:const Icon(Icons.edit_outlined),label:const Text('Editar')),
                if(canEdit) OutlinedButton.icon(onPressed:()=>_variantDialog(p,null),
                  icon:const Icon(Icons.add_box_outlined),label:const Text('Nova variante')),
                if(canEdit) OutlinedButton.icon(onPressed:()=>_duplicate(p),icon:const Icon(Icons.copy_outlined),label:const Text('Duplicar')),
                if(canEdit && (p['status']=='PUBLISHED' || p['status']=='HIDDEN'))
                  OutlinedButton.icon(onPressed:()=>_togglePublished(p),
                    icon:Icon(p['status']=='PUBLISHED'?Icons.visibility_off_outlined:Icons.visibility_outlined),
                    label:Text(p['status']=='PUBLISHED'?'Ocultar':'Publicar')),
                if(canEdit) TextButton.icon(onPressed:()=>_archive(p),icon:const Icon(Icons.archive_outlined),label:const Text('Arquivar')),
              ]),
              if(variants.isNotEmpty) ExpansionTile(tilePadding:EdgeInsets.zero,title:const Text('SKUs e variantes'),
                children:variants.map((v)=>ListTile(dense:true,
                  title:Text('${v['sku']} • ${v['color']} / ${v['size']}'),
                  subtitle:Text('Físico ${v['onHand']} • Reservado ${v['reserved']} • Disponível ${v['available']} • ${v['status']}'),
                  trailing:canEdit?IconButton(tooltip:'Editar variante',onPressed:()=>_variantDialog(p,v),
                    icon:const Icon(Icons.tune)):null)).toList()),
            ])));
        }))),
      ]);
    }),
  );
}
