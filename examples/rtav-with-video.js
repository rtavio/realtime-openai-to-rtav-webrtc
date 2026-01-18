/**
 * RTAV Realtime API Example with Video Output (WebRTC)
 * 
 * This example demonstrates how to handle video frames from RTAV's API.
 * Video frames are received via the data channel as base64-encoded JPEG images.
 */

require('dotenv').config();
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc');
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

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

// Create output directory for video frames
const outputDir = path.join(__dirname, '..', 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function createCall() {
  console.log('🔌 Creating WebRTC call with RTAV Realtime API (with video)...');
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
  let videoFrameCount = 0;
  let currentResponseId = null;

  // Handle data channel messages
  dataChannel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data.toString());
      
      // Handle session creation
      if (message.type === 'session.created') {
        sessionId = message.session?.id || null;
        console.log(`✅ Session created: ${sessionId}`);
        console.log('');
        
        // Configure session with video enabled
        console.log('⚙️  Configuring session with video...');
        const sessionConfig = {
          type: 'session.update',
          session: {
            instructions: 'You are a helpful assistant. Keep your responses concise.',
            voice: RTAV_VOICE_ID || 'default',
            model: RTAV_MODEL,
            modalities: ['audio', 'text', 'image'] // Enable video output
          }
        };
        
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
                text: 'Hello! Can you introduce yourself and say "Hello, this is RTAV with video output" in a friendly way?'
              }
            ]
          }
        }));
        
        // Trigger response
        dataChannel.send(JSON.stringify({
          type: 'response.create'
        }));
      }
      
      // Handle response creation
      if (message.type === 'response.created') {
        currentResponseId = message.response?.id || null;
        console.log(`📝 Response started (ID: ${currentResponseId})`);
        videoFrameCount = 0;
      }
      
      // Handle text chunks
      const eventType = message.type;
      if (eventType === 'response.output_text.delta' || eventType === 'response.text.delta') {
        const delta = message.delta || '';
        if (delta) {
          process.stdout.write(delta);
        }
      }
      
      // Handle video frame chunks (RTAV only)
      if (eventType === 'response.output_image.delta' || eventType === 'response.image.delta') {
        const delta = message.delta || '';
        if (delta) {
          videoFrameCount++;
          process.stdout.write('🎬');
          
          // Save video frame to file
          try {
            const frameData = Buffer.from(delta, 'base64');
            const framePath = path.join(outputDir, `frame_${videoFrameCount.toString().padStart(4, '0')}.jpg`);
            fs.writeFileSync(framePath, frameData);
          } catch (error) {
            console.error('❌ Error saving frame:', error);
          }
        }
      }
      
      // Handle video completion
      if (eventType === 'response.output_image.done' || eventType === 'response.image.done') {
        const totalFrames = message.total_frames || videoFrameCount;
        console.log('');
        console.log(`🎬 Video complete: ${totalFrames} frames received`);
        console.log(`   Frames saved to: ${outputDir}`);
      }
      
      // Handle response completion
      if (eventType === 'response.done') {
        console.log('');
        console.log('');
        console.log('✅ Response complete');
        console.log(`   Received ${videoFrameCount} video frames`);
        console.log(`   Frames saved to: ${outputDir}`);
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
    }
    if (event.track.kind === 'video') {
      console.log('🎥 Video track received (RTP)');
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

    // Prepare session configuration with video enabled
    const sessionConfig = {
      type: 'realtime',
      model: RTAV_MODEL,
      instructions: 'You are a helpful assistant.',
      voice: RTAV_VOICE_ID || 'default',
      modalities: ['audio', 'text', 'image'] // Enable video
    };

    if (RTAV_FACE_ID) {
      sessionConfig.face = RTAV_FACE_ID;
    }

    // Send SDP offer to RTAV
    console.log('📤 Sending SDP offer to RTAV...');
    const formData = new FormData();
    formData.append('sdp', pc.localDescription.sdp);
    formData.append('session', JSON.stringify(sessionConfig));

    const response = await fetch(CALLS_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RTAV_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
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
