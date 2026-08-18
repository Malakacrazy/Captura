// library-ambientes.js — Studio Araci FF&E · Library Ambientes Autocomplete
// Handles environment ("Ambiente") datalist suggestions and string parsing.

const AMBIENTES_PADRAO = [
  'Cozinha', 'Lavanderia', 'Banheiros', 'Suíte Master', 'Suíte 2', 'Suíte 3',
  'Dormitório 1', 'Dormitório 2', 'Dormitório 3', 'Dormitório 4', 'Terraço', 'Sala'
];

let ambienteDatalist = null;

function ensureAmbienteDatalist() {
  if (!ambienteDatalist) {
    ambienteDatalist = document.createElement('datalist');
    ambienteDatalist.id = 'studio-araci-ambientes';
    document.body.appendChild(ambienteDatalist);
  }
  return ambienteDatalist;
}

function refreshAmbienteSuggestions() {
  const usados = new Set(AMBIENTES_PADRAO);
  projects.forEach(pr => (pr.products || []).forEach(p => {
    (Array.isArray(p.ambiente) ? p.ambiente : [p.ambiente])
      .forEach(a => { if (typeof a === 'string' && a.trim()) usados.add(a.trim()); });
  }));

  const dl = ensureAmbienteDatalist();
  dl.innerHTML = '';
  [...usados].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    dl.appendChild(opt);
  });
}

function parseAmbiente(texto) {
  return String(texto || '').split(',').map(s => s.trim()).filter(Boolean);
}
