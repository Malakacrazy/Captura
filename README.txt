============================================================
  DECORAFIT · ORCAMENTO FF&E
  Extensao Chrome para Arquitetos e Designers de Interiores
============================================================

O QUE FAZ
---------
A extensao injeta dois botoes flutuantes em todas as paginas,
ativados pelo atalho Ctrl+. Nas paginas de produto das lojas
suportadas, extrai automaticamente nome, marca, SKU, preco e
imagem do item. Os produtos capturados sao organizados por
categoria em uma interface popup, podem ter ambiente e
observacoes associados, e sao exportados como orcamento A4
em PDF ou planilha Excel estruturada visualmente. Os projetos
sao salvos em uma biblioteca local e podem ser compartilhados
com outros usuarios via area de transferencia.


FUNCIONALIDADES
---------------
- Captura de produtos com um clique em mais de 18 lojas brasileiras
- Extracao automatica de nome, marca, SKU, preco, imagem e unidade
- Deteccao inteligente de categoria pelo nome do produto (7 categorias)
- Botao flutuante [+] Orcamento para captura direta na pagina do produto
- Botao flutuante [Abrir Projeto] para abrir o popup como overlay na pagina
- Atalho Ctrl+. para mostrar/ocultar os botoes flutuantes (estado persistido)
- Interface popup com controle de quantidade, unidade de medida e entrada manual
- Total do orcamento em tempo real, agrupado por categoria
- Exportacao PDF profissional (A4, multipaginas, identidade Decorafit)
  Colunas: Produto | Ambiente | Observacoes | Qtd | Subtotal
- Exportacao Excel (.xlsx) com estrutura visual identica ao PDF:
  cabecalho com logo, cards de resumo, secoes coloridas por categoria,
  cabecalhos em azul escuro, subtotais e URL dos produtos
- Biblioteca de projetos: salvar, carregar, renomear, excluir e expandir itens
- Itens editaveis na biblioteca: nome, unidade, ambiente (dropdown) e observacoes
- Compartilhar projeto via clipboard (copia JSON) — outro usuario cola e importa
- Importar projeto copiado de outro usuario com um clique


LOJAS SUPORTADAS
----------------
  Leroy Merlin        leroymerlin.com.br
  Telhanorte          telhanorte.com.br
  Obra Facil          obrafacil.com.br
  ABC da Construcao   abcdaconstrucao.com.br
  Andra               andra.com.br
  Inspire Home        inspirehome.com.br
  Yamamura            yamamura.com.br
  Bela Metais         belametais.com.br
  Tok&Stok            tokstok.com.br
  WestWing            westwing.com.br
  Boobam              boobam.com.br
  Camicado            camicado.com.br
  Muma                muma.com.br
  Dexco               dexco.com.br
  Deca                deca.com.br
  Electrolux          electrolux.com.br
  FastShop            fastshop.com.br
  Brastemp            brastemp.com.br
  Samsung             samsung.com/br

A extracao tambem funciona em qualquer site via JSON-LD,
meta tags Open Graph e varredura de texto como fallback.


INSTALACAO
----------
1. Baixe ou clone este repositorio.
2. Abra o Chrome e acesse: chrome://extensions/
3. Ative o "Modo do desenvolvedor" (canto superior direito).
4. Clique em "Carregar sem compactacao".
5. Selecione a pasta decorafit-ffe/ dentro do repositorio.
6. O icone da extensao aparece na barra de ferramentas do Chrome.


COMO USAR
---------
1. Clique no icone da extensao e defina o nome do projeto.
   Ex.: "Sala de estar - Cliente X"

2. Pressione Ctrl+. para exibir os botoes flutuantes nas paginas.

3. Navegue ate a pagina de um produto e clique em [+] Orcamento.
   O produto e adicionado automaticamente a lista.

4. Ajuste categoria, quantidade ou unidade de medida no popup.
   Use [+ Manual] para adicionar itens sem site.

5. Clique em [Abrir Projeto] (botao escuro) para abrir o popup
   como overlay sem sair da pagina da loja.

6. Repita para todos os produtos da especificacao.

7. Clique em [📂] para abrir a Biblioteca de Projetos:

   - Salve o orcamento como projeto nomeado
   - Expanda cada projeto para editar nome, unidade,
     ambiente e observacoes de cada item
   - [Exportar PDF]   — gera o orcamento em PDF
   - [Exportar Excel] — gera a planilha .xlsx
   - [Compartilhar]   — copia o projeto para a area de transferencia
                        Envie o texto por WhatsApp, email ou chat
   - [Importar Projeto] — cola e importa um projeto recebido


CATEGORIAS DE PRODUTOS
----------------------
  revestimentos      Revestimentos
  loucas-metais      Loucas & Metais
  iluminacao         Iluminacao e Eletrica
  eletros            Eletros
  moveis             Moveis
  decoracao-enxoval  Decoracao e Enxoval
  outros             Outros


ESTRUTURA DE ARQUIVOS
---------------------
  decorafit-ffe/
  |-- manifest.json        Manifesto da extensao (Manifest V3)
  |-- background.js        Service worker — ciclo de vida e orquestracao da captura
  |-- extractor.js         Raspagem da pagina de produto (injetada sob demanda)
  |-- categories.js        Taxonomia e classificacao de categorias (compartilhado)
  |-- content.js           Injetado em todas as paginas — botoes flutuantes e overlay
  |-- content.css          Estilos dos botoes, iframe overlay e toasts
  |-- popup.html           Interface popup (markup)
  |-- popup.js             Logica do popup — lista, entrada manual, exportacao
  |-- print.html           Template do PDF / Excel
  |-- print.js             Renderizacao do PDF e geracao do .xlsx
  |-- library.html         Interface da biblioteca (markup)
  |-- library.js           Logica da biblioteca — salvar, editar, compartilhar
  |-- logo-horizontal.png  Logo Decorafit usada no PDF
  |-- icons/               Icones da extensao (16x16, 48x48, 128x128)


TECNOLOGIAS
-----------
- Vanilla JavaScript (ES6+), HTML5, CSS3
  Sem ferramentas de build ou bundlers

- Chrome Extension Manifest V3
  Service worker, content scripts, Storage API

- Chrome Storage API
  Persiste produtos, projetos e estado dos botoes localmente

- Clipboard API
  Compartilhamento e importacao de projetos via area de transferencia

- Engine OOXML/ZIP customizada
  Arquivos .xlsx gerados inteiramente em JS, sem bibliotecas externas
  (container ZIP, CRC-32, partes OOXML, formula IMAGE() para miniaturas)

- Google Fonts — Montserrat


============================================================
  decorafit.com.br
============================================================
