/* Categories view — list, add, inline edit, delete */

const Categories = {

  /* ---------- Init ---------- */

  init() {
    const saveBtn = document.getElementById('btn-save-category');
    const nameInp = document.getElementById('new-cat-name');
    const errorEl = document.getElementById('cat-form-error');

    const trySave = async () => {
      const name  = nameInp.value.trim();
      const color = document.getElementById('new-cat-color').value;

      if (!name) {
        errorEl.textContent   = 'El nombre es requerido';
        errorEl.style.display = 'block';
        nameInp.focus();
        return;
      }

      const cats = await Data.getCategories();
      const duplicate = cats.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        errorEl.textContent   = 'Ya existe una categoría con ese nombre';
        errorEl.style.display = 'block';
        nameInp.focus();
        return;
      }

      const newCat = await Data.addCategory(name, color);
      nameInp.value                                   = '';
      document.getElementById('new-cat-color').value = '#6366f1';
      errorEl.style.display                          = 'none';

      await this.render();
      await Expenses.refreshCategoryFilter();
      if (newCat && newCat.color.toLowerCase() !== color.toLowerCase()) {
        UI.toast('El color ya estaba en uso — se asignó uno alternativo', 'info');
      }
      UI.toast('Categoría creada', 'success');
    };

    saveBtn.addEventListener('click', trySave);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') trySave(); });
  },

  /* ---------- Render list ---------- */

  async render() {
    const [categories, expenses] = await Promise.all([
      Data.getCategories(), Data.getExpenses()
    ]);
    // Count expenses per category without N+1 queries
    const countMap = {};
    expenses.forEach(e => { countMap[e.categoryId] = (countMap[e.categoryId] || 0) + 1; });

    const container = document.getElementById('categories-list');
    container.innerHTML = categories.map(cat => {
      const count = countMap[cat.id] || 0;
      return `
        <div class="category-list-item" id="cat-item-${cat.id}">
          <span class="cat-color-swatch" style="background:${cat.color}"></span>
          <span class="cat-name" id="cat-name-${cat.id}">${UI._esc(cat.name)}</span>
          ${cat.isPredefined ? '<span class="predefined-badge">predefinida</span>' : ''}
          <span class="cat-count">${count} gasto${count !== 1 ? 's' : ''}</span>
          <div class="cat-actions">
            <button class="btn-icon btn-cat-edit" data-id="${cat.id}" title="Editar">⚙️</button>
            ${!cat.isPredefined
              ? `<button class="btn-icon danger btn-cat-delete" data-id="${cat.id}" title="Eliminar">🗑️</button>`
              : ''}
          </div>
        </div>`;
    }).join('');

    // Edit buttons
    container.querySelectorAll('.btn-cat-edit').forEach(btn => {
      btn.addEventListener('click', () => this._startEdit(btn.dataset.id));
    });

    // Delete buttons — use closure to avoid re-fetch
    container.querySelectorAll('.btn-cat-delete').forEach(btn => {
      const cat   = categories.find(c => c.id === btn.dataset.id);
      const count = countMap[btn.dataset.id] || 0;
      btn.addEventListener('click', () => {
        if (!cat) return;
        if (count > 0) {
          UI.toast(
            `No se puede eliminar "${cat.name}" — tiene ${count} gasto${count !== 1 ? 's' : ''} asociado${count !== 1 ? 's' : ''}`,
            'error'
          );
          return;
        }
        UI.confirm(`¿Eliminar la categoría "${cat.name}"?`, async () => {
          await Data.deleteCategory(cat.id);
          await this.render();
          await Expenses.refreshCategoryFilter();
          UI.toast('Categoría eliminada', 'success');
        });
      });
    });
  },

  /* ---------- Inline edit ---------- */

  async _startEdit(id) {
    const cat = await Data.getCategoryById(id);
    if (!cat) return;

    const item      = document.getElementById(`cat-item-${id}`);
    const nameSpan  = document.getElementById(`cat-name-${id}`);

    nameSpan.innerHTML = `
      <div class="cat-edit-row">
        <input type="text" class="form-input" id="edit-name-${id}" value="${UI._esc(cat.name)}" maxlength="50">
        <input type="color" class="form-color" id="edit-color-${id}" value="${cat.color}">
        <button class="btn btn-primary btn-sm" id="btn-cat-save-${id}">Guardar</button>
        <button class="btn btn-outline btn-sm" id="btn-cat-cancel-${id}">Cancelar</button>
      </div>`;

    const colorInp = document.getElementById(`edit-color-${id}`);
    const swatch   = item.querySelector('.cat-color-swatch');
    colorInp.addEventListener('input', () => { swatch.style.background = colorInp.value; });

    const nameInp = document.getElementById(`edit-name-${id}`);
    nameInp.focus();
    nameInp.select();

    const doSave = async () => {
      const newName  = nameInp.value.trim();
      const newColor = colorInp.value;
      if (!newName) { UI.toast('El nombre no puede estar vacío', 'error'); return; }

      const cats      = await Data.getCategories();
      const duplicate = cats.find(c => c.id !== id && c.name.toLowerCase() === newName.toLowerCase());
      if (duplicate) { UI.toast('Ya existe una categoría con ese nombre', 'error'); return; }

      const updated = await Data.updateCategory(id, newName, newColor);
      await this.render();
      await Expenses.refreshCategoryFilter();
      await Dashboard.render();
      if (updated && updated.color.toLowerCase() !== newColor.toLowerCase()) {
        UI.toast('El color ya estaba en uso — se asignó uno alternativo', 'info');
      }
      UI.toast('Categoría actualizada', 'success');
    };

    document.getElementById(`btn-cat-save-${id}`).addEventListener('click', doSave);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
    document.getElementById(`btn-cat-cancel-${id}`).addEventListener('click',
      async () => this.render());
  }
};
