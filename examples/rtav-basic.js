/**
 * RTAV Realtime API Basic Example (WebRTC)
 * 
 * This example demonstrates the same functionality as openai-basic.js
 * but using RTAV's API. Notice how minimal the changes are!
 * 
 * Changes from OpenAI version:
 * 1. Different API URL (api.rtav.io instead of api.openai.com)
 * 2. Different API key (RTAV_API_KEY instead of OPENAI_API_KEY)
 * 3. Different model (gpt-5.2 instead of gpt-realtime)
 * 4. RTAV-specific voice/face IDs instead of OpenAI voice names
 * 
 * Everything else is IDENTICAL - RTAV is a drop-in replacement!
 */

require('dotenv').config();
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc');
const FormData = require('form-data');
const fetch = require('node-fetch');
const https = require('https');
const { URL } = require('url');

const RTAV_API_KEY = process.env.RTAV_API_KEY;
const RTAV_API_URL = process.env.RTAV_API_URL || 'https://api.rtav.io';
const RTAV_MODEL = process.env.RTAV_MODEL || 'gpt-5.2';
const RTAV_VOICE_ID = process.env.RTAV_VOICE_ID;
const RTAV_FACE_ID = process.env.RTAV_FACE_ID;

if (!RTAV_API_KEY) {
  console.error('❌ RTAV_API_KEY not found in environment variables');
  console.error('   Please set it in your .env file');
  process.exit(1);
}

const CALLS_API_URL = `${RTAV_API_URL}/v1/realtime/calls`;

async function createCall() {
  console.log('🔌 Creating WebRTC call with RTAV Realtime API...');
  console.log(`   API: ${CALLS_API_URL}`);
  console.log('');

  // Create RTCPeerConnection
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  // Create data channel for control messages
  const dataChannel = pc.createDataChannel('realtime', {
    ordered: true
  });

  let sessionId = null;
  let audioChunks = [];

  // Handle data channel messages
  dataChannel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data.toString());
      
      // Handle session creation
      if (message.type === 'session.created') {
        sessionId = message.session?.id || null;
        console.log(`✅ Session created: ${sessionId}`);
        console.log('');
        
        // Configure session
        console.log('⚙️  Configuring session...');
        const sessionConfig = {
          type: 'session.update',
          session: {
            instructions: 'You are a helpful assistant. Keep your responses concise.',
            voice: 'default',
            model: RTAV_MODEL
          }
        };
        
        // Add RTAV-specific options if provided
        if (RTAV_VOICE_ID) {
          sessionConfig.session.voice = RTAV_VOICE_ID;
        }
        if (RTAV_FACE_ID) {
          sessionConfig.session.face = RTAV_FACE_ID;
        }

        dataChannel.send(JSON.stringify(sessionConfig));
      }
      
      // Handle session update confirmation
      if (message.type === 'session.updated') {
        console.log('✅ Session configured');
        console.log('');
        
        // Send a test message
        console.log('💬 Sending test message...');
        dataChannel.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Hello! Can you say "Hello, this is RTAV Realtime API" in a friendly way?'
              }
            ]
          }
        }));
        
        // Trigger response
        dataChannel.send(JSON.stringify({
          type: 'response.create'
        }));
      }
      
      // Debug: log all event types
      const eventType = message.type;
      if (eventType !== 'session.created' && eventType !== 'session.updated') {
        console.log(`📨 Event: ${eventType}`);
      }
      
      // Handle text chunks
      if (eventType === 'response.output_text.delta' || eventType === 'response.text.delta') {
        const delta = message.delta || '';
        if (delta) {
          process.stdout.write(delta);
        }
      }
      
      // Handle video frame chunks (RTAV only)
      if (eventType === 'response.output_image.delta' || eventType === 'response.image.delta') {
        process.stdout.write('🎬');
      }
      
      // Handle response creation
      if (eventType === 'response.created') {
        console.log('📝 Response started');
      }
      
      // Handle response completion
      if (eventType === 'response.done') {
        console.log('');
        console.log('');
        console.log('✅ Response complete');
        console.log('');
        console.log('🔌 Closing connection...');
        pc.close();
        process.exit(0);
      }
      
      // Handle errors
      if (eventType === 'error') {
        const errorInfo = message.error || {};
        const errorMsg = errorInfo.message || errorInfo || 'Unknown error';
        console.error('❌ Error:', errorMsg);
        pc.close();
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error parsing message:', error);
    }
  };

  dataChannel.onopen = () => {
    console.log('✅ Data channel opened');
  };

  dataChannel.onerror = (error) => {
    console.error('❌ Data channel error:', error);
  };

  // Handle incoming audio track
  pc.ontrack = (event) => {
    if (event.track.kind === 'audio') {
      console.log('🎵 Audio track received');
      // In a real application, you would play this audio
      // For this example, we just acknowledge receipt
    }
  };

  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log(`🔌 Connection state: ${pc.connectionState}`);
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      console.log('❌ Connection failed or disconnected');
      process.exit(1);
    }
  };

  try {
    // Create SDP offer
    console.log('📤 Creating SDP offer...');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for local description to be set
    await new Promise(resolve => {
      if (pc.localDescription) {
        resolve();
      } else {
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            resolve();
          }
        };
      }
    });

    // Prepare session configuration
    const sessionConfig = {
      type: 'realtime',
      model: RTAV_MODEL,
      instructions: 'You are a helpful assistant.',
      voice: RTAV_VOICE_ID || 'default'
    };

    if (RTAV_FACE_ID) {
      sessionConfig.face = RTAV_FACE_ID;
    }

    // Send SDP offer to RTAV
    console.log('📤 Sending SDP offer to RTAV...');
    const formData = new FormData();
    formData.append('sdp', pc.localDescription.sdp);
    formData.append('session', JSON.stringify(sessionConfig));

    // Disable SSL verification for localhost/local IP HTTPS (self-signed certs)
    let httpsAgent = undefined;
    if (CALLS_API_URL.startsWith('https://')) {
      const parsed = new URL(CALLS_API_URL);
      const isLocalhost = (
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1' ||
        (parsed.hostname && (
          parsed.hostname.startsWith('192.168.') ||
          parsed.hostname.startsWith('10.') ||
          (parsed.hostname.startsWith('172.') &&
            parseInt(parsed.hostname.split('.')[1] || '0') >= 16 &&
            parseInt(parsed.hostname.split('.')[1] || '0') <= 31)
        ))
      );
      
      if (isLocalhost) {
        httpsAgent = new https.Agent({
          rejectUnauthorized: false
        });
      }
    }

    const response = await fetch(CALLS_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RTAV_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData,
      agent: httpsAgent
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create call: ${response.status} ${errorText}`);
    }

    // Get SDP answer
    const answerSdp = await response.text();
    const sessionIdHeader = response.headers.get('X-Session-Id');
    if (sessionIdHeader) {
      sessionId = sessionIdHeader;
      console.log(`✅ Session ID: ${sessionId}`);
    }
    
    console.log('✅ Received SDP answer');
    console.log('');

    // Set remote description
    await pc.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: answerSdp
    }));

    console.log('✅ WebRTC connection established');
    console.log('⏳ Waiting for data channel to open...');

  } catch (error) {
    console.error('❌ Error creating call:', error);
    pc.close();
    process.exit(1);
  }
}

// Run the example
createCall().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
