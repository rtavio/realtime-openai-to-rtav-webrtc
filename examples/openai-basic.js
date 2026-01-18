/**
 * OpenAI Realtime API Basic Example (WebRTC)
 * 
 * This example demonstrates a basic connection to OpenAI's Realtime API
 * using WebRTC. It sends a text message and receives an audio response.
 * 
 * Note: This example uses the 'wrtc' package for Node.js WebRTC support.
 * For browser usage, see the HTML examples.
 */

require('dotenv').config();
const { RTCPeerConnection, RTCSessionDescription } = require('wrtc');
const FormData = require('form-data');
const fetch = require('node-fetch');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-realtime';
const OPENAI_API_URL = 'https://api.openai.com/v1/realtime/calls';

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
  console.error('   Please set it in your .env file');
  process.exit(1);
}

async function createCall() {
  console.log('🔌 Creating WebRTC call with OpenAI Realtime API...');
  console.log(`   API: ${OPENAI_API_URL}`);
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
  let messageSent = false;  // Track if we've already sent the test message
  let responseComplete = false;  // Track if response is complete

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
        // Note: OpenAI uses nested audio.output.voice structure
        dataChannel.send(JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: 'You are a helpful assistant. Keep your responses concise.',
            audio: {
              output: {
                voice: 'alloy'
              }
            },
            model: OPENAI_MODEL
          }
        }));
      }
      
      // Handle session update confirmation
      if (message.type === 'session.updated') {
        console.log('✅ Session configured');
        console.log('');
        
        // Only send test message once
        if (!messageSent) {
          messageSent = true;
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
                  text: 'Hello! Can you say "Hello, this is OpenAI Realtime API" in a friendly way?'
                }
              ]
            }
          }));
          
          // Trigger response
          dataChannel.send(JSON.stringify({
            type: 'response.create'
          }));
        } else {
          console.log('⚠️  Session updated again, but message already sent');
        }
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
        responseComplete = true;
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
    // Add audio transceiver to ensure SDP offer has audio media section
    // OpenAI requires an audio media section in the SDP offer
    console.log('📤 Adding audio transceiver...');
    try {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      console.log('✅ Added audio transceiver');
    } catch (error) {
      console.log(`⚠️  Could not add audio transceiver: ${error}`);
      console.log('⚠️  Continuing anyway - SDP may not have audio section');
    }
    
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

    // Send SDP offer to OpenAI
    console.log('📤 Sending SDP offer to OpenAI...');
    const formData = new FormData();
    formData.append('sdp', pc.localDescription.sdp);
    // Note: OpenAI uses nested audio.output.voice structure
    formData.append('session', JSON.stringify({
      type: 'realtime',
      model: OPENAI_MODEL,
      audio: {
        output: {
          voice: 'alloy'
        }
      }
    }));

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
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
    console.log('✅ Received SDP answer');
    console.log('');

    // Set remote description
    await pc.setRemoteDescription(new RTCSessionDescription({
      type: 'answer',
      sdp: answerSdp
    }));

    console.log('✅ WebRTC connection established');
    console.log('⏳ Waiting for data channel to open...');

    // Keep running until response completes or timeout
    const maxWaitTime = 60.0;
    const startTime = Date.now() / 1000;
    
    while (!responseComplete) {
      const elapsed = (Date.now() / 1000) - startTime;
      if (elapsed >= maxWaitTime) {
        console.log('⏱️  Timeout waiting for response');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Give a moment for any final events
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log('🔌 Closing connection...');
    try {
      pc.close();
    } catch (error) {
      // Ignore errors during close
    }

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
