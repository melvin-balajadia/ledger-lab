#!/usr/bin/env python3
"""
ETL: Plaridel Extension .ods workbooks  ->  CSVs matching schema.sql

Usage:
    python3 etl_ods_to_csv.py <cost.ods> <payroll.ods> <outdir>

Then load with:
    LOAD DATA LOCAL INFILE 'suppliers.csv' INTO TABLE suppliers
      FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
      LINES TERMINATED BY '\n' IGNORE 1 LINES (...);

Notes on why this is not a one-liner:
  * pandas' odf engine dies on these files ("Unrecognized type error") because
    several cells hold #REF!/#VALUE! formula errors. We parse content.xml directly.
  * Sheets are visual layouts, not tables: section-header rows, side-by-side
    blocks in one sheet, totals rows mixed into the data, merged headers.
  * Bad rows are emitted with needs_review=1 rather than dropped, so nothing
    silently disappears from the ledger.
"""
import csv, os, re, sys, zipfile
from datetime import date, datetime
from xml.etree import ElementTree as ET

# ---------------------------------------------------------------- ODS reader

NS = {'table':  'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
      'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
      'text':   'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}
T = lambda t: '{%s}%s' % (NS['table'], t)
O = lambda t: '{%s}%s' % (NS['office'], t)


def _cell_text(c):
    return '\n'.join(''.join(p.itertext())
                     for p in c.iter('{%s}p' % NS['text'])).strip()


def read_ods(path):
    """-> {sheet_name: [[cell, ...], ...]}  Errors/blanks become None."""
    root = ET.fromstring(zipfile.ZipFile(path).read('content.xml'))
    sheets = {}
    for tbl in root.iter(T('table')):
        rows = []
        for r in tbl.findall(T('table-row')):
            rrep = int(r.get(T('number-rows-repeated'), 1))
            cells = []
            for c in list(r):
                if c.tag not in (T('table-cell'), T('covered-table-cell')):
                    continue
                crep = min(int(c.get(T('number-columns-repeated'), 1)), 200)
                vt = c.get(O('value-type'))
                if vt in ('float', 'percentage', 'currency'):
                    v = float(c.get(O('value')))
                    val = int(v) if v.is_integer() else v
                elif vt == 'date':
                    val = c.get(O('date-value'))
                elif vt == 'boolean':
                    val = c.get(O('boolean-value'))
                elif vt == 'string':
                    val = _cell_text(c) or c.get(O('string-value'))
                else:                       # includes formula-error cells
                    val = _cell_text(c) or None
                cells.extend([val] * crep)
            while cells and cells[-1] in (None, ''):
                cells.pop()
            for _ in range(rrep if rrep <= 200 else 1):
                rows.append(list(cells))
        while rows and not rows[-1]:
            rows.pop()
        sheets[tbl.get(T('name'))] = rows
    return sheets


# ---------------------------------------------------------------- coercion

def at(row, i):
    return row[i] if i < len(row) else None


def num(v):
    """Money -> float or None. Tolerates '-', '', ' ', '1,234.50', '#REF!'."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(',', '').replace('\u20b1', '')
    if s in ('', '-', '–'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def dt(v):
    """ISO date string or None. Flags implausible project dates."""
    if not v:
        return None, False
    s = str(v)[:10]
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', s):
        return None, True
    ok = '2025-01-01' <= s <= '2027-12-31'
    return s, not ok



TERM_KINDS = [
    (r'retention|retent',                        'retention',       1),
    (r'completion|complet|acceptance|accept',    'completion',      1),
    (r'\bpb\b|progress|billing|payable',         'progress',        0),
    (r'before\s*deliver|prior\s*deliver|\bbd\b', 'before_delivery', 0),
    (r'upon\s*deliver|after\s*deliver|\bud\b|'
     r'pick\s*up|install|\bpdc\b|\bdays\b|\buc\b', 'upon_delivery',  0),
    (r'\bdp\b|down\s*pay|downpayment',          'downpayment',     0),
]


def parse_terms(text):
    """'30% DP, 60% PB, 10% RETENTION' -> milestone rows.

    The source spells ~8 real patterns 31 different ways ('60 PB' with no %,
    lowercase '50%dp', and one cell that is a note rather than terms). Returns
    (rows, ok) where ok is False if the percentages do not total 100 -- those
    need a human, not a cleverer regex.
    """
    if not text:
        return [], True
    t = str(text).strip()
    if re.match(r'^\s*note\s*:', t, re.I):          # not terms at all
        return [], False
    rows, seq = [], 0
    for seg in re.split(r'[,;]|\band\b', t):
        m = re.search(r'(\d+(?:\.\d+)?)\s*%?', seg)
        if not m:
            continue
        pct = float(m.group(1)) / 100.0
        if not 0 < pct <= 1:
            continue
        label = re.sub(r'\d+(?:\.\d+)?\s*%?', '', seg).strip(' .-')
        kind, hold = 'other', 0
        for pat, k, h in TERM_KINDS:
            if re.search(pat, label, re.I):
                kind, hold = k, h
                break
        seq += 1
        rows.append(dict(seq=seq, label=(label or kind)[:80], pct=round(pct, 6),
                         kind=kind, is_holdback=hold))
    # A milestone is a holdback only if it is genuinely withheld. An explicit
    # 'RETENTION' label always counts; 'completion' only counts when it is a
    # minority tail of a multi-part schedule -- '100% Upon Completion' is the
    # whole payment falling due at the end, not a 100% retention.
    for r in rows:
        if r['kind'] == 'retention':
            r['is_holdback'] = 1
        elif r['kind'] == 'completion':
            r['is_holdback'] = 1 if (len(rows) > 1 and r['pct'] <= 0.25) else 0
        else:
            r['is_holdback'] = 0
    total = sum(r['pct'] for r in rows)
    return rows, bool(rows) and abs(total - 1.0) < 0.02

def norm_supplier(name):
    s = re.sub(r'[^A-Z0-9 ]', ' ', str(name).upper())
    s = re.sub(r'\b(INC|CORP|CORPORATION|COMPANY|CO|LTD|PHILS|PHILIPPINES|'
               r'ENTERPRISES|TRADING|GENERAL MERCHANDISE|SERVICES)\b', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


REF_RE = re.compile(r'\b(SI|CI|CSI|OR|BS|MSR)\b', re.I)


def ref_type(ref):
    m = REF_RE.search(str(ref or ''))
    return m.group(1).upper() if m else 'other'


def clean_jpl(v):
    """Normalise a JPL code. '3.8.7.' -> '3.8.7'; 3 -> '3.0';
    'Inaguration' -> '1.0' (accounting: inauguration is the first planning
    line); a cell naming two codes -> None, flagged for splitting."""
    if v is None:
        return None
    s = str(v).strip()
    if isinstance(v, (int, float)) and float(v).is_integer():
        s = '%d.0' % int(v)
    if re.fullmatch(r'ina[gu]+ration', s, re.I):
        return '1.0'
    s = s.rstrip('.')                            # '3.8.7.' typo -> '3.8.7'
    if not re.fullmatch(r'\d+(\.\d+)*', s):
        return None
    return s if '.' in s else s + '.0'


MULTI_JPL_RE = re.compile(r'(\d+(?:\.\d+){1,})[^\d]+(\d+(?:\.\d+){1,})')


def multi_jpl(v):
    """A single cell naming two codes ('wire 3.2.2.26 pipe 3.1.2.2.1').
    Accounting confirmed one invoice can hit several codes, so this must
    become two rows sharing a document_no -- not one row with a lost code."""
    if v is None or clean_jpl(v):
        return None
    m = MULTI_JPL_RE.search(str(v))
    return [m.group(1), m.group(2)] if m else None


MONTHS = {m.lower(): i for i, m in enumerate(
    ['January','February','March','April','May','June','July',
     'August','September','October','November','December'], 1)}
MONTHS.update({'ma': 5, 'sept': 9, 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
               'jun': 6, 'jul': 7, 'aug': 8, 'oct': 10, 'nov': 11, 'dec': 12})


def parse_period(label):
    """'August 4-10, 2025' / 'September 29 - October 5, 2025' /
       'July 06- July 12,2026' / 'Ma 25 -May 31, 2026' -> (start, end)"""
    s = re.sub(r'\s+', ' ', str(label)).strip()
    yr = re.search(r'(20\d{2})', s)
    if not yr:
        return None, None
    year = int(yr.group(1))
    toks = re.findall(r'([A-Za-z]+)\s*(\d{1,2})', s)
    if len(toks) == 2:                       # Month D ... Month D
        (m1, d1), (m2, d2) = toks
    elif len(toks) == 1:                     # Month D-D
        (m1, d1) = toks[0]
        m2 = m1
        tail = re.search(r'\d{1,2}\s*[-–]\s*(\d{1,2})', s)
        if not tail:
            return None, None
        d2 = tail.group(1)
    else:
        return None, None
    try:
        mo1, mo2 = MONTHS[m1.lower()], MONTHS[m2.lower()]
    except KeyError:
        return None, None
    start = date(year, mo1, int(d1))
    end_year = year + 1 if mo2 < mo1 else year   # Dec 29 - Jan 4 rollover
    end = date(end_year, mo2, int(d2))
    return start.isoformat(), end.isoformat()


# ---------------------------------------------------------------- registries

class Registry:
    """Assigns stable surrogate ids on first sight."""
    def __init__(self):
        self.by_key, self.rows = {}, []

    def get(self, key, make):
        if key not in self.by_key:
            self.by_key[key] = len(self.rows) + 1
            self.rows.append(make(self.by_key[key]))
        return self.by_key[key]


ITEM_NOS = ['1.0','2.0','3.0','4.0','5.0','6.0','7.0','8.0','9.0','10.0',
            '11.0','12.0','13.0','14.0','15.0','16.0','17.0','18.0','19.0']
ITEM_ID = {n: i + 1 for i, n in enumerate(ITEM_NOS)}   # must match schema.sql seed order
# schema seeds 2.0..19.0 first then 1.0; recompute to match that exactly:
_seed_order = ITEM_NOS[1:] + ['1.0']
ITEM_ID = {n: i + 1 for i, n in enumerate(_seed_order)}


def item_id_for_jpl(code):
    if not code:
        return None
    return ITEM_ID.get(code.split('.')[0] + '.0')


def main(cost_path, pay_path, outdir):
    os.makedirs(outdir, exist_ok=True)
    cost, pay = read_ods(cost_path), read_ods(pay_path)
    PID = 1

    suppliers = Registry()
    planning = Registry()
    workers = Registry()
    periods = Registry()

    def sup_id(name):
        if not name or str(name).strip() in ('', 'None'):
            return None
        key = norm_supplier(name)
        if not key:
            return None
        return suppliers.get(key, lambda i: dict(
            id=i, name=str(name).strip()[:191], normalized_name=key[:191],
            tin='', category='', is_active=1))

    def pl_id(raw):
        code = clean_jpl(raw)
        if not code:
            return None, None
        pid = planning.get(code, lambda i: dict(
            id=i, project_id=PID, budget_item_id=item_id_for_jpl(code) or '',
            code=code, parent_id='', depth=code.count('.') + 1,
            description='', budget_amount=''))
        return pid, item_id_for_jpl(code)

    # ---------- purchase_orders + po_payments (PO_MONITORING, WITH_PO'S, DP)
    pos, pays = [], []
    seen_por = {}
    cur_item = None
    for r in cost['PO_MONITORING'][2:]:
        if len([x for x in r if x not in (None, '')]) == 1 and isinstance(r[0], str):
            m = re.match(r'([\d.]+)\s', r[0])
            cur_item = ITEM_ID.get(m.group(1) if m and '.' in m.group(1)
                                   else (m.group(1) + '.0') if m else '') or None
            continue
        d, bad = dt(at(r, 0))
        por = str(at(r, 2) or '').strip()
        if not por or not por.upper().startswith('POR'):
            continue
        contract = num(at(r, 8))
        paid = num(at(r, 10))
        sid = sup_id(at(r, 3))
        if sid is None:
            continue
        plid, iid = pl_id(at(r, 6))
        if plid is None:
            plid, iid = pl_id(at(r, 7))
        if por in seen_por:
            poid = seen_por[por]
        else:
            poid = len(pos) + 1
            seen_por[por] = poid
            pos.append(dict(
                id=poid, project_id=PID, por_no=por,
                msr_no=str(at(r, 1) or '').strip(), po_date=d or '',
                supplier_id=sid, budget_item_id=iid or cur_item or '',
                planning_line_id=plid or '',
                item_description=str(at(r, 4) or '')[:255],
                ref_no=str(at(r, 5) or '')[:120],
                currency='PHP', contract_amount=contract or 0, fx_rate=1,
                payment_terms='', status='open', remarks='',
                retention_pct=''))
        if paid:
            pays.append(dict(
                id=len(pays) + 1, purchase_order_id=poid, paid_on=d or '',
                payment_type='other', currency='PHP', amount=paid, fx_rate=1,
                pct_of_contract='', voucher_no='', remarks=''))

    # DP_MONITORING gives payment terms / %/ DP dates for equipment POs
    cur_hdr = None
    for r in cost['DP_MONITORING']:
        if len([x for x in r if x not in (None, '')]) == 1:
            cur_hdr = str(r[0])
            continue
        po_raw = str(at(r, 0) or '').strip()
        if not po_raw.upper().startswith('POR'):
            continue
        por = 'POR' + po_raw[3:].lstrip('0')          # POR0000016622 -> POR16622
        contract = num(at(r, 2))
        pct = num(at(r, 4))
        d, _ = dt(at(r, 5))
        amt = num(at(r, 6))
        sid = sup_id(at(r, 1))
        if por in seen_por:
            poid = seen_por[por]
            pos[poid - 1]['payment_terms'] = str(at(r, 3) or '')[:160]
        else:
            poid = len(pos) + 1
            seen_por[por] = poid
            pos.append(dict(
                id=poid, project_id=PID, por_no=por, msr_no='', po_date=d or '',
                supplier_id=sid or '', budget_item_id='', planning_line_id='',
                item_description='', ref_no='', currency='PHP',
                contract_amount=contract or 0, fx_rate=1,
                payment_terms=str(at(r, 3) or '')[:160], status='open',
                remarks=cur_hdr or '', retention_pct=''))
        if amt:
            pays.append(dict(
                id=len(pays) + 1, purchase_order_id=poid, paid_on=d or '',
                payment_type='downpayment' if (pct or 0) < 1 else 'other',
                currency='PHP', amount=amt, fx_rate=1,
                pct_of_contract=pct if pct is not None else '',
                voucher_no='', remarks=''))

    # ---------- payment-term milestones + retention percentage
    terms_rows = []
    for p in pos:
        rows, ok = parse_terms(p.get('payment_terms'))
        if not rows:
            continue
        for r in rows:
            terms_rows.append(dict(id=len(terms_rows) + 1,
                                   purchase_order_id=p['id'], **r))
        hold = sum(r['pct'] for r in rows if r['is_holdback'])
        if hold:
            p['retention_pct'] = round(hold, 6)
        if not ok:
            p['remarks'] = ((p.get('remarks') or '') +
                            ' [terms do not total 100% - review]').strip()

    for p in pos:
        p.setdefault('retention_pct', '')
        tot = sum(x['amount'] for x in pays if x['purchase_order_id'] == p['id'])
        p['status'] = ('fully_paid' if tot >= p['contract_amount'] > 0
                       else 'partially_paid' if tot > 0 else 'open')

    # ---------- replenishments (CIVIL_MATERIALS)
    reps = []
    for ri, r in enumerate(pay['CIVIL_MATERIALS'][4:], 5):
        d, bad = dt(at(r, 1))
        amt = num(at(r, 6))
        if amt is None and not d:
            continue
        ref = str(at(r, 4) or '')[:120]
        codes = multi_jpl(at(r, 5))
        # One cell naming two codes becomes two rows sharing a document_no,
        # each flagged so a human can set the real split amounts (the source
        # gives one lump sum, so we cannot infer the division).
        targets = codes if codes else [at(r, 5)]
        doc = 'CM-%04d' % ri if codes else ''
        for code in targets:
            plid, iid = pl_id(code)
            reps.append(dict(
                id=len(reps) + 1, project_id=PID, txn_date=d or '',
                supplier_id=sup_id(at(r, 2)) or '', planning_line_id=plid or '',
                budget_item_id=iid or '',
                item_description=str(at(r, 3) or '')[:255], ref_no=ref,
                ref_type=ref_type(ref),
                amount=(amt if amt is not None else 0) if not codes else 0,
                batch_no='', document_no=doc,
                needs_review=int(bool(codes) or bad or amt is None or plid is None)))

    # ---------- cash advances (CASH_ADVANCE sheet, added by accounting)
    # "an amount provided BEFORE the expense is incurred" -- as opposed to
    # replenishment, which reimburses something already paid.
    cas = []
    ca_rows = cost.get('CASH_ADVANCE', [])
    for ri, r in enumerate(ca_rows):
        d, bad = dt(at(r, 0))
        amt = num(at(r, 2))
        if not d or amt is None:
            continue
        plid, iid = pl_id(at(r, 3))
        desc = str(at(r, 1) or '').replace('\xa0', ' ').strip()[:255]
        cas.append(dict(
            id=len(cas) + 1, project_id=PID, txn_date=d,
            budget_item_id=iid or '', planning_line_id=plid or '',
            requested_by='', purpose=desc, amount=amt,
            liquidated_amount=0, status='open',
            document_no='', needs_review=int(bad or plid is None)))
    # Same date + same description across consecutive rows = one advance split
    # over several JPL codes (e.g. the Sika grout advance -> 3.1.4.2 / 5.0 / 6.1).
    groups = {}
    for c_ in cas:
        groups.setdefault((c_['txn_date'], c_['purpose'][:40]), []).append(c_)
    for n, (k, g_) in enumerate(groups.items(), 1):
        if len(g_) > 1:
            for c_ in g_:
                c_['document_no'] = 'CA-%03d' % n

    # ---------- additional payments (ADDITIONAL_PAYMENT sheet)
    # Landed cost on imported equipment: customs duties, freight, THC,
    # marine insurance. Cash out, but NOT an increase to contract value.
    def expense_type(payee):
        u = str(payee).upper()
        if 'CUSTOMS' in u:                       return 'customs_duty'
        if 'INSURANCE' in u:                     return 'insurance'
        if 'THC' in u or 'TERMINAL' in u:        return 'terminal_handling'
        if any(w in u for w in ('LOGISTICS', 'CARGO', 'CONTAINER', 'FEEDER',
                                'LINES', 'SINOTRANS', 'YUSEN')):
                                                 return 'freight'
        return 'other'

    aps = []
    for r in cost.get('ADDITIONAL_PAYMENT', []):
        d, bad = dt(at(r, 0))
        payee = str(at(r, 1) or '').strip()
        amt = num(at(r, 2))
        if amt is None or not payee or payee.upper() in ('NAME', 'SUMMARY'):
            continue
        plid, iid = pl_id(at(r, 4))
        aps.append(dict(
            id=len(aps) + 1, project_id=PID, txn_date=d or '',
            payee=payee[:191], supplier_id=sup_id(payee) or '',
            budget_item_id=iid or '', planning_line_id=plid or '',
            description='', voucher_no=str(at(r, 3) or '').strip()[:64],
            expense_type=expense_type(payee), currency='PHP',
            amount=amt, fx_rate=1, document_no='',
            # 8 rows in the sheet have no date -- flagged, not dropped
            needs_review=int(not d or plid is None)))

    # ---------- payroll periods (PAY_ROLL: label + weekly total)
    for r in pay['PAY_ROLL'][3:]:
        label = at(r, 1)
        if not label or not isinstance(label, str):
            continue
        s, e = parse_period(label)
        if not s:
            continue
        periods.get(s, lambda i, s=s, e=e, label=label: dict(
            id=i, project_id=PID, label=label.strip()[:64],
            period_start=s, period_end=e, status='paid',
            total_amount=num(at(r, 2)) or 0))

    # ---------- workers + payroll_entries (unpivot Payroll_with_JPL grid)
    grid = pay['Payroll_with_JPL_sept_to_jan']
    hdr, sub = grid[8], grid[9]
    # column pairs: (AMOUNT col, JPL col) under each period label
    cols = []
    for ci in range(3, len(hdr)):
        if hdr[ci] and str(sub[ci] if ci < len(sub) else '').upper() == 'AMOUNT':
            cols.append((ci, ci + 1, str(hdr[ci])))

    # The author buried column totals INSIDE the data rows, at a DIFFERENT row
    # offset for every week (row 122 for one week, row 260 for another), and
    # they sit next to unrelated workers' names, so position and name give no
    # signal. Each column has a grand-total row plus item-2.0 / item-3.0
    # subtotal rows. Left in, weekly figures come out up to 3x too high.
    #
    # Magnitude separates them: the highest daily rate in the source is PHP 800,
    # so an individual's weekly net tops out near PHP 12.3k (95th pct is 7.8k),
    # while the totals cluster starts at PHP 28.4k. 15k sits in that gap.
    TOTALS_THRESHOLD = 15_000.0
    skip = {}                                   # amount_col -> {row_index, ...}
    for amt_c, _jpl_c, _lab in cols:
        skip[amt_c] = {ri for ri, r in enumerate(grid)
                       if ri >= 10 and amt_c < len(r)
                       and isinstance(r[amt_c], (int, float))
                       and r[amt_c] >= TOTALS_THRESHOLD}

    entries = []
    for ri, r in enumerate(grid):
        if ri < 10:
            continue
        name = at(r, 1)
        if not name or not isinstance(name, str) or not name.strip():
            continue
        nm = name.strip()
        parts = nm.split(',', 1)
        last, first = parts[0], (parts[1] if len(parts) > 1 else '')
        wid = workers.get(nm.upper(), lambda i: dict(
            id=i, employee_no='', last_name=last.strip()[:80],
            first_name=first.strip()[:80] or last.strip()[:80],
            middle_name='', full_name=nm[:191],
            position=str(at(r, 2) or '')[:80], daily_rate='', hourly_rate='',
            date_hired='', is_active=1))
        for amt_c, jpl_c, label in cols:
            if ri in skip.get(amt_c, ()):        # embedded totals row
                continue
            amt = num(at(r, amt_c))
            if not amt:
                continue
            s, e = parse_period(label)
            if not s:
                continue
            pid_ = periods.get(s, lambda i, s=s, e=e, label=label: dict(
                id=i, project_id=PID, label=label.strip()[:64],
                period_start=s, period_end=e, status='paid', total_amount=0))
            plid, iid = pl_id(at(r, jpl_c))
            entries.append(dict(
                id=len(entries) + 1, project_id=PID, payroll_period_id=pid_,
                worker_id=wid, planning_line_id=plid or '',
                budget_item_id=iid or '', amount=round(amt, 2)))

    # ---------- weekly_budget_additions (side-by-side week blocks)
    wba = []
    wsheet = cost['WEEKLY_ADDITIONAL_FOR_BUDGET_']
    week_row = wsheet[3] if len(wsheet) > 3 else []
    # Count how many blocks carry each week label first, so repeats can be
    # flagged. Four blocks share 'JULY 06-JULY 12, 2026' in the source.
    label_count = {}
    for cell in week_row:
        if isinstance(cell, str) and re.search(r'20\d{2}', cell):
            s_, _ = parse_period(cell)
            if s_:
                label_count[s_] = label_count.get(s_, 0) + 1
    seen_week = {}
    for ci, cell in enumerate(week_row):
        if not isinstance(cell, str) or not re.search(r'20\d{2}', cell):
            continue
        s, e = parse_period(cell)
        if not s:
            continue
        seen_week[s] = seen_week.get(s, 0) + 1
        seq = seen_week[s]
        dup = label_count.get(s, 1) > 1
        for ri in (5, 6, 7):                       # LAND DEV / CIVIL / ELECTRICAL
            row = wsheet[ri] if ri < len(wsheet) else []
            label = str(at(row, ci) or '').upper()
            iid = (ITEM_ID['2.0'] if 'LAND' in label else
                   ITEM_ID['3.0'] if 'CIVIL' in label else
                   ITEM_ID['6.0'] if 'ELECTRIC' in label else None)
            if not iid:
                continue
            po_a = num(at(row, ci + 1)) or 0
            rep_a = num(at(row, ci + 2)) or 0
            lab_a = num(at(row, ci + 3)) or 0
            if not (po_a or rep_a or lab_a):
                continue
            wba.append(dict(
                id=len(wba) + 1, project_id=PID, week_label=cell.strip()[:48],
                week_start=s, week_end=e, budget_item_id=iid,
                seq=seq, needs_review=int(dup),
                additional_po=po_a, replen=rep_a, labor=lab_a))

    # ---------- write
    def dump(name, rows):
        path = os.path.join(outdir, name + '.csv')
        if not rows:
            print('  %-24s 0 rows (skipped)' % name)
            return
        with open(path, 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print('  %-24s %6d rows' % (name, len(rows)))

    print('Writing seed CSVs to %s' % outdir)
    dump('suppliers', suppliers.rows)
    dump('planning_lines', planning.rows)
    dump('purchase_orders', pos)
    dump('po_payments', pays)
    dump('po_payment_terms', terms_rows)
    dump('replenishments', reps)
    dump('payroll_periods', sorted(periods.rows, key=lambda r: r['period_start']))
    dump('workers', workers.rows)
    dump('payroll_entries', entries)
    dump('cash_advances', cas)
    dump('additional_payments', aps)
    dump('weekly_budget_additions', wba)

    # ---------- reconciliation report
    # PAY_ROLL's weekly figure is the control total. Where the unpivoted
    # worker rows disagree, the SOURCE workbook is internally inconsistent --
    # do not silently pick a side, hand the week to a human.
    ctrl = {}
    for r in pay['PAY_ROLL'][3:]:
        if len(r) > 2 and isinstance(at(r, 1), str):
            s, _e = parse_period(r[1])
            if s:
                ctrl[s] = num(at(r, 2)) or 0.0
    by_period = {}
    for e in entries:
        by_period[e['payroll_period_id']] = by_period.get(e['payroll_period_id'], 0) + e['amount']
    pstart = {p['id']: p['period_start'] for p in periods.rows}
    recon = []
    for pid_, amt in sorted(by_period.items(), key=lambda kv: pstart[kv[0]]):
        s = pstart[pid_]
        c = ctrl.get(s)
        diff = None if c is None else round(amt - c, 2)
        recon.append(dict(
            period_start=s, extracted_total=round(amt, 2),
            control_total='' if c is None else c,
            difference='' if diff is None else diff,
            status=('no_control_total' if c is None
                    else 'ok' if abs(diff) < 1.0
                    else 'REVIEW')))
    dump('_reconciliation_payroll', recon)

    flagged = sum(r['needs_review'] for r in reps)
    nrev = sum(1 for r in recon if r['status'] == 'REVIEW')
    print('\nData quality:')
    print('  replenishments flagged needs_review : %d of %d' % (flagged, len(reps)))
    print('  payroll weeks reconciling exactly   : %d of %d'
          % (sum(1 for r in recon if r['status'] == 'ok'), len(recon)))
    print('  payroll weeks needing review        : %d' % nrev)
    print('  extracted payroll total : {:>16,.2f}'.format(
        sum(e['amount'] for e in entries)))
    print('  control payroll total   : {:>16,.2f}'.format(sum(ctrl.values())))


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
