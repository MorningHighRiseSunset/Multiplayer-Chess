# Video Chat Feature Implementation

This document describes the video chat feature implemented for the chess multiplayer game using WebRTC and Socket.IO with in-memory storage.

## Overview

The video chat feature allows players in the same chess room to have real-time video and audio communication during their game. It uses WebRTC for peer-to-peer connections and Socket.IO for signaling, with all data stored in memory (no external databases required).

## Architecture

### Server-Side (server.js)

#### In-Memory Storage
```javascript
const videoChatRooms = new Map(); // roomCode -> { participants: Set, connections: Map }
const userVideoInfo = new Map(); // socketId -> { roomCode, userId }
```

#### Socket.IO Events
- `joinVideoChat` - Join video chat room
- `leaveVideoChat` - Leave video chat room
- `videoOffer` - WebRTC offer signaling
- `videoAnswer` - WebRTC answer signaling
- `iceCandidate` - ICE candidate exchange

### Client-Side (js/video-chat.js)

#### VideoChat Class
The main class that handles:
- WebRTC peer connections
- Media stream management
- UI controls
- Signaling coordination

#### Key Methods
- `initialize()` - Set up media streams and join room
- `createPeerConnection()` - Create WebRTC connection with peer
- `handleVideoOffer()` - Process incoming video offers
- `handleVideoAnswer()` - Process incoming video answers
- `handleIceCandidate()` - Process ICE candidates
- `toggleVideo()` - Enable/disable video
- `toggleAudio()` - Mute/unmute audio
- `leave()` - Clean up and leave video chat

## Features

### Core Functionality
- ✅ Real-time video and audio communication
- ✅ Multiple participants support (up to 2 players per room)
- ✅ WebRTC peer-to-peer connections
- ✅ Automatic connection establishment
- ✅ Graceful disconnection handling

### UI Features
- ✅ Floating video chat window
- ✅ Minimize/maximize functionality
- ✅ Video/audio toggle controls
- ✅ Responsive design for mobile devices
- ✅ Visual indicators for connection status

### Technical Features
- ✅ STUN servers for NAT traversal
- ✅ Automatic reconnection handling
- ✅ Memory cleanup on disconnect
- ✅ Error handling and user feedback
- ✅ Cross-browser compatibility

## Usage

### Starting Video Chat
1. Join a chess game room
2. Click the video chat button (📹) in the top-right corner
3. Grant camera and microphone permissions when prompted
4. Video chat window will appear with your local video

### Controls
- **🔴/📹** - Toggle video on/off
- **🔇/🔊** - Mute/unmute audio
- **❌** - Leave video chat
- **−/+** - Minimize/maximize video window

### Connection Process
1. User clicks video chat button
2. Browser requests camera/microphone access
3. Local video stream is displayed
4. Socket.IO signals to join video chat room
5. WebRTC offer/answer exchange with other participants
6. ICE candidates exchanged for connection establishment
7. Peer-to-peer video/audio streams established

## Technical Details

### WebRTC Configuration
```javascript
const peerConnection = new RTCPeerConnection({
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
});
```

### Media Constraints
```javascript
const constraints = {
    video: true,
    audio: true
};
```

### Signaling Flow
1. **Offer Creation**: Initiator creates RTCPeerConnection and offer
2. **Offer Transmission**: Offer sent via Socket.IO to target peer
3. **Answer Creation**: Target creates RTCPeerConnection and answer
4. **Answer Transmission**: Answer sent back to initiator
5. **ICE Exchange**: ICE candidates exchanged for connection establishment

## Browser Support

### Required Features
- WebRTC (RTCPeerConnection)
- getUserMedia API
- WebSocket support (for Socket.IO)

### Supported Browsers
- Chrome 56+
- Firefox 52+
- Safari 11+
- Edge 79+

## Security Considerations

### Permissions
- Camera and microphone access required
- HTTPS recommended for production (required for getUserMedia)

### Data Privacy
- Video/audio streams are peer-to-peer (not stored on server)
- Only signaling data passes through server
- No video/audio data stored in memory

### Connection Security
- WebRTC connections are encrypted by default
- STUN servers used for NAT traversal
- No TURN servers required for basic functionality

## Troubleshooting

### Common Issues

#### Camera/Microphone Access Denied
- Check browser permissions
- Ensure HTTPS is used (required for getUserMedia)
- Try refreshing the page

#### No Video/Audio
- Check device permissions
- Verify camera/microphone are not in use by other applications
- Check browser console for errors

#### Connection Issues
- Check network connectivity
- Verify STUN servers are accessible
- Check firewall settings

#### Performance Issues
- Reduce video quality if needed
- Close other video applications
- Check network bandwidth

## Development Notes

### Adding Features
- Video quality controls
- Screen sharing
- Recording functionality
- Multiple participant support (>2 players)

### Optimization Opportunities
- Implement TURN servers for better connectivity
- Add video quality adaptation
- Implement bandwidth estimation
- Add connection quality indicators

## Dependencies

### Server
- Socket.IO (already included)
- No additional dependencies required

### Client
- Socket.IO client (already included)
- No additional dependencies required

## File Structure

```
chess-site/
├── server.js              # Server with video chat signaling
├── js/
│   ├── video-chat.js      # Video chat client implementation
│   └── game.js           # Game logic with video chat integration
├── css/
│   └── video.css         # Video chat styling
├── game.html             # Game page with video chat UI
└── VIDEO_CHAT_README.md  # This documentation
```

## Testing

### Local Testing
1. Start the server: `node server.js`
2. Open two browser windows/tabs
3. Join the same room in both
4. Start video chat in both
5. Verify video/audio communication

### Network Testing
- Test with different network conditions
- Verify NAT traversal works
- Test with firewall restrictions

## Future Enhancements

### Planned Features
- Video quality controls
- Screen sharing capability
- Recording functionality
- Better error handling and recovery
- Connection quality indicators

### Technical Improvements
- TURN server implementation
- Bandwidth adaptation
- Better mobile optimization
- Accessibility improvements 