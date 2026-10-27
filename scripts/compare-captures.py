"""Compare the two independent renderer regions in captured QA pages."""
import json
from pathlib import Path

import numpy as np
from PIL import Image

project = Path(__file__).resolve().parents[1]
captures = project / 'work' / 'visual-qa' / 'screenshots'
results = []
excluded = []
for metadata_path in sorted(captures.glob('*.json')):
    image_path = metadata_path.with_suffix('.png')
    if not image_path.exists():
        continue
    metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
    source_image = Image.open(image_path)
    if source_image.format != 'PNG':
        excluded.append({'case': metadata_path.stem, 'reason': f'{source_image.format} screenshot is lossy; use raw GPU buffer comparison instead.'})
        continue
    image = source_image.convert('RGB')
    scale = image.width / metadata['viewport']['width']
    arrays = []
    for rect in metadata['rects']:
        bounds = tuple(round(value * scale) for value in (
            rect['x'], rect['y'], rect['x'] + rect['width'], rect['y'] + rect['height']))
        arrays.append(np.asarray(image.crop(bounds)).astype(np.int16))
    reference, reconstruction = arrays
    difference = np.abs(reference - reconstruction)
    non_uniform = int(np.any(reference != reference[0, 0], axis=2).sum())
    result = {
        'case': metadata_path.stem,
        'pixelCount': int(reference.shape[0] * reference.shape[1]),
        'differentPixelCount': int(np.any(difference != 0, axis=2).sum()),
        'meanAbsoluteChannelError': float(difference.mean()),
        'maximumChannelError': int(difference.max()),
        'nonUniformReferencePixels': non_uniform,
        'renderIsNonBlank': non_uniform > 1000,
        'exactPixelMatch': not np.any(difference),
        'rects': metadata['rects'],
    }
    result['passed'] = result['exactPixelMatch'] and result['renderIsNonBlank']
    results.append(result)
    if not result['passed']:
        Image.fromarray(np.minimum(difference * 12, 255).astype(np.uint8)).save(
            captures / f'{metadata_path.stem}-difference.png')

report = {
    'scope': 'Original published core with fixed-time instrumentation vs reconstruction; same Chrome, GPU, Three 0.181.0, size and time. This does not assert equivalence for every GPU or every possible input.',
    'caseCount': len(results),
    'passedCount': sum(result['passed'] for result in results),
    'cases': results,
    'excludedLossyCaptures': excluded,
}
(captures.parent / 'pixel-comparison.json').write_text(
    json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
for result in results:
    print(f"{result['case']}: {'PASS' if result['passed'] else 'FAIL'}; "
          f"different pixels={result['differentPixelCount']}/{result['pixelCount']}; "
          f"max channel error={result['maximumChannelError']}; "
          f"nonblank={result['renderIsNonBlank']}")
print(f"{report['passedCount']}/{report['caseCount']} passed")
for result in excluded:
    print(f"Excluded {result['case']}: {result['reason']}")
raise SystemExit(0 if (results or excluded) and all(result['passed'] for result in results) else 1)
