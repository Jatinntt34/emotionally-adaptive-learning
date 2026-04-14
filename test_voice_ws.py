"""Test the voice WebSocket endpoint directly."""
import asyncio
import numpy as np
import json

async def test():
    try:
        import websockets
    except ImportError:
        # Use the built-in approach
        print("websockets not installed, using urllib approach...")
        return

    uri = "ws://127.0.0.1:8000/ws/voice"
    print(f"Connecting to {uri}...")

    try:
        async with websockets.connect(uri) as ws:
            print("Connected!")

            # Send 3 seconds of random audio (simulating speech)
            sr = 22050
            t = np.linspace(0, 3, sr * 3, dtype=np.float32)
            # Mix of frequencies to simulate voice-like audio
            audio = 0.3 * np.sin(2 * np.pi * 200 * t) + 0.2 * np.sin(2 * np.pi * 400 * t) + 0.05 * np.random.randn(len(t)).astype(np.float32)

            rms = np.sqrt(np.mean(audio**2))
            print(f"Sending {len(audio)} samples ({len(audio)/sr:.1f}s), RMS={rms:.4f}")
            await ws.send(audio.tobytes())

            # Wait for response
            response = await asyncio.wait_for(ws.recv(), timeout=10)
            data = json.loads(response)
            print(f"Response: {json.dumps(data, indent=2)}")

            if data.get('status') == 'success' or data.get('status') == 'low_confidence':
                print(f"\n  Voice model WORKING: {data['emotion']} ({data['confidence']:.1f}%)")
            elif data.get('status') == 'error':
                print(f"\n  ERROR: {data.get('message')}")
            elif data.get('status') == 'no_voice':
                print(f"\n  No voice detected (RMS too low)")
            else:
                print(f"\n  Unexpected: {data}")

    except ConnectionRefusedError:
        print("ERROR: Cannot connect to ws://127.0.0.1:8000/ws/voice")
        print("Make sure api.py is running!")
    except Exception as e:
        print(f"ERROR: {e}")

asyncio.run(test())
