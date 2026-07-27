#!/usr/bin/env python3
"""Contact sheet: every generated plate inside the REAL offers/index.html tile."""
import base64, json, pathlib, subprocess
HERE = pathlib.Path(__file__).parent
OUT  = HERE.parents[2] / 'images' / 'offers'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

TILES = [
  ('freecash',  'Freecash',              'Mobile Apps',   'Fixed CPA', 'Creatives · 219', ['us','gb','ca']),
  ('apple-pay', 'Rewards US - Apple Pay','Sweepstakes',   'Revshare',  'New',             ['us']),
  ('copper',    'Copper Banking',        'Uncategorised', 'Fixed CPA', 'Creatives · 2',   ['us']),
  ('testerup',  'Testerup',              'Uncategorised', 'Fixed CPA', 'Creatives · 35',  ['us','gb','ca']),
  ('reco',      'Reco Social',           'Uncategorised', 'Fixed CPA', 'New',             ['us']),
  ('prograd',   'Prograd App',           'Mobile Apps',   'Fixed CPA', 'New',             ['gb','us']),
  ('sephora',   'Rewards - Sephora $750','Sweepstakes',   'Revshare',  'New',             ['us','gb','ca']),
  ('shein',     'Rewards - Shein $750',  'Sweepstakes',   'Revshare',  'New',             ['us','gb','ca']),
  ('uber-eats', 'Rewards UK - Uber Eats £50','Sweepstakes','Revshare','New',          ['gb']),
]

def uri(p):
    return 'data:image/webp;base64,' + base64.b64encode(p.read_bytes()).decode()

cards = [dict(src=uri(OUT/f'{s}.webp'), name=n, cat=c, pay=p, chip=ch, geo=g)
         for s, n, c, p, ch, g in TILES]

html = (HERE/'sheet.html').read_text().replace('__CARDS__', json.dumps(cards))
work = HERE/'.sheet-work.html'
work.write_text(html)
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                '--force-device-scale-factor=2', '--window-size=880,960',
                f'--screenshot={HERE}/contact-sheet.png', f'file://{work}'],
               capture_output=True, timeout=90)
work.unlink(missing_ok=True)
print(HERE/'contact-sheet.png')
