# Site do Promotor Adrian

Site estático em HTML, CSS e JavaScript. O calendário público consulta apenas os intervalos ocupados; o painel em `/admin.html` usa Supabase Auth e as políticas RLS da migração.

## Configuração do Supabase

1. O projeto Supabase dedicado a este site é `adrian` (`nwdwldhzcyrzkmywykzo`). A migração abaixo já foi aplicada nesse projeto; mantenha o arquivo versionado para reproduzir e auditar a estrutura em outros ambientes.
2. As migrações em `supabase/migrations/` criam as tabelas da agenda com RLS e restringem gravações a administradores autorizados. Os bloqueios podem ser de dia inteiro ou conter horários; intervalos ocupados não podem se sobrepor. A migração `20261025010000_availability_time_ranges.sql` mantém bloqueios antigos como dia inteiro e expõe ao público apenas datas e horários ocupados.
3. Em **Authentication → Providers → Email**, mantenha o cadastro público desativado. Crie a conta de Adrian pelo painel do Supabase Auth; não há cadastro no site.
4. Autorize a conta inserindo seu UUID, obtido na lista de usuários do Auth, no SQL Editor:

   ```sql
   insert into public.availability_admins (user_id)
   values ('UUID-DA-CONTA-DE-ADRIAN');
   ```

   Essa tabela não permite que usuários do aplicativo incluam ou alterem administradores. A autorização é verificada pelo RLS em cada operação.
5. Confirme que o schema `public` está exposto à Data API do projeto. A migração concede somente as permissões necessárias e não desativa RLS.

O banco armazena apenas datas, o UUID administrativo e timestamps. Não há campos para clientes, locais, contatos ou observações de eventos. Visitantes anônimos só podem ler `start_date` e `end_date`; usuários autenticados sem autorização não conseguem gerenciar bloqueios.

## Configuração local e Vercel

Defina estas variáveis de ambiente no build local ou no projeto Vercel, nos ambientes Development, Preview e Production:

- `SUPABASE_URL`: URL do projeto Supabase deste site.
- `SUPABASE_PUBLISHABLE_KEY`: chave pública publishable do mesmo projeto.

Não use `service_role` nem chaves secretas. Copie `.env.example` para `.env.local` para desenvolvimento local. O arquivo de configuração público é gerado somente no diretório `dist/` durante o build; `.env.local` e `dist/` estão ignorados pelo Git. O build falha se as variáveis não estiverem definidas.

O projeto Vercel deve apontar para este repositório e executar `node scripts/build.mjs`, publicando `dist/` (já indicado em `vercel.json`). O painel fica em `https://SEU-DOMINIO/admin.html`. Defina o domínio como Site URL/URL de redirecionamento permitido no Supabase Auth se a configuração de Auth do projeto solicitar esses endereços.

## Portfólio e mídias

`supabase/migrations/20261024221000_portfolio_media.sql` cria e popula a tabela `portfolio_media` com as imagens e os vídeos já usados no site. A migração cria o bucket público `portfolio-media` para os novos arquivos; o acesso público é somente para leitura, e as políticas RLS de upload, alteração e remoção consultam `availability_admins`.

No painel `/admin.html`, a área **Imagens e vídeos do portfólio** permite adicionar arquivos a Experiências, Galeria e Vídeos, editar título/descrição e remover registros. Experiências e Galeria recebem imagens; Vídeos aceita imagens, MP4 e WebM. O limite é 50 MB por arquivo. O público vê prévias na página inicial e usa **Ver mais** para abrir todas as mídias do tópico. A descrição aparece no visualizador quando a mídia é aberta.

A idade e altura exibidas na seção Sobre são configuradas diretamente no HTML da página inicial. Atualize esses dados no código quando forem alterados.

## Desenvolvimento

Copie `.env.example` para `.env.local`, substitua os valores de exemplo pelas credenciais públicas do projeto e execute `node scripts/build.mjs`. Sirva o conteúdo de `dist/` por um servidor HTTP local para testar; abrir `index.html` diretamente como arquivo não fornece o módulo de configuração gerado.

A agenda consulta o banco sempre que o mês muda, quando a página volta ao foco e a cada minuto. Durante carregamento ou falha, os dias ficam em estado desconhecido e não são apresentados como livres.
