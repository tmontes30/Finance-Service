/* Categories — hoja de gestión (se abre desde Ajustes o desde Gastos en escritorio) */

const Categories = {

  init() {
    // Fila "Categorías" dentro de Ajustes
    document.getElementById('btn-toggle-categories').addEventListener('click', () => this.open());

    const nameInp = document.getElementById('new-cat-name');
    const errorEl = document.getElementById('cat-form-error');

    const trySave = async () => {
      const name  = nameInp.value.trim();
      const color = document.getElementById('new-cat-color').value;
      if (!name) {
        errorEl.textContent   = 'Escribe un nombre para la categoría';
        errorEl.style.display = 'block';
        nameInp.focus();
        return;
      }
      const cats = await Data.getCategories();
      if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
        errorEl.textContent   = 'Ya existe una categoría con ese nombre';
        errorEl.style.display = 'block';
        nameInp.focus();
        return;
      }
      const newCat = await Data.addCategory(name, color);
      nameInp.value         = '';
      errorEl.style.display = 'none';
      await this.render();
      await Expenses.refreshCategoryFilter();
      if (newCat && newCat.color.toLowerCase() !== color.toLowerCase()) {
        UI.toast('Ese color ya estaba en uso: se asignó otro', 'info');
      }
      UI.toast('Categoría creada', 'success');
    };

    document.getElementById('btn-save-category').addEventListener('click', trySave);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); trySave(); } });

    // Acciones en filas (delegación)
    document.getElementById('categories-list').addEventListener('click', e => {
      const edit = e.target.closest('.btn-cat-edit');
      const del  = e.target.closest('.btn-cat-delete');
      if (edit) this._startEdit(edit.dataset.id);
      if (del)  this._delete(del.dataset.id);
    });
  },

  async open() {
    UI.openModal('modal-categories');
    await this.render();
  },

  async updateCount() {
    const cats  = await Data.getCategories();
    const badge = document.getElementById('categories-count-badge');
    if (badge) badge.textContent = cats.length;
  },

  async render() {
    const [categories, expenses] = await Promise.all([Data.getCategories(), Data.getExpenses()]);
    const countMap = {};
    expenses.forEach(e => { countMap[e.categoryId] = (countMap[e.categoryId] || 0) + 1; });
    this._countMap = countMap;

    const badge = document.getElementById('categories-count-badge');
    if (badge) badge.textContent = categories.length;

    document.getElementById('categories-list').innerHTML = categories.map(cat => {
      const count = countMap[cat.id] || 0;
      return `
        <div class="tx-row cat-row" id="cat-item-${cat.id}">
          ${UI.txIcon(cat.color, UI.initial(cat.name))}
          <div class="tx-main" id="cat-main-${cat.id}">
            <div class="tx-title">${UI._esc(cat.name)}</div>
            <div class="cat-count">${count} gasto${count !== 1 ? 's' : ''}${cat.isPredefined ? ' · predefinida' : ''}</div>
          </div>
          <button class="row-icon-btn btn-cat-edit" data-id="${cat.id}" aria-label="Editar ${UI._esc(cat.name)}">${UI.icon('pencil')}</button>
          ${!cat.isPredefined
            ? `<button class="row-icon-btn danger btn-cat-delete" data-id="${cat.id}" aria-label="Eliminar ${UI._esc(cat.name)}">${UI.icon('trash')}</button>`
            : ''}
        </div>`;
    }).join('');
  },

  _delete(id) {
    Data.getCategoryById(id).then(cat => {
      if (!cat) return;
      const count = (this._countMap || {})[id] || 0;
      if (count > 0) {
        UI.toast(`No se puede eliminar "${cat.name}": tiene ${count} gasto${count !== 1 ? 's' : ''} asociado${count !== 1 ? 's' : ''}`, 'error');
        return;
      }
      UI.confirm(`¿Eliminar la categoría "${cat.name}"?`, async () => {
        await Data.deleteCategory(cat.id);
        await this.render();
        await Expenses.refreshCategoryFilter();
        UI.toast('Categoría eliminada', 'success');
      });
    });
  },

  async _startEdit(id) {
    const cat = await Data.getCategoryById(id);
    if (!cat) return;
    const main = document.getElementById(`cat-main-${id}`);
    const item = document.getElementById(`cat-item-${id}`);
    item.querySelectorAll('.row-icon-btn').forEach(b => { b.style.display = 'none'; });

    main.innerHTML = `
      <div class="cat-edit-row">
        <label class="color-dot-input" aria-label="Color"><input type="color" id="edit-color-${id}" value="${cat.color}"></label>
        <input type="text" class="form-input" id="edit-name-${id}" value="${UI._esc(cat.name)}" maxlength="50" enterkeyhint="done">
        <button class="row-icon-btn" id="btn-cat-save-${id}" aria-label="Guardar">${UI.icon('check')}</button>
        <button class="row-icon-btn" id="btn-cat-cancel-${id}" aria-label="Cancelar">${UI.icon('x')}</button>
      </div>`;

    const colorInp = document.getElementById(`edit-color-${id}`);
    const icon     = item.querySelector('.tx-icon');
    colorInp.addEventListener('input', () => {
      icon.style.background = colorInp.value + '22';
      icon.style.color      = colorInp.value;
    });

    const nameInp = document.getElementById(`edit-name-${id}`);
    nameInp.focus();
    nameInp.select();

    const doSave = async () => {
      const newName  = nameInp.value.trim();
      const newColor = colorInp.value;
      if (!newName) { UI.toast('El nombre no puede estar vacío', 'error'); return; }
      const cats = await Data.getCategories();
      if (cats.find(c => c.id !== id && c.name.toLowerCase() === newName.toLowerCase())) {
        UI.toast('Ya existe una categoría con ese nombre', 'error'); return;
      }
      const updated = await Data.updateCategory(id, newName, newColor);
      await this.render();
      await Expenses.refreshCategoryFilter();
      if (updated && updated.color.toLowerCase() !== newColor.toLowerCase()) {
        UI.toast('Ese color ya estaba en uso: se asignó otro', 'info');
      }
      UI.toast('Categoría actualizada', 'success');
      Router.refresh();
    };

    document.getElementById(`btn-cat-save-${id}`).addEventListener('click', doSave);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
    document.getElementById(`btn-cat-cancel-${id}`).addEventListener('click', () => this.render());
  }
};
