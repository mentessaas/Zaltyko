"""Write the element list of one batch for the animation pipeline.
usage: python3 make_batch.py <edition> <batch>  -> batches/<edition>-<batch>.json"""
import json, os, sys
ROOT = os.path.join(os.path.dirname(__file__), '..', '..', '..')
ed, b = sys.argv[1], int(sys.argv[2])
data = os.path.join(ROOT, 'src/modules/element-library/data', ed)
rec = json.load(open(os.path.join(data, 'tandas', f'{b}.json')))
keys = set(rec['elementKeys']); out = []
for f in sorted(os.listdir(data)):
    if not f.endswith('.json'): continue
    d = json.load(open(os.path.join(data, f)))
    for e in d.get('elements', []):
        if e['elementKey'] in keys:
            out.append(dict(elementKey=e['elementKey'], apparatus=d['apparatus'], group=e['group'],
                            value=e.get('valueLetter', e.get('valuePoints')), figReference=e['figReference'],
                            sourcePage=e['sourcePage'], name=e['name'], shortName=e['shortName'], description=e.get('description')))
os.makedirs('batches', exist_ok=True)
json.dump(dict(edition=ed, batch=b, elements=out), open(f'batches/{ed}-{b}.json', 'w'), ensure_ascii=False, indent=1)
print(f'batches/{ed}-{b}.json', len(out))
