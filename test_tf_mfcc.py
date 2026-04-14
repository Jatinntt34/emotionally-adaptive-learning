import numpy as np
import tensorflow as tf

def extract_features_tf(audio_chunk, sr=22050):
    min_length = sr // 2
    if len(audio_chunk) < min_length:
        audio_chunk = np.pad(audio_chunk, (0, min_length - len(audio_chunk)), mode='constant')
    
    audio_chunk = audio_chunk.astype(np.float32)
    n_fft = min(512, len(audio_chunk))
    hop_length = n_fft // 4
    
    # Compute STFT
    stft = tf.signal.stft(audio_chunk, frame_length=n_fft, frame_step=hop_length, fft_length=n_fft)
    spectrogram = tf.abs(stft)
    
    # Compute Mel spectrogram
    num_spectrogram_bins = stft.shape[-1]
    lower_edge_hertz, upper_edge_hertz, num_mel_bins = 0.0, sr / 2.0, 128
    linear_to_mel_weight_matrix = tf.signal.linear_to_mel_weight_matrix(
        num_mel_bins, num_spectrogram_bins, sr, lower_edge_hertz, upper_edge_hertz)
    
    mel_spectrogram = tf.tensordot(spectrogram, linear_to_mel_weight_matrix, 1)
    mel_spectrogram.set_shape(spectrogram.shape[:-1].concatenate(linear_to_mel_weight_matrix.shape[-1:]))
    
    # Compute Log Mel spectrogram
    log_mel_spectrogram = tf.math.log(mel_spectrogram + 1e-6)
    
    # Compute MFCCs
    mfccs = tf.signal.mfccs_from_log_mel_spectrograms(log_mel_spectrogram)[..., :40]
    
    # Transpose to match librosa (n_mfcc, time) for feature extraction
    mfccs = tf.transpose(mfccs)
    
    # Compute mean and std
    mfcc_mean = tf.reduce_mean(mfccs, axis=1)
    mfcc_std = tf.math.reduce_std(mfccs, axis=1)
    
    features = tf.concat([mfcc_mean, mfcc_std], axis=0)
    return features.numpy()

# Test
fake_audio = np.random.uniform(-1, 1, int(22050 * 0.5))
features = extract_features_tf(fake_audio)
print("Features shape:", features.shape)

try:
    model = tf.keras.models.load_model('audio models and  dataset/models/voice_model.h5')
    
    model_input = features.reshape(1, 80, 1)
    prediction = model.predict(model_input, verbose=0)[0]
    print("Prediction:", prediction)
except Exception as e:
    print("Error:", e)
