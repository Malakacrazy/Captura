# Decorafit · Orçamento FF&E

Extensão Chrome para designers de interiores capturarem produtos de lojas online brasileiras e gerarem orçamentos profissionais em PDF e Excel.

## O que faz

A extensão injeta um botão flutuante **"⊕ Orçamento"** em todas as páginas. Nas páginas de produto das lojas suportadas, extrai automaticamente nome, marca, SKU, preço e imagem do item. Os produtos capturados são organizados por categoria em uma interface popup e podem ser exportados como orçamento A4 em PDF ou planilha Excel com a identidade visual da Decorafit. Os projetos podem ser salvos em uma biblioteca local e recarregados a qualquer momento.

## Funcionalidades

- Captura de produtos com um clique em mais de 18 lojas brasileiras
- Extração automática de nome, marca, SKU, preço e imagem
- Detecção inteligente de categoria pelo nome do produto
- Interface popup com controle de quantidade por item e formulário de entrada manual
- Total do orçamento calculado em tempo real, agrupado por categoria
- Geração de PDF profissional (A4, multipáginas, identidade Decorafit)
- Exportação para Excel (.xlsx) com cabeçalho personalizado, cores alternadas por linha, subtotais por categoria e imagens dos produtos via fórmula `IMAGE()`
- Biblioteca de projetos: salvar, recarregar, renomear e excluir orçamentos anteriores

## Lojas suportadas

| Loja | Domínio |
|------|---------|
| Leroy Merlin | leroymerlin.com.br |
| Telhanorte | telhanorte.com.br |
| Obra Fácil | obrafacil.com.br |
| ABC Construção | abcconstrucao.com.br |
| Andra | andra.com.br |
| Inspire Home | inspirehome.com.br |
| Yamamura | yamamura.com.br |
| Bela Metais | belametais.com.br |
| Tok&Stok | tokstok.com.br |
| WestWing | westwing.com.br |
| Boobam | boobam.com.br |
| Camicado | camicado.com.br |
| Muma | muma.com.br |
| Dexco | dexco.com.br |
| Deca | deca.com.br |
| Electrolux | electrolux.com.br |
| FastShop | fastshop.com.br |
| Brastemp | brastemp.com.br |
| Samsung | samsung.com/br |

A extração também funciona em qualquer site por meio de JSON-LD, meta tags Open Graph e varredura de nós de texto como fallback.

## Instalação

1. Clone ou baixe este repositório.
2. Abra o Chrome e acesse `chrome://extensions/`.
3. Ative o **Modo do desenvolvedor** (botão no canto superior direito).
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `decorafit-ffe/` dentro do repositório.
6. O ícone da extensão aparece na barra de ferramentas do Chrome.

## Como usar

1. Clique no ícone da extensão e defina o **nome do projeto** (ex.: *Sala de estar – Cliente X*).
2. Navegue até a página de um produto em qualquer loja suportada.
3. Clique no botão **⊕ Orçamento** que aparece no canto inferior direito da página.
4. O produto é capturado e adicionado automaticamente à lista no popup.
5. No popup, ajuste **categoria**, **quantidade** ou qualquer outro campo conforme necessário.
6. Repita para todos os produtos da especificação.
7. Clique em **Gerar PDF** para abrir o orçamento pronto para impressão em uma nova aba.
   - Na página de impressão, clique em **Salvar Excel** para baixar a planilha `.xlsx` com o mesmo orçamento.
8. Clique em **📂** para abrir a biblioteca de projetos, onde é possível salvar, recarregar ou excluir projetos.

## Categorias de produtos

| Chave | Rótulo |
|-------|--------|
| `revestimentos` | Revestimentos |
| `loucas-metais` | Louças & Metais |
| `iluminacao` | Iluminação |
| `eletros` | Eletros |
| `moveis` | Móveis |
| `decoracao-enxoval` | Decoração e Enxoval |
| `outros` | Outros |

## Estrutura do projeto

```
decorafit-ffe/
├── manifest.json   # Manifesto da extensão (Manifest V3)
├── background.js   # Service worker — gerencia eventos do ciclo de vida da extensão
├── content.js      # Injetado em todas as páginas — botão flutuante e extração de produtos
├── content.css     # Estilos do botão flutuante e notificações toast
├── popup.html      # Markup da interface popup
├── popup.js        # Lógica do popup — lista de produtos, entrada manual, totais, geração de PDF
├── print.html      # Template do PDF
├── print.js        # Renderização do PDF e exportação Excel — carrega produtos, formata o orçamento e gera o .xlsx
├── library.html    # Markup da interface da biblioteca de projetos
├── library.js      # Lógica da biblioteca — salvar, carregar, renomear e excluir projetos
└── icons/          # Ícones da extensão (16 × 16, 48 × 48, 128 × 128)
```

## Tecnologias

- **Vanilla JavaScript** (ES6+), HTML5, CSS3 — sem ferramentas de build ou bundlers
- **Chrome Extension Manifest V3** — service worker, content scripts, Storage API
- **Chrome Storage API** — persiste produtos e projetos localmente no navegador
- **Engine OOXML/ZIP customizada** — arquivos `.xlsx` gerados inteiramente em JS, sem bibliotecas externas (container ZIP, CRC-32, partes OOXML, fórmula `IMAGE()` do Excel para miniaturas dos produtos)
- **Google Fonts** — Cormorant Garamond, Jost, Poppins
