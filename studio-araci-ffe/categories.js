// categories.js — Studio Araci FF&E · Taxonomia compartilhada
//
// Fonte ÚNICA das categorias e da lógica de classificação. Antes esta lógica
// existia duplicada em content.js e popup.js, e as duas cópias já haviam
// divergido (a de content.js classificava "lava-louças" como "outros", e as
// duas liam segmentos diferentes do breadcrumb). Qualquer ajuste de regex agora
// acontece em um lugar só.
//
// Carregado por:
//   • background.js  → importScripts('categories.js')
//   • popup.html / print.html → <script src="categories.js">
//
// Roda FORA da página capturada — recebe apenas strings já extraídas.

// Ordem canônica + rótulos de exibição. Usado nas abas do popup, nas seções do
// PDF e no agrupamento do Excel.
const STUDIO_ARACI_CATEGORIES = [
    { id: 'revestimentos', label: 'Revestimentos' },
    { id: 'loucas-metais', label: 'Louças e Metais' },
    { id: 'iluminacao', label: 'Iluminação e Elétrica' },
    { id: 'eletros', label: 'Eletros' },
    { id: 'moveis', label: 'Móveis' },
    { id: 'decoracao-enxoval', label: 'Decoração e Enxoval' },
    { id: 'outros', label: 'Outros' }
];

// Normaliza para comparação: minúsculas, sem acentos, pontuação virando espaço.
// O range ̀-ͯ é escrito com escapes (e não com os caracteres
// combinantes literais que estavam no código antigo) para o regex sobreviver a
// uma reconversão de encoding do arquivo.
function studioAraciNormalize(raw) {
    return String(raw || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ');
}

// Mapeia uma categoria bruta vinda do site (JSON-LD, meta tag ou breadcrumb)
// para um dos 7 ids internos. Retorna null quando não reconhece — o chamador
// então cai no palpite por nome de produto.
function studioAraciMapSiteCategory(raw) {
    if (!raw) return null;
    const c = studioAraciNormalize(raw);

    if (/revestimento|piso|porcelan|ceramic|azulejo|gres|pedra|granito|marmore|parquet|laminado|deck|pastilha|vinilico|carpete/.test(c))
        return 'revestimentos';
    if (/louca|sanitari|bacia|cuba|torneira|ducha|chuveiro|metal|hidraulic|registro|misturador|banheiro|box|banheira|sifao|mictorio|valvula/.test(c))
        return 'loucas-metais';
    if (/iluminac|luminaria|lampada|lustre|arandela|spot|pendente|led|eletric|interruptor|tomada|disjuntor|conduite|eletroduto|cabo|fio/.test(c))
        return 'iluminacao';
    if (/eletro|geladeira|refrigerador|fogao|forno|microondas|lavadora|secadora|lava.louca|lava.loca|ar condicionado|climatizador|ventilador|exaustor|coifa|cooktop|frigobar|freezer|adega|depurador/.test(c))
        return 'eletros';
    if (/movel|sofa|poltrona|mesa|cadeira|cama|colchao|armario|guarda.roupa|estante|rack|prateleira|aparador|buffet|escrivaninha|banco|pufe|cabeceira|comoda|sapateira|roupeiro|berco|beliche/.test(c))
        return 'moveis';
    if (/decor|tapete|quadro|almofada|cortina|persiana|espelho|toalha|cama.mesa|enxoval|roupa|vaso|planta|porta.retrato|relogio|difusor|aromatizador/.test(c))
        return 'decoracao-enxoval';
    return null;
}

// Palpite por palavra-chave no nome do produto. Fallback usado quando o site
// não informa categoria ou informa uma que não reconhecemos.
function studioAraciCategoryFromName(name) {
    const n = studioAraciNormalize(name);
    if (/piso|ceramic|porcelan|revestimento|argamassa|rejunte|tijolet|pedra|marmo|granito|parquet|laminado|deck|azulejo|gres|porcelanato|pastilha|cimento queimado|microcimento|vinilico|carpete/.test(n))
        return 'revestimentos';
    if (/vaso sanitario|bacia sanitaria|cuba|torneira|ducha|chuveiro|sifao|mictorio|valvula|box|banheira|fechadura|cadeado|registro|misturador|metalic|bide|saboneteira|papeleira|toalheiro|gancho|cabide de banheiro|kit banheiro|acessorio banheiro/.test(n))
        return 'loucas-metais';
    if (/luminaria|lampada|lustre|arandela|spot|trilho|pendente|led|plafon|interruptor|tomada|disjuntor|cabo eletric|fio eletric|quadro eletric|quadro de distribuicao|eletroduto|conduite|fita led|painel led|refletor|poste|balizador|sensor de presenca/.test(n))
        return 'iluminacao';
    if (/geladeira|refrigerador|fogao|forno|microondas|maquina de lavar|maquina de secar|lava.louca|lavadora|secadora|air fryer|aspirador|purificador|climatizador|ar condicionado|ventilador|exaustor|coifa|cooktop|frigobar|freezer|adega|depurador/.test(n))
        return 'eletros';
    if (/sofa|poltrona|mesa|cadeira|cama|colchao|armario|guarda.roupa|estante|rack|prateleira|criado.mudo|aparador|buffet|escrivaninha|banco|pufe|cabeceira|penteadeira|comoda|bau|painel|sapateira|roupeiro|berco|beliche/.test(n))
        return 'moveis';
    if (/tapete|quadro|almofada|cortina|persiana|espelho|toalha|lencol|fronha|edredom|travesseiro|enxoval|roupa de cama|vaso decorat|planta artificial|decoracao|objeto decorat|porta.retrato|relogio de parede|difusor|aromatizador/.test(n))
        return 'decoracao-enxoval';
    return 'outros';
}

// Classificação final: a categoria declarada pelo site tem prioridade sobre o
// palpite por nome, porque o site sabe onde catalogou o produto.
function studioAraciGuessCategory(name, siteCategory) {
    const mapped = studioAraciMapSiteCategory(siteCategory);
    if (mapped) return mapped;
    return studioAraciCategoryFromName(name);
}
