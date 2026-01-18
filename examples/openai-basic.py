#!/usr/bin/env python3
"""
OpenAI Realtime API Basic Example (WebRTC)

This example demonstrates a basic connection to OpenAI's Realtime API
using WebRTC. It sends a text message and receives an audio response.

Note: This example uses the 'aiortc' package for Python WebRTC support.
"""

import asyncio
import json
import os
import sys
from dotenv import load_dotenv
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer
import httpx

load_dotenv()

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-realtime')
OPENAI_API_URL = 'https://api.openai.com/v1/realtime/calls'

if not OPENAI_API_KEY:
    print('❌ OPENAI_API_KEY not found in environment variables')
    print('   Please set it in your .env file')
    sys.exit(1)


async def create_call():
    print('🔌 Creating WebRTC call with OpenAI Realtime API...')
    print(f'   API: {OPENAI_API_URL}')
    print()

    # Create RTCPeerConnection
    pc = RTCPeerConnection(
        configuration=RTCConfiguration(
            iceServers=[RTCIceServer(urls=['stun:stun.l.google.com:19302'])]
        )
    )

    # Create data channel for control messages
    data_channel = pc.createDataChannel('realtime', ordered=True)

    session_id = None
    audio_chunks = []
    message_sent = False  # Track if we've already sent the test message
    response_complete = False  # Track if response is complete

    # Handle data channel messages
    @data_channel.on("message")
    def on_message(message):
        nonlocal session_id, audio_chunks, message_sent, response_complete
        
        try:
            if isinstance(message, str):
                data = json.loads(message)
            else:
                return
            
            # Handle session creation
            if data.get('type') == 'session.created':
                session_id = data.get('session', {}).get('id')
                print(f'✅ Session created: {session_id}')
                print()
                
                # Configure session
                print('⚙️  Configuring session...')
                data_channel.send(json.dumps({
                    'type': 'session.update',
                    'session': {
                        'type': 'realtime',
                        'instructions': 'You are a helpful assistant. Keep your responses concise.',
                        'audio': {'output': {'voice': 'alloy'}},
                        'model': OPENAI_MODEL
                    }
                }))
            
            # Handle session update confirmation
            if data.get('type') == 'session.updated':
                print('✅ Session configured')
                print()
                
                # Only send test message once
                if not message_sent:
                    message_sent = True
                    # Send a test message
                    print('💬 Sending test message...')
                    data_channel.send(json.dumps({
                        'type': 'conversation.item.create',
                        'item': {
                            'type': 'message',
                            'role': 'user',
                            'content': [
                                {
                                    'type': 'input_text',
                                    'text': 'Hello! Can you say "Hello, this is OpenAI Realtime API" in a friendly way?'
                                }
                            ]
                        }
                    }))
                    
                    # Trigger response
                    data_channel.send(json.dumps({
                        'type': 'response.create'
                    }))
                else:
                    print('⚠️  Session updated again, but message already sent')
            
            # Debug: log all event types
            event_type = data.get('type')
            if event_type not in ['session.created', 'session.updated']:
                print(f'📨 Event: {event_type}')
            
            # Handle text chunks
            if event_type in ['response.output_text.delta', 'response.text.delta']:
                delta = data.get('delta', '')
                if delta:
                    print(delta, end='', flush=True)
            
            # Handle response creation
            if event_type == 'response.created':
                print('📝 Response started')
            
            # Handle response completion
            if event_type == 'response.done':
                print()
                print()
                print('✅ Response complete')
                print()
                response_complete = True
            
            # Handle errors
            if event_type == 'error':
                error_info = data.get('error', {})
                error_msg = error_info.get('message', 'Unknown error') if isinstance(error_info, dict) else str(error_info)
                print(f'❌ Error: {error_msg}')
                response_complete = True  # Mark as complete to exit
                
        except Exception as error:
            print(f'❌ Error parsing message: {error}')

    @data_channel.on("open")
    def on_open():
        print('✅ Data channel opened')

    # Handle incoming audio track
    @pc.on("track")
    def on_track(track):
        if track.kind == 'audio':
            print('🎵 Audio track received')

    # Handle connection state changes
    @pc.on("connectionstatechange")
    def on_connectionstatechange():
        print(f'🔌 Connection state: {pc.connectionState}')
        if pc.connectionState in ['failed', 'disconnected']:
            print('❌ Connection failed or disconnected')
            asyncio.get_event_loop().stop()

    try:
        # Add audio transceiver to ensure SDP offer has audio media section
        # OpenAI requires an audio media section in the SDP offer
        print('📤 Adding audio transceiver...')
        try:
            pc.addTransceiver("audio", direction="sendrecv")
            print('✅ Added audio transceiver')
        except Exception as e:
            print(f'⚠️  Could not add audio transceiver: {e}')
            # Try alternative: create a silent audio track
            try:
                from aiortc.contrib.media import MediaStreamTrack
                from av import AudioFrame
                import numpy as np
                
                class SilentAudioTrack(MediaStreamTrack):
                    kind = "audio"
                    
                    async def recv(self):
                        # Return a frame of silence (16000 samples = 1 second at 16kHz)
                        frame = AudioFrame.from_ndarray(
                            np.zeros((16000, 1), dtype=np.int16),
                            format="s16",
                            layout="mono"
                        )
                        frame.sample_rate = 16000
                        frame.time_base = 1 / 16000
                        return frame
                
                audio_track = SilentAudioTrack()
                pc.addTrack(audio_track)
                print('✅ Added silent audio track')
            except Exception as e2:
                print(f'⚠️  Could not add audio track: {e2}')
                print('⚠️  Continuing anyway - SDP may not have audio section')
        
        # Create SDP offer
        print('📤 Creating SDP offer...')
        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        # Wait for ICE gathering to complete
        print('⏳ Waiting for ICE gathering...')
        await asyncio.sleep(2)

        # Wait a bit for ICE gathering
        await asyncio.sleep(1)

        # Send SDP offer to OpenAI
        print('📤 Sending SDP offer to OpenAI...')
        # OpenAI requires multipart/form-data with specific content types
        # Following OpenAI WebRTC guide format
        # Note: OpenAI uses nested audio.output.voice structure
        # Note: OpenAI uses nested audio.output.voice structure
        session_config = {
            "type": "realtime",
            "model": OPENAI_MODEL,
            "audio": {
                "output": {
                    "voice": "alloy"
                }
            }
        }
        
        # Create multipart form data
        # Format: (filename, content, content_type) - filename must be None
        sdp_content = pc.localDescription.sdp.encode('utf-8')
        session_json = json.dumps(session_config)
        
        files = {
            "sdp": (None, sdp_content, "application/sdp"),
            "session": (None, session_json.encode('utf-8'), "application/json"),
        }
        
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}"
            # Note: No OpenAI-Beta header for GA Calls API
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                OPENAI_API_URL,
                headers=headers,
                files=files
            )
            
            # Print error details if request fails
            if response.status_code != 201:
                error_text = response.text
                print(f"❌ Error response status: {response.status_code}")
                print(f"❌ Error response body: {error_text}")
                try:
                    error_json = response.json()
                    print(f"❌ Error details: {json.dumps(error_json, indent=2)}")
                except:
                    pass
                raise Exception(f'Failed to create call: {response.status_code} {error_text}')

            # Get SDP answer
            answer_sdp = response.text
            print('✅ Received SDP answer')
            print()

            # Set remote description
            await pc.setRemoteDescription(
                RTCSessionDescription(sdp=answer_sdp, type='answer')
            )

            print('✅ WebRTC connection established')
            print('⏳ Waiting for data channel to open...')

            # Keep running until response completes or timeout
            max_wait_time = 60.0
            start_time = asyncio.get_event_loop().time()
            
            try:
                while not response_complete:
                    elapsed = asyncio.get_event_loop().time() - start_time
                    if elapsed >= max_wait_time:
                        print('⏱️  Timeout waiting for response')
                        break
                    await asyncio.sleep(0.5)
                
                # Give a moment for any final events
                await asyncio.sleep(0.5)
                
            except KeyboardInterrupt:
                print('\n👋 Interrupted by user')
            finally:
                print('🔌 Closing connection...')
                try:
                    await pc.close()
                except:
                    pass

    except Exception as error:
        print(f'❌ Error creating call: {error}')
        await pc.close()
        sys.exit(1)


if __name__ == '__main__':
    try:
        asyncio.run(create_call())
    except KeyboardInterrupt:
        print('\n👋 Interrupted by user')
    except Exception as error:
        print(f'❌ Fatal error: {error}')
        sys.exit(1)
