# OpenAI Realtime to rtAV WebRTC Conversion Demo

This demo demonstrates how to convert an existing OpenAI Realtime API WebRTC session to use rtAV's enhanced realtime API, which provides **drop-in compatibility** with OpenAI's protocol plus **real-time video avatar output**.

## Overview

rtAV provides a production-ready alternative to OpenAI's Realtime API with the following enhancements:

- ✅ **Full OpenAI Realtime API Compatibility**: Drop-in replacement with identical WebRTC Calls API protocol
- ✅ **Real-Time Video Output**: Generates synchronized video avatars alongside audio responses
- ✅ **Flexible LLM Integration**: Support for any LLM model (not just OpenAI models)
- ✅ **Cost-Effective**: Transparent pricing with no per-token charges
- ✅ **Self-Hosted Option**: Deploy your own workers for complete control
- ✅ **Low Latency**: Direct RTP audio streaming for real-time conversation

### What This Demo Shows

This demo illustrates:
1. How to connect to OpenAI's Realtime API using WebRTC (Calls API)
2. How to migrate the same code to rtAV's API with minimal changes
3. How to handle the additional video output that rtAV provides
4. Side-by-side comparison of both implementations

## Prerequisites

- Node.js (v14 or higher) or Python 3.8+
- An OpenAI API key (for comparison)
- An rtAV API key (sign up at [rtav.io](https://rtav.io))
- Basic understanding of WebRTC connections
- Modern browser with WebRTC support (Chrome, Firefox, Safari, Edge)

## Installation

### Node.js Version

```bash
cd realtime-openai-to-rtav-webrtc

# Install node-pre-gyp first (required by wrtc)
npm install --save-dev node-pre-gyp

# Then install all dependencies
npm install
```

**Note:** If you encounter errors with `wrtc`, make sure `node-pre-gyp` is installed first, as `wrtc` needs it to download prebuilt binaries.

### Python Version

**Note:** Python WebRTC support requires FFmpeg system libraries. See [INSTALL.md](INSTALL.md) for detailed installation instructions.

**Quick install (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install libavformat-dev libavcodec-dev libavdevice-dev libavutil-dev libavfilter-dev libswscale-dev libswresample-dev pkg-config
cd realtime-openai-to-rtav-webrtc
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**Alternative:** If you prefer not to install FFmpeg, you can use the Node.js examples or the browser-based HTML example instead.

## Configuration

Create a `.env` file in the root directory:

```env
# OpenAI Configuration (for comparison)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-realtime

# RTAV Configuration
RTAV_API_URL=https://api.rtav.io
RTAV_API_KEY=your_rtav_api_key_here
RTAV_MODEL=gpt-5.2

# Optional: RTAV Session Configuration
RTAV_FACE_ID=your_face_id_here
RTAV_VOICE_ID=your_voice_id_here
RTAV_DRIVING_ID=your_driving_id_here
```

## Key Differences: OpenAI vs rtAV

### Connection Method

**OpenAI:**
- Uses WebRTC Calls API: `POST https://api.openai.com/v1/realtime/calls`
- Sends SDP offer via multipart form data
- Receives SDP answer in response body
- Communication via WebRTC data channel and RTP media streams

**rtAV:**
- Uses WebRTC Calls API: `POST https://api.rtav.io/v1/realtime/calls`
- Same protocol, same request format
- Same response format
- **Identical API structure** - drop-in replacement!

### Authentication

Both use the same Bearer token authentication:
```javascript
headers: {
  'Authorization': `Bearer ${API_KEY}`
}
```

### Event Protocol

rtAV supports the **exact same event protocol** as OpenAI Realtime API via WebRTC data channel, including:

- `session.update` - Configure session settings
- `session.created` - Session created confirmation
- `session.updated` - Session updated confirmation
- `input_audio_buffer.append` - Send audio input (via RTP or data channel)
- `input_audio_buffer.commit` - Commit audio for processing
- `conversation.item.create` - Add text messages
- `response.create` - Trigger response generation
- `response.output_audio.delta` - Receive audio chunks (via RTP)
- `response.output_text.delta` - Receive text chunks
- `response.done` - Response complete

### Additional rtAV Features

rtAV adds video output events that OpenAI doesn't have:

- `response.output_image.delta` - Receive video frame chunks (base64 JPEG)
- `response.output_image.done` - Video generation complete

## Usage Examples

### Example 1: Basic WebRTC Call Setup

**OpenAI Version:**
```javascript
// Create RTCPeerConnection
const pc = new RTCPeerConnection();

// Create data channel
const dataChannel = pc.createDataChannel('realtime');

// Create SDP offer
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

// Send SDP offer to OpenAI
const formData = new FormData();
formData.append('sdp', offer.sdp);
formData.append('session', JSON.stringify({
  type: 'realtime',
  model: 'gpt-realtime',
  instructions: 'You are a helpful assistant.',
  voice: 'alloy'
}));

const response = await fetch('https://api.openai.com/v1/realtime/calls', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${OPENAI_API_KEY}`
  },
  body: formData
});

const answerSdp = await response.text();
await pc.setRemoteDescription({
  type: 'answer',
  sdp: answerSdp
});
```

**rtAV Version (minimal change):**
```javascript
// Create RTCPeerConnection
const pc = new RTCPeerConnection();

// Create data channel
const dataChannel = pc.createDataChannel('realtime');

// Create SDP offer
const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

// Send SDP offer to rtAV (only URL and API key changed!)
const formData = new FormData();
formData.append('sdp', offer.sdp);
formData.append('session', JSON.stringify({
  type: 'realtime',
  model: 'gpt-5.2',
  instructions: 'You are a helpful assistant.',
  voice: 'default',  // or your rtAV voice ID
  face: 'default',    // rtAV face ID (NEW)
  driving: 'default'  // rtAV driving motion (NEW)
}));

const response = await fetch('https://api.rtav.io/v1/realtime/calls', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${RTAV_API_KEY}`
  },
  body: formData
});

const answerSdp = await response.text();
await pc.setRemoteDescription({
  type: 'answer',
  sdp: answerSdp
});
```

The rest of your code remains **identical** - rtAV is a drop-in replacement!

### Example 2: Handling Video Output

rtAV adds video frames to the response. Here's how to handle them via the data channel:

```javascript
dataChannel.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Handle audio (same as OpenAI)
  if (data.type === 'response.output_audio.delta') {
    const audioChunk = data.delta; // base64-encoded audio
    // Play audio chunk
  }
  
  // Handle text (same as OpenAI)
  if (data.type === 'response.output_text.delta') {
    const textChunk = data.delta;
    // Display text
  }
  
  // NEW: Handle video frames (rtAV only)
  if (data.type === 'response.output_image.delta') {
    const frameData = data.delta; // base64-encoded JPEG
    // Display video frame
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${frameData}`;
    videoContainer.appendChild(img);
  }
  
  // Video complete
  if (data.type === 'response.output_image.done') {
    console.log(`Received ${data.total_frames} video frames`);
  }
};
```

### Example 3: Session Configuration

Both APIs support session configuration, but rtAV adds video-specific options:

**OpenAI:**
```javascript
const sessionConfig = {
  type: 'realtime',
  model: 'gpt-realtime',
  instructions: 'You are a helpful assistant.',
  voice: 'alloy',
  modalities: ['audio', 'text']
};

formData.append('session', JSON.stringify(sessionConfig));
```

**rtAV (adds video options):**
```javascript
const sessionConfig = {
  type: 'realtime',
  model: 'gpt-5.2',
  instructions: 'You are a helpful assistant.',
  voice: 'voice-id-here',      // RTAV voice ID
  face: 'face-id-here',         // RTAV face ID (NEW)
  driving: 'IdleListeningEncouraging', // Avatar behavior (NEW)
  modalities: ['audio', 'text', 'image'] // Add 'image' for video
};

formData.append('session', JSON.stringify(sessionConfig));
```

### Example 4: Audio Streaming

Both APIs support RTP audio streaming for low-latency communication:

```javascript
// Get user media
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

// Add audio track to peer connection
stream.getAudioTracks().forEach(track => {
  pc.addTrack(track, stream);
});

// Handle incoming audio
pc.ontrack = (event) => {
  if (event.track.kind === 'audio') {
    const audioElement = document.createElement('audio');
    audioElement.srcObject = event.streams[0];
    audioElement.play();
  }
};
```

## Migration Guide

### Step 1: Update API URL

Change the API endpoint from OpenAI to rtAV:

```diff
- const response = await fetch('https://api.openai.com/v1/realtime/calls', {
+ const response = await fetch('https://api.rtav.io/v1/realtime/calls', {
    method: 'POST',
    headers: {
-     'Authorization': `Bearer ${OPENAI_API_KEY}`
+     'Authorization': `Bearer ${RTAV_API_KEY}`
    },
    body: formData
  });
```

### Step 2: Update API Key

Use your rtAV API key instead of OpenAI API key.

### Step 3: Update Session Configuration

Update the session config to use rtAV-specific options:

```javascript
const sessionConfig = {
  type: 'realtime',
  model: 'gpt-5.2',  // rtAV model
  instructions: 'You are a helpful assistant.',
  voice: 'default',  // or your rtAV voice ID
  face: 'default',   // rtAV face ID (optional)
  driving: 'default' // rtAV driving motion (optional)
};
```

### Step 4: (Optional) Enable Video Output

Add video handling to your data channel message handler:

```javascript
dataChannel.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Add this to your existing message handler
  if (data.type === 'response.output_image.delta') {
    // Handle video frame
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${data.delta}`;
    videoContainer.appendChild(img);
  }
};
```

### Step 5: (Optional) Configure Video Avatar

If you want to customize the avatar appearance, update session configuration:

```javascript
const sessionConfig = {
  type: 'realtime',
  model: 'gpt-5.2',
  instructions: 'You are a helpful assistant.',
  voice: 'your-voice-id',
  face: 'your-face-id',
  driving: 'IdleListeningEncouraging'
};
```

That's it! Your existing OpenAI Realtime API WebRTC code should work with rtAV with minimal changes.

## Project Structure

```
realtime-openai-to-rtav-webrtc/
├── README.md
├── package.json              # Node.js dependencies
├── requirements.txt           # Python dependencies
├── .env                       # Environment variables (create this)
├── examples/
│   ├── openai-basic.js        # Basic OpenAI WebRTC example
│   ├── rtav-basic.js           # Basic rtAV WebRTC example (minimal changes)
│   ├── rtav-with-video.js     # rtAV with video output
│   ├── openai-basic.py        # Python OpenAI example
│   └── rtav-basic.py           # Python rtAV example
└── comparison/
    ├── side-by-side.html      # Interactive comparison demo
    └── server.js               # Local server with API proxy
```

## Running the Examples

### Node.js

```bash
# OpenAI example
node examples/openai-basic.js

# rtAV example (minimal changes)
node examples/rtav-basic.js

# rtAV with video
node examples/rtav-with-video.js
```

### Python

**Note:** Requires FFmpeg system libraries (see Installation section above).

```bash
# OpenAI example
python3 examples/openai-basic.py

# rtAV example
python3 examples/rtav-basic.py
```

### Interactive Comparison

The comparison demo provides a side-by-side view of OpenAI and rtAV implementations running simultaneously in your browser.

**Start the server:**
```bash
npm run serve
# or
npm run demo
```

This will start a local server at `http://localhost:3000` (or the port specified).

**Open in browser:**
Navigate to `http://localhost:3000` to see the interactive comparison demo.

**Features:**
- Side-by-side comparison of OpenAI and rtAV WebRTC connections
- Real-time event logging for both APIs
- Video frame display for rtAV (when face ID is provided)
- Automatic proxy for local HTTPS connections:
  - For local/private IP HTTPS endpoints, uses `/proxy/v1/realtime/calls` to avoid browser SSL certificate issues

**Configuration:**
The server reads `RTAV_API_URL` from `.env` file. Set it to your local API server if testing locally:
```env
RTAV_API_URL=https://192.168.4.101:8443
```

**Browser Limitations:**
- Browsers reject self-signed SSL certificates for local HTTPS connections
- The proxy server (`server.js`) handles this automatically by disabling SSL verification for local/private IP connections

## Event Compatibility Matrix

| Event Type | OpenAI | rtAV | Notes |
|------------|--------|------|-------|
| `session.update` | ✅ | ✅ | rtAV adds video options |
| `session.created` | ✅ | ✅ | Identical |
| `session.updated` | ✅ | ✅ | Identical |
| `input_audio_buffer.append` | ✅ | ✅ | Identical (RTP or data channel) |
| `input_audio_buffer.commit` | ✅ | ✅ | Identical |
| `conversation.item.create` | ✅ | ✅ | Identical |
| `response.create` | ✅ | ✅ | Identical |
| `response.output_audio.delta` | ✅ | ✅ | Identical (via RTP) |
| `response.output_text.delta` | ✅ | ✅ | Identical |
| `response.done` | ✅ | ✅ | Identical |
| `response.output_image.delta` | ❌ | ✅ | **rtAV only** - Video frames |
| `response.output_image.done` | ❌ | ✅ | **rtAV only** - Video complete |

## WebRTC-Specific Features

### RTP Audio Streaming

Both OpenAI and rtAV support RTP audio streaming for low-latency, real-time communication:

- **Incoming Audio**: Received via RTP media stream (not data channel)
- **Outgoing Audio**: Sent via RTP media stream (not data channel)
- **Control Events**: Sent/received via data channel

### Data Channel Communication

All control events (session updates, text messages, etc.) are sent via the WebRTC data channel:

```javascript
// Send event via data channel
dataChannel.send(JSON.stringify({
  type: 'session.update',
  session: {
    instructions: 'You are a helpful assistant.'
  }
}));

// Receive events via data channel
dataChannel.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle event
};
```

### ICE Candidates

Both APIs handle ICE candidates automatically. The SDP exchange includes all necessary ICE candidates for connection establishment.

## Benefits of Migrating to rtAV

1. **Video Output**: Add real-time video avatars to your application
2. **Cost Savings**: Transparent pricing without per-token charges
3. **Model Flexibility**: Use any LLM model, not just OpenAI
4. **Self-Hosting**: Option to deploy your own workers
5. **Open Source**: Full control over your infrastructure
6. **Drop-in Replacement**: Minimal code changes required
7. **Low Latency**: Direct RTP streaming for real-time conversation

## Troubleshooting

### Connection Issues

- **Error: "Invalid API key"**
  - Verify your rtAV API key is correct in `.env`
  - Ensure the API key has proper permissions

- **Error: "WebRTC connection failed"**
  - Check network connectivity
  - Verify the rtAV API URL is correct
  - Ensure you're using `https://` (secure connection)
  - Check browser WebRTC support
  - For local HTTPS connections, use the proxy server (see Interactive Comparison section)

- **Error: "self-signed certificate" (local HTTPS)**
  - Browsers reject self-signed certificates for local HTTPS connections
  - Use the proxy server at `/proxy/v1/realtime/calls` (automatically used when connecting to local/private IP HTTPS)

- **Error: "SDP negotiation failed"**
  - Verify SDP offer format is correct
  - Check that session configuration is valid JSON
  - Ensure multipart form data is properly formatted

### Video Not Displaying

- **No video frames received**
  - Ensure `modalities` includes `'image'` in session configuration
  - Check that `face` and `voice` are valid rtAV IDs
  - Verify your rtAV account has video output enabled
  - Check data channel is open and receiving messages

### Audio Issues

- **Audio not playing**
  - Check browser autoplay permissions
  - Verify RTP audio track is properly set up
  - Ensure `ontrack` handler is correctly implemented
  - Check that audio element is properly configured

- **No audio input**
  - Verify microphone permissions are granted
  - Check that audio track is added to peer connection
  - Ensure RTP audio stream is properly configured

### Data Channel Issues

- **Data channel not opening**
  - Verify data channel is created before SDP exchange
  - Check that data channel name is `'realtime'`
  - Ensure peer connection state is correct
  - Check browser console for WebRTC errors

- **Events not received**
  - Verify data channel is open (`readyState === 'open'`)
  - Check that `onmessage` handler is properly set up
  - Ensure events are being sent in correct format (JSON)

## API Reference

### POST /v1/realtime/calls

Create a WebRTC call session.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Headers: `Authorization: Bearer <api_key>`
- Body:
  - `sdp`: SDP offer string (required)
  - `session`: Session configuration JSON string (required)

**Response:**
- Content-Type: `application/sdp`
- Body: SDP answer string
- Headers: `X-Session-Id: <session_id>`

**Example:**
```bash
curl -X POST https://api.rtav.io/v1/realtime/calls \
  -H "Authorization: Bearer your_api_key" \
  -F "sdp=v=0..." \
  -F 'session={"type":"realtime","model":"gpt-5.2","instructions":"You are a helpful assistant."}'
```

## Docs

- **Documentation**: [platform.rtav.io/docs/overview](https://platform.rtav.io/docs/overview)
- **API Reference**: [platform.rtav.io/docs/api-reference](https://platform.rtav.io/docs/api-reference)
- **WebRTC Guide**: [platform.rtav.io/docs/guides/realtime-webrtc](https://platform.rtav.io/docs/guides/realtime-webrtc)

## License

This is a demo project for showcasing rtAV's OpenAI Realtime API compatibility.
