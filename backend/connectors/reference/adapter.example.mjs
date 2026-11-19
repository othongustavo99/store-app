// COPIE para adapter.mjs e implemente integracao com o ERP escolhido.
// Nunca marque ready=true enquanto a persistencia idempotente nao estiver funcionando.
export const ready = false;

export async function processEvent({event, idempotencyKey, getStoreResource, abortSignal}) {
  // Ex.: order.changed -> GET /v1/external/orders/{resourceId}
  // Ex.: catalog.product.changed -> GET /v1/external/catalog/products/{resourceId}
  // O adapter deve usar idempotencyKey para impedir criacao duplicada apos timeout.
  // E usar APIs oficiais do ERP + conferir resposta/commit efetivo.
  // So retornar {committed:true} apos confirmar persistencia.
  // Em 404 do Store App (recurso excluido) tratar exclusao/tombstone no ERP.
  void event; void idempotencyKey; void getStoreResource; void abortSignal;
  throw new Error('Implemente a logica do ERP escolhido antes de ativar ready=true.');
}
