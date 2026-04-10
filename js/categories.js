/* Categories — collapsible panel inside Expenses view */

const Categories = {

  init() {
    // Toggle panel open/close
    document.getElementById('btn-toggle-categories').addEventListener('click', () => {
      const body  = document.getElementById('categories-panel-body');
      const arrow = document.querySelector('.categories-toggle-arrow');
      const open  = body.style.display === 'none';
      body.style.display = open ? '' : 'none';
      arrow.textContent  = open ? '▴' : '▾';
      if (open) this.render();
    });

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
      if (cats.find(c => c.name.toLowerCase() === name.toLowerCase())) {
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

    document.getElementById('btn-save-category').addEventListener('click', trySave);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') trySave(); });
  },

  async render() {
    const [categories, expenses] = await Promise.all([
      Data.getCategories(), Data.getExpenses()
    ]);
    const countMap = {};
    expenses.forEach(e => { countMap[e.categoryId] = (countMap[e.categoryId] || 0) + 1; });

    // Update badge with total count
    const badge = document.getElementById('categories-count-badge');
    if (badge) badge.textContent = categories.length;

    const container = document.getElementById('categories-list');
    if (!container) return;

    container.innerHTML = categories.map(cat => {
      const count = countMap[cat.id] || 0;
      return `
        <div class="cat-chip" id="cat-item-${cat.id}">
          <span class="cat-chip-swatch" style="background:${cat.color}"></span>
          <span class="cat-chip-name" id="cat-name-${cat.id}">${UI._esc(cat.name)}</span>
          <span class="cat-chip-count">${count}</span>
          <div class="cat-chip-actions">
            <button class="btn-icon btn-cat-edit" data-id="${cat.id}" title="Editar">✏️</button>
            ${!cat.isPredefined
              ? `<button class="btn-icon danger btn-cat-delete" data-id="${cat.id}" title="Eliminar">✕</button>`
              : ''}
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.btn-cat-edit').forEach(btn =>
      btn.addEventListener('click', () => this._startEdit(btn.dataset.id))
    );
    container.querySelectorAll('.btn-cat-delete').forEach(btn => {
      const cat   = categories.find(c => c.id === btn.dataset.id);
      const count = countMap[btn.dataset.id] || 0;
      btn.addEventListener('click', () => {
        if (!cat) return;
        if (count > 0) {
          UI.toast(`No se puede eliminar "${cat.name}" — tiene ${count} gasto${count !== 1 ? 's' : ''} asociado${count !== 1 ? 's' : ''}`, 'error');
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

  async _startEdit(id) {
    const cat = await Data.getCategoryById(id);
    if (!cat) return;
    const nameSpan = document.getElementById(`cat-name-${id}`);
    const item     = document.getElementById(`cat-item-${id}`);

    nameSpan.innerHTML = `
      <div class="cat-edit-row">
        <input type="text" class="form-input" id="edit-name-${id}" value="${UI._esc(cat.name)}" maxlength="50">
        <input type="color" class="form-color" id="edit-color-${id}" value="${cat.color}">
        <button class="btn btn-primary btn-sm" id="btn-cat-save-${id}">Guardar</button>
        <button class="btn btn-outline btn-sm" id="btn-cat-cancel-${id}">✕</button>
      </div>`;

    const colorInp = document.getElementById(`edit-color-${id}`);
    colorInp.addEventListener('input', () => {
      item.querySelector('.cat-chip-swatch').style.background = colorInp.value;
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
      await Dashboard.render();
      if (updated && updated.color.toLowerCase() !== newColor.toLowerCase()) {
        UI.toast('El color ya estaba en uso — se asignó uno alternativo', 'info');
      }
      UI.toast('Categoría actualizada', 'success');
    };

    document.getElementById(`btn-cat-save-${id}`).addEventListener('click', doSave);
    nameInp.addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
    document.getElementById(`btn-cat-cancel-${id}`).addEventListener('click', () => this.render());
  }
};
