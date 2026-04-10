/* Import — parse bank statement photos via Claude Vision Edge Function */

const Import = {
  _pendingTxs: [],
  // Each tx: { date, amount, description, type: 'gasto'|'ingreso',
  //            externalId, selected, categoryId, isDuplicate }
  _categories: [],
  _accounts:   [],

  init() {
    document.getElementById('btn-import').addEventListener('click', () => this.openModal());
    document.getElementById('modal-import-close').addEventListener('click', () => this._closeModal());
    document.getElementById('modal-import').addEventListener('click', e => {
      if (e.target.id === 'modal-import') this._closeModal();
    });
    document.getElementById('btn-parse-photo').addEventListener('click', () => this._parsePhoto());
    document.getElementById('btn-confirm-import').addEventListener('click', () => this._confirmImport());
    document.getElementById('btn-preview-back').addEventListener('click', () => this._showStep('upload'));
  },

  async openModal() {
    [this._accounts, this._categories] = await Promise.all([
      Data.getAccounts(),
      Data.getCategories()
    ]);
    this._showStep('upload');
    document.getElementById('modal-import').style.display = 'flex';
  },

  _closeModal() {
    document.getElementById('modal-import').style.display = 'none';
    this._pendingTxs = [];
    document.getElementById('photo-file-input').value = '';
  },

  _showStep(step) {
    document.getElementById('step-upload').style.display  = step === 'upload'  ? '' : 'none';
    document.getElementById('step-preview').style.display = step === 'preview' ? '' : 'none';
    document.getElementById('btn-confirm-import').style.display = step === 'preview' ? '' : 'none';
    document.getElementById('btn-preview-back').style.display   = step === 'preview' ? '' : 'none';
  },

  // ── Deduplication ─────────────────────────────────────────────────────────

  _dedupKey(date, amount, description) {
    const desc = (description || '').toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 40);
    return `photo|${date}|${Math.round(amount * 100)}|${desc}`;
  },

  async _buildExistingKeysSet() {
    const [expenses, incomes] = await Promise.all([
      Storage.getExpenses(),
      Storage.getIncomes()
    ]);
    const keys = new Set();
    [...expenses, ...incomes].forEach(t => {
      if (t.externalId) keys.add(t.externalId);
    });
    return keys;
  },

  // ── Photo parsing ─────────────────────────────────────────────────────────

  async _parsePhoto() {
    const fileInput = document.getElementById('photo-file-input');
    if (!fileInput.files.length) { UI.toast('Selecciona una imagen', 'error'); return; }
    const file = fileInput.files[0];

    const btn = document.getElementById('btn-parse-photo');
    btn.disabled    = true;
    btn.textContent = 'Analizando...';

    try {
      const base64  = await this._fileToBase64(file);
      const session = (await supabase.auth.getSession()).data.session;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-bank-statement`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type })
      });

      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
      const { transactions } = await res.json();

      if (!transactions || !transactions.length) {
        UI.toast('No se encontraron transacciones en la imagen', 'error');
        return;
      }

      // Build dedup set from already-imported transactions
      const existingKeys = await this._buildExistingKeysSet();

      this._pendingTxs = transactions.map(t => {
        const externalId  = this._dedupKey(t.date, t.amount, t.description);
        const isDuplicate = existingKeys.has(externalId);
        return {
          ...t,
          type:        t.type || 'gasto',
          externalId,
          isDuplicate,
          selected:    !isDuplicate,
          categoryId:  ''
        };
      });

      this._renderPreview();
      this._showStep('preview');
    } catch (err) {
      UI.toast('Error al analizar la imagen: ' + err.message, 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Analizar imagen';
    }
  },

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // ── Preview ───────────────────────────────────────────────────────────────

  _renderPreview() {
    const catOptions = this._categories
      .map(c => `<option value="${c.id}">${c.name}</option>`)
      .join('');

    const tbody = document.getElementById('preview-tbody');
    tbody.innerHTML = this._pendingTxs.map((t, i) => `
      <tr class="${t.isDuplicate ? 'import-row-dup' : ''}">
        <td><input type="checkbox" data-idx="${i}" ${t.selected ? 'checked' : ''}></td>
        <td style="white-space:nowrap">${t.date}</td>
        <td class="preview-desc" title="${(t.description || '').replace(/"/g, '&quot;')}">
          ${t.description || ''}
          ${t.isDuplicate ? '<span class="import-dup-badge" title="Ya importado anteriormente">\u21a9 dup</span>' : ''}
        </td>
        <td class="preview-amount ${t.type === 'ingreso' ? 'import-income' : 'import-expense'}">
          ${t.type === 'ingreso' ? '+' : '-'}${Data.formatAmount(t.amount)}
        </td>
        <td>
          ${t.type === 'gasto'
            ? `<select class="form-select form-select-sm preview-cat" data-idx="${i}">
                 <option value="">— categoría —</option>${catOptions}
               </select>`
            : '<span class="import-income-label">Ingreso</span>'
          }
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('input[type=checkbox]').forEach(cb =>
      cb.addEventListener('change', e => {
        this._pendingTxs[+e.target.dataset.idx].selected = e.target.checked;
        this._updateCount();
      })
    );
    tbody.querySelectorAll('.preview-cat').forEach(sel =>
      sel.addEventListener('change', e => {
        this._pendingTxs[+e.target.dataset.idx].categoryId = e.target.value;
      })
    );

    // Populate account selector
    const accSel = document.getElementById('preview-account');
    accSel.innerHTML =
      '<option value="">Sin cuenta específica</option>' +
      this._accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    // Duplicate notice
    const dupCount  = this._pendingTxs.filter(t => t.isDuplicate).length;
    const dupNotice = document.getElementById('preview-dup-notice');
    if (dupCount > 0) {
      dupNotice.textContent =
        `${dupCount} transacción${dupCount !== 1 ? 'es marcadas' : ' marcada'} como posible duplicado` +
        ` (desmarcada${dupCount !== 1 ? 's' : ''} por defecto).`;
      dupNotice.style.display = '';
    } else {
      dupNotice.style.display = 'none';
    }

    this._updateCount();
  },

  _updateCount() {
    const n = this._pendingTxs.filter(t => t.selected).length;
    document.getElementById('btn-confirm-import').textContent =
      `Importar ${n} transacción${n !== 1 ? 'es' : ''}`;
  },

  // ── Confirm & import ──────────────────────────────────────────────────────

  async _confirmImport() {
    const toImport = this._pendingTxs.filter(t => t.selected);
    if (!toImport.length) { UI.toast('Selecciona al menos una transacción', 'error'); return; }

    const accountId = document.getElementById('preview-account').value || null;

    const gastosWithoutCat = toImport.filter(t => t.type === 'gasto' && !t.categoryId);
    if (gastosWithoutCat.length) {
      UI.toast('Asigna una categoría a todos los gastos seleccionados', 'error');
      return;
    }

    const hasIncomes = toImport.some(t => t.type === 'ingreso');
    if (hasIncomes && !accountId) {
      UI.toast('Selecciona una cuenta para poder importar los ingresos', 'error');
      return;
    }

    const btn = document.getElementById('btn-confirm-import');
    btn.disabled = true;

    let imported = 0;
    for (const t of toImport) {
      try {
        if (t.type === 'ingreso') {
          await Data.addIncome({
            accountId,
            amount:      t.amount,
            description: t.description,
            date:        t.date,
            externalId:  t.externalId
          });
        } else {
          await Data.addExpense({
            amount:      t.amount,
            categoryId:  t.categoryId,
            description: t.description,
            date:        t.date,
            accountId,
            isPlanned:   false,
            externalId:  t.externalId
          });
        }
        imported++;
      } catch (_) {}
    }

    btn.disabled = false;
    UI.toast(
      `${imported} transacción${imported !== 1 ? 'es' : ''} importada${imported !== 1 ? 's' : ''} correctamente`,
      'success'
    );
    this._closeModal();
    if (Router._current === 'expenses')  Expenses.render();
    if (Router._current === 'dashboard') Dashboard.render();
    if (Router._current === 'accounts')  Accounts.render();
  }
};
