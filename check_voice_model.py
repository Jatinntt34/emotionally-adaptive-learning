import os, json
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import tensorflow as tf, numpy as np

MODEL  = 'audio models and  dataset/models/voice_model.h5'
CONFIG = 'audio models and  dataset/models/tfjs_voice/config.json'
MEAN   = 'audio models and  dataset/models/tfjs_voice/feature_mean.npy'
STD    = 'audio models and  dataset/models/tfjs_voice/feature_std.npy'

print('--- File check ---')
for f in [MODEL, CONFIG, MEAN, STD]:
    exists = os.path.exists(f)
    size   = os.path.getsize(f) if exists else 0
    print(f'  {exists}  {size:>10} bytes  {f}')

print()
print('--- Model load test ---')
try:
    m = tf.keras.models.load_model(MODEL, compile=False)
    m.compile('adam', 'categorical_crossentropy', metrics=['accuracy'])
    print(f'  OK: {m.count_params()} params')
    xm = np.load(MEAN)
    xs = np.load(STD)
    with open(CONFIG) as cf:
        cfg = json.load(cf)
    print(f'  Emotions: {cfg["emotions"]}')
    print(f'  Accuracy: {cfg["accuracy"]*100:.1f}%')
    print()
    print('  ALL GOOD — restart api.py to use the new model!')
except Exception as e:
    print(f'  ERROR: {e}')
