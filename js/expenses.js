/* Expenses view — lista agrupada por día, búsqueda, filtros, selección múltiple */

const Expenses = {
  _PAGE:        40,
  _limit:       40,
  _sortField:   'date',
  _sortDir:     'desc',
  _filters:     {},
  _text:        '',
  _type:        '',      // '' | 'real' | 'planned'
  _selecting:   false,
  _selectedIds: new Set(),

  _SORT_LABELS: {
    date:     { desc: 'Recientes',   asc: 'Antiguos' },
    amount:   { desc: 'Mayor monto', asc: 'Menor monto' },
    category: { asc: 'Categoría A–Z', desc: 'Categoría Z–A' }
  },

  /* ---------- Init ---------- */

  init() {
    // Búsqueda en vivo
    let searchTimer;
    document.getElementById('filter-text').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this._text  = e.target.value.trim().toLowerCase();
        this._limit = this._PAGE;
        this.render();
      }, 180);
    });
    document.getElementById('filter-text').addEventListener('keydown', e => {
      if (e.key === 'Enter') e.target.blur();
    });

    // Todos / Realizados / Previstos
    document.querySelectorAll('#type-segment button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#type-segment button').forEach(b => b.classList.toggle('active', b === btn));
        this._type  = btn.dataset.type;
        this._limit = this._PAGE;
        this.render();
      });
    });

    // Hoja de filtros
    document.getElementById('btn-toggle-filters').addEventListener('click', () => {
      this._syncFilterForm();
      UI.openModal('modal-filters');
    });
    document.querySelectorAll('#sort-field-segment button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#sort-field-segment button').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
    document.getElementById('btn-apply-filters').addEventListener('click', () => {
      this._filters = this._readFilters();
      const sortBtn = document.querySelector('#sort-field-segment button.active');
      const field   = sortBtn ? sortBtn.dataset.sort : 'date';
      if (field !== this._sortField) {
        this._sortField = field;
        this._sortDir   = field === 'category' ? 'asc' : 'desc';
      }
      this._limit = this._PAGE;
      UI.closeModal('modal-filters');
      this.render();
    });
    document.getElementById('btn-reset-filters').addEventListener('click', () => {
      this._clearFilterForm();
      this._filters   = {};
      this._sortField = 'date';
      this._sortDir   = 'desc';
      this._limit     = this._PAGE;
      UI.closeModal('modal-filters');
      this.render();
    });

    // Dirección de orden
    document.getElementById('btn-sort-dir').addEventListener('click', () => {
      this._sortDir = this._sortDir === 'desc' ? 'asc' : 'desc';
      this.render();
    });

    document.getElementById('btn-load-more').addEventListener('click', () => {
      this._limit += this._PAGE;
      this.render();
    });

    // Tocar una fila: editar, o marcar si estamos en modo selección
    const list = document.getElementById('expenses-list');
    const onRow = row => {
      const id = row.dataset.id;
      if (this._selecting) {
        if (this._selectedIds.has(id)) this._selectedIds.delete(id); else this._selectedIds.add(id);
        row.classList.toggle('checked', this._selectedIds.has(id));
        this._syncBulkBar();
        return;
      }
      const exp = this._lastAll.find(e => e.id === id);
      if (exp) UI.openExpenseModal(exp);
    };
    list.addEventListener('click', e => {
      const row = e.target.closest('.tx-row[data-id]');
      if (row) onRow(row);
    });
    list.addEventListener('keydown', e => {
      const row = e.target.closest('.tx-row[data-id]');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRow(row); }
    });

    // Modo selección
    document.getElementById('btn-select-mode').addEventListener('click', () => this._setSelecting(!this._selecting));
    document.getElementById('btn-bulk-cancel').addEventListener('click', () => this._setSelecting(false));
    document.getElementById('btn-delete-selected').addEventListener('click', () => {
      const ids = [...this._selectedIds];
      if (!ids.length) return;
      UI.confirm(
        `¿Eliminar ${ids.length} gasto${ids.length !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`,
        async () => {
          try {
            await Data.deleteExpenses(ids);
            this._setSelecting(false);
            UI.toast(ids.length === 1 ? 'Gasto eliminado' : `${ids.length} gastos eliminados`, 'success');
            await this.render();
          } catch (err) {
            UI.toast('Error al eliminar: ' + (err.message || err), 'error');
          }
        }
      );
    });

    document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCSV());
    document.getElementById('btn-open-categories').addEventListener('click', () => Categories.open());

    this.refreshCategoryFilter();
  },

  _lastAll: [],

  /* ---------- Category filter options ---------- */

  async refreshCategoryFilter() {
    const select     = document.getElementById('filter-category');
    const categories = await Data.getCategories();
    const current    = select.value;
    select.innerHTML =
      '<option value="">Todas</option>' +
      categories.map(c => `<option value="${c.id}">${UI._esc(c.name)}</option>`).join('');
    select.value = current;
  },

  /* ---------- Filtros ---------- */

  _readFilters() {
    return {
      dateFrom:   document.getElementById('filter-date-from').value,
      dateTo:     document.getElementById('filter-date-to').value,
      categoryId: document.getElementById('filter-category').value,
      amountMin:  document.getElementById('filter-amount-min').value,
      amountMax:  document.getElementById('filter-amount-max').value
    };
  },

  _syncFilterForm() {
    const f = this._filters;
    document.getElementById('filter-date-from').value  = f.dateFrom   || '';
    document.getElementById('filter-date-to').value    = f.dateTo     || '';
    document.getElementById('filter-category').value   = f.categoryId || '';
    document.getElementById('filter-amount-min').value = f.amountMin  || '';
    document.getElementById('filter-amount-max').value = f.amountMax  || '';
    document.querySelectorAll('#sort-field-segment button').forEach(b => {
      b.classList.toggle('active', b.dataset.sort === this._sortField);
    });
  },

  _clearFilterForm() {
    ['filter-date-from', 'filter-date-to', 'filter-amount-min', 'filter-amount-max', 'filter-category']
      .forEach(id => { document.getElementById(id).value = ''; });
  },

  _activeFilterCount() {
    return Object.values(this._filters).filter(Boolean).length;
  },

  _applyFilters(expenses) {
    const f = this._filters;
    const text = this._text;
    return expenses.filter(e => {
      if (f.dateFrom   && e.date < f.dateFrom) return false;
      if (f.dateTo     && e.date > f.dateTo)   return false;
      if (f.categoryId && e.categoryId !== f.categoryId) return false;
      if (f.amountMin  && e.amount < UI.parseMoney(f.amountMin)) return false;
      if (f.amountMax  && e.amount > UI.parseMoney(f.amountMax)) return false;
      if (text && !(e.description || '').toLowerCase().includes(text)) return false;
      if (this._type === 'planned' && !e.isPlanned) return false;
      if (this._type === 'real'    &&  e.isPlanned) return false;
      return true;
    });
  },

  _sortExpenses(expenses, catNameMap = {}) {
    const dir = this._sortDir === 'desc' ? -1 : 1;
    return [...expenses].sort((a, b) => {
      let va, vb;
      if (this._sortField === 'amount') {
        va = a.amount; vb = b.amount;
      } else if (this._sortField === 'category') {
        va = (catNameMap[a.categoryId] || '').toLowerCase();
        vb = (catNameMap[b.categoryId] || '').toLowerCase();
      } else {
        va = a.date; vb = b.date;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return  1 * dir;
      return b.createdAt - a.createdAt;
    });
  },

  async _getFiltered() {
    const [expenses, categories] = await Promise.all([Data.getExpenses(), Data.getCategories()]);
    const catNameMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    return this._sortExpenses(this._applyFilters(expenses), catNameMap);
  },

  async exportCSV() {
    const filtered = await this._getFiltered();
    if (!filtered.length) { UI.toast('No hay gastos para exportar', 'error'); return; }
    await Export.toCSV(filtered);
    UI.toast('CSV exportado', 'success');
  },

  /* ---------- Render ---------- */

  async render() {
    const [allExpenses, categories, accounts] = await Promise.all([
      Data.getExpenses(), Data.getCategories(), Data.getAccounts()
    ]);
    this._lastAll = allExpenses;
    const catMap     = Object.fromEntries(categories.map(c => [c.id, c]));
    const accMap     = Object.fromEntries(accounts.map(a => [a.id, a]));
    const catNameMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    const filtered = this._sortExpenses(this._applyFilters(allExpenses), catNameMap);
    const total    = filtered.length;
    const sum      = filtered.reduce((s, e) => s + e.amount, 0);

    document.getElementById('list-count').textContent = `${total} gasto${total !== 1 ? 's' : ''}`;
    document.getElementById('list-total').textContent = Data.formatAmount(sum);
    document.getElementById('sort-label').textContent = this._SORT_LABELS[this._sortField][this._sortDir];
    document.getElementById('filters-dot').style.display = this._activeFilterCount() ? '' : 'none';
    document.getElementById('btn-toggle-filters').classList.toggle('active', this._activeFilterCount() > 0);
    this._renderFilterChips(catMap);

    // Quitar de la selección los que ya no existen
    const ids = new Set(allExpenses.map(e => e.id));
    [...this._selectedIds].forEach(id => { if (!ids.has(id)) this._selectedIds.delete(id); });
    this._syncBulkBar();

    const container = document.getElementById('expenses-list');
    const emptyEl   = document.getElementById('expenses-empty');
    const moreBtn   = document.getElementById('btn-load-more');
    document.getElementById('list-header').style.display = allExpenses.length ? '' : 'none';
    document.getElementById('btn-select-mode').style.display = allExpenses.length ? '' : 'none';

    if (total === 0) {
      container.innerHTML   = '';
      moreBtn.style.display = 'none';
      emptyEl.style.display = 'block';
      const hasData = allExpenses.length > 0;
      document.getElementById('expenses-empty-title').textContent = hasData ? 'Sin resultados' : 'Sin gastos registrados';
      document.getElementById('expenses-empty-text').textContent  = hasData
        ? 'Prueba con otra búsqueda o limpia los filtros.'
        : 'Toca el botón + para agregar tu primer gasto.';
      return;
    }
    emptyEl.style.display = 'none';

    const visible = filtered.slice(0, this._limit);
    container.classList.toggle('selecting', this._selecting);
    container.innerHTML = this._groupsHTML(visible, filtered, catMap, accMap);

    const remaining = total - visible.length;
    moreBtn.style.display = remaining > 0 ? '' : 'none';
    moreBtn.textContent   = `Mostrar más (${remaining} restante${remaining !== 1 ? 's' : ''})`;
  },

  // Agrupa por día cuando se ordena por fecha; si no, una sola lista
  _groupsHTML(visible, filtered, catMap, accMap) {
    if (this._sortField !== 'date') {
      return `<div class="list-group">${visible.map(e => this.rowHTML(e, catMap, accMap, { showDate: true })).join('')}</div>`;
    }
    const keyOf = e => e.isPlanned ? `p:${e.date.slice(0, 7)}` : e.date;
    // Totales del grupo sobre todos los filtrados, no solo los visibles
    const totals = {};
    filtered.forEach(e => { totals[keyOf(e)] = (totals[keyOf(e)] || 0) + e.amount; });

    const groups = [];
    visible.forEach(e => {
      const key = keyOf(e);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(e);
      else groups.push({ key, items: [e] });
    });

    return groups.map(g => {
      const label = g.key.startsWith('p:')
        ? `Previsto · ${UI.monthLabel(g.key.slice(2))}`
        : UI.dayLabel(g.key);
      return `
        <div class="tx-group-label"><span>${label}</span><span class="tx-group-total">${Data.formatAmount(totals[g.key])}</span></div>
        <div class="list-group">${g.items.map(e => this.rowHTML(e, catMap, accMap)).join('')}</div>`;
    }).join('');
  },

  /* ---------- Fila (también la usa el Dashboard) ---------- */

  rowHTML(e, catMap, accMap, { showDate = false } = {}) {
    const cat   = catMap[e.categoryId];
    const acc   = e.accountId ? accMap[e.accountId] : null;
    const color = cat ? cat.color : '#94a3b8';
    const title = e.description || (cat ? cat.name : 'Gasto');

    const sub = [];
    if (e.description && cat) sub.push(`<span>${UI._esc(cat.name)}</span>`);
    if (acc) sub.push(`<span>${UI._esc(acc.name)}</span>`);
    if (showDate && !e.isPlanned) sub.push(`<span>${UI.dayLabel(e.date)}</span>`);
    const subHTML = sub.join('<span aria-hidden="true">·</span>');
    // Dentro de su grupo ("Previsto · Diciembre 2026") basta con "Previsto"; en listas planas va el mes
    const badge = e.isPlanned
      ? `<span class="planned-badge">Previsto${showDate ? ' ' + e.date.slice(0, 7).split('-').reverse().join('/') : ''}</span>`
      : '';

    const checked = this._selectedIds.has(e.id) ? ' checked' : '';
    return `
      <div class="tx-row${e.isPlanned ? ' tx-planned' : ''}${checked}" data-id="${e.id}" role="button" tabindex="0">
        <span class="tx-check">${UI.icon('check')}</span>
        ${UI.txIcon(color, UI.initial(cat ? cat.name : title))}
        <div class="tx-main">
          <div class="tx-title">${UI._esc(title)}</div>
          <div class="tx-sub">${badge}${subHTML}</div>
        </div>
        <div class="tx-amount">${Data.formatAmount(e.amount)}</div>
      </div>`;
  },

  /* ---------- Chips de filtros activos ---------- */

  _renderFilterChips(catMap) {
    const f = this._filters;
    const chips = [];
    if (f.categoryId) chips.push(['categoryId', catMap[f.categoryId] ? catMap[f.categoryId].name : 'Categoría']);
    if (f.dateFrom)   chips.push(['dateFrom', `Desde ${Data.formatDate(f.dateFrom)}`]);
    if (f.dateTo)     chips.push(['dateTo', `Hasta ${Data.formatDate(f.dateTo)}`]);
    if (f.amountMin)  chips.push(['amountMin', `≥ $${f.amountMin}`]);
    if (f.amountMax)  chips.push(['amountMax', `≤ $${f.amountMax}`]);

    const wrap = document.getElementById('active-filter-chips');
    wrap.innerHTML = chips.map(([key, label]) => `
      <span class="filter-chip">${UI._esc(label)}
        <button class="filter-chip-x" data-key="${key}" aria-label="Quitar filtro">${UI.icon('x')}</button>
      </span>`).join('');
    wrap.querySelectorAll('.filter-chip-x').forEach(btn => {
      btn.addEventListener('click', () => {
        delete this._filters[btn.dataset.key];
        this._limit = this._PAGE;
        this.render();
      });
    });
  },

  /* ---------- Selección múltiple ---------- */

  _setSelecting(on) {
    this._selecting = on;
    if (!on) this._selectedIds.clear();
    document.body.classList.toggle('is-selecting', on);
    document.getElementById('btn-select-mode').textContent = on ? 'Listo' : 'Seleccionar';
    const list = document.getElementById('expenses-list');
    list.classList.toggle('selecting', on);
    list.querySelectorAll('.tx-row.checked').forEach(r => { if (!on) r.classList.remove('checked'); });
    this._syncBulkBar();
  },

  _syncBulkBar() {
    const n = this._selectedIds.size;
    document.getElementById('bulk-bar').classList.toggle('show', this._selecting);
    document.getElementById('bulk-count').textContent = n === 0
      ? 'Toca para seleccionar'
      : `${n} seleccionado${n !== 1 ? 's' : ''}`;
    document.getElementById('btn-delete-selected').disabled = n === 0;
  }
};
