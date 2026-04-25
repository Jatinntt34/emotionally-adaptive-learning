import torch
import tensorflow as tf
print(f"Torch Version: {torch.__version__}")
print(f"Torch CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"Torch GPU Name: {torch.cuda.get_device_name(0)}")

print(f"TensorFlow Version: {tf.__version__}")
gpus = tf.config.list_physical_devices('GPU')
print(f"TF GPUs: {gpus}")
