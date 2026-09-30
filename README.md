# Residencial das Américas — aplicativo local

## O que esta versão faz
- Funciona como aplicativo web instalável (PWA) em celular.
- Os cadastros ficam armazenados **no próprio aparelho**, usando IndexedDB.
- Cadastro e consulta de moradores.
- Foto do morador usando câmera ou galeria do celular.
- 31 blocos, com 8 apartamentos por bloco = 248 unidades.
- Apartamentos/unidades importados da estrutura da planilha.
- Veículos e vagas de garagem.
- 248 vagas privativas, 1 para cada unidade.
- 36 vagas extras pertencentes ao condomínio, com controle de disponível/alugada, unidade locatária, início/fim e observações.
- Busca por nome, profissão, telefone, apartamento, bloco, placa e vaga.
- PIN do administrador para confirmar inclusões, edições e exclusões.
- Pendências de correção com origem, assunto e descrição.
- Aviso visual/badge para alterações pendentes.
- Histórico de alterações confirmadas e recusadas.
- Backup exportado em arquivo JSON.

## Importante sobre o armazenamento local
Os dados ficam no navegador/app deste celular. Isso atende ao objetivo de manter a base no aparelho, mas significa que **não existe sincronização automática com outro celular ou computador** nesta versão.

Recomendação: fazer backup periódico do arquivo JSON e mantê-lo em local seguro. Fotos também são incluídas no backup.

## Instalação no celular
Para instalação como PWA, o projeto precisa ser servido por HTTPS (ou por um servidor local/ambiente de desenvolvimento). Em Android/Chrome, abra o endereço do aplicativo e use **Adicionar à tela inicial / Instalar aplicativo**.

Abrir `index.html` diretamente pelo gerenciador de arquivos é suficiente para testar a interface, mas normalmente não permite todos os recursos de instalação PWA porque o service worker exige um contexto seguro.

## Primeira utilização
1. Abra o aplicativo.
2. No primeiro acesso, crie um PIN de administrador com pelo menos 4 dígitos.
3. Faça os cadastros normalmente.
4. Ao salvar uma inclusão/edição/exclusão, o aplicativo pede o PIN para confirmar.
5. Em **Avisos e histórico**, acompanhe pendências e alterações.

## Estrutura da garagem
- Vagas privativas: 248.
- Vagas extras: 36.
- Cada locação de vaga extra exige confirmação do PIN do administrador.
- Encerramento de locação também exige confirmação do PIN.

## Próxima evolução recomendada
Caso o condomínio passe a precisar de portaria, administração e outros aparelhos trabalhando juntos, o projeto pode evoluir para banco de dados central + sincronização + permissões por perfil. Nesse cenário, o administrador continuará sendo a autoridade para aprovar alterações, e poderão ser enviadas notificações para o celular.
