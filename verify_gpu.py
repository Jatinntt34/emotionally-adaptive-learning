import torch
import tensorflow as tf

print("-" * 30)
print("ENVIRONMENT CHECK")
print("-" * 30)

torch_gpu = torch.cuda.is_available()
print(f"PyTorch CUDA Available: {torch_gpu}")
if torch_gpu:
    print(f"Device Name: {torch.cuda.get_device_name(0)}")

tf_gpu_count = len(tf.config.list_physical_devices('GPU'))
print(f"TensorFlow GPU Count: {tf_gpu_count}")
if tf_gpu_count > 0:
    print(f"TF GPU Name: {tf.config.list_physical_devices('GPU')[0]}")

print("-" * 30)
