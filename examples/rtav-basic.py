#!/usr/bin/env python3
"""
RTAV Realtime API Basic Example (WebRTC)

This example demonstrates the same functionality as openai-basic.py
but using RTAV's API. Notice how minimal the changes are!

Changes from OpenAI version:
1. Different API URL (api.rtav.io instead of api.openai.com)
2. Different API key (RTAV_API_KEY instead of OPENAI_API_KEY)
3. Different model (gpt-5.2 instead of gpt-realtime)
4. RTAV-specific voice/face IDs instead of OpenAI voice names

Everything else is IDENTICAL - RTAV is a drop-in replacement!
"""

import asyncio
import json
import os
import sys
from urllib.parse import urlparse
from dotenv import load_dotenv
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer
from aiohttp import ClientSession, FormData, TCPConnector
import ssl

load_dotenv()

RTAV_API_KEY = os.getenv('RTAV_API_KEY')
RTAV_API_URL = os.getenv('RTAV_API_URL', 'https://api.rtav.io')
RTAV_MODEL = os.getenv('RTAV_MODEL', 'gpt-5.2')
RTAV_VOICE_ID = os.getenv('RTAV_VOICE_ID')
RTAV_FACE_ID = os.getenv('RTAV_FACE_ID')

if not RTAV_API_KEY:
    print('❌ RTAV_API_KEY not found in environment variables')
    print('   Please set it in your .env file')
    sys.exit(1)

CALLS_API_URL = f'{RTAV_API_URL}/v1/realtime/calls'


async def create_call():
    print('🔌 Creating WebRTC call with RTAV Realtime API...')
    print(f'   API: {CALLS_API_URL}')
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
                session_config = {
                    'type': 'session.update',
                    'session': {
                        'instructions': 'You are a helpful assistant. Keep your responses concise.',
                        'voice': RTAV_VOICE_ID or 'default',
                        'model': RTAV_MODEL
                    }
                }
                
                # Add RTAV-specific options if provided
                if RTAV_FACE_ID:
                    session_config['session']['face'] = RTAV_FACE_ID

                data_channel.send(json.dumps(session_config))
            
            # Handle session update confirmation
            if data.get('type') == 'session.updated':
                print('✅ Session configured')
                print()
                
                # Only send test message once (after session.updated confirms worker is ready)
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
                                    'text': 'Hello! Can you say "Hello, this is RTAV Realtime API" in a friendly way?'
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
            
            # Handle video frame chunks (RTAV only)
            if event_type in ['response.output_image.delta', 'response.image.delta']:
                print('🎬', end='', flush=True)
            
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
        nonlocal response_complete
        print(f'🔌 Connection state: {pc.connectionState}')
        if pc.connectionState in ['failed', 'disconnected']:
            print('❌ Connection failed or disconnected')
            response_complete = True  # Mark as complete to exit

    try:
        # Create SDP offer
        print('📤 Creating SDP offer...')
        await pc.setLocalDescription(await pc.createOffer())

        # Wait a bit for ICE gathering
        await asyncio.sleep(1)

        # Prepare session configuration
        session_config = {
            'type': 'realtime',
            'model': RTAV_MODEL,
            'instructions': 'You are a helpful assistant.',
            'voice': RTAV_VOICE_ID or 'default'
        }

        if RTAV_FACE_ID:
            session_config['face'] = RTAV_FACE_ID

        # Send SDP offer to RTAV
        print('📤 Sending SDP offer to RTAV...')
        form_data = FormData()
        form_data.add_field('sdp', pc.localDescription.sdp)
        form_data.add_field('session', json.dumps(session_config))

        # Disable SSL verification for localhost/local IP HTTPS (self-signed certs)
        verify_ssl = True
        if CALLS_API_URL.startswith("https://"):
            parsed = urlparse(CALLS_API_URL)
            is_localhost = (
                parsed.hostname == "localhost" or 
                parsed.hostname == "127.0.0.1" or 
                parsed.hostname == "::1" or
                (parsed.hostname and (
                    parsed.hostname.startswith("192.168.") or
                    parsed.hostname.startswith("10.") or
                    parsed.hostname.startswith("172.16.") or
                    parsed.hostname.startswith("172.17.") or
                    parsed.hostname.startswith("172.18.") or
                    parsed.hostname.startswith("172.19.") or
                    parsed.hostname.startswith("172.20.") or
                    parsed.hostname.startswith("172.21.") or
                    parsed.hostname.startswith("172.22.") or
                    parsed.hostname.startswith("172.23.") or
                    parsed.hostname.startswith("172.24.") or
                    parsed.hostname.startswith("172.25.") or
                    parsed.hostname.startswith("172.26.") or
                    parsed.hostname.startswith("172.27.") or
                    parsed.hostname.startswith("172.28.") or
                    parsed.hostname.startswith("172.29.") or
                    parsed.hostname.startswith("172.30.") or
                    parsed.hostname.startswith("172.31.")
                ))
            )
            if is_localhost:
                verify_ssl = False  # Disable SSL verification for self-signed certs

        # Create SSL context if needed
        ssl_context = None
        if not verify_ssl:
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

        async with ClientSession(connector=TCPConnector(ssl=ssl_context if not verify_ssl else True)) as session:
            async with session.post(
                CALLS_API_URL,
                headers={
                    'Authorization': f'Bearer {RTAV_API_KEY}'
                },
                data=form_data
            ) as response:
                if not response.ok:
                    error_text = await response.text()
                    raise Exception(f'Failed to create call: {response.status} {error_text}')

                # Get SDP answer
                answer_sdp = await response.text()
                session_id_header = response.headers.get('X-Session-Id')
                if session_id_header:
                    session_id = session_id_header
                    print(f'✅ Session ID: {session_id}')
                
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
