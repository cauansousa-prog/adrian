-- Índice da chave estrangeira permite verificações eficientes ao excluir usuários autorizados.
create index if not exists availability_blocks_created_by_idx
  on public.availability_blocks (created_by);
