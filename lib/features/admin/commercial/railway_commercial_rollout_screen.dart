import 'package:flutter/material.dart';
import '../../../data/repositories/railway_commercial_rollout_repository.dart';

/// Planejamento declaratório: não ativa checkout, estorno ou transportadora.
class RailwayCommercialRolloutScreen extends StatefulWidget {
  const RailwayCommercialRolloutScreen({super.key, this.repository});
  final CommercialRolloutSource? repository;
  @override
  State<RailwayCommercialRolloutScreen> createState() => _RailwayCommercialRolloutScreenState();
}

class _RailwayCommercialRolloutScreenState extends State<RailwayCommercialRolloutScreen> {
  late final CommercialRolloutSource _repo = widget.repository ?? RailwayCommercialRolloutRepository();
  Map<String, dynamic> _plan = {};
  Map<String, dynamic> _legacy = {};
  List<String> _steps = [];
  bool _loading = true, _saving = false, _owner = false, _dirty = false;
  int _revision = 0;
  String? _error, _notice;

  static const _payments = {'NONE':'Sem pagamento online','MERCADOPAGO':'Mercado Pago','OTHER':'Outro fornecedor (futuro adaptador)'};
  static const _carriers = {'NONE':'Sem transportadora','MELHOR_ENVIO':'Melhor Envio','OTHER':'Outro fornecedor (futuro adaptador)'};
  static const _stages = {'NOT_PLANNED':'Não planejado','PLANNED':'Planejado','CREDENTIALS_PENDING':'Aguardando credenciais','HOMOLOGATION_PENDING':'Aguardando homologação'};
  static const _refunds = {'NOT_PLANNED':'Não planejado','PLANNED':'Planejado'};
  static const _environments = {'SANDBOX':'Teste / homologação','PRODUCTION':'Produção (apenas intenção)'};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading=true; _error=null; _notice=null; });
    try {
      final response=await _repo.load();
      if (!mounted) return;
      setState(() {
        _plan=Map<String,dynamic>.from(response['plan'] as Map? ?? {});
        _legacy=Map<String,dynamic>.from(response['legacyPilot'] as Map? ?? {});
        _steps=(response['nextSteps'] as List? ?? []).map((e)=>'$e').toList();
        _revision=(response['revision'] as num?)?.toInt() ?? 0;
        _owner=response['myRole']=='OWNER';
        _dirty=false;
      });
    } catch (_) {
      if (mounted) setState(()=>_error='Não foi possível consultar o planejamento desta loja.');
    } finally { if(mounted) setState(()=>_loading=false); }
  }

  void _set(String key,String value) {
    setState(() {
      _plan[key]=value;
      if(key=='paymentProvider' && value=='NONE') {
        _plan['paymentStage']='NOT_PLANNED'; _plan['refundStage']='NOT_PLANNED';
      } else if(key=='paymentProvider' && value!='NONE') {
        if(_plan['paymentStage']=='NOT_PLANNED')_plan['paymentStage']='PLANNED';
        if(value!='MERCADOPAGO')_plan['refundStage']='NOT_PLANNED';
      }
      if(key=='carrierProvider' && value=='NONE')_plan['carrierStage']='NOT_PLANNED';
      if(key=='carrierProvider' && value!='NONE' && _plan['carrierStage']=='NOT_PLANNED') {
        _plan['carrierStage']='PLANNED';
      }
      _dirty=true; _notice=null;
    });
  }

  Future<void> _save() async {
    if(_saving || !_owner || !_dirty)return;
    setState(() {_saving=true;_error=null;_notice=null;});
    try{
      final result=await _repo.save({'expectedRevision':_revision,..._plan});
      if(!mounted)return;
      setState(() {
        _plan=Map<String,dynamic>.from(result['plan'] as Map);
        _legacy=Map<String,dynamic>.from(result['legacyPilot'] as Map? ?? {});
        _steps=(result['nextSteps'] as List? ?? []).map((e)=>'$e').toList();
        _revision=(result['revision'] as num).toInt();
        _dirty=false;
        _notice='Planejamento salvo. Nenhuma integração real foi ativada.';
      });
    }catch(_){
      if(mounted)setState(()=>_error='Não foi possível salvar. Outra pessoa pode ter alterado o plano; recarregue antes de tentar novamente.');
    }finally{if(mounted)setState(()=>_saving=false);}
  }

  Widget _dropdown(String label,String key,Map<String,String> options, {bool enabled=true}) {
    final value='${_plan[key] ?? options.keys.first}';
    return InputDecorator(
      decoration: InputDecoration(labelText:label,border:const OutlineInputBorder()),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          key:ValueKey(key),value:options.containsKey(value)?value:options.keys.first,
          isExpanded:true,
          items:options.entries.map((e)=>DropdownMenuItem(value:e.key,child:Text(e.value,overflow:TextOverflow.ellipsis))).toList(),
          onChanged:_owner && !_saving && enabled ? (next){if(next!=null)_set(key,next);} : null,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar:AppBar(title:const Text('Pagamentos e frete por loja'),actions:[
      IconButton(tooltip:'Recarregar',onPressed:_loading||_saving?null:_load,icon:const Icon(Icons.refresh)),
    ]),
    body:_loading ? const Center(child:CircularProgressIndicator()) : _error!=null && _plan.isEmpty
      ? Center(child:Padding(padding:const EdgeInsets.all(20),child:Column(mainAxisSize:MainAxisSize.min,children:[
        Text(_error!,textAlign:TextAlign.center),const SizedBox(height:16),FilledButton(onPressed:_load,child:const Text('Tentar novamente'))])))
      : ListView(padding:const EdgeInsets.all(18),children:[
          Center(child:ConstrainedBox(constraints:const BoxConstraints(maxWidth:760),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            const Card(child:Padding(padding:EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Row(children:[Icon(Icons.info_outline),SizedBox(width:8),Expanded(child:Text('Configuração apenas preparatória',style:TextStyle(fontWeight:FontWeight.w700)))]),
              SizedBox(height:8),Text('Nenhum campo desta tela ativa cobranças, estornos ou fretes. Tokens e credenciais não são cadastrados aqui. Homologação com o fornecedor acontecerá somente quando houver cliente.'),
            ]))),
            const SizedBox(height:18),
            Text('Pagamentos',style:Theme.of(context).textTheme.titleLarge),const SizedBox(height:10),
            _dropdown('Provedor planejado','paymentProvider',_payments),const SizedBox(height:12),
            _dropdown('Etapa','paymentStage',_stages,enabled:_plan['paymentProvider']!='NONE'),const SizedBox(height:12),
            _dropdown('Ambiente pretendido','paymentEnvironment',_environments),const SizedBox(height:12),
            _dropdown('Estornos','refundStage',_refunds,enabled:_plan['paymentProvider']=='MERCADOPAGO'),
            const SizedBox(height:22),
            Text('Transportadoras',style:Theme.of(context).textTheme.titleLarge),const SizedBox(height:10),
            _dropdown('Provedor planejado','carrierProvider',_carriers),const SizedBox(height:12),
            _dropdown('Etapa','carrierStage',_stages,enabled:_plan['carrierProvider']!='NONE'),const SizedBox(height:12),
            _dropdown('Ambiente pretendido','carrierEnvironment',_environments),const SizedBox(height:20),
            if(!_owner)const Text('Somente o proprietário pode editar este planejamento.'),
            if(_error!=null)Padding(padding:const EdgeInsets.symmetric(vertical:8),child:Text(_error!,style:TextStyle(color:Theme.of(context).colorScheme.error))),
            if(_notice!=null)Padding(padding:const EdgeInsets.symmetric(vertical:8),child:Text(_notice!)),
            FilledButton.icon(onPressed:_owner && _dirty && !_saving?_save:null,
              icon:const Icon(Icons.save_outlined),label:Text(_saving?'Salvando...':'Salvar planejamento')),
            const SizedBox(height:16),
            Text('Próximos passos',style:Theme.of(context).textTheme.titleLarge),
            ..._steps.map((s)=>ListTile(dense:true,leading:const Icon(Icons.pending_actions_outlined),title:Text(s))),
            const Divider(),
            Text('Piloto legado (somente diagnóstico): pagamento ${_legacy['paymentPilot']==true?'configurado':'não configurado'}; transportadora ${_legacy['carrierPilot']==true?'configurada':'não configurada'}.',
              style:Theme.of(context).textTheme.bodySmall),
          ]))),
        ]),
  );
}
