/* Export — CSV generation */

const Export = {
  async toCSV(expenses) {
    const categories = await Data.getCategories();
    const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

    const headers = ['Fecha', 'Descripción', 'Categoría', 'Monto'];

    const rows = expenses.map(e => [
      e.date,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${(catMap[e.categoryId] || '').replace(/"/g, '""')}"`,
      e.amount.toFixed(2)
    ]);

    const csv = [headers, ...rows].map(r => r.join(',')).join('\r\n');

    // BOM for proper Excel/UTF-8 handling
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `gastos-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
