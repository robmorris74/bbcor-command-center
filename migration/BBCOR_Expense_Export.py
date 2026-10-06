"""Read-only transfer from the original BBCOR expense app to the cloud Expense Center.
Uses Python's standard library; no installation or internet connection needed.
Run beside bbcor.db, or choose the database when prompted. Passwords are not exported.
"""
from pathlib import Path
import base64, datetime, json, mimetypes, sqlite3, tempfile, sys

FORMAT = 'BBCOR_EXPENSE_TRANSFER_V1'
MAX_RECEIPT = 2 * 1024 * 1024
ALLOWED = {'application/pdf', 'image/jpeg', 'image/png', 'image/webp'}

def export(database, destination=None):
    database = Path(database).resolve()
    if not database.is_file():
        raise FileNotFoundError('Choose the original bbcor.db file.')
    result = {'format': FORMAT, 'exportedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'expenses': [], 'projects': [], 'vendors': [], 'receipts': [], 'missing_receipts': []}
    # SQLite backup reads a consistent snapshot without modifying the running app.
    with tempfile.TemporaryDirectory() as temp:
        source = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
        snapshot = sqlite3.connect(str(Path(temp) / 'snapshot.db'))
        try:
            source.backup(snapshot)
            snapshot.row_factory = sqlite3.Row
            tables = {r[0] for r in snapshot.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            for table in ['expenses', 'projects', 'vendors']:
                if table not in tables:
                    raise ValueError('This is not the original BBCOR expense database: ' + table + ' is missing.')
                result[table] = [dict(r) for r in snapshot.execute('SELECT * FROM ' + table)]
        finally:
            source.close()
            snapshot.close()
    receipts = {}
    for expense in result['expenses']:
        name = str(expense.get('receipt_file') or '')
        expense['receipt_id'] = ''
        if not name:
            continue
        path = (database.parent / 'static' / 'uploads' / name).resolve()
        uploads = (database.parent / 'static' / 'uploads').resolve()
        reason = None
        if not path.is_relative_to(uploads):
            reason = 'Unexpected receipt path'
        elif not path.is_file():
            reason = 'Receipt file not found in static/uploads'
        elif path.stat().st_size > MAX_RECEIPT:
            reason = 'Receipt exceeds 2 MB; transfer separately'
        mime = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
        if mime not in ALLOWED:
            reason = reason or 'Receipt type is unsupported; transfer separately'
        if reason:
            result['missing_receipts'].append({'expense_id': expense['id'], 'file': name, 'reason': reason})
            continue
        rid = 'local_receipt_' + str(len(receipts) + 1)
        if name in receipts:
            rid = receipts[name]['id']
        else:
            receipts[name] = {'id': rid, 'name': name, 'mime': mime,
                              'data': 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode('ascii')}
        expense['receipt_id'] = rid
    result['receipts'] = list(receipts.values())
    destination = Path(destination or database.parent / 'BBCOR_EXPENSE_TRANSFER.json')
    temporary = destination.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    temporary.replace(destination)
    return destination, result

def main():
    database = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / 'bbcor.db'
    if not database.is_file():
        from tkinter import Tk, filedialog
        root = Tk(); root.withdraw()
        selected = filedialog.askopenfilename(title='Choose the BBCOR expense database', filetypes=[('SQLite database', '*.db'), ('All files', '*.*')])
        root.destroy()
        if not selected:
            return
        database = Path(selected)
    destination, result = export(database)
    print('Transfer saved:', destination)
    print(len(result['expenses']), 'expenses;', len(result['projects']), 'projects;', len(result['vendors']), 'vendors;', len(result['receipts']), 'receipts')
    if result['missing_receipts']:
        print(len(result['missing_receipts']), 'receipt files need separate transfer. Details are in the JSON file.')
    print('Import this JSON in BBCOR Expense Center > Reports & transfer.')
    print('The original database and receipt files were not changed. User passwords were not exported.')

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Export could not finish:', error)
    input('\nPress Enter to close...')
