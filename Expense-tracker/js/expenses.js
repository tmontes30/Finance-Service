/* Expenses view — list, filters, sorting, pagination, edit/delete */

const Expenses = {
  _page:        1,
  _pageSize:    20,
  _sortField:   'date',
  _sortDir:     'desc',
  _filters:     {},
  _selectedIds: new Set(),

  /* ---------- Init ---------- */

  init() {
    document.getElementById('btn-toggle-filters').addEventListener('click', () => {
      const panel = document.getElementById('filter-panel');
      const open  = panel.style.display === 'none' || panel.style.display === '';
      panel.style.display = open ? 'block' : 'none';
    });

    document.getElementById('btn-apply-filters').addEventListener('click', async () => {
      this._filters = this._readFilters();
      this._page    = 1;
      this._selectedIds.clear();
      await this.render();
    });

    document.getElementById('btn-reset-filters').addEventListener('click', async () => {
      ['filter-date-from', 'filter-date-to', 'filter-text',
       'filter-amount-min', 'filter-amount-max'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('filter-category').value = '';
      this._filters = {};
      this._page    = 1;
      this._selectedIds.clear();
      await this.render();
    });

    document.getElementById('sort-field').addEventListener('change', async e => {
      this._sortField = e.target.value;
      this._page      = 1;
      await this.render();
    });

    document.getElementById('btn-sort-dir').addEventListener('click', async () => {
      this._sortDir = this._sortDir === 'desc' ? 'asc' : 'desc';
      document.getElementById('btn-sort-dir').textContent =
        this._sortDir === 'desc' ? '↓' : '↑';
      this._page = 1;
      await this.render();
    });

    document.getElementById('btn-prev').addEventListener('click', async () => {
      if (this._page > 1) { this._page--; await this.render(); }
    });

    document.getElementById('btn-next').addEventListener('click', async () => {
      const filtered = await this._getFiltered();
      const pages    = Math.ceil(filtered.length / this._pageSize);
      if (this._page < pages) { this._page++; await this.render(); }
    });

    document.getElementById('btn-export-csv').addEventListener('click', async () => {
      const filtered = await this._getFiltered();
      if (!filtered.length) { UI.toast('No hay gastos para exportar', 'error'); return; }
      await Export.toCSV(filtered);
      UI.toast('CSV exportado correctamente', 'success');
    });

    document.getElementById('btn-delete-selected').addEventListener('click', () => {
      const ids = [...this._selectedIds];
      if (!ids.length) return;
      UI.confirm(
        `¿Eliminar ${ids.length} gasto${ids.length !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`,
        async () => {
          await Data.deleteExpenses(ids);
          this._selectedIds.clear();
          await this.render();
          await Dashboard.render();
          UI.toast('Gastos eliminados', 'success');
        }
      );
    });

    this.refreshCategoryFilter();
  },

  /* ---------- Category filter options ---------- */

  async refreshCategoryFilter() {
    await this._populateCategoryFilter();
  },

  async _populateCategoryFilter() {
    const select     = document.getElementById('filter-category');
    const categories = await Data.getCategories();
    select.innerHTML =
      '<option value="">Todas</option>' +
      categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  },

  /* ---------- Read filter form ---------- */

  _readFilters() {
    return {
      dateFrom:   document.getElementById('filter-date-from').value,
      dateTo:     document.getElementById('filter-date-to').value,
      categoryId: document.getElementById('filter-category').value,
      amountMin:  document.getElementById('filter-amount-min').value,
      amountMax:  document.getElementById('filter-amount-max').value,
      text:       document.getElementById('filter-text').value.trim().toLowerCase()
    };
  },

  /* ---------- Pure filter function ---------- */

  _applyFilters(expenses, f) {
    return expenses.filter(e => {
      if (f.dateFrom   && e.date < f.dateFrom) return false;
      if (f.dateTo     && e.date > f.dateTo)   return false;
      if (f.categoryId && e.categoryId !== f.categoryId) return false;
      if (f.amountMin  && e.amount < parseFloat(f.amountMin)) return false;
      if (f.amountMax  && e.amount > parseFloat(f.amountMax)) return false;
      if (f.text && !(e.description || '').toLowerCase().includes(f.text)) return false;
      return true;
    });
  },

  /* ---------- Sort (catMap passed in to avoid duplicate fetch) ---------- */

  _sortExpenses(expenses, catMap = {}) {
    const dir = this._sortDir === 'desc' ? -1 : 1;
    return [...expenses].sort((a, b) => {
      let va, vb;
      if (this._sortField === 'amount') {
        va = a.amount; vb = b.amount;
      } else if (this._sortField === 'category') {
        va = (catMap[a.categoryId] || '').toLowerCase();
        vb = (catMap[b.categoryId] || '').toLowerCase();
      } else {
        va = a.date; vb = b.date;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return  1 * dir;
      return b.createdAt - a.createdAt;
    });
  },

  /* ---------- Combined (async) ---------- */

  async _getFiltered() {
    const [expenses, categories] = await Promise.all([
      Data.getExpenses(), Data.getCategories()
    ]);
    const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
    return this._sortExpenses(this._applyFilters(expenses, this._filters), catMap);
  },

  /* ---------- Render ---------- */

  async render() {
    const [allExpenses, categories, accounts] = await Promise.all([
      Data.getExpenses(), Data.getCategories(), Data.getAccounts()
    ]);
    const catMap     = Object.fromEntries(categories.map(c => [c.id, c]));
    const accMap     = Object.fromEntries(accounts.map(a => [a.id, a]));
    const catNameMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    const filtered = this._sortExpenses(this._applyFilters(allExpenses, this._filters), catNameMap);
    const total    = filtered.length;
    const pages    = Math.max(1, Math.ceil(total / this._pageSize));
    if (this._page > pages) this._page = pages;

    const start = (this._page - 1) * this._pageSize;
    const paged = filtered.slice(start, start + this._pageSize);

    const container  = document.getElementById('expenses-list');
    const emptyEl    = document.getElementById('expenses-empty');
    const pagination = document.getElementById('pagination');

    document.getElementById('list-count').textContent =
      `${total} gasto${total !== 1 ? 's' : ''}`;

    if (total === 0) {
      container.innerHTML      = '';
      emptyEl.style.display    = 'block';
      pagination.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';

    container.innerHTML = `
      <table class="expense-table">
        <thead>
          <tr>
            <th class="col-check"><input type="checkbox" id="select-all" title="Seleccionar todo"></th>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Cuenta</th>
            <th style="text-align:right">Monto</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          ${paged.map(e => this._rowHTML(e, catMap, accMap)).join('')}
        </tbody>
      </table>`;

    // Select-all
    const selectAll = document.getElementById('select-all');
    const allIds    = paged.map(e => e.id);
    selectAll.checked = allIds.length > 0 && allIds.every(id => this._selectedIds.has(id));

    selectAll.addEventListener('change', () => {
      allIds.forEach(id => {
        if (selectAll.checked) this._selectedIds.add(id);
        else                   this._selectedIds.delete(id);
      });
      container.querySelectorAll('.row-check').forEach(cb => { cb.checked = selectAll.checked; });
      this._syncDeleteBtn();
    });

    container.querySelectorAll('.row-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.id;
        if (cb.checked) this._selectedIds.add(id);
        else            this._selectedIds.delete(id);
        this._syncDeleteBtn();
        selectAll.checked = allIds.every(id => this._selectedIds.has(id));
      });
    });

    // Edit — use closure to avoid re-fetch
    container.querySelectorAll('.btn-edit').forEach(btn => {
      const expense = allExpenses.find(e => e.id === btn.dataset.id);
      btn.addEventListener('click', async () => {
        if (expense) await UI.openExpenseModal(expense);
      });
    });

    // Delete
    container.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        UI.confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.', async () => {
          await Data.deleteExpense(btn.dataset.id);
          this._selectedIds.delete(btn.dataset.id);
          await this.render();
          await Dashboard.render();
          UI.toast('Gasto eliminado', 'success');
        });
      });
    });

    // Pagination
    if (pages > 1) {
      pagination.style.display = 'flex';
      document.getElementById('page-info').textContent = `Página ${this._page} de ${pages}`;
      document.getElementById('btn-prev').disabled = this._page === 1;
      document.getElementById('btn-next').disabled = this._page === pages;
    } else {
      pagination.style.display = 'none';
    }
  },

  /* ---------- Row HTML ---------- */

  _rowHTML(e, catMap, accMap) {
    const cat     = catMap[e.categoryId];
    const acc     = e.accountId ? accMap[e.accountId] : null;
    const checked = this._selectedIds.has(e.id) ? 'checked' : '';
    const descHtml = e.description
      ? UI._esc(e.description)
      : `<span style="color:var(--color-text-muted);font-style:italic">Sin descripción</span>`;
    const accHtml  = acc
      ? `<span class="category-badge" style="background:${acc.color}22;color:${acc.color}">
           <span class="category-dot" style="background:${acc.color}"></span>${UI._esc(acc.name)}
         </span>`
      : `<span style="color:var(--color-text-muted)">—</span>`;

    return `
      <tr>
        <td class="col-check"><input type="checkbox" class="row-check" data-id="${e.id}" ${checked}></td>
        <td class="col-date" data-label="Fecha">${Data.formatDate(e.date)}</td>
        <td data-label="Descripción">${descHtml}</td>
        <td data-label="Categoría">${UI.categoryBadge(cat)}</td>
        <td data-label="Cuenta">${accHtml}</td>
        <td class="col-amount" data-label="Monto">${Data.formatAmount(e.amount)}</td>
        <td class="col-actions">
          <button class="btn-icon btn-edit" data-id="${e.id}" title="Editar">⚙️</button>
          <button class="btn-icon danger btn-delete" data-id="${e.id}" title="Eliminar">🗑️</button>
        </td>
      </tr>`;
  },

  /* ---------- Helpers ---------- */

  _syncDeleteBtn() {
    document.getElementById('btn-delete-selected').style.display =
      this._selectedIds.size > 0 ? 'inline-flex' : 'none';
  }
};
